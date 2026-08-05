export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export interface RandomBytesProvider {
  bytes(length: number): Buffer;
}

export interface Sleeper {
  sleep(milliseconds: number): Promise<void>;
}

export class SystemSleeper implements Sleeper {
  async sleep(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  needsRehash(passwordHash: string): boolean;
  verify(passwordHash: string, password: string): Promise<boolean>;
}
