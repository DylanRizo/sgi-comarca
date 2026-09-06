'use client';
import { useRef, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { ApiHttpError } from '@/lib/http/api-client';

type Work = (key: string, csrf: string) => Promise<void>;

// Retains the same command and key after an ambiguous response. Editing the
// draft is blocked until this intent is recovered, never silently duplicated.
export function useStockMutation() {
  const { getCsrfToken } = useAuth();
  const running = useRef(false);
  const completed = useRef(false);
  const attempt = useRef<{ key: string; work: Work } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  async function execute(work: Work) {
    if (running.current || completed.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    attempt.current ??= { key: crypto.randomUUID(), work };
    try {
      await attempt.current.work(attempt.current.key, await getCsrfToken());
      completed.current = true;
      attempt.current = null;
      setUncertain(false);
    } catch (failure) {
      const ambiguous =
        !(failure instanceof ApiHttpError) ||
        failure.status >= 500 ||
        failure.status < 400;
      setUncertain(ambiguous);
      setError(
        ambiguous
          ? 'No pudimos confirmar la respuesta. Conservamos tu operación: pulsa Reintentar para recuperar el resultado sin duplicarla.'
          : failure.code === 'HTTP_ERROR'
            ? 'No se pudo completar la operación. Revisa los campos y los permisos de tu sesión.'
            : failure.message,
      );
      if (!ambiguous) attempt.current = null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function reset() {
    if (running.current || uncertain) return;
    completed.current = false;
    attempt.current = null;
    setError('');
  }
  return { busy, uncertain, error, execute, reset };
}
