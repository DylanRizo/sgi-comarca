import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

import { AuthenticationDatabase } from './support/authentication-database.js';

const apiUrl = process.env.SGI_E2E_API_URL ?? 'http://localhost:3101';
const webUrl = process.env.SGI_E2E_WEB_URL ?? 'http://localhost:3100';
const password = 'calm river orchard lantern';
const database = new AuthenticationDatabase();

async function activateAndLogin(
  request: APIRequestContext,
  page: Page,
): Promise<void> {
  const token = await database.createInvitation();
  const activation = await request.post(`${apiUrl}/api/v1/auth/activate`, {
    data: { password, token },
    headers: { Origin: webUrl },
  });
  expect(activation.status()).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Usuario').fill('dylan');
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/app');
}

test.describe('FASE 5B product and inventory views', () => {
  test.beforeEach(async () => {
    await database.reset();
    await database.seedInventoryReadFixtures();
    expect(await database.inventoryFixtureProductCount()).toBe(25);
  });

  test.afterAll(async () => {
    await database.disconnect();
  });

  test('lists, searches and paginates products, then renders multiwarehouse detail', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    await page.getByRole('link', { name: 'Productos' }).click();
    await expect(page).toHaveURL('/products');
    await expect(page.getByText('26 productos')).toBeVisible();
    await expect(page.getByText('DGGR-X', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('E2E-024', { exact: true })).toBeVisible();

    await page.getByLabel('Buscar producto').fill('DGGR-X');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('1 productos')).toBeVisible();
    await page.getByRole('link', { name: 'Ver detalle' }).click();

    await expect(
      page.getByRole('heading', { name: 'Producto multi-almacén' }),
    ).toBeVisible();
    await expect(page.getByText('CASA_DYLAN', { exact: true })).toBeVisible();
    await expect(page.getByText('CASA_JEAN', { exact: true })).toBeVisible();
    await expect(page.getByText(/0[.,]00/u).first()).toBeVisible();
    await expect(page.getByText('6', { exact: true }).first()).toBeVisible();

    await page.getByRole('link', { name: 'Volver a productos' }).click();
    await page.getByLabel('Buscar producto').fill('NO-EXISTE');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(
      page.getByRole('heading', { name: 'Sin resultados' }),
    ).toBeVisible();
  });

  test('filters inventory by warehouse and makes missing valuation explicit', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    await page.getByRole('link', { name: 'Inventario' }).click();
    await expect(page).toHaveURL('/inventory');
    await expect(page.getByText('2 productos con saldo')).toBeVisible();

    await page
      .getByLabel('Almacén')
      .selectOption({ label: 'Casa Dylan (CASA_DYLAN)' });
    await expect(page.getByText('DGGR-X', { exact: true })).toBeVisible();
    await expect(page.getByText('CCWH-L', { exact: true })).toHaveCount(0);

    await page.getByLabel('Almacén').selectOption('');
    await page.getByLabel('Buscar producto').fill('CCWH-L');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('link', { name: 'Ver producto' }).click();
    await expect(
      page.getByText('Sin valoración registrada para este almacén.'),
    ).toBeVisible();
    await expect(page.getByText('Sin fecha observada')).toHaveCount(0);
  });

  test('hides navigation and reports a direct inventory.read denial', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    await database.denyInventoryRead();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Productos' })).toHaveCount(0);

    await page.goto('/products');
    await expect(
      page.getByRole('heading', { name: 'Sin permiso de lectura' }),
    ).toBeVisible();
    await expect(page.getByText(/inventory\.read/u)).toBeVisible();
  });

  test('shows safe loading, error and not-found states', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    await page.route('**/api/v1/inventory*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });
    await page.goto('/inventory');
    await expect(
      page.getByRole('heading', { name: 'Cargando inventario' }),
    ).toBeVisible();
    await expect(page.getByText('2 productos con saldo')).toBeVisible();
    await page.unroute('**/api/v1/inventory*');

    await page.route('**/api/v1/inventory*', async (route) => {
      await route.fulfill({ body: 'service unavailable', status: 503 });
    });
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Error de consulta' }),
    ).toBeVisible();
    await page.unroute('**/api/v1/inventory*');

    await page.goto('/products/00000000-0000-4000-8000-000000000099');
    await expect(
      page.getByRole('heading', { name: 'No encontrado' }),
    ).toBeVisible();
  });
});
