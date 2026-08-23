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

test.describe('FASE 5B/5C product and inventory flows', () => {
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

  test('adjusts and transfers inventory with immutable movement history', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    await page.getByRole('link', { name: 'Inventario' }).click();

    await page
      .getByRole('button', { name: 'Ajustar DGGR-X en Casa Dylan' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Ajustar inventario' }),
    ).toBeVisible();
    await page.getByLabel('Delta firmado').fill('+5');
    await page.getByLabel('Motivo obligatorio').fill('Conteo E2E positivo');
    await expect(page.getByText('ENTRADA +5', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar entrada +5' }).click();
    await expect(page.getByText('Ajuste registrado.')).toBeVisible();
    await expect(page.getByText('7.5', { exact: true })).toBeVisible();

    await page
      .getByRole('button', { name: 'Ajustar DGGR-X en Casa Dylan' })
      .click();
    await page.getByLabel('Delta firmado').fill('-3');
    await page.getByLabel('Motivo obligatorio').fill('Conteo E2E negativo');
    await expect(page.getByText('SALIDA -3', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar salida -3' }).click();
    await expect(page.getByText('Ajuste registrado.')).toBeVisible();
    await expect(page.getByText('4.5', { exact: true })).toBeVisible();

    await page
      .getByRole('button', { name: 'Ajustar DGGR-X en Casa Dylan' })
      .click();
    await page.getByLabel('Delta firmado').fill('-10');
    await page
      .getByLabel('Motivo obligatorio')
      .fill('Intento E2E de saldo negativo');
    await expect(
      page.getByText('El saldo resultante no puede ser negativo.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Confirmar/u }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    const cookies = await page.context().cookies(apiUrl);
    const cookieHeader = cookies
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ');
    const csrfResponse = await request.get(`${apiUrl}/api/v1/auth/csrf`, {
      headers: { Cookie: cookieHeader, Origin: webUrl },
    });
    expect(csrfResponse.status()).toBe(200);
    const csrfBody = (await csrfResponse.json()) as {
      data: { csrfToken: string };
    };
    await database.denyInventoryAdjust();
    await page.reload();
    await expect(
      page.getByRole('button', { name: /Ajustar DGGR-X/u }),
    ).toHaveCount(0);

    const forbidden = await request.post(
      `${apiUrl}/api/v1/inventory/adjustments`,
      {
        data: {
          productId: '00000000-0000-4000-8000-000000000001',
          quantityDelta: '1',
          reason: 'Debe ser rechazado por DENY',
          warehouseId: '00000000-0000-4000-8000-000000000002',
        },
        headers: {
          Cookie: cookieHeader,
          Origin: webUrl,
          'X-CSRF-Token': csrfBody.data.csrfToken,
        },
      },
    );
    expect(forbidden.status()).toBe(403);

    await page.getByRole('link', { exact: true, name: 'Movimientos' }).click();
    await expect(page).toHaveURL('/inventory/movements');
    await expect(
      page
        .locator('td[data-label="Tipo"]')
        .getByText('Ajuste', { exact: true })
        .first(),
    ).toBeVisible();
    await expect(page.getByText('Conteo E2E positivo')).toHaveCount(0);

    await page.getByRole('link', { name: 'Inventario' }).click();
    await page.getByRole('button', { name: 'Transferir inventario' }).click();
    const firstTransferDialog = page.getByRole('dialog', {
      name: 'Transferir inventario',
    });
    await expect(
      firstTransferDialog.getByRole('heading', {
        name: 'Transferir inventario',
      }),
    ).toBeVisible();
    await firstTransferDialog
      .getByLabel('Producto')
      .selectOption({ label: 'DGGR-X · Producto multi-almacén' });
    await firstTransferDialog
      .getByLabel('Almacén origen')
      .selectOption({ label: 'Casa Dylan · 4.5' });
    await firstTransferDialog
      .getByLabel('Almacén destino')
      .selectOption({ label: 'Casa Luden (CASA_LUDEN)' });
    await firstTransferDialog.getByLabel('Cantidad').fill('1');
    await firstTransferDialog
      .getByLabel('Motivo obligatorio')
      .fill('Transferencia E2E controlada');
    await expect(
      firstTransferDialog.getByText('TRANSFERENCIA', { exact: true }),
    ).toBeVisible();
    await expect(
      firstTransferDialog.getByText(/4[.,]5 → 3[.,]5/u),
    ).toBeVisible();
    await expect(firstTransferDialog.getByText(/0 → 1/u)).toBeVisible();
    await expect(firstTransferDialog.getByText(/8 → 8/u)).toBeVisible();
    const submit = firstTransferDialog.getByRole('button', {
      name: 'Confirmar transferencia',
    });
    await submit.click();
    await expect(page.getByText('Transferencia registrada.')).toBeVisible();
    expect(await database.inventoryTransferCounts()).toEqual({
      items: 1,
      movements: 2,
      transfers: 1,
    });

    await page.getByRole('link', { exact: true, name: 'Movimientos' }).click();
    const movementTable = page.getByRole('table');
    await expect(
      movementTable.getByText('Transferencia · salida', { exact: true }),
    ).toBeVisible();
    await expect(
      movementTable.getByText('Transferencia · entrada', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('CASA_DYLAN → CASA_LUDEN')).toHaveCount(2);

    await page.getByRole('link', { name: 'Inventario' }).click();
    await page.getByRole('button', { name: 'Transferir inventario' }).click();
    const secondTransferDialog = page.getByRole('dialog', {
      name: 'Transferir inventario',
    });
    await secondTransferDialog
      .getByLabel('Producto')
      .selectOption({ label: 'DGGR-X · Producto multi-almacén' });
    await secondTransferDialog
      .getByLabel('Almacén origen')
      .selectOption({ label: 'Casa Dylan · 3.5' });
    await secondTransferDialog
      .getByLabel('Almacén destino')
      .selectOption({ label: 'Casa Jean (CASA_JEAN)' });
    await secondTransferDialog.getByLabel('Cantidad').fill('99');
    await secondTransferDialog
      .getByLabel('Motivo obligatorio')
      .fill('Debe bloquear stock insuficiente');
    await expect(
      secondTransferDialog.getByText(
        'La cantidad supera el stock disponible en origen.',
      ),
    ).toBeVisible();
    await expect(
      secondTransferDialog.getByRole('button', {
        name: 'Confirmar transferencia',
      }),
    ).toBeDisabled();
    await secondTransferDialog
      .getByRole('button', { name: 'Cancelar' })
      .click();

    await database.denyTransfersCreate();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Transferir inventario' }),
    ).toHaveCount(0);
    const transferForbidden = await request.post(
      `${apiUrl}/api/v1/inventory/transfers`,
      {
        data: {
          fromWarehouseId: '00000000-0000-4000-8000-000000000001',
          productId: '00000000-0000-4000-8000-000000000002',
          quantity: '1',
          reason: 'Debe ser rechazado por DENY',
          toWarehouseId: '00000000-0000-4000-8000-000000000003',
        },
        headers: {
          Cookie: cookieHeader,
          'Idempotency-Key': crypto.randomUUID(),
          Origin: webUrl,
          'X-CSRF-Token': csrfBody.data.csrfToken,
        },
      },
    );
    expect(transferForbidden.status()).toBe(403);
    expect(await database.inventoryTransferCounts()).toEqual({
      items: 1,
      movements: 2,
      transfers: 1,
    });
  });
});
