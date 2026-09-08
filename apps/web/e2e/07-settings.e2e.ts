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

/**
 * The suite works over the four accounts the manifest creates and never adds
 * one: `AuthenticationDatabase.reset()` restores dylan and clears sessions,
 * credentials and invitations, but does not delete users, so a created account
 * would leak into every suite that runs afterwards.
 */
test.describe('Administration settings', () => {
  test.beforeEach(async () => {
    await database.reset();
  });

  test.afterAll(async () => database.disconnect());

  test('lists the directory and states who can actually sign in', async ({
    page,
    request,
  }) => {
    await login(request, page);
    await page.getByRole('link', { name: 'Configuración' }).click();
    await expect(page).toHaveURL('/settings');
    await expect(
      page.getByRole('heading', { name: 'Configuración' }),
    ).toBeVisible();

    const dylanRow = page.getByRole('row').filter({ hasText: 'dylan' });
    await expect(dylanRow).toContainText('ADMIN');
    await expect(dylanRow).toContainText('Activa');
    await expect(dylanRow).toContainText('Puede entrar');

    // Jean never activated in this fixture, so the panel must not imply access.
    const jeanRow = page.getByRole('row').filter({ hasText: 'jean' });
    await expect(jeanRow).toContainText('Pendiente de activación');
    await expect(jeanRow).toContainText('Sin credencial ni invitación');

    await page.getByLabel('Buscar persona').fill('samanth');
    await expect(page.getByRole('row').filter({ hasText: 'jean' })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('row').filter({ hasText: 'samantha' }),
    ).toHaveCount(1);
  });

  test('creates an invitation link that carries its token in the fragment', async ({
    page,
    request,
  }) => {
    await login(request, page);
    await page.goto('/settings');
    const jeanRow = page.getByRole('row').filter({ hasText: 'jean' });
    await jeanRow.getByRole('button', { name: 'Crear invitación' }).click();

    const link = page.getByLabel('Enlace de activación');
    await expect(link).toBeVisible();
    const value = await link.inputValue();
    // The token travels in the fragment so it never reaches a server log, a
    // proxy or a Referer header. A query string would leak it.
    expect(value).toContain('/activate#token=');
    expect(value).not.toContain('?token=');

    await expect(
      page.getByRole('button', { name: 'Copiar enlace' }),
    ).toBeVisible();
    // The row now reports the outstanding invitation rather than plain access.
    await page.getByRole('button', { name: 'Ocultar' }).click();
    await expect(jeanRow).toContainText('Invitación vigente sin usar');
  });

  test('hides the panel from an account without the permission', async ({
    page,
    request,
  }) => {
    await database.denyUsersRead();
    await login(request, page);
    await expect(
      page.getByRole('link', { name: 'Configuración' }),
    ).toHaveCount(0);
    await page.goto('/settings');
    await expect(
      page.getByText('requiere el permiso de administración de usuarios'),
    ).toBeVisible();
  });
});
