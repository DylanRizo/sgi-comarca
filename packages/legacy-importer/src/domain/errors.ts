const SAFE_ERROR_CODE = /^[A-Z0-9_:.-]+$/u;

export class LegacyImporterError extends Error {
  constructor(
    public readonly code: string,
    public readonly exitCode: 2 | 3 | 4 | 5 | 6,
  ) {
    super(code);
    this.name = 'LegacyImporterError';
  }
}

export function safeErrorCode(error: unknown): string {
  if (error instanceof LegacyImporterError) return error.code;
  if (error instanceof Error && SAFE_ERROR_CODE.test(error.message)) {
    return error.message;
  }
  return 'LEGACY_IMPORTER_FAILED';
}

export function importerExitCode(error: unknown): 2 | 3 | 4 | 5 | 6 {
  return error instanceof LegacyImporterError ? error.exitCode : 6;
}
