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
  // Without waiting for the session to land, the next navigation races the
  // login request and arrives anonymous, which bounces back to /login.
  await expect(page).toHaveURL('/app');
}
test.describe('Guided physical count', () => {
  test.beforeEach(async () => {
    await database.reset();
    await database.prepareOperationalFixtures();
  });
  test.afterAll(async () => database.disconnect());
  test('finds product 155, retains failed input, corrects with history and locks on submit', async ({
    page,
    request,
  }, info) => {
    await login(request, page);
    await page.goto('/inventory/counts');
    await page.getByLabel('Motivo').fill('Conteo guiado de prueba');
    await page.getByLabel('Casa Dylan').check();
    await page
      .getByRole('button', { name: 'Crear y comenzar a contar' })
      .click();
    await expect(page).toHaveURL(/\/inventory\/counts\/[0-9a-f-]+$/u);
    await expect(
      page.getByRole('heading', { name: /Conteo del/u }),
    ).toBeVisible();
    await page.getByLabel('Buscar producto').fill('OPS-SYN-155');
    await page.getByRole('button', { name: /OPS-SYN-155/u }).click();
    await page
      .getByRole('combobox', { name: 'Bodega', exact: true })
      .selectOption({ label: 'Casa Dylan' });
    const quantity = page.getByLabel('Cantidad contada', { exact: true });
    await quantity.fill('1.00000');
    await page.getByRole('button', { name: 'Guardar y continuar' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
    await expect(quantity).toHaveValue('1.00000');
    await quantity.fill('3');
    await page.getByRole('button', { name: 'Guardar y continuar' }).click();
    await expect(
      page.getByText('Conteo guardado. Puedes continuar después.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Corregir' }).click();
    await page.getByLabel('Cantidad contada corregida').fill('5');
    await page
      .getByLabel('Motivo de la corrección')
      .fill('Segundo recuento confirmado');
    await page.getByRole('button', { name: 'Guardar corrección' }).click();
    await expect(
      page.getByText('Corrección guardada con su motivo e historial.'),
    ).toBeVisible();
    await expect(page.getByText('1 cambio(s)')).toBeVisible();
    await page.screenshot({
      path: info.outputPath('count-review.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Enviar a aprobación' }).click();
    await expect(
      page.getByText('Sesión enviada. Las líneas quedaron bloqueadas.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Corregir' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Aprobar y ajustar' }).click();
    await expect(
      page.getByText('Conteo aprobado y ajustes generados.'),
    ).toBeVisible();
    await expect(page.getByText('Aprobado', { exact: true })).toBeVisible();
  });
});
