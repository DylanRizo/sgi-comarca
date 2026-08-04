import { createInterface } from 'node:readline/promises';

export class InteractiveTerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InteractiveTerminalError';
  }
}

export type AdminCliTerminal = {
  close: () => void;
  confirm: (prompt: string) => Promise<boolean>;
  writeTokenOnce: (token: string) => void;
};

export function assertNoAdditionalArguments(
  arguments_: readonly string[],
): void {
  if (arguments_.length !== 0) {
    throw new InteractiveTerminalError(
      'Administrative CLIs do not accept arguments.',
    );
  }
}

export function createInteractiveTerminal(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): AdminCliTerminal {
  if (!input.isTTY || !output.isTTY) {
    throw new InteractiveTerminalError(
      'An interactive input and output TTY are required.',
    );
  }

  const readline = createInterface({ input, output });
  let tokenWritten = false;

  return {
    close: () => readline.close(),
    confirm: async (prompt) => {
      const response = await readline.question(prompt + ' [escriba SI]: ');
      return response.trim() === 'SI';
    },
    writeTokenOnce: (token) => {
      if (tokenWritten) {
        throw new InteractiveTerminalError(
          'The activation token can only be written once.',
        );
      }
      tokenWritten = true;
      output.write(
        'Token de activación (mostrar una sola vez): ' + token + '\n',
      );
    },
  };
}
