import {
  marketplaceBotClockPattern,
  marketplaceBotLocalDateTimePattern,
  marketplaceBotScheduleLimits,
  type MarketplaceBotCommandPayload,
  type MarketplaceBotQueueItem,
  type MarketplaceBotScheduleRules,
} from '@sgi/contracts';

/** The bot numbers days from Monday (0) to Sunday (6). */
export const botDayLabels = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

export const queueStatusLabels: Readonly<Record<string, string>> = {
  blocked: 'Bloqueada',
  failed: 'Falló',
  planned: 'Por aprobar',
  published: 'Publicada',
  queued: 'Programada',
  retry: 'Reintento',
  running: 'Publicando ahora',
};

const MOVABLE_STATUSES = new Set(['planned', 'queued', 'retry']);

const botTimeFormatter = new Intl.DateTimeFormat('es-NI', {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  timeZone: 'UTC',
  weekday: 'short',
});

/**
 * Queue times are the bot computer's wall clock (Nicaragua) without an offset.
 * They are shown as written, whatever the viewer's time zone.
 */
export function formatBotLocalTime(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/u.exec(value);
  if (!match) return value || '—';
  const [, year, month, day, hour, minute] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return botTimeFormatter.format(
    new Date(Date.UTC(year, month - 1, day, hour, minute)),
  );
}

export function canMoveQueueItem(item: MarketplaceBotQueueItem): boolean {
  return MOVABLE_STATUSES.has(item.status);
}

/** `YYYY-MM-DDTHH:mm` for a `datetime-local` input. */
export function toLocalInputValue(value: string): string {
  return value.slice(0, 16);
}

export function describeSchedule(rules: MarketplaceBotScheduleRules): string {
  const days =
    rules.activeDays.length === 7
      ? 'Todos los días'
      : rules.activeDays
          .map((day) => botDayLabels[day]?.slice(0, 3) ?? '?')
          .join(', ');
  return `${days} · ${rules.startTime} a ${rules.endTime}`;
}

/** Posts that fit in one day with the chosen window and spacing. */
export function slotsPerDay(rules: MarketplaceBotScheduleRules): number {
  const [startHour, startMinute] = rules.startTime.split(':').map(Number);
  const [endHour, endMinute] = rules.endTime.split(':').map(Number);
  const minutes =
    (endHour ?? 0) * 60 +
    (endMinute ?? 0) -
    (startHour ?? 0) * 60 -
    (startMinute ?? 0);
  if (minutes <= 0 || rules.intervalMinutes <= 0) return 0;
  return Math.min(
    rules.maxPerDay,
    Math.floor(minutes / rules.intervalMinutes) + 1,
  );
}

export type ScheduleDraft = {
  activeDays: readonly number[];
  startTime: string;
  endTime: string;
  maxPerDay: string;
  intervalMinutes: string;
  regenerate: boolean;
};

/**
 * Builds the SET_SCHEDULE command or explains, in Spanish, what to fix.
 * The API and the bot validate again; this only spares a useless round trip.
 */
export function buildScheduleCommand(
  draft: ScheduleDraft,
):
  | { ok: true; command: MarketplaceBotCommandPayload }
  | { ok: false; error: string } {
  const activeDays = [...new Set(draft.activeDays)].sort((a, b) => a - b);
  if (activeDays.length === 0) {
    return { error: 'Elige al menos un día.', ok: false };
  }
  if (
    !marketplaceBotClockPattern.test(draft.startTime) ||
    !marketplaceBotClockPattern.test(draft.endTime)
  ) {
    return {
      error: 'Escribe las horas completas (por ejemplo 09:00).',
      ok: false,
    };
  }
  if (draft.endTime <= draft.startTime) {
    return {
      error: 'La hora final debe ser posterior a la hora inicial.',
      ok: false,
    };
  }
  const maxPerDay = Number(draft.maxPerDay);
  const { max: maxDaily, min: minDaily } =
    marketplaceBotScheduleLimits.maxPerDay;
  if (
    !Number.isInteger(maxPerDay) ||
    maxPerDay < minDaily ||
    maxPerDay > maxDaily
  ) {
    return {
      error: `El máximo por día debe estar entre ${minDaily} y ${maxDaily}.`,
      ok: false,
    };
  }
  const intervalMinutes = Number(draft.intervalMinutes);
  const { max: maxGap, min: minGap } =
    marketplaceBotScheduleLimits.intervalMinutes;
  if (
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes < minGap ||
    intervalMinutes > maxGap
  ) {
    return {
      error: `La separación debe estar entre ${minGap} y ${maxGap} minutos.`,
      ok: false,
    };
  }
  return {
    command: {
      activeDays,
      endTime: draft.endTime,
      intervalMinutes,
      maxPerDay,
      regenerate: draft.regenerate,
      startTime: draft.startTime,
      type: 'SET_SCHEDULE',
    },
    ok: true,
  };
}

export function isValidMoveValue(value: string): boolean {
  return marketplaceBotLocalDateTimePattern.test(value);
}
