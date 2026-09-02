import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

import { AuthenticationDatabase } from './support/authentication-database.js';

// FASE 10C. The multi-viewport gate. This suite runs in every project
// (desktop, tablet, mobile) against the one shared ephemeral database, so it
// seeds nothing and asserts no counts: it checks layout primitives only.
// Seeding here would collide with itself on the second project, which is the
// same ordering hazard playwright.config.ts documents for the numbered suites.

const apiUrl = process.env.SGI_E2E_API_URL ?? 'http://localhost:3101';
const webUrl = process.env.SGI_E2E_WEB_URL ?? 'http://localhost:3100';
const password = 'calm river orchard lantern';
const database = new AuthenticationDatabase();

const routes = [
  '/app',
  '/products',
  '/inventory',
  '/inventory/movements',
  '/sales',
  '/finances',
  '/reports',
  '/analytics',
] as const;

// Below this width the shell collapses its navigation behind the toggle and
// content keeps the full viewport; at or above it the shell becomes a left
// sidebar. Mirrors the 64rem breakpoint in globals.css.
const collapseWidth = 1024;

// Tables switch to their card presentation on their own, narrower breakpoint
// (48rem): that is about how many columns fit, not about the navigation.
const tableCardWidth = 768;

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

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
}

test.describe('FASE 10C responsive and navigation gate', () => {
  test.beforeEach(async () => {
    await database.reset();
  });

  test.afterAll(async () => {
    await database.disconnect();
  });

  test('never scrolls the page sideways on any main route', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // A page that scrolls sideways has content escaping the viewport, which
      // on a phone hides controls with no affordance saying they exist.
      expect(
        await horizontalOverflow(page),
        `${route} overflows horizontally`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test('keeps every destination reachable at this width', async ({
    page,
    request,
  }, testInfo) => {
    await activateAndLogin(request, page);
    const width = page.viewportSize()?.width ?? 0;
    const toggle = page.getByRole('button', { name: 'Menú' });
    const analytics = page.getByRole('link', { name: 'Analytics' });

    if (width < collapseWidth) {
      // Collapsed: the toggle is the only entry point, and it must reveal the
      // full list rather than a subset.
      await expect(toggle).toBeVisible();
      await expect(analytics).toBeHidden();
      await toggle.click();
      await expect(analytics).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Cerrar menú' }),
      ).toBeVisible();
    } else {
      // Expanded: no toggle, and the last destination is on screen rather
      // than clipped by a scrolling strip.
      await expect(toggle).toBeHidden();
      await expect(analytics).toBeInViewport();
    }

    await page.screenshot({
      path: testInfo.outputPath(`navigation-${String(width)}.png`),
    });
  });

  test('presents tables as cards below the breakpoint', async ({
    page,
    request,
  }) => {
    await activateAndLogin(request, page);
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');
    const width = page.viewportSize()?.width ?? 0;

    const header = page.locator('.data-table thead').first();
    if (await header.count()) {
      // Below the breakpoint the header row is visually hidden and each cell
      // carries its own label instead; above it, the header leads the table.
      if (width < tableCardWidth) {
        await expect(header).not.toBeInViewport();
      } else {
        await expect(header).toBeVisible();
      }
    }
  });
});
