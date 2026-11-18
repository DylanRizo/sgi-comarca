import type { MarketplaceBotQueueItem } from '@sgi/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildScheduleCommand,
  canMoveQueueItem,
  describeSchedule,
  formatBotLocalTime,
  isValidMoveValue,
  slotsPerDay,
  type ScheduleDraft,
} from './marketplace-bot-schedule.js';

const draft: ScheduleDraft = {
  activeDays: [4, 0, 2],
  endTime: '18:00',
  intervalMinutes: '180',
  maxPerDay: '3',
  regenerate: false,
  startTime: '09:00',
};

function item(status: string): MarketplaceBotQueueItem {
  return {
    account: 'Dylan',
    approved: false,
    detail: '',
    id: 'q-1',
    name: 'Calcetas',
    scheduledAt: '2026-11-20T15:30:00',
    status,
  };
}

describe('Marketplace bot schedule helpers', () => {
  it('builds a sorted schedule command from the form', () => {
    expect(buildScheduleCommand(draft)).toEqual({
      command: {
        activeDays: [0, 2, 4],
        endTime: '18:00',
        intervalMinutes: 180,
        maxPerDay: 3,
        regenerate: false,
        startTime: '09:00',
        type: 'SET_SCHEDULE',
      },
      ok: true,
    });
  });

  it('explains what to fix before sending an invalid schedule', () => {
    for (const [change, message] of [
      [{ activeDays: [] }, 'al menos un día'],
      [{ endTime: '08:00' }, 'posterior'],
      [{ maxPerDay: '0' }, 'máximo por día'],
      [{ intervalMinutes: '15' }, 'separación'],
      [{ startTime: '9' }, 'horas completas'],
    ] as const) {
      const result = buildScheduleCommand({ ...draft, ...change });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain(message);
    }
  });

  it('shows the bot wall clock as written, without shifting time zones', () => {
    expect(formatBotLocalTime('2026-11-20T15:30:00')).toMatch(/3:30\s*p/u);
    expect(formatBotLocalTime('2026-11-20T15:30:00')).toContain('20');
    expect(formatBotLocalTime('')).toBe('—');
  });

  it('counts how many posts fit in the window', () => {
    expect(
      slotsPerDay({
        ...draft,
        activeDays: [0],
        intervalMinutes: 180,
        maxPerDay: 3,
      }),
    ).toBe(3);
    expect(
      slotsPerDay({
        ...draft,
        activeDays: [0],
        intervalMinutes: 240,
        maxPerDay: 5,
      }),
    ).toBe(3);
    expect(
      slotsPerDay({
        ...draft,
        activeDays: [0],
        endTime: '10:00',
        intervalMinutes: 30,
        maxPerDay: 2,
      }),
    ).toBe(2);
  });

  it('describes the schedule and only moves pending posts', () => {
    expect(
      describeSchedule({
        activeDays: [0, 1, 2, 3, 4, 5, 6],
        endTime: '18:00',
        intervalMinutes: 180,
        maxPerDay: 3,
        startTime: '09:00',
      }),
    ).toBe('Todos los días · 09:00 a 18:00');
    expect(canMoveQueueItem(item('planned'))).toBe(true);
    expect(canMoveQueueItem(item('running'))).toBe(false);
    expect(canMoveQueueItem(item('published'))).toBe(false);
    expect(isValidMoveValue('2026-11-20T15:30')).toBe(true);
    expect(isValidMoveValue('2026-11-20')).toBe(false);
  });
});
