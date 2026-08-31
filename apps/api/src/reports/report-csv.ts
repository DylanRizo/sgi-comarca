/**
 * Deterministic CSV serialization for FASE 9B.2 reports.
 *
 * Two properties matter beyond formatting. Values are quoted whenever they
 * contain a delimiter, quote, or newline, so a product name with a comma can
 * never shift later columns. And a value that a spreadsheet would evaluate as
 * a formula is prefixed with a single quote: product names and entry
 * descriptions are operator-supplied text, so an exported report opened in
 * Excel must not execute them.
 */

const formulaLeadingCharacters = new Set(['=', '+', '-', '@', '\t', '\r']);

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  const guarded =
    text.length > 0 && formulaLeadingCharacters.has(text[0] as string)
      ? `'${text}`
      : text;
  return /[",\n\r]/u.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
}

export function csvDocument(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  // A trailing newline keeps the file POSIX-clean and diff-friendly.
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Attachment name for a report download. Kept ASCII and free of user input so
 * the header never needs escaping.
 */
export function csvFilename(report: string, generatedAt: Date): string {
  const stamp = generatedAt.toISOString().slice(0, 19).replaceAll(/[:-]/gu, '');
  return `sgi-${report}-${stamp}.csv`;
}
