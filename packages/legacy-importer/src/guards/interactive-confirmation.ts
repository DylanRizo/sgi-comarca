import { createInterface } from 'node:readline/promises';
import process from 'node:process';

import { LegacyImporterError } from '../domain/errors.js';

export interface InteractiveTerminal {
  inputIsTTY: boolean;
  outputIsTTY: boolean;
  write(value: string): void;
  question(prompt: string): Promise<string>;
}

export function commitConfirmationPhrase(targetFingerprint: string): string {
  return `COMMIT LEGACY WAVES 1-2 ${targetFingerprint.slice(0, 12)}`;
}

export async function requireInteractiveCommitConfirmation(
  terminal: InteractiveTerminal,
  summary: {
    targetFingerprint: string;
    sourceSha256: string;
    approvedPlanKey: string;
    operatorUserId: string;
    backupSha256: string;
    businessWrites: number;
  },
): Promise<void> {
  if (!terminal.inputIsTTY || !terminal.outputIsTTY) {
    throw new LegacyImporterError('COMMIT_TTY_REQUIRED', 2);
  }
  const phrase = commitConfirmationPhrase(summary.targetFingerprint);
  terminal.write(
    [
      'PERSISTENT LEGACY IMPORT PREVIEW',
      `TARGET=${summary.targetFingerprint.slice(0, 12)}`,
      `SOURCE=${summary.sourceSha256.slice(0, 12)}`,
      `PLAN=${summary.approvedPlanKey.slice(0, 12)}`,
      `OPERATOR=${summary.operatorUserId}`,
      `BACKUP=${summary.backupSha256.slice(0, 12)}`,
      `BUSINESS_WRITES=${summary.businessWrites}`,
      `TYPE EXACTLY: ${phrase}`,
      '',
    ].join('\n'),
  );
  const answer = await terminal.question('confirmation> ');
  if (answer !== phrase) {
    throw new LegacyImporterError('COMMIT_CONFIRMATION_REJECTED', 2);
  }
}

export function nodeInteractiveTerminal(): InteractiveTerminal {
  return {
    inputIsTTY: process.stdin.isTTY === true,
    outputIsTTY: process.stdout.isTTY === true,
    write(value) {
      process.stdout.write(value);
    },
    async question(prompt) {
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });
      try {
        return await readline.question(prompt);
      } finally {
        readline.close();
      }
    },
  };
}
