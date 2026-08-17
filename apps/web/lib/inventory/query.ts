export function inventoryQueryString(query: Readonly<object>): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    if (!['boolean', 'number', 'string'].includes(typeof value)) {
      throw new Error('Unsupported inventory query value.');
    }
    parameters.set(key, String(value));
  }
  const serialized = parameters.toString();
  return serialized ? `?${serialized}` : '';
}
