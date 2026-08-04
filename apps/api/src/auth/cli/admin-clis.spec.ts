import { describe, expect, it, vi } from 'vitest';

import { runBootstrapAdminInvitationCli } from './bootstrap-admin-invitation.cli.js';
import {
  assertNoAdditionalArguments,
  createInteractiveTerminal,
  InteractiveTerminalError,
  type AdminCliTerminal,
} from './interactive-terminal.js';
import { runRecoverAdminCli } from './recover-admin.cli.js';

function createTerminal(confirmed = true): {
  terminal: AdminCliTerminal;
  writeTokenOnce: ReturnType<typeof vi.fn<(token: string) => void>>;
} {
  const writeTokenOnce = vi.fn<(token: string) => void>();
  return {
    terminal: {
      close: vi.fn(),
      confirm: vi.fn().mockResolvedValue(confirmed),
      writeTokenOnce,
    },
    writeTokenOnce,
  };
}

describe('administrative CLIs', () => {
  it('requires both input and output TTYs', () => {
    expect(() =>
      createInteractiveTerminal(
        { isTTY: false } as NodeJS.ReadStream,
        { isTTY: true } as NodeJS.WriteStream,
      ),
    ).toThrow(InteractiveTerminalError);
    expect(() =>
      createInteractiveTerminal(
        { isTTY: true } as NodeJS.ReadStream,
        { isTTY: false } as NodeJS.WriteStream,
      ),
    ).toThrow(InteractiveTerminalError);
  });

  it('rejects every additional argument before executing an operation', async () => {
    expect(() => assertNoAdditionalArguments(['--token=forbidden'])).toThrow(
      InteractiveTerminalError,
    );
    const { terminal } = createTerminal();
    const createInitialAdminInvitation = vi.fn<() => Promise<string>>();

    await expect(
      runBootstrapAdminInvitationCli(['unexpected'], terminal, {
        createInitialAdminInvitation,
      }),
    ).rejects.toThrow(InteractiveTerminalError);
    expect(createInitialAdminInvitation).not.toHaveBeenCalled();
  });

  it('writes an initial invitation token exactly once after confirmation', async () => {
    const { terminal, writeTokenOnce } = createTerminal();
    const controlledToken = 'CONTROLLED_REDACTED_TEST_VALUE';

    await runBootstrapAdminInvitationCli([], terminal, {
      createInitialAdminInvitation: vi.fn().mockResolvedValue(controlledToken),
    });

    expect(writeTokenOnce).toHaveBeenCalledTimes(1);
    expect(writeTokenOnce).toHaveBeenCalledWith(controlledToken);
  });

  it('writes a recovery token exactly once and never writes after failure', async () => {
    const success = createTerminal();
    const controlledToken = 'CONTROLLED_REDACTED_TEST_VALUE';
    await runRecoverAdminCli([], success.terminal, {
      recoverAssignedAdmin: vi.fn().mockResolvedValue(controlledToken),
    });
    expect(success.writeTokenOnce).toHaveBeenCalledTimes(1);

    const failure = createTerminal();
    await expect(
      runRecoverAdminCli([], failure.terminal, {
        recoverAssignedAdmin: vi
          .fn<() => Promise<string>>()
          .mockRejectedValue(new Error('controlled failure')),
      }),
    ).rejects.toThrow('controlled failure');
    expect(failure.writeTokenOnce).not.toHaveBeenCalled();
  });

  it('does nothing when the operator does not confirm', async () => {
    const { terminal, writeTokenOnce } = createTerminal(false);
    const recoverAssignedAdmin = vi.fn<() => Promise<string>>();
    await runRecoverAdminCli([], terminal, { recoverAssignedAdmin });

    expect(recoverAssignedAdmin).not.toHaveBeenCalled();
    expect(writeTokenOnce).not.toHaveBeenCalled();
  });
});
