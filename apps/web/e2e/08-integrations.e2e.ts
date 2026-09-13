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

const readCatalog = (request: APIRequestContext, secret: string) =>
  request.get(`${apiUrl}/api/v1/integrations/catalog`, {
    headers: { Authorization: `Bearer ${secret}` },
  });

test.describe('Integration keys', () => {
  test.beforeEach(async () => {
    await database.reset();
  });

  test.afterAll(async () => database.disconnect());

  test('shows a key once, lets a program read with it and stops it on revocation', async ({
    page,
    request,
  }) => {
    // Unique per run: keys belong to dylan, whom reset() never deletes.
    const name = `Bot E2E ${String(Date.now())}`;
    await login(request, page);
    await page.getByRole('link', { name: 'Integraciones' }).click();
    await expect(page).toHaveURL('/settings/integrations');

    await page.getByLabel('Nombre').fill(name);
    await page.getByRole('button', { name: 'Crear llave' }).click();
    const secretField = page.getByLabel('Llave de integración');
    await expect(secretField).toBeVisible();
    const secret = await secretField.inputValue();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/u);

    // The key works from outside the browser session, as the publisher uses it.
    expect((await readCatalog(request, secret)).status()).toBe(200);

    await page.getByRole('button', { name: 'Ya la guardé' }).click();
    await expect(secretField).toHaveCount(0);
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toContainText('Activa');
    await expect(row).toContainText(`Empieza por ${secret.slice(0, 8)}`);
    // Once dismissed, the full secret is never rendered again.
    await expect(page.getByText(secret)).toHaveCount(0);

    page.once('dialog', (dialog) => void dialog.accept());
    await row.getByRole('button', { name: 'Revocar' }).click();
    await expect(row).toContainText('Revocada');
    expect((await readCatalog(request, secret)).status()).toBe(401);
  });

  test('hides integrations from an account without the permission', async ({
    page,
    request,
  }) => {
    await database.denyIntegrationsManage();
    await login(request, page);
    await expect(
      page.getByRole('link', { name: 'Integraciones' }),
    ).toHaveCount(0);
    await page.goto('/settings/integrations');
    await expect(
      page.getByText('requiere el permiso de administración de integraciones'),
    ).toBeVisible();
  });
});
