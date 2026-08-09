import { createHash } from 'node:crypto';

import { PROFILE_SCHEMA_VERSION } from './profile-types.js';

const SOURCE_CODE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export interface SourceIdentity {
  sourceCode: string;
  sourceSha256: string;
  profileSchemaVersion: typeof PROFILE_SCHEMA_VERSION;
  sourceId: string;
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function createSourceIdentity(
  sourceCode: string,
  sourceSha256: string,
): SourceIdentity {
  if (!SOURCE_CODE_PATTERN.test(sourceCode)) {
    throw new TypeError('sourceCode must be a lowercase kebab-case identifier');
  }
  if (!/^[a-f0-9]{64}$/u.test(sourceSha256)) {
    throw new TypeError('sourceSha256 must be a lowercase SHA-256 digest');
  }
  const seed = `${PROFILE_SCHEMA_VERSION}\u0000${sourceCode}\u0000${sourceSha256}`;
  return {
    sourceCode,
    sourceSha256,
    profileSchemaVersion: PROFILE_SCHEMA_VERSION,
    sourceId: createHash('sha256').update(seed, 'utf8').digest('hex'),
  };
}
