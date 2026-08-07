const fallbackApiUrl = 'http://localhost:3001';

export function publicApiUrl(): string {
  const candidate = process.env.NEXT_PUBLIC_API_URL ?? fallbackApiUrl;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL must be an absolute HTTP(S) origin.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'NEXT_PUBLIC_API_URL must be an HTTP(S) origin without credentials, path, query or fragment.',
    );
  }
  return url.origin;
}
