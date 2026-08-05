import argon2 from 'argon2';

import { AuthenticationInvariantError } from '../domain/authentication.errors.js';
import type { PasswordHasher } from '../domain/authentication.ports.js';

export const minimumArgon2idParameters = {
  hashLength: 32,
  memoryCost: 19_456,
  parallelism: 1,
  timeCost: 2,
} as const;

export const candidateArgon2idParameters = {
  hashLength: 32,
  memoryCost: 65_536,
  parallelism: 4,
  timeCost: 3,
} as const;

export type Argon2idParameters = {
  hashLength: number;
  memoryCost: number;
  parallelism: number;
  timeCost: number;
};

function assertApprovedFloor(parameters: Argon2idParameters): void {
  if (
    parameters.hashLength < minimumArgon2idParameters.hashLength ||
    parameters.memoryCost < minimumArgon2idParameters.memoryCost ||
    parameters.parallelism < minimumArgon2idParameters.parallelism ||
    parameters.timeCost < minimumArgon2idParameters.timeCost
  ) {
    throw new AuthenticationInvariantError(
      'Argon2id parameters are below the approved minimum.',
    );
  }
}

export class Argon2PasswordHasher implements PasswordHasher {
  readonly parameters: Readonly<Argon2idParameters>;

  constructor(parameters: Argon2idParameters = candidateArgon2idParameters) {
    assertApprovedFloor(parameters);
    this.parameters = Object.freeze({ ...parameters });
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, this.options());
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  needsRehash(passwordHash: string): boolean {
    try {
      return argon2.needsRehash(passwordHash, this.options());
    } catch {
      return true;
    }
  }

  private options() {
    return {
      hashLength: this.parameters.hashLength,
      memoryCost: this.parameters.memoryCost,
      parallelism: this.parameters.parallelism,
      timeCost: this.parameters.timeCost,
      type: argon2.argon2id as 2,
    };
  }
}
