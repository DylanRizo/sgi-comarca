'use client';

import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { alexaApi } from '@/lib/http/alexa-api';
import { useAuth } from '@/providers/auth-provider';

import { AuthFeedback } from './auth-feedback';

const requiredParameters = [
  'client_id',
  'redirect_uri',
  'response_type',
  'state',
  'code_challenge',
  'code_challenge_method',
] as const;

export function AlexaLinkForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { getCsrfToken, state } = useAuth();
  const submission = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete =
    requiredParameters.every((name) => Boolean(search.get(name))) &&
    search.get('response_type') === 'code' &&
    search.get('code_challenge_method') === 'S256';
  const returnPath = useMemo(() => {
    const query = search.toString();
    return `/alexa/link${query ? `?${query}` : ''}`;
  }, [search]);

  useEffect(() => {
    if (state.kind === 'anonymous') {
      router.replace(`/login?next=${encodeURIComponent(returnPath)}` as Route);
    }
  }, [returnPath, router, state.kind]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current || state.kind !== 'authenticated' || !complete)
      return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const approved =
      submitter instanceof HTMLButtonElement &&
      submitter.name === 'decision' &&
      submitter.value === 'approve';
    submission.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await alexaApi.authorize(
        {
          approved,
          clientId: search.get('client_id') ?? '',
          codeChallenge: search.get('code_challenge') ?? '',
          codeChallengeMethod: 'S256',
          redirectUri: search.get('redirect_uri') ?? '',
          responseType: 'code',
          scope: search.get('scope') ?? '',
          state: search.get('state') ?? '',
        },
        await getCsrfToken(),
      );
      window.location.assign(result.redirectUrl);
    } catch {
      setError(
        'No fue posible vincular la cuenta. Verifica tus permisos e inténtalo nuevamente.',
      );
      submission.current = false;
      setSubmitting(false);
    }
  }

  if (state.kind === 'loading' || state.kind === 'anonymous') {
    return <p role="status">Verificando tu sesión segura…</p>;
  }
  if (!complete) {
    return (
      <AuthFeedback>
        La solicitud de Alexa está incompleta. Regresa a la app Alexa e intenta
        vincular la cuenta nuevamente.
      </AuthFeedback>
    );
  }

  return (
    <form aria-busy={submitting} className="auth-form" onSubmit={submit}>
      {error ? <AuthFeedback>{error}</AuthFeedback> : null}
      <p>
        Alexa solicita permiso para consultar en voz alta únicamente estos datos
        del SGI:
      </p>
      <ul className="account-permissions">
        <li>Existencias por producto y bodega.</li>
        <li>Ventas en tránsito, productos y cantidades.</li>
      </ul>
      <p className="auth-description">
        No podrá crear ni modificar productos, inventario o ventas. Tampoco
        recibirá precios, costos, pagos, clientes, direcciones u observaciones.
      </p>
      <button
        className="primary-button"
        disabled={submitting}
        name="decision"
        type="submit"
        value="approve"
      >
        {submitting ? 'Vinculando…' : 'Vincular Alexa'}
      </button>
      <button
        className="secondary-button"
        disabled={submitting}
        name="decision"
        type="submit"
        value="deny"
      >
        Cancelar
      </button>
    </form>
  );
}
