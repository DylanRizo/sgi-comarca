'use client';

import type {
  MarketplaceBotCommandPayload,
  MarketplaceBotQueueItem,
  MarketplaceBotSchedule,
} from '@sgi/contracts';
import { useState } from 'react';

import {
  botDayLabels,
  buildScheduleCommand,
  describeSchedule,
  formatBotLocalTime,
  isValidMoveValue,
  slotsPerDay,
  toLocalInputValue,
  type ScheduleDraft,
} from '@/lib/integrations/marketplace-bot-schedule';

type Send = (
  command: MarketplaceBotCommandPayload,
  successMessage: string,
) => Promise<void>;

function draftFrom(schedule: MarketplaceBotSchedule): ScheduleDraft {
  return {
    activeDays: schedule.activeDays,
    endTime: schedule.endTime,
    intervalMinutes: String(schedule.intervalMinutes),
    maxPerDay: String(schedule.maxPerDay),
    regenerate: false,
    startTime: schedule.startTime,
  };
}

/**
 * Publishing window of the bot. Sellers see it; administrators can change it.
 * Times are the bot computer's clock (Nicaragua).
 */
export function BotSchedulePanel({
  busy,
  canControl,
  schedule,
  onSend,
}: {
  busy: boolean;
  canControl: boolean;
  schedule: MarketplaceBotSchedule | null;
  onSend: Send;
}) {
  // The draft exists only while editing; otherwise the panel shows what the
  // bot reported in its last pulse.
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [formError, setFormError] = useState('');
  const editing = draft !== null;

  if (!schedule) {
    return (
      <div className="work-panel">
        <h3>Horario de publicación</h3>
        <p>
          Esta versión del bot todavía no informa su horario. Se mostrará aquí
          cuando el bot se actualice.
        </p>
      </div>
    );
  }

  const preview = draft ? buildScheduleCommand(draft) : null;
  const fits =
    preview?.ok && preview.command.type === 'SET_SCHEDULE'
      ? slotsPerDay(preview.command)
      : null;

  async function submit() {
    if (!draft) return;
    const result = buildScheduleCommand(draft);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    if (
      draft.regenerate &&
      !window.confirm(
        'Se borrarán las publicaciones futuras del calendario (también las aprobadas) y el bot armará otras con el nuevo horario. Quedarán por aprobar. ¿Continuar?',
      )
    ) {
      return;
    }
    setFormError('');
    await onSend(
      result.command,
      draft.regenerate
        ? 'Se envió el nuevo horario; el bot rehará el calendario.'
        : 'Se envió el nuevo horario al bot.',
    );
    setDraft(null);
  }

  function toggleDay(day: number) {
    setDraft((current) =>
      current
        ? {
            ...current,
            activeDays: current.activeDays.includes(day)
              ? current.activeDays.filter((value) => value !== day)
              : [...current.activeDays, day],
          }
        : current,
    );
  }

  return (
    <div className="work-panel">
      <div className="section-heading">
        <h3>Horario de publicación</h3>
        {canControl && !editing ? (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => setDraft(draftFrom(schedule))}
            type="button"
          >
            Cambiar horario
          </button>
        ) : null}
      </div>

      {!draft ? (
        <dl className="schedule-summary">
          <div>
            <dt>Publica</dt>
            <dd>{describeSchedule(schedule)}</dd>
          </div>
          <div>
            <dt>Máximo por día</dt>
            <dd>{schedule.maxPerDay} publicaciones</dd>
          </div>
          <div>
            <dt>Separación mínima</dt>
            <dd>{schedule.intervalMinutes} minutos</dd>
          </div>
          <div>
            <dt>Hora en la computadora del bot</dt>
            <dd>
              {schedule.botTime ? formatBotLocalTime(schedule.botTime) : '—'}
            </dd>
          </div>
        </dl>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset className="schedule-days">
            <legend>Días en que publica</legend>
            {botDayLabels.map((label, day) => (
              <label className="checkbox-field" key={label}>
                <input
                  checked={draft.activeDays.includes(day)}
                  onChange={() => toggleDay(day)}
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </fieldset>

          <div className="form-grid">
            <label className="form-field">
              <span>Desde (hora de Nicaragua)</span>
              <input
                onChange={(event) =>
                  setDraft({ ...draft, startTime: event.target.value })
                }
                required
                type="time"
                value={draft.startTime}
              />
            </label>
            <label className="form-field">
              <span>Hasta</span>
              <input
                onChange={(event) =>
                  setDraft({ ...draft, endTime: event.target.value })
                }
                required
                type="time"
                value={draft.endTime}
              />
            </label>
            <label className="form-field">
              <span>Máximo por día</span>
              <input
                inputMode="numeric"
                max={20}
                min={1}
                onChange={(event) =>
                  setDraft({ ...draft, maxPerDay: event.target.value })
                }
                required
                type="number"
                value={draft.maxPerDay}
              />
            </label>
            <label className="form-field">
              <span>Separación mínima (minutos)</span>
              <input
                inputMode="numeric"
                max={1440}
                min={30}
                onChange={(event) =>
                  setDraft({ ...draft, intervalMinutes: event.target.value })
                }
                required
                step={15}
                type="number"
                value={draft.intervalMinutes}
              />
            </label>
          </div>

          {fits !== null ? (
            <p className="schedule-hint">
              Con este horario caben hasta {fits}{' '}
              {fits === 1 ? 'publicación' : 'publicaciones'} por día.
            </p>
          ) : null}

          <label className="checkbox-field">
            <input
              checked={draft.regenerate}
              onChange={(event) =>
                setDraft({ ...draft, regenerate: event.target.checked })
              }
              type="checkbox"
            />
            Rehacer el calendario con el nuevo horario (las publicaciones
            futuras se reemplazan y quedan por aprobar)
          </label>

          {formError ? <p role="alert">{formError}</p> : null}

          <div className="user-actions-buttons">
            <button className="primary-button" disabled={busy} type="submit">
              Guardar horario
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setFormError('');
              }}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Move one pending post to another date and time, or publish it now. */
export function QueueItemTimeControls({
  busy,
  item,
  onSend,
}: {
  busy: boolean;
  item: MarketplaceBotQueueItem;
  onSend: Send;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(toLocalInputValue(item.scheduledAt));

  if (!open) {
    return (
      <>
        <button
          className="table-action"
          disabled={busy}
          onClick={() => {
            setValue(toLocalInputValue(item.scheduledAt));
            setOpen(true);
          }}
          type="button"
        >
          Mover
        </button>
        <button
          className="table-action"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                `¿Publicar «${item.name}» ahora? El bot respeta el horario y los límites de seguridad de la cuenta.`,
              )
            ) {
              void onSend(
                {
                  action: 'publish_now',
                  id: item.id,
                  type: 'QUEUE_ITEM_ACTION',
                },
                'Se pidió publicar ahora; el bot lo hará en cuanto el horario y los límites lo permitan.',
              );
            }
          }}
          type="button"
        >
          Publicar ya
        </button>
      </>
    );
  }

  const changed = value !== toLocalInputValue(item.scheduledAt);
  return (
    <span className="queue-move">
      <input
        aria-label={`Nueva fecha y hora para ${item.name} (hora de Nicaragua)`}
        onChange={(event) => setValue(event.target.value)}
        type="datetime-local"
        value={value}
      />
      <button
        className="table-action"
        disabled={busy || !changed || !isValidMoveValue(value)}
        onClick={() => {
          void onSend(
            {
              action: 'move',
              id: item.id,
              scheduledAt: value,
              type: 'QUEUE_ITEM_ACTION',
            },
            `Se pidió mover «${item.name}» al ${formatBotLocalTime(value)}.`,
          );
          setOpen(false);
        }}
        type="button"
      >
        Guardar
      </button>
      <button
        className="table-action"
        disabled={busy}
        onClick={() => setOpen(false)}
        type="button"
      >
        Cancelar
      </button>
    </span>
  );
}
