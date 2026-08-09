const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MANAGUA_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/u;

function validCivilDate(value: string): boolean {
  const match = CIVIL_DATE.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseCivilDate(value: unknown): string {
  if (typeof value !== 'string' || !validCivilDate(value)) {
    throw new Error('CIVIL_DATE_INVALID');
  }
  return value;
}

export function managuaDateTimeToUtc(value: unknown): string {
  if (typeof value !== 'string') throw new Error('DATETIME_TYPE_INVALID');
  const match = MANAGUA_DATE_TIME.exec(value);
  if (match === null) throw new Error('DATETIME_AMBIGUOUS');
  const civil = `${match[1]}-${match[2]}-${match[3]}`;
  if (!validCivilDate(civil)) throw new Error('DATETIME_INVALID');
  const seconds = match[6] ?? '00';
  const date = new Date(`${civil}T${match[4]}:${match[5]}:${seconds}-06:00`);
  if (Number.isNaN(date.getTime())) throw new Error('DATETIME_INVALID');
  return date.toISOString();
}

export function excelDateToCivil(value: unknown): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('EXCEL_DATE_INVALID');
  }
  return value.toISOString().slice(0, 10);
}
