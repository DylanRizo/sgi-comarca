import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { AuthenticationDatabase } from './support/authentication-database.js';
const apiUrl = process.env.SGI_E2E_API_URL ?? 'http://localhost:3101';
const webUrl = process.env.SGI_E2E_WEB_URL ?? 'http://localhost:3100';
const database = new AuthenticationDatabase();
async function login(request: APIRequestContext, page: Page) {
  const token = await database.createInvitation();
  expect(
    (
      await request.post(`${apiUrl}/api/v1/auth/activate`, {
        data: { password: 'calm river orchard lantern', token },
        headers: { Origin: webUrl },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Usuario').fill('dylan');
  await page.getByLabel('Contraseña').fill('calm river orchard lantern');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/app');
}
test.describe('Operational product and receipt journeys', () => {
  test.beforeEach(async () => {
    await database.reset();
    await database.prepareOperationalFixtures();
  });
  test.afterAll(async () => database.disconnect());
  test('creates product and first receipt, then edits only its description', async ({
    page,
    request,
  }, info) => {
    await login(request, page);
    await page
      .getByRole('link', { name: 'Nuevo producto', exact: true })
      .click();
    await page.getByLabel(/^Código/u).fill('OPS-FIRST-RECEIPT');
    await page
      .getByLabel('Nombre del producto')
      .fill('Producto recibido desde el asistente');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByLabel('Registrar una entrada inicial').check();
    await page
      .getByRole('combobox', { name: 'Bodega', exact: true })
      .selectOption({ label: 'Casa Dylan' });
    await page.getByLabel(/^Cantidad que ingresa/u).fill('3.25');
    await page
      .getByLabel('Motivo o referencia')
      .fill('Prueba de primera entrada');
    await page.getByLabel(/^Costo unitario/u).fill('15');
    await page.getByLabel(/^Precio de venta/u).fill('25');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Revisa antes de guardar' }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath('first-receipt-review.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Guardar producto y entrada' })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Producto recibido desde el asistente',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Editar ficha' }).click();
    await expect(page.getByLabel(/^Código/u)).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Unidad de medida')).toBeDisabled();
    await page
      .getByLabel('Descripción (opcional)')
      .fill('Ficha corregida sin cambiar existencias');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(
      page.getByText('Ficha corregida sin cambiar existencias'),
    ).toBeVisible();
    await expect(page.locator('.balance-quantity')).toContainText(/3[.,]25/u);
  });
  test('searches beyond product 100 and recovers a lost receipt response without duplication', async ({
    page,
    request,
  }, info) => {
    await login(request, page);
    await page
      .getByRole('link', { name: 'Registrar entrada', exact: true })
      .click();
    await page.getByLabel('Buscar producto').fill('OPS-SYN-155');
    await page.getByRole('button', { name: /OPS-SYN-155/u }).click();
    await page
      .getByRole('combobox', { name: 'Bodega', exact: true })
      .selectOption({ label: 'Casa Jean' });
    await page.getByLabel(/^Cantidad que ingresa/u).fill('1.5');
    await page
      .getByLabel('Motivo o referencia')
      .fill('Respuesta perdida sintética');
    await page.getByRole('button', { name: 'Revisar entrada' }).click();
    let lost = false;
    await page.route('**/api/v1/stock-receipts', async (route) => {
      if (route.request().method() === 'POST' && !lost) {
        lost = true;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Confirmar entrada' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'sin duplicarla',
    );
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Entrada registrada' }),
    ).toBeVisible();
    await expect(page.getByRole('status')).toContainText('0 → 1.5');
    await page.getByRole('link', { name: 'Ver comprobante' }).click();
    await expect(
      page.getByRole('heading', { name: 'Comprobante de entrada' }),
    ).toBeVisible();
    await expect(page.getByText('Pendiente al recibir').first()).toBeVisible();
    await page.screenshot({
      path: info.outputPath('receipt-recovered.png'),
      fullPage: true,
    });
  });
  test('remembers explicit light and dark appearance after navigation and reload', async ({
    page,
    request,
  }) => {
    await login(request, page);
    for (const theme of ['dark', 'light']) {
      await page.getByLabel('Apariencia', { exact: true }).selectOption(theme);
      await page.goto('/products/new');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByLabel('Apariencia', { exact: true })).toHaveValue(
        theme,
      );
      await expect(page.getByLabel('Nombre del producto')).toBeVisible();
    }
  });
});
