import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';

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

/**
 * Fill one line of the create-sale dialog. Product options render as
 * "CODE / Name", so the option is resolved by its code and selected by value
 * rather than by an exact label match.
 */
async function fillLine(
  page: Page,
  index: number,
  values: Readonly<{
    productCode: string;
    quantity: string;
    unitPrice?: string;
    warehouse: string;
  }>,
): Promise<void> {
  const line = page.locator('.sale-line').nth(index);
  const productSelect = line.locator('select').nth(0);
  const productOption = productSelect
    .locator('option', { hasText: values.productCode })
    .first();
  await expect(productOption).toHaveCount(1);
  const optionValue = await productOption.getAttribute('value');
  if (!optionValue) {
    throw new Error(`Product ${values.productCode} is not selectable.`);
  }
  await productSelect.selectOption(optionValue);
  await line.locator('select').nth(1).selectOption({ label: values.warehouse });
  await line.getByLabel('Cantidad', { exact: true }).fill(values.quantity);
  if (values.unitPrice !== undefined) {
    await line
      .getByLabel('Precio (opcional)', { exact: true })
      .fill(values.unitPrice);
  }
}

async function registeredSaleNumber(page: Page): Promise<string> {
  const notice = page.locator('.form-feedback[data-tone="success"]');
  await expect(notice).toContainText(/Venta VTA-\d{9} registrada/u);
  const saleNumber = /VTA-\d{9}/u.exec((await notice.textContent()) ?? '')?.[0];
  if (!saleNumber) throw new Error('Registered sale number was not rendered.');
  return saleNumber;
}

async function openCreateDialog(page: Page): Promise<void> {
  await expect(page.locator('.result-count')).toBeVisible();
  await page
    .locator('.page-heading-actions')
    .getByRole('button', { name: 'Registrar venta' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Registrar venta' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.sale-line')).toBeVisible();
}

test.describe('FASE 7C sales UI flows', () => {
  test.afterAll(async () => {
    await database.disconnect();
  });

  test.beforeEach(async () => {
    await database.reset();
  });

  test('creates a sale across two warehouses, deducting stock exactly once', async ({
    page,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const { multiWarehouseCode } = await database.seedSalesFixtures(suffix);
    const before = await database.salesCounts();
    await activateAndLogin(request, page);

    await page.goto('/sales');
    await expect(page).toHaveURL('/sales');
    await openCreateDialog(page);

    await fillLine(page, 0, {
      productCode: multiWarehouseCode,
      quantity: '2',
      warehouse: 'Casa Dylan',
    });
    await page.getByRole('button', { name: 'Agregar línea' }).click();
    await fillLine(page, 1, {
      productCode: multiWarehouseCode,
      quantity: '1',
      warehouse: 'Casa Jean',
    });
    await page.getByLabel('Envío (C$)').fill('5.00');

    await page.getByRole('button', { name: 'Registrar venta' }).last().click();

    await registeredSaleNumber(page);

    const after = await database.salesCounts();
    expect(after.sales).toBe(before.sales + 1);
    expect(after.items).toBe(before.items + 2);
    // Exactly one SALE movement per line, never two.
    expect(after.saleMovements).toBe(before.saleMovements + 2);

    // 2 * 10.00 + 1 * 12.00 + 5.00 shipping.
    expect(
      await database.balanceQuantity(multiWarehouseCode, 'CASA_DYLAN'),
    ).toBe(6);
    expect(
      await database.balanceQuantity(multiWarehouseCode, 'CASA_JEAN'),
    ).toBe(4);
  });

  test('shows the sale detail without cost and confirms delivery without charging it', async ({
    page,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const { multiWarehouseCode } = await database.seedSalesFixtures(suffix);
    await activateAndLogin(request, page);

    await page.goto('/sales');
    await openCreateDialog(page);
    await fillLine(page, 0, {
      productCode: multiWarehouseCode,
      quantity: '1',
      warehouse: 'Casa Dylan',
    });
    await page.getByRole('button', { name: 'Registrar venta' }).last().click();
    const saleNumber = await registeredSaleNumber(page);

    await page
      .getByRole('link', {
        exact: true,
        name: `Ver detalle de la venta ${saleNumber}`,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: /VTA-\d{9}/u }),
    ).toBeVisible();
    const fulfillmentStatus = page.locator('.status-badge');
    const paymentStatus = page
      .getByRole('region', { name: 'Resumen de la venta' })
      .getByText('Pendiente');
    await expect(fulfillmentStatus).toHaveText('En tránsito');
    await expect(paymentStatus).toBeVisible();
    // sales.read grants no financial permission: cost never reaches the page.
    await expect(page.locator('body')).not.toContainText('Costo');
    await expect(page.locator('body')).not.toContainText('Margen');

    const beforeConfirm = await database.salesCounts();
    await page.getByRole('button', { name: 'Confirmar entrega' }).click();

    await expect(fulfillmentStatus).toHaveText('Completada');
    const afterConfirm = await database.salesCounts();
    expect(afterConfirm.confirmations).toBe(beforeConfirm.confirmations + 1);
    // Confirmation touches neither inventory nor payment.
    expect(afterConfirm.saleMovements).toBe(beforeConfirm.saleMovements);
    expect(
      await database.balanceQuantity(multiWarehouseCode, 'CASA_DYLAN'),
    ).toBe(7);
    await expect(paymentStatus).toBeVisible();
  });

  test('cancels a sale after asking for a reason and restores stock once', async ({
    page,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const { multiWarehouseCode } = await database.seedSalesFixtures(suffix);
    await activateAndLogin(request, page);

    await page.goto('/sales');
    await openCreateDialog(page);
    await fillLine(page, 0, {
      productCode: multiWarehouseCode,
      quantity: '3',
      warehouse: 'Casa Dylan',
    });
    await page.getByRole('button', { name: 'Registrar venta' }).last().click();
    const saleNumber = await registeredSaleNumber(page);
    expect(
      await database.balanceQuantity(multiWarehouseCode, 'CASA_DYLAN'),
    ).toBe(5);

    await page
      .getByRole('link', {
        exact: true,
        name: `Ver detalle de la venta ${saleNumber}`,
      })
      .click();
    await page.getByRole('button', { name: 'Cancelar venta' }).click();
    // Cancellation is destructive, so it demands an explicit reason.
    await expect(
      page.getByRole('button', { name: 'Confirmar cancelación' }),
    ).toBeDisabled();
    await page.getByLabel('Motivo').fill('El cliente desistió');

    const before = await database.salesCounts();
    await page.getByRole('button', { name: 'Confirmar cancelación' }).click();

    await expect(page.locator('.status-badge')).toHaveText('Cancelada');
    const after = await database.salesCounts();
    expect(after.cancellations).toBe(before.cancellations + 1);
    expect(after.saleCancellationMovements).toBe(
      before.saleCancellationMovements + 1,
    );
    expect(
      await database.balanceQuantity(multiWarehouseCode, 'CASA_DYLAN'),
    ).toBe(8);
    // A cancelled sale offers no further lifecycle action.
    await expect(
      page.getByRole('button', { name: 'Confirmar entrega' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Cancelar venta' }),
    ).toHaveCount(0);
  });

  test('rejects the whole sale when a line has no registered cost', async ({
    page,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const { nullCostCode } = await database.seedSalesFixtures(suffix);
    const before = await database.salesCounts();
    await activateAndLogin(request, page);

    await page.goto('/sales');
    await openCreateDialog(page);
    await fillLine(page, 0, {
      productCode: nullCostCode,
      quantity: '1',
      warehouse: 'Casa Dylan',
    });
    await page.getByRole('button', { name: 'Registrar venta' }).last().click();

    await expect(page.getByText(/no tiene costo registrado/u)).toBeVisible();
    const after = await database.salesCounts();
    expect(after.sales).toBe(before.sales);
    expect(after.saleMovements).toBe(before.saleMovements);
    expect(await database.balanceQuantity(nullCostCode, 'CASA_DYLAN')).toBe(4);
  });

  test('blocks the draft before sending when stock is insufficient', async ({
    page,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const { multiWarehouseCode } = await database.seedSalesFixtures(suffix);
    const before = await database.salesCounts();
    await activateAndLogin(request, page);

    await page.goto('/sales');
    await openCreateDialog(page);
    await fillLine(page, 0, {
      productCode: multiWarehouseCode,
      quantity: '99',
      warehouse: 'Casa Dylan',
    });

    await expect(page.getByText(/supera el stock disponible/u)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Registrar venta' }).last(),
    ).toBeDisabled();
    expect((await database.salesCounts()).sales).toBe(before.sales);
  });

  test('hides sales entirely from a user denied sales.read', async ({
    page,
    request,
  }) => {
    await database.seedSalesFixtures(randomUUID().slice(0, 8));
    await database.denySalesPermission('sales.read');
    await activateAndLogin(request, page);

    // A direct DENY prevails over the role grant.
    await expect(page.getByRole('link', { name: 'Ventas' })).toHaveCount(0);
    await page.goto('/sales');
    await expect(page.getByText(/permiso|autorizad/u).first()).toBeVisible();
  });

  test('hides the create control from a user denied sales.create', async ({
    page,
    request,
  }) => {
    await database.seedSalesFixtures(randomUUID().slice(0, 8));
    await database.denySalesPermission('sales.create');
    await activateAndLogin(request, page);

    await page.goto('/sales');
    await expect(
      page.getByRole('heading', { name: 'Ventas registradas' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Registrar venta' }),
    ).toHaveCount(0);
  });
});
