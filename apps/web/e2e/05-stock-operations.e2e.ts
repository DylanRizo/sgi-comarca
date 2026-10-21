import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { AuthenticationDatabase } from './support/authentication-database.js';
const apiUrl = process.env.SGI_E2E_API_URL ?? 'http://localhost:3101';
const webUrl = process.env.SGI_E2E_WEB_URL ?? 'http://localhost:3100';
const database = new AuthenticationDatabase();
async function login(
  request: APIRequestContext,
  page: Page,
  identifier = 'dylan',
) {
  const token = await database.createInvitation(identifier);
  expect(
    (
      await request.post(`${apiUrl}/api/v1/auth/activate`, {
        data: { password: 'calm river orchard lantern', token },
        headers: { Origin: webUrl },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/login');
  await page.getByLabel('Usuario').fill(identifier);
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
  test('creates safe product specifications and preserves the mobile layout in both themes', async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(request, page);
    await page
      .getByRole('link', { name: 'Nuevo producto', exact: true })
      .click();
    await page.getByLabel(/^Código/u).fill('E2E-SPECS-MOBILE');
    await page
      .getByLabel('Nombre del producto')
      .fill('Ficha técnica sintética');
    await page
      .getByLabel('Descripción de materiales')
      .fill('Tejido <b>sin HTML</b>\nCuidados: agua fría.');
    await page
      .getByLabel('Tabla de medidas para este SKU')
      .fill('Pecho: 95–102 cm\nLargo: 68 cm\n' + 'x'.repeat(160));
    await page
      .getByLabel('Carpeta de fotos en Google Drive')
      .fill('https://drive.google.com.evil.invalid/drive/folders/test');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'enlace HTTPS de carpeta de Google Drive',
    );
    const url =
      'https://drive.google.com/drive/folders/synthetic-mobile?usp=sharing';
    await page.getByLabel('Carpeta de fotos en Google Drive').fill(url);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
    await expect(
      page.getByRole('link', {
        name: 'Abrir carpeta de fotos en Google Drive',
      }),
    ).toHaveAttribute('href', url);
    await page
      .getByRole('button', { name: 'Guardar producto', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Ficha técnica sintética',
        exact: true,
      }),
    ).toBeVisible();
    const specs = page.getByRole('region', {
      name: 'Especificaciones del producto y multimedia',
    });
    await expect(specs).toContainText('Tejido <b>sin HTML</b>');
    await expect(specs.locator('b')).toHaveCount(0);
    await expect(specs.getByRole('link')).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate(
        (value) => document.documentElement.setAttribute('data-theme', value),
        theme,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await specs.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`product-specifications-${theme}-mobile.png`),
        fullPage: true,
      });
    }
    await page.reload();
    await expect(
      page.getByRole('region', {
        name: 'Especificaciones del producto y multimedia',
      }),
    ).toContainText('Largo: 68 cm');
  });
  test('keeps technical fields readonly for Jean and omits them from an ordinary edit', async ({
    page,
    request,
  }) => {
    await login(request, page);
    const csrf = await page.request.get(apiUrl + '/api/v1/auth/csrf');
    const token = (await csrf.json()).data.csrfToken as string;
    const units = (
      await (
        await page.request.get(
          apiUrl + '/api/v1/units?active=true&page=1&pageSize=100',
        )
      ).json()
    ).data.items as { id: string; code: string }[];
    const groups = (
      await (await page.request.get(apiUrl + '/api/v1/product-groups')).json()
    ).data as { id: string; code: string }[];
    const created = await page.request.post(apiUrl + '/api/v1/products', {
      headers: {
        Origin: webUrl,
        'X-CSRF-Token': token,
        'Idempotency-Key': crypto.randomUUID(),
      },
      data: {
        code: 'E2E-SPECS-READONLY',
        name: 'Especificaciones protegidas',
        unitId: units.find((u) => u.code === 'UNIDADES')!.id,
        groupId: groups.find((g) => g.code === 'GENERAL')!.id,
        minimumStock: '0',
        materialsDescription: 'Material original',
        measurementChart: 'Pecho: 100 cm',
        photosUrl: 'https://drive.google.com/drive/folders/synthetic-readonly',
      },
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).data.product.id as string;
    await page.context().clearCookies();
    await login(request, page, 'jean');
    await page.goto('/products/' + id + '/edit');
    await expect(page.getByLabel('Descripción de materiales')).toHaveJSProperty(
      'readOnly',
      true,
    );
    await expect(
      page.getByLabel('Tabla de medidas para este SKU'),
    ).toHaveJSProperty('readOnly', true);
    await expect(
      page.getByLabel('Carpeta de fotos en Google Drive'),
    ).toHaveJSProperty('readOnly', true);
    let edited = false;
    await page.route('**/api/v1/products/' + id, async (route) => {
      if (route.request().method() === 'PATCH') {
        edited = true;
        const data = route.request().postDataJSON() as Record<string, unknown>;
        for (const field of [
          'materialsDescription',
          'measurementChart',
          'photosUrl',
        ])
          expect(data).not.toHaveProperty(field);
      }
      await route.continue();
    });
    await page
      .getByLabel('Descripción (opcional)')
      .fill('Cambio ordinario de la ficha');
    await page
      .getByRole('button', { name: 'Guardar cambios', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Especificaciones protegidas',
        exact: true,
      }),
    ).toBeVisible();
    expect(edited).toBe(true);
    await expect(
      page.getByText('Material original', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Pecho: 100 cm', { exact: true }),
    ).toBeVisible();
  });
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
  test('previews and imports a physical-count workbook idempotently', async ({
    page,
    request,
  }, info) => {
    await login(request, page);
    const workbookPath = info.outputPath('physical-count.xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        [
          'SKU INTUITIVO',
          'CÓDIGO ANTERIOR',
          'NOMBRE DEL PRODUCTO',
          'DESCRIPCIÓN',
          'PRECIO VENTA (C$)',
          'COSTO UNITARIO (C$)',
          'STOCK MÍNIMO',
          'CASA DYLAN (FÍSICO)',
          'CASA JEAN (FÍSICO)',
          'CASA LUDEN (FÍSICO)',
          'TOTAL EN LA COMARCA',
          'NOTAS / OBSERVACIONES',
        ],
        [
          'E2E-IMPORT-A',
          'OLD-A',
          'Camisa importada con stock',
          'Azul M',
          250,
          100,
          2,
          2.5,
          0,
          0,
          1,
          '',
        ],
        [
          'E2E-IMPORT-B',
          'OLD-B',
          'Camisa importada sin stock',
          'Negra S',
          200,
          80,
          1,
          0,
          0,
          0,
          0,
          '',
        ],
      ]),
      'Conteo Fisico Inicial',
    );
    await writeFile(
      workbookPath,
      XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }),
    );

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.goto('/products/import');
      await page
        .getByLabel('Archivo Excel (.xlsx)')
        .setInputFiles(workbookPath);
      await expect(
        page.getByRole('heading', { name: 'Vista previa' }),
      ).toBeVisible();
      await expect(
        page.getByText(/2 productos · 2.5 unidades físicas/u),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Importar productos y existencias' })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Importación terminada' }),
      ).toBeVisible();
      await expect(page.getByText('2 de 2 productos')).toBeVisible();
    }

    expect(await database.balanceQuantity('E2E-IMPORT-A', 'CASA_DYLAN')).toBe(
      2.5,
    );
    await page.getByRole('link', { name: 'Ver productos' }).click();
    await page.getByLabel('Buscar producto').fill('E2E-IMPORT-B');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(page.getByText('Camisa importada sin stock')).toBeVisible();
    await expect(page.locator('td[data-label="Stock total"]')).toHaveText('0');
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
