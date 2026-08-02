'use client';

import type { ApiSuccess, HealthData } from '@sgi/contracts';
import { TechnicalStatus } from '@sgi/ui';
import { useEffect, useState } from 'react';

interface ApiStatusCardProps {
  apiUrl: string;
}

type ApiState =
  | { kind: 'loading' }
  | { kind: 'online'; checkedAt: string }
  | { kind: 'offline'; message: string };

export function ApiStatusCard({ apiUrl }: ApiStatusCardProps) {
  const [state, setState] = useState<ApiState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    async function checkApi(): Promise<void> {
      try {
        const response = await fetch(`${apiUrl}/api/v1/health`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const body = (await response.json()) as ApiSuccess<HealthData>;
        setState({ kind: 'online', checkedAt: body.data.timestamp });
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          kind: 'offline',
          message: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    void checkApi();
    return () => controller.abort();
  }, [apiUrl]);

  return (
    <section className="technical-card" aria-live="polite">
      <p className="eyebrow">Conectividad técnica</p>
      <h2>Estado de la API</h2>
      {state.kind === 'loading' && (
        <TechnicalStatus>Comprobando…</TechnicalStatus>
      )}
      {state.kind === 'online' && (
        <TechnicalStatus tone="success">
          API disponible ·{' '}
          {new Date(state.checkedAt).toLocaleTimeString('es-NI')}
        </TechnicalStatus>
      )}
      {state.kind === 'offline' && (
        <TechnicalStatus tone="warning">
          API no disponible · {state.message}
        </TechnicalStatus>
      )}
      <p className="technical-note">Origen configurado: {apiUrl}</p>
    </section>
  );
}
