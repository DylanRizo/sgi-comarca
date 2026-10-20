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
  // The product is chosen by typing its code or description and picking a
  // match, so the warehouse is now the only select on the line.
  await line.getByLabel('Producto').fill(values.productCode);
  await line
    .getByRole('button', { name: new RegExp(values.productCode, 'u') })
    .click();
  await expect(line.getByText(values.productCode).first()).toBeVisible();
  await line.locator('select').nth(0).selectOption({ label: values.warehouse });
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

  test('records a hybrid payment on mobile with exact remaining amount and visible breakdown', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    const fixture = await database.seedDuplicateSalesFixtures(
      randomUUID().slice(0, 8),
    );
    const before = await database.salesCounts();
    const stock = await database.balanceQuantity(
      fixture.rightCode,
      'CASA_DYLAN',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sales/${fixture.target.id}`);
    await page
      .getByRole('button', { name: 'Registrar pago', exact: true })
      .click();
    const panel = page.getByRole('region', {
      name: 'Registrar pago de la venta',
    });
    await panel.getByLabel('Tipo de pago').selectOption('split');
    await panel.getByLabel('Importe 1 (C$)').fill('8');
    await panel.getByLabel('Importe 2 (C$)').fill('11.99');
    const confirm = panel.getByRole('button', {
      name: 'Confirmar pago',
      exact: true,
    });
    await expect(confirm).toBeDisabled();
    await panel.getByLabel('Importe 2 (C$)').fill('12');
    await expect(confirm).toBeEnabled();
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: test.info().outputPath(`hybrid-payment-${theme}-mobile.png`),
        fullPage: true,
      });
    }
    await confirm.press('Enter');
    const breakdown = page.getByRole('region', { name: 'Desglose del pago' });
    await expect(breakdown).toContainText('Efectivo');
    await expect(breakdown).toContainText('C$8.00');
    await expect(breakdown).toContainText('Digital');
    await expect(breakdown).toContainText('C$12.00');
    await expect(
      page.getByRole('button', { name: 'Registrar pago', exact: true }),
    ).toHaveCount(0);
    expect(await database.paymentParts(fixture.target.id)).toEqual([
      { amount: '8.00', methodText: 'Efectivo' },
      { amount: '12.00', methodText: 'Digital' },
    ]);
    const after = await database.salesCounts();
    expect(after.payments).toBe(before.payments + 1);
    expect(after.saleMovements).toBe(before.saleMovements);
    expect(
      await database.balanceQuantity(fixture.rightCode, 'CASA_DYLAN'),
    ).toBe(stock);
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Desglose del pago' }),
    ).toBeVisible();
  });

  test('freezes a lost-response hybrid payment and replays the same key and lines', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    const fixture = await database.seedDuplicateSalesFixtures(
      randomUUID().slice(0, 8),
    );
    const before = await database.salesCounts();
    await page.goto(`/sales/${fixture.target.id}`);
    await page
      .getByRole('button', { name: 'Registrar pago', exact: true })
      .click();
    const panel = page.getByRole('region', {
      name: 'Registrar pago de la venta',
    });
    await panel.getByLabel('Tipo de pago').selectOption('split');
    await panel.getByLabel('Importe 1 (C$)').fill('8');
    await panel.getByLabel('Importe 2 (C$)').fill('12');
    let calls = 0,
      originalKey = '',
      originalBody = '';
    await page.route(
      `**/api/v1/sales/${fixture.target.id}/payment`,
      async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue();
          return;
        }
        const currentKey = route.request().headers()['idempotency-key'] ?? '';
        const currentBody = route.request().postData() ?? '';
        if (calls++ === 0) {
          originalKey = currentKey;
          originalBody = currentBody;
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          await route.abort('failed');
        } else {
          expect(currentKey).toBe(originalKey);
          expect(currentBody).toBe(originalBody);
          if (calls === 2) {
            await route.fulfill({
              status: 403,
              contentType: 'application/json',
              headers: {
                'access-control-allow-origin': webUrl,
                'access-control-allow-credentials': 'true',
              },
              body: JSON.stringify({
                error: {
                  code: 'CSRF_TOKEN_INVALID',
                  message: 'Synthetic transient CSRF refusal',
                  requestId: randomUUID(),
                },
              }),
            });
          } else await route.continue();
        }
      },
    );
    await panel
      .getByRole('button', { name: 'Confirmar pago', exact: true })
      .click();
    await expect(panel.getByRole('alert')).toBeVisible();
    await expect(panel.getByLabel('Importe 1 (C$)')).toBeDisabled();
    await expect(panel.getByLabel('Tipo de pago')).toBeDisabled();
    await panel
      .getByRole('button', { name: 'Reintentar el mismo pago' })
      .click();
    await expect(panel.getByRole('alert')).toContainText(
      'No se autorizó este intento',
    );
    await expect(panel.getByLabel('Importe 1 (C$)')).toBeDisabled();
    await panel
      .getByRole('button', { name: 'Reintentar el mismo pago' })
      .click();
    await expect(
      page.getByRole('region', { name: 'Desglose del pago' }),
    ).toBeVisible();
    expect((await database.salesCounts()).payments).toBe(before.payments + 1);
    expect(await database.paymentParts(fixture.target.id)).toHaveLength(2);
    expect(calls).toBe(3);
  });

  test('voids a paid duplicate on mobile and reuses its payment without selling again', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    const fixture = await database.seedDuplicateSalesFixtures(
      randomUUID().slice(0, 8),
    );
    const before = await database.salesCounts();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sales/${fixture.source.id}`);
    await page.getByRole('button', { name: 'Anular venta duplicada' }).click();
    await page
      .getByLabel('Número de la venta correcta')
      .fill(fixture.target.saleNumber);
    await page.getByRole('button', { name: 'Revisar venta correcta' }).click();
    await expect(
      page.getByRole('heading', {
        name: `Se conservará ${fixture.target.saleNumber}`,
      }),
    ).toBeVisible();
    await page
      .getByLabel('Motivo de la anulación')
      .fill('Synthetic duplicated sale with mistaken product');
    const submit = page.getByRole('button', {
      name: 'Confirmar anulación y reasignar cobro',
    });
    await expect(submit).toBeDisabled();
    await page
      .getByRole('checkbox', { name: /Confirmo que todos estos productos/u })
      .check();
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath('duplicate-sale-review-light-mobile.png'),
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({
      path: test.info().outputPath('duplicate-sale-review-dark-mobile.png'),
      fullPage: true,
    });
    await page.emulateMedia({ colorScheme: 'light' });
    await submit.click();
    await expect(
      page.getByRole('heading', { name: 'Anulada por registro duplicado' }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: test.info().outputPath('duplicate-sale-mobile.png'),
      fullPage: true,
    });
    await expect(
      page.getByRole('button', { name: 'Anular venta duplicada' }),
    ).toHaveCount(0);
    const after = await database.salesCounts();
    expect(after.payments).toBe(before.payments);
    expect(after.sales).toBe(before.sales);
    expect(after.saleMovements).toBe(before.saleMovements);
    expect(after.saleCancellationMovements).toBe(
      before.saleCancellationMovements + 1,
    );
    expect(
      await database.balanceQuantity(fixture.wrongCode, 'CASA_DYLAN'),
    ).toBe(8);
    expect(
      await database.balanceQuantity(fixture.rightCode, 'CASA_DYLAN'),
    ).toBe(6);
    await page.goto(`/sales/${fixture.target.id}`);
    await expect(
      page.getByRole('heading', { name: 'Cobro reasignado a esta venta' }),
    ).toBeVisible();
    await expect(page.getByText('Digital', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Registrar pago' }),
    ).toHaveCount(0);
  });

  test('retries an uncertain correction with its same frozen intention', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    const fixture = await database.seedDuplicateSalesFixtures(
      randomUUID().slice(0, 8),
    );
    const before = await database.salesCounts();
    await page.goto(`/sales/${fixture.source.id}`);
    await page.getByRole('button', { name: 'Anular venta duplicada' }).click();
    await page
      .getByLabel('Número de la venta correcta')
      .fill(fixture.target.saleNumber);
    await page.getByRole('button', { name: 'Revisar venta correcta' }).click();
    await expect(
      page.getByRole('heading', {
        name: `Se conservará ${fixture.target.saleNumber}`,
      }),
    ).toBeVisible();
    await page
      .getByLabel('Motivo de la anulación')
      .fill('Synthetic lost response');
    await page
      .getByRole('checkbox', { name: /Confirmo que todos estos productos/u })
      .check();
    let attempts = 0;
    await page.route('**/void-duplicate', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      attempts += 1;
      if (attempts === 2)
        return route.fulfill({
          status: 403,
          headers: {
            'access-control-allow-origin': webUrl,
            'access-control-allow-credentials': 'true',
          },
          json: {
            error: {
              code: 'REQUEST_VERIFICATION_FAILED',
              message: 'Synthetic CSRF refusal',
              requestId: 'synthetic',
            },
          },
        });
      if (attempts > 2) return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('failed');
    });
    await page
      .getByRole('button', { name: 'Confirmar anulación y reasignar cobro' })
      .click();
    await expect(
      page.getByRole('button', { name: 'Reintentar misma corrección' }),
    ).toBeVisible();
    await expect(page.getByLabel('Número de la venta correcta')).toBeDisabled();
    await page
      .getByRole('button', { name: 'Reintentar misma corrección' })
      .click();
    await expect(
      page
        .getByRole('region', { name: 'Anulación por duplicado' })
        .getByRole('alert'),
    ).toContainText('No se pudo verificar');
    await expect(page.getByLabel('Número de la venta correcta')).toBeDisabled();
    await page
      .getByRole('button', { name: 'Reintentar misma corrección' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Anulada por registro duplicado' }),
    ).toBeVisible();
    expect((await database.salesCounts()).saleCancellationMovements).toBe(
      before.saleCancellationMovements + 1,
    );
    expect((await database.salesCounts()).payments).toBe(before.payments);
  });

  test('hides paid duplicate correction when sales.cancel is denied', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    const fixture = await database.seedDuplicateSalesFixtures(
      randomUUID().slice(0, 8),
    );
    await database.denySalesPermission('sales.cancel');
    await page.goto(`/sales/${fixture.source.id}`);
    await expect(
      page.getByRole('heading', { name: fixture.source.saleNumber }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Anular venta duplicada' }),
    ).toHaveCount(0);
  });

  test('states how many products match and reveals the rest on demand', async ({
    page,
    request,
  }) => {
    const prefix = `E2E-SRCH-${randomUUID().slice(0, 6).toUpperCase()}`;
    await database.seedSearchableProducts(prefix, 20);
    await activateAndLogin(request, page);
    await page.goto('/sales');
    await openCreateDialog(page);

    const line = page.locator('.sale-line').first();
    await line.getByLabel('Producto').fill(prefix);
    const summary = line.locator('.picker-results-summary');
    // The search used to stop at eight matches without saying more existed.
    await expect(summary).toContainText('Mostrando 8 de 20 coincidencias');
    await expect(
      line.getByRole('button', { name: new RegExp(`${prefix}-009`, 'u') }),
    ).toHaveCount(0);

    await summary
      .getByRole('button', { name: 'Ver más coincidencias' })
      .click();
    await expect(summary).toContainText('Mostrando 16 de 20 coincidencias');
    await line
      .getByRole('button', { name: new RegExp(`${prefix}-016`, 'u') })
      .click();
    await expect(line.getByText(`${prefix}-016`).first()).toBeVisible();

    // A new search starts from the first step again.
    await line.getByRole('button', { name: 'Cambiar producto' }).click();
    await line.getByLabel('Producto').fill(`${prefix}-01`);
    await expect(line.locator('.picker-results-summary')).toContainText(
      '10 coincidencias',
    );
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
    await expect(
      page
        .getByRole('dialog', { name: 'Registrar venta' })
        .getByText('Dylan', { exact: true }),
    ).toBeVisible();

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
    await expect(
      page
        .getByRole('region', { name: 'Resumen de la venta' })
        .getByText('Dylan', { exact: true }),
    ).toBeVisible();
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

    await page.getByRole('link', { name: 'Análisis', exact: true }).click();
    const sellers = page.getByRole('region', { name: 'Vendedores' });
    await expect(
      sellers.getByText('Dylan', { exact: true }).first(),
    ).toBeVisible();
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

  test('records payment for a completed sale exactly once', async ({
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
    await page.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(page.locator('.status-badge')).toHaveText('Completada');

    const before = await database.salesCounts();
    await page.getByRole('button', { name: 'Registrar pago' }).click();
    await page.getByLabel('Medio de pago').fill('Transferencia');
    await page.getByRole('button', { name: 'Confirmar pago' }).click();

    const summary = page.getByRole('region', { name: 'Resumen de la venta' });
    await expect(
      summary
        .getByText('Pago', { exact: true })
        .locator('..')
        .getByText('Pagada', { exact: true }),
    ).toBeVisible();
    await expect(
      summary.getByText('Transferencia', { exact: true }),
    ).toBeVisible();
    await expect(
      summary
        .getByText('Pago registrado por', { exact: true })
        .locator('..')
        .getByText('Dylan', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Registrar pago' }),
    ).toHaveCount(0);

    const after = await database.salesCounts();
    expect(after.payments).toBe(before.payments + 1);
    expect(after.saleMovements).toBe(before.saleMovements);
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

  test('hides payment recording when the explicit permission is denied', async ({
    page,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const { multiWarehouseCode } = await database.seedSalesFixtures(suffix);
    await database.denySalesPermission('sales.record_payment');
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
    await page.getByRole('button', { name: 'Confirmar entrega' }).click();
    await expect(page.locator('.status-badge')).toHaveText('Completada');
    await expect(
      page.getByRole('button', { name: 'Registrar pago' }),
    ).toHaveCount(0);
  });
});
