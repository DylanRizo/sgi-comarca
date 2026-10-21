export interface ProductSpecificationsAccessView {
  canEditSpecifications: boolean;
}

/** A link only: never fetch Drive, embed remote images or alter folder access. */
export function productPhotosFolderUrl(
  input: unknown,
  Url: new (value: string) => {
    protocol: string;
    hostname: string;
    port: string;
    username: string;
    password: string;
    pathname: string;
    toString(): string;
  },
): { valid: true; value: string | null } | { valid: false } {
  if (input === null || input === undefined)
    return { valid: true, value: null };
  if (typeof input !== 'string' || input.length > 1024) return { valid: false };
  const value = input.trim();
  if (!value) return { valid: true, value: null };
  if (
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return { valid: false };
  try {
    // The universal contracts package deliberately has no DOM/Node globals.
    // Callers provide their platform's standard URL constructor.
    const url = new Url(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'drive.google.com' ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/drive\/(?:u\/\d+\/)?folders\/[A-Za-z0-9_-]+\/?$/u.test(url.pathname)
    )
      return { valid: false };
    const canonical = url.toString();
    return canonical.length <= 1024
      ? { valid: true, value: canonical }
      : { valid: false };
  } catch {
    return { valid: false };
  }
}
