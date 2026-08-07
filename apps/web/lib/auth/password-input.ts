export const passwordInputPolicy = {
  maximumCodePoints: 128,
  minimumCodePoints: 12,
} as const;

export function codePointLength(value: string): number {
  return [...value.normalize('NFC')].length;
}

export function normalizeNewPassword(value: string): string {
  return value.normalize('NFC');
}

export function validateNewPassword(
  password: string,
  confirmation: string,
): { confirmation?: string; password?: string } {
  const normalizedPassword = normalizeNewPassword(password);
  const normalizedConfirmation = normalizeNewPassword(confirmation);
  const length = codePointLength(password);
  const errors: { confirmation?: string; password?: string } = {};
  if (
    length < passwordInputPolicy.minimumCodePoints ||
    length > passwordInputPolicy.maximumCodePoints
  ) {
    errors.password = 'La contraseña debe contener entre 12 y 128 caracteres.';
  }
  if (normalizedConfirmation !== normalizedPassword) {
    errors.confirmation = 'Las contraseñas no coinciden.';
  }
  return errors;
}
