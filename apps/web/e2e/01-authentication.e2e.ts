import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

import { AuthenticationDatabase } from './support/authentication-database.js';

const apiUrl = process.env.SGI_E2E_API_URL ?? 'http://localhost:3101';
const webUrl = process.env.SGI_E2E_WEB_URL ?? 'http://localhost:3100';
const initialPassword = 'calm river orchard lantern';
const changedPassword = 'gentle mountain harbor phrase';
const database = new AuthenticationDatabase();

async function activateThroughApi(request: APIRequestContext): Promise<void> {
  const token = await database.createInvitation();
  const response = await request.post(`${apiUrl}/api/v1/auth/activate`, {
    data: { password: initialPassword, token },
    headers: { Origin: webUrl },
  });
  expect(response.status()).toBe(201);
}

async function loginThroughPage(
  page: Page,
  password = initialPassword,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Usuario').fill('dylan');
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL('/app');
}

test.describe('BLOQUE 6 authentication interface', () => {
  test.beforeEach(async () => {
    await database.reset();
  });

  test.afterAll(async () => {
    await database.disconnect();
  });

  test('activates from an in-memory fragment and protects browser storage', async ({
    context,
    page,
  }) => {
    const token = await database.createInvitation();
    const consoleMessages: string[] = [];
    page.on('console', (message) => consoleMessages.push(message.text()));

    await page.goto(`/activate#token=${token}`);
    await expect(page).toHaveURL('/activate');
    await page.getByLabel('Contraseña', { exact: true }).fill(initialPassword);
    await page.getByLabel('Confirmar contraseña').fill(initialPassword);
    await page.getByRole('button', { name: 'Activar cuenta' }).click();

    await expect(page).toHaveURL('/app');
    await expect(
      page.getByRole('heading', { name: /Bienvenido/u }),
    ).toBeVisible();
    const sessionCookie = (await context.cookies()).find(
      (cookie) => cookie.name === 'sgi_session',
    );
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      'sgi_session',
    );
    const storage = await page.evaluate(() => ({
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
    }));
    expect(storage.local.filter(([key]) => !key.startsWith('__next'))).toEqual(
      [],
    );
    expect(
      storage.session.filter(([key]) => !key.startsWith('__next')),
    ).toEqual([]);
    expect(JSON.stringify(storage)).not.toContain(token);
    expect(JSON.stringify(storage)).not.toContain(initialPassword);
    const visibleContent = await page.locator('body').innerText();
    expect(visibleContent).not.toMatch(
      /\b(?:ADMIN|FINANCE|INVENTORY_MANAGER|PARTNER|READ_ONLY|SALES)\b/u,
    );
    expect(visibleContent).not.toMatch(/\b[a-f0-9]{64}\b/iu);
    expect(visibleContent).not.toContain(token);
    expect(visibleContent).not.toContain(initialPassword);
    expect(await database.originalTokenMatchesPersistedValue(token)).toBe(
      false,
    );
    expect(consoleMessages.join('\n')).not.toContain(token);
    expect(consoleMessages.join('\n')).not.toContain(initialPassword);
  });

  test('rejects an invalid activation with an accessible generic error on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });
    const token = Buffer.alloc(32, 91).toString('base64url');
    await page.goto(`/activate#token=${token}`);
    await expect(page).toHaveURL('/activate');
    await page.getByLabel('Contraseña', { exact: true }).fill(initialPassword);
    await page.getByLabel('Confirmar contraseña').fill(initialPassword);
    await page.getByRole('button', { name: 'Activar cuenta' }).click();
    await expect(page.locator('.auth-feedback')).toContainText(
      'No fue posible activar la cuenta',
    );
    await expect(page.locator('.auth-feedback')).toBeFocused();
    await expect(
      page.getByRole('heading', { name: 'Cómo continuar' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Volver a iniciar sesión' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Activar cuenta' }),
    ).toHaveCount(0);
  });

  test('keeps a valid invitation usable after password policy rejection', async ({
    page,
  }) => {
    const token = await database.createInvitation();
    await page.goto(`/activate#token=${token}`);
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill('dylan secure phrase');
    await page.getByLabel('Confirmar contraseña').fill('dylan secure phrase');
    await page.getByRole('button', { name: 'Activar cuenta' }).click();

    await expect(page.locator('.auth-feedback')).toContainText(
      'La contraseña no cumple la política aprobada',
    );
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Activar cuenta' }),
    ).toBeEnabled();

    await page.getByLabel('Contraseña', { exact: true }).fill(initialPassword);
    await page.getByLabel('Confirmar contraseña').fill(initialPassword);
    await page.getByRole('button', { name: 'Activar cuenta' }).click();
    await expect(page).toHaveURL('/app');
  });

  test('redirects an anonymous private visit to login', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL('/login?next=%2Fapp');
    await expect(
      page.getByRole('heading', { name: 'Iniciar sesión' }),
    ).toBeVisible();
  });

  test('logs in with a valid credential on desktop', async ({
    page,
    request,
  }) => {
    await activateThroughApi(request);
    await loginThroughPage(page);
    await expect(page.getByText('dylan', { exact: true })).toBeVisible();
    await expect(page.getByText('sales.create', { exact: true })).toBeVisible();
    await expect(page.getByText('Operación', { exact: true })).toBeVisible();
    await expect(page.getByText('Control', { exact: true })).toBeVisible();
    await expect(page.getByText('Análisis', { exact: true })).toBeVisible();
  });

  test('keeps invalid login errors uniform, accessible and focused', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Usuario').fill('unknown-user');
    await page.getByLabel('Contraseña').fill('not the right password');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.locator('.auth-feedback[data-tone="error"]')).toHaveText(
      'No fue posible iniciar sesión con esos datos.',
    );
    await expect(page.getByLabel('Usuario')).toBeFocused();
  });

  test('explains the administrator-mediated password recovery path', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByText('¿Olvidaste tu contraseña?').click();
    await expect(
      page.getByText(/genere una nueva invitación privada/u),
    ).toBeVisible();
    await expect(
      page.getByText(/Nunca compartas tu contraseña actual/u),
    ).toBeVisible();
  });

  test('prevents a double login submission', async ({ page, request }) => {
    await activateThroughApi(request);
    let loginRequests = 0;
    page.on('request', (outgoing) => {
      if (outgoing.url().endsWith('/api/v1/auth/login')) loginRequests += 1;
    });
    await page.goto('/login');
    await page.getByLabel('Usuario').fill('dylan');
    await page.getByLabel('Contraseña').fill(initialPassword);
    await page.locator('form').evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect(page).toHaveURL('/app');
    expect(loginRequests).toBe(1);
  });

  test('recovers CSRF after reload and logs out only with POST', async ({
    page,
    request,
  }) => {
    await activateThroughApi(request);
    await loginThroughPage(page);
    await page.reload();
    const logoutRequest = page.waitForRequest((outgoing) =>
      outgoing.url().endsWith('/api/v1/auth/logout'),
    );
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    expect((await logoutRequest).method()).toBe('POST');
    await expect(page).toHaveURL('/login');
    await page.goto('/app');
    await expect(page).toHaveURL('/login?next=%2Fapp');
  });

  test('redirects a previously authenticated revoked session', async ({
    page,
    request,
  }) => {
    await activateThroughApi(request);
    await loginThroughPage(page);
    expect(await database.revokeSessions()).toBeGreaterThan(0);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page).toHaveURL('/session-expired');
  });

  for (const expiration of ['idle', 'absolute'] as const) {
    test(`rejects a session after ${expiration} expiration without exposing private content`, async ({
      context,
      page,
      request,
    }) => {
      await activateThroughApi(request);
      await loginThroughPage(page);
      await expect(page.getByText('dylan', { exact: true })).toBeVisible();
      await database.expireLatestSession(expiration);

      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page).toHaveURL('/session-expired');
      await expect(page.getByText('dylan', { exact: true })).toHaveCount(0);
      await expect(page.getByText('sales.create', { exact: true })).toHaveCount(
        0,
      );
      expect(
        (await context.cookies()).some(
          (cookie) => cookie.name === 'sgi_session',
        ),
      ).toBe(false);
      const storage = await page.evaluate(() => ({
        local: Object.entries(localStorage),
        session: Object.entries(sessionStorage),
      }));
      expect(
        storage.local.filter(([key]) => !key.startsWith('__next')),
      ).toEqual([]);
      expect(
        storage.session.filter(([key]) => !key.startsWith('__next')),
      ).toEqual([]);
    });
  }

  test('changes the password, revokes the session and requires a new login', async ({
    page,
    request,
  }) => {
    await activateThroughApi(request);
    await loginThroughPage(page);
    await page.getByRole('link', { name: 'Cambiar contraseña' }).click();
    await page.getByLabel('Contraseña actual').fill(initialPassword);
    await page
      .getByLabel('Nueva contraseña', { exact: true })
      .fill(changedPassword);
    await page.getByLabel('Confirmar nueva contraseña').fill(changedPassword);
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(page).toHaveURL('/login?passwordChanged=1');
    await expect(page.locator('.auth-feedback')).toContainText(
      'Inicia sesión nuevamente',
    );

    await page.getByLabel('Usuario').fill('dylan');
    await page.getByLabel('Contraseña').fill(initialPassword);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.locator('.auth-feedback[data-tone="error"]')).toHaveText(
      'No fue posible iniciar sesión con esos datos.',
    );
    await page.getByLabel('Contraseña').fill(changedPassword);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL('/app');
  });
});
