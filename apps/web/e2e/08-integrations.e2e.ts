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

  test('queues a bot command once, asks before deleting a listing and stops offering to cancel once the bot has it', async ({
    page,
    request,
  }) => {
    const name = `Bot monitor E2E ${String(Date.now())}`;
    const instanceKey = `e2e-monitor-${String(Date.now())}`;
    const sync = (secret: string, commandResults: unknown[] = []) =>
      request.post(`${apiUrl}/api/v1/integrations/marketplace-bot/sync`, {
        data: {
          botVersion: '2026.11',
          commandResults,
          instanceKey,
          instanceName: 'PC de prueba E2E',
          snapshot: {
            listings: {
              actionable: 1,
              items: [
                {
                  account: 'acc-1',
                  executable: true,
                  key: 'acc-1::1',
                  listedOn: '2026-11-04',
                  recommendation: 'renew',
                  recommendationLabel: 'Renovar',
                  status: 'active',
                  title: 'Camisa de prueba E2E',
                },
              ],
              totalActive: 1,
            },
            worker: { enabled: true, processRunning: true, status: 'idle' },
          },
        },
        headers: { Authorization: `Bearer ${secret}` },
      });

    await login(request, page);
    await page.getByRole('link', { name: 'Integraciones' }).click();
    await page.getByLabel('Nombre').fill(name);
    await page.getByRole('button', { name: 'Crear llave' }).click();
    const secret = await page.getByLabel('Llave de integración').inputValue();
    expect((await sync(secret)).status()).toBe(200);

    await page
      .getByRole('link', { name: 'Bot Marketplace', exact: true })
      .click();
    await expect(page).toHaveURL('/settings/marketplace-bot');
    const listing = page
      .getByRole('row')
      .filter({ hasText: 'Camisa de prueba E2E' });
    await expect(listing).toBeVisible();
    const history = page.getByRole('region', {
      name: 'Historial de Comandos Remotos',
    });

    // Declining the question queues nothing.
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('Camisa de prueba E2E');
      void dialog.dismiss();
    });
    await listing.getByRole('button', { name: 'Eliminar' }).click();
    await expect(
      history.getByText('Todavía no se han enviado comandos remotos'),
    ).toBeVisible();

    page.once('dialog', (dialog) => void dialog.accept());
    await listing.getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.getByText('Se encoló "Eliminar"')).toBeVisible();
    const command = history
      .getByRole('row')
      .filter({ hasText: 'Acción sobre anuncio' });
    await expect(command).toHaveCount(1);
    await expect(command).toContainText(
      'Se entregará en el próximo pulso del bot',
    );
    await expect(
      command.getByRole('button', { name: 'Cancelar' }),
    ).toBeVisible();

    // The bot picks it up; a second heartbeat must not receive it again.
    const delivered = (await (await sync(secret)).json()) as {
      data: { pendingCommands: Array<{ id: string }> };
    };
    expect(delivered.data.pendingCommands).toHaveLength(1);
    const commandId = delivered.data.pendingCommands[0]?.id ?? '';
    const repeated = (await (await sync(secret)).json()) as {
      data: { pendingCommands: unknown[] };
    };
    expect(repeated.data.pendingCommands).toEqual([]);

    await page.reload();
    await expect(command).toContainText(
      'Entregado al bot; esperando su resultado',
    );
    await expect(command.getByRole('button', { name: 'Cancelar' })).toHaveCount(
      0,
    );

    expect(
      (
        await sync(secret, [
          { detail: 'Anuncio eliminado.', id: commandId, status: 'COMPLETED' },
        ])
      ).status(),
    ).toBe(200);
    await page.reload();
    await expect(command).toContainText('Completado');
    await expect(command).toContainText('Anuncio eliminado.');
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
