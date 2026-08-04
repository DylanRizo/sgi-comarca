import { pathToFileURL } from 'node:url';

import { createDatabaseClient } from '@sgi/database';

import { AdminRecoveryService } from '../application/admin-recovery.service.js';
import {
  assertNoAdditionalArguments,
  createInteractiveTerminal,
  type AdminCliTerminal,
} from './interactive-terminal.js';

export type AdminRecoveryOperations = {
  recoverAssignedAdmin: () => Promise<string>;
};

export async function runRecoverAdminCli(
  arguments_: readonly string[],
  terminal: AdminCliTerminal,
  operations: AdminRecoveryOperations,
): Promise<void> {
  assertNoAdditionalArguments(arguments_);
  const confirmed = await terminal.confirm(
    'Revocar el acceso actual y recuperar al único ADMIN asignado',
  );
  if (!confirmed) return;

  const token = await operations.recoverAssignedAdmin();
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
    await runRecoverAdminCli([], terminal, {
      recoverAssignedAdmin: () => service.recoverAssignedAdmin(),
    });
  } catch {
    process.stderr.write(
      'No se pudo completar la recuperación administrativa.\n',
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
