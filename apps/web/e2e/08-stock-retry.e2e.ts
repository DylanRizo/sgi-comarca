import { expect, test } from '@playwright/test';
import type { ProductCreatedView } from '@sgi/contracts';
import { AuthenticationDatabase } from './support/authentication-database.js';

const apiUrl = process.env.SGI_E2E_API_URL ?? 'http://localhost:3101';
const webUrl = process.env.SGI_E2E_WEB_URL ?? 'http://localhost:3100';
const database = new AuthenticationDatabase();

test.describe('Stock mutation uncertain-response recovery', () => {
  test.beforeEach(async () => {
    await database.reset();
    await database.prepareOperationalFixtures();
  });
  test.afterAll(async () => database.disconnect());
  test('retains product/first-receipt intent after a committed lost response and a refused retry', async ({
    page,
    request,
  }) => {
    const invitation = await database.createInvitation();
    expect(
      (
        await request.post(apiUrl + '/api/v1/auth/activate', {
          headers: { Origin: webUrl },
          data: { token: invitation, password: 'calm river orchard lantern' },
        })
      ).status(),
    ).toBe(201);
    await page.goto('/login');
    await page.getByLabel('Usuario').fill('dylan');
    await page.getByLabel('Contraseña').fill('calm river orchard lantern');
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await expect(page).toHaveURL('/app');
    await page
      .getByRole('link', { name: 'Nuevo producto', exact: true })
      .click();
    await page.getByLabel(/^Código/u).fill('E2E-STOCK-RETRY');
    await page
      .getByLabel('Nombre del producto')
      .fill('Producto de recuperación sintético');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByLabel('Registrar una entrada inicial').check();
    await page
      .getByRole('combobox', { name: 'Bodega', exact: true })
      .selectOption({ label: 'Casa Dylan' });
    await page.getByLabel(/^Cantidad que ingresa/u).fill('2.5');
    await page
      .getByLabel('Motivo o referencia')
      .fill('Prueba sintética de recuperación');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    const attempts: { key: string; body: unknown }[] = [];
    const committed: ProductCreatedView[] = [];
    await page.route('**/api/v1/products', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      attempts.push({
        key: route.request().headers()['idempotency-key']!,
        body: route.request().postDataJSON(),
      });
      if (attempts.length === 1) {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        committed.push((await response.json()).data as ProductCreatedView);
        await route.abort('failed');
      } else if (attempts.length === 2) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          headers: {
            'Access-Control-Allow-Origin': webUrl,
            'Access-Control-Allow-Credentials': 'true',
          },
          body: JSON.stringify({
            error: {
              code: 'REQUEST_VERIFICATION_FAILED',
              message: 'Synthetic refused retry',
              requestId: 'synthetic-refused-retry',
            },
          }),
        });
      } else await route.continue();
    });
    await page
      .getByRole('button', { name: 'Guardar producto y entrada', exact: true })
      .click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'sin duplicarla',
    );
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Synthetic refused retry',
    );
    await expect(
      page.getByRole('button', { name: 'Reintentar', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Atrás', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Producto de recuperación sintético',
        exact: true,
      }),
    ).toBeVisible();
    expect(attempts).toHaveLength(3);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(attempts[2]).toEqual(attempts[0]);
    expect(committed).toHaveLength(1);
    const inventory = await page.request.get(
      apiUrl + '/api/v1/inventory/products/' + committed[0]!.product.id,
    );
    expect((await inventory.json()).data.totalQuantity).toBe('2.5');
    const products = await page.request.get(
      apiUrl + '/api/v1/products?search=E2E-STOCK-RETRY',
    );
    expect((await products.json()).data.items).toHaveLength(1);
    const movements = await page.request.get(
      apiUrl +
        '/api/v1/inventory/movements?productId=' +
        committed[0]!.product.id,
    );
    expect((await movements.json()).data.items).toHaveLength(1);
  });
});
