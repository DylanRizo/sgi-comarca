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
 * Resolve the code-prefixed option in a finance/sale select by its code and
 * select it by value, since options render as "CODE / Name" or just "Name".
 */
async function selectByVisibleText(
  select: ReturnType<Page['locator']>,
  text: string,
): Promise<void> {
  const option = select.locator('option', { hasText: text }).first();
  await expect(option).toHaveCount(1);
  const value = await option.getAttribute('value');
  if (!value) throw new Error(`Option "${text}" is not selectable.`);
  await select.selectOption(value);
}

test.describe('FASE 8C finances and closings UI flows', () => {
  test.afterAll(async () => {
    await database.disconnect();
  });

  test.beforeEach(async () => {
    await database.reset();
  });

  test('registers a manual expense and reflects it in totals', async ({
    page,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    await database.seedFinanceFixtures(suffix);
    const before = await database.financeCounts();
    await activateAndLogin(request, page);

    await page.goto('/finances');
    await expect(page.locator('.result-count')).toBeVisible();
    await page
      .locator('.page-heading-actions')
      .getByRole('button', { name: 'Registrar asiento' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Registrar asiento' });
    await expect(dialog).toBeVisible();

    // Type defaults to EXPENSE, matching the fixture category's type.
    await selectByVisibleText(dialog.locator('select').nth(1), suffix);
    await dialog.getByLabel('Monto (C$)').fill('45.00');
    await dialog
      .getByLabel('Descripción (opcional)')
      .fill('Combustible de reparto');
    await dialog
      .getByRole('button', { name: 'Registrar asiento' })
      .last()
      .click();

    await expect(
      page.locator('.form-feedback[data-tone="success"]'),
    ).toContainText('registrado');

    const after = await database.financeCounts();
    expect(after.entries).toBe(before.entries + 1);

    // Totals accumulate over the whole shared ephemeral database (entries
    // are immutable and never deleted), so scope the check to this test's
    // own category rather than asserting on the unscoped global totals.
    await page
      .getByLabel('Categoría')
      .selectOption({ label: `Gasto sintético ${suffix}` });
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page.locator('.totals-panel')).toContainText('Gastos');
    await expect(page.locator('.totals-panel')).toContainText('C$45.00');
  });

  test('registers a manual income and updates income, expense and net', async ({
    page,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    await database.seedFinanceFixtures(suffix);
    await activateAndLogin(request, page);

    await page.goto('/finances');
    await page
      .locator('.page-heading-actions')
      .getByRole('button', { name: 'Registrar asiento' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Registrar asiento' });
    await dialog.getByLabel('Tipo').selectOption('INCOME');
    await selectByVisibleText(dialog.locator('select').nth(1), suffix);
    await dialog.getByLabel('Monto (C$)').fill('100.00');
    await dialog
      .getByRole('button', { name: 'Registrar asiento' })
      .last()
      .click();

    await expect(
      page.locator('.form-feedback[data-tone="success"]'),
    ).toContainText('registrado');

    await page
      .getByLabel('Categoría')
      .selectOption({ label: `Ingreso sintético ${suffix}` });
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    await expect(page.locator('.totals-panel')).toContainText('C$100.00');
  });

  test('derives sale income without ever persisting a financial entry', async ({
    page,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const { multiWarehouseCode } = await database.seedSalesFixtures(suffix);
    const before = await database.financeCounts();
    await activateAndLogin(request, page);

    await page.goto('/sales');
    await page
      .locator('.page-heading-actions')
      .getByRole('button', { name: 'Registrar venta' })
      .click();
    const saleDialog = page.getByRole('dialog', { name: 'Registrar venta' });
    const line = saleDialog.locator('.sale-line').first();
    const productSelect = line.locator('select').nth(0);
    await selectByVisibleText(productSelect, multiWarehouseCode);
    await line.locator('select').nth(1).selectOption({ label: 'Casa Dylan' });
    await line.getByLabel('Cantidad', { exact: true }).fill('2');
    // Complete it directly: only a COMPLETED sale counts as finance income.
    await saleDialog.getByLabel('Entrega').selectOption('COMPLETED');
    await saleDialog
      .getByRole('button', { name: 'Registrar venta' })
      .last()
      .click();
    const notice = page.locator('.form-feedback[data-tone="success"]');
    await expect(notice).toContainText(/VTA-\d{9}/u);
    const saleNumberMatch = /VTA-\d{9}/u.exec(
      (await notice.textContent()) ?? '',
    );
    if (!saleNumberMatch)
      throw new Error('Registered sale number was not rendered.');
    const saleNumber = saleNumberMatch[0];

    await page.goto('/finances');
    // The shared database may already hold other completed sales from
    // earlier suites, so target this exact sale number rather than any row
    // that merely looks like a sale.
    const saleLine = page.locator('tbody tr', { hasText: saleNumber });
    await expect(saleLine).toBeVisible();
    // 2 units at the 10.00 reference price seeded for Casa Dylan.
    await expect(saleLine).toContainText('20.00');

    const after = await database.financeCounts();
    expect(after.entries).toBe(before.entries);
  });

  test('creates a daily closing that freezes completed sales as system sales', async ({
    page,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    const { multiWarehouseCode } = await database.seedSalesFixtures(suffix);
    const businessDate = '2026-09-20';
    await activateAndLogin(request, page);

    await page.goto('/sales');
    await page
      .locator('.page-heading-actions')
      .getByRole('button', { name: 'Registrar venta' })
      .click();
    const saleDialog = page.getByRole('dialog', { name: 'Registrar venta' });
    await saleDialog.getByLabel('Fecha').fill(businessDate);
    const line = saleDialog.locator('.sale-line').first();
    await selectByVisibleText(
      line.locator('select').nth(0),
      multiWarehouseCode,
    );
    await line.locator('select').nth(1).selectOption({ label: 'Casa Dylan' });
    await line.getByLabel('Cantidad', { exact: true }).fill('3');
    await saleDialog.getByLabel('Entrega').selectOption('COMPLETED');
    await saleDialog
      .getByRole('button', { name: 'Registrar venta' })
      .last()
      .click();
    await expect(
      page.locator('.form-feedback[data-tone="success"]'),
    ).toContainText(/VTA-\d{9}/u);

    await page.goto('/closings');
    await page
      .locator('.page-heading-actions')
      .getByRole('button', { name: 'Crear cierre' })
      .click();
    const closingDialog = page.getByRole('dialog', {
      name: 'Crear cierre diario',
    });
    await closingDialog.getByLabel('Fecha').fill(businessDate);
    // 3 units at 10.00 = 30.00 system sales; count exactly that in cash.
    await closingDialog.getByLabel('Efectivo contado (C$)').fill('30.00');
    await closingDialog.getByLabel('Digital contado (C$)').fill('0.00');
    await closingDialog
      .getByRole('button', { name: 'Crear cierre' })
      .last()
      .click();

    await expect(
      page.locator('.form-feedback[data-tone="success"]'),
    ).toContainText('registrado');
    const row = page.locator('tbody tr').first();
    await expect(row).toContainText('30.00');
    await expect(row).toContainText('Cuadrado');
  });

  test('reopens a closing with a mandatory reason and keeps the history', async ({
    page,
    request,
  }) => {
    const businessDate = '2026-09-21';
    await activateAndLogin(request, page);

    await page.goto('/closings');
    await page
      .locator('.page-heading-actions')
      .getByRole('button', { name: 'Crear cierre' })
      .click();
    const closingDialog = page.getByRole('dialog', {
      name: 'Crear cierre diario',
    });
    await closingDialog.getByLabel('Fecha').fill(businessDate);
    await closingDialog.getByLabel('Efectivo contado (C$)').fill('0.00');
    await closingDialog.getByLabel('Digital contado (C$)').fill('0.00');
    await closingDialog
      .getByRole('button', { name: 'Crear cierre' })
      .last()
      .click();
    await expect(
      page.locator('.form-feedback[data-tone="success"]'),
    ).toContainText('registrado');

    // Target the row by its known date rather than "first": a click right
    // after creation can race the list's post-submit refetch.
    await page
      .getByRole('link', { name: `Ver cierre del ${businessDate}` })
      .click();
    // The status filter select only exists on the list page, so once we are
    // truly on the detail page this text is unambiguous.
    await expect(page).toHaveURL(/\/closings\/.+/u);
    await expect(page.getByText('Cerrado', { exact: true })).toBeVisible();

    const before = await database.financeCounts();
    await page.getByRole('button', { name: 'Reabrir cierre' }).click();
    await expect(
      page.getByRole('button', { name: 'Confirmar reapertura' }),
    ).toBeDisabled();
    await page.getByLabel('Motivo').fill('Conteo corregido tras arqueo');
    await page.getByRole('button', { name: 'Confirmar reapertura' }).click();

    await expect(page.getByText('Reabierto', { exact: true })).toBeVisible();
    await expect(page.getByText('Conteo corregido tras arqueo')).toBeVisible();
    const after = await database.financeCounts();
    expect(after.reopenings).toBe(before.reopenings + 1);
    // Once reopened it stays reopened: no reopen control remains.
    await expect(
      page.getByRole('button', { name: 'Reabrir cierre' }),
    ).toHaveCount(0);
  });

  test('hides finances entirely from a user denied finances.read', async ({
    page,
    request,
  }) => {
    await database.denyFinancePermission('finances.read');
    await activateAndLogin(request, page);

    // A direct DENY prevails over the FINANCE role grant.
    await expect(page.getByRole('link', { name: 'Finanzas' })).toHaveCount(0);
    await page.goto('/finances');
    await expect(page.getByText(/permiso|autorizad/u).first()).toBeVisible();
  });

  test('hides the manual entry control from a user denied finances.manual.create', async ({
    page,
    request,
  }) => {
    await database.denyFinancePermission('finances.manual.create');
    await activateAndLogin(request, page);

    await page.goto('/finances');
    await expect(
      page.getByRole('heading', { name: 'Movimientos financieros' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Registrar asiento' }),
    ).toHaveCount(0);
  });

  test('hides the closing creation control from a user denied closings.create', async ({
    page,
    request,
  }) => {
    await database.denyFinancePermission('closings.create');
    await activateAndLogin(request, page);

    await page.goto('/closings');
    await expect(
      page.getByRole('heading', { name: 'Cierres diarios' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Crear cierre' }),
    ).toHaveCount(0);
  });
});
