const fallbackApiUrl = 'http://localhost:3001';

export function publicApiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? fallbackApiUrl).replace(/\/$/, '');
}
