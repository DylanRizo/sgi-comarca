import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

import { AuthenticationDatabase } from './support/authentication-database.js';

// FASE 10B. Keyboard contract for every aria-modal dialog. It asserts no
// global counts and seeds only a suffixed fixture of its own, so it runs last
// without disturbing the exact-count assertions the numbered suites depend on
// (see the ordering note in playwright.config.ts).

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

test.describe('FASE 10B dialog keyboard behaviour', () => {
  test.beforeEach(async () => {
    await database.reset();
  });

  test.afterAll(async () => {
    await database.disconnect();
  });

  test('traps focus, closes on Escape and restores focus', async ({
    page,
    request,
  }) => {
    const code = await database.seedAdjustableProduct('D1');
    await activateAndLogin(request, page);
    await page.goto('/inventory');
    await page.getByLabel('Buscar producto').fill(code);
    await page.getByRole('button', { name: 'Buscar' }).click();

    const opener = page.getByRole('button', { name: 'Ajustar' }).first();
    await expect(opener).toBeVisible();
    await opener.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // 1. Focus moved into the dialog on open.
    const focusedInsideOnOpen = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? d.contains(document.activeElement) : false;
    });
    expect(focusedInsideOnOpen).toBe(true);

    // 2. Tab many times: focus must never leave the dialog.
    for (let index = 0; index < 25; index += 1) {
      await page.keyboard.press('Tab');
    }
    const stillInside = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? d.contains(document.activeElement) : false;
    });
    expect(stillInside).toBe(true);

    // 3. Shift+Tab wraps backwards without escaping either.
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('Shift+Tab');
    }
    const stillInsideBackwards = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return d ? d.contains(document.activeElement) : false;
    });
    expect(stillInsideBackwards).toBe(true);

    // 4. Escape closes it.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // 5. Focus returned to the control that opened it.
    const restored = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? '',
    );
    expect(restored).toContain('Ajustar');
  });
});
