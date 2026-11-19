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

  test('connects a bot installation and respects listing action eligibility', async ({
    page,
    request,
  }) => {
    await login(request, page);
    await page.goto('/settings/integrations');
    await page.getByLabel('Uso de la llave').selectOption('bot');
    await page
      .getByLabel('Identificador de la instalación')
      .fill('e2e-monitor');
    await page.getByRole('button', { name: 'Crear llave' }).click();
    const secretField = page.getByLabel('Llave de integración');
    await expect(secretField).toBeVisible();
    const secret = await secretField.inputValue();
    expect((await readCatalog(request, secret)).status()).toBe(403);
    const sync = await request.post(
      `${apiUrl}/api/v1/integrations/marketplace-bot/sync`,
      {
        data: {
          botVersion: 'e2e',
          commandProtocolVersion: 1,
          instanceKey: 'e2e-monitor',
          instanceName: 'Instalación de prueba',
          snapshot: {
            leads: { awaitingReply: 3 },
            listings: {
              items: [
                {
                  key: 'twin',
                  title: 'Producto gemelo',
                  status: 'in_stock',
                  isExactTwin: true,
                },
                {
                  key: 'missing',
                  title: 'Producto sin estado',
                  isExactTwin: false,
                },
                {
                  key: 'legacy',
                  title: 'Producto sin verificar',
                  status: 'active',
                },
                {
                  key: 'unique',
                  title: 'Producto disponible',
                  status: 'in_stock',
                  isExactTwin: false,
                },
                {
                  key: 'queued-action',
                  title: 'Producto con acción en cola',
                  status: 'in_stock',
                  isExactTwin: false,
                  pendingAction: 'renew',
                  pendingActionId: 77,
                },
              ],
            },
            queue: {
              upcoming: [
                {
                  account: 'Dylan Steven',
                  approved: false,
                  id: 'queue-e2e',
                  name: 'Calcetas de compresión',
                  scheduledAt: '2099-11-20T15:30:00',
                  status: 'planned',
                },
              ],
            },
            schedule: {
              activeDays: [0, 1, 2, 3, 4],
              botTime: '2026-11-18T09:15',
              endTime: '18:00',
              intervalMinutes: 180,
              maxPerDay: 3,
              startTime: '09:00',
            },
            worker: { enabled: true },
          },
        },
        headers: { Authorization: `Bearer ${secret}` },
      },
    );
    expect(sync.status()).toBe(200);
    expect((await sync.json()).data.pendingCommands).toEqual([]);

    await page.getByRole('link', { name: 'Monitor Bot Marketplace' }).click();
    await expect(page).toHaveURL('/settings/marketplace-bot');
    await expect(
      page.getByText('Instalación de prueba', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('En línea', { exact: true })).toBeVisible();
    const twin = page.getByRole('row').filter({ hasText: 'Producto gemelo' });
    const unknown = page
      .getByRole('row')
      .filter({ hasText: 'Producto sin estado' });
    const legacy = page
      .getByRole('row')
      .filter({ hasText: 'Producto sin verificar' });
    const available = page
      .getByRole('row')
      .filter({ hasText: 'Producto disponible' });
    const queuedAction = page
      .getByRole('row')
      .filter({ hasText: 'Producto con acción en cola' });
    for (const row of [twin, unknown, legacy]) {
      await expect(row).toBeVisible();
      await expect(row.getByRole('button')).toHaveCount(0);
    }
    await expect(unknown).toContainText('Estado: desconocido');
    await expect(queuedAction).toBeVisible();
    await page.getByLabel('Buscar anuncio').fill('disponible');
    await expect(available).toBeVisible();
    await expect(twin).toHaveCount(0);
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(twin).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Horario de publicación' }),
    ).toBeVisible();
    await expect(
      page.getByText('Lun, Mar, Mié, Jue, Vie · 09:00 a 18:00'),
    ).toBeVisible();
    const queued = page
      .getByRole('row')
      .filter({ hasText: 'Calcetas de compresión' });
    await expect(queued).toContainText('Por aprobar');
    if (process.env.MARKETPLACE_BOT_CONTROL_ENABLED === 'true') {
      await page.getByRole('button', { name: 'Cambiar horario' }).click();
      await page.getByLabel('Hasta').fill('08:00');
      await page.getByRole('button', { name: 'Guardar horario' }).click();
      await expect(
        page.getByText('La hora final debe ser posterior a la hora inicial.'),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Cancelar' }).first().click();
      await queued.getByRole('button', { name: 'Mover' }).click();
      await expect(
        queued.getByRole('button', { name: 'Guardar' }),
      ).toBeDisabled();
      await expect(twin).toContainText('Solo en Facebook');
      await expect(legacy).toContainText('Pendiente de verificar');
      await expect(
        available.getByRole('button', { name: 'Marcar agotado' }),
      ).toBeVisible();
      await expect(
        queuedAction.getByRole('button', { name: 'Cancelar acción' }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole('button', { name: 'Cambiar horario' }),
      ).toHaveCount(0);
      await expect(queued.getByRole('button')).toHaveCount(0);
      await expect(queuedAction.getByRole('button')).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Control remoto deshabilitado' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /pausar bot/i }),
      ).toHaveCount(0);
      await expect(available.getByRole('button')).toHaveCount(0);
    }
  });

  test('hides integrations from an account without the permission', async ({
    page,
    request,
  }) => {
    await database.denyIntegrationsManage();
    await login(request, page);
    await expect(page.getByRole('link', { name: 'Integraciones' })).toHaveCount(
      0,
    );
    await page.goto('/settings/integrations');
    await expect(
      page.getByText('requiere el permiso de administración de integraciones'),
    ).toBeVisible();
  });
});
