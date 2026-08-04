import { pathToFileURL } from 'node:url';

import { createDatabaseClient } from '@sgi/database';

import { AdminRecoveryService } from '../application/admin-recovery.service.js';
import {
  assertNoAdditionalArguments,
  createInteractiveTerminal,
  type AdminCliTerminal,
} from './interactive-terminal.js';

export type InitialInvitationOperations = {
  createInitialAdminInvitation: () => Promise<string>;
};

export async function runBootstrapAdminInvitationCli(
  arguments_: readonly string[],
  terminal: AdminCliTerminal,
  operations: InitialInvitationOperations,
): Promise<void> {
  assertNoAdditionalArguments(arguments_);
  const confirmed = await terminal.confirm(
    'Generar una nueva invitación para el único ADMIN pendiente',
  );
  if (!confirmed) return;

  const token = await operations.createInitialAdminInvitation();
  terminal.writeTokenOnce(token);
}

async function main(): Promise<void> {
  let terminal: AdminCliTerminal | undefined;
  let client: ReturnType<typeof createDatabaseClient> | undefined;

  try {
    assertNoAdditionalArguments(process.argv.slice(2));
    terminal = createInteractiveTerminal();
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required.');
    client = createDatabaseClient(databaseUrl);
    const service = new AdminRecoveryService(client);
    await runBootstrapAdminInvitationCli([], terminal, {
      createInitialAdminInvitation: () =>
        service.createInitialAdminInvitation(),
    });
  } catch {
    process.stderr.write(
      'No se pudo completar la invitación administrativa.\n',
    );
    process.exitCode = 1;
  } finally {
    terminal?.close();
    await client?.$disconnect();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
