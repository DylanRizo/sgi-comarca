'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { validateNewPassword } from '@/lib/auth/password-input';
import { ApiHttpError } from '@/lib/http/api-client';
import { authApi } from '@/lib/http/auth-api';
import { useAuth } from '@/providers/auth-provider';

import { AuthFeedback } from './auth-feedback';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function ActivationForm() {
  const router = useRouter();
  const { establish } = useAuth();
  const tokenRef = useRef<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const submissionRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [tokenAvailable, setTokenAvailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const token = parameters.get('token');
    tokenRef.current = token && TOKEN_PATTERN.test(token) ? token : null;
    window.history.replaceState(null, '', '/activate');
    const valid = tokenRef.current !== null;
    queueMicrotask(() => {
      if (!mounted) return;
      setReady(true);
      setTokenAvailable(valid);
      if (!valid) setError('El enlace de activación no es válido.');
    });
    return () => {
      mounted = false;
      tokenRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!error || !ready) return;
    if (tokenAvailable) {
      passwordRef.current?.focus();
      return;
    }
    feedbackRef.current?.focus();
  }, [error, ready, tokenAvailable]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionRef.current || !tokenRef.current) return;
    submissionRef.current = true;
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    const confirmation = String(data.get('confirmation') ?? '');
    const validationErrors = validateNewPassword(password, confirmation);
    const validationError =
      validationErrors.password ?? validationErrors.confirmation;
    if (validationError) {
      setError(validationError);
      passwordRef.current?.focus();
      submissionRef.current = false;
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const result = await authApi.activate({
        password: password.normalize('NFC'),
        token: tokenRef.current,
      });
      tokenRef.current = null;
      setTokenAvailable(false);
      await establish(result);
      router.replace('/app' as Route);
    } catch (activationError) {
      if (
        activationError instanceof ApiHttpError &&
        activationError.code === 'PASSWORD_POLICY_REJECTED'
      ) {
        setError(
          'La contraseña no cumple la política aprobada. Usa una frase distinta que no sea común ni incluya tu usuario.',
        );
      } else if (
        activationError instanceof ApiHttpError &&
        activationError.code === 'ACTIVATION_FAILED'
      ) {
        tokenRef.current = null;
        setTokenAvailable(false);
        setError('No fue posible activar la cuenta. Solicita un enlace nuevo.');
      } else {
        setError(
          'No fue posible conectar con el servicio de activación. Intenta nuevamente.',
        );
      }
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-flow">
      {error ? (
        <AuthFeedback feedbackRef={feedbackRef}>{error}</AuthFeedback>
      ) : null}
      {!ready ? <p role="status">Comprobando invitación…</p> : null}
      {ready && !tokenAvailable ? (
        <section className="auth-recovery" aria-labelledby="activation-help">
          <h2 id="activation-help">Cómo continuar</h2>
          <ol>
            <li>Pide a la persona administradora una invitación nueva.</li>
            <li>Abre únicamente el enlace privado que recibas.</li>
            <li>Crea tu contraseña antes de que el enlace venza.</li>
          </ol>
          <p>
            La invitación anterior queda inutilizable. No necesitas compartir tu
            contraseña con nadie.
          </p>
          <Link className="secondary-link" href="/login">
            Volver a iniciar sesión
          </Link>
        </section>
      ) : null}
      {ready && tokenAvailable ? (
        <form aria-busy={submitting} className="auth-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              aria-describedby="password-help"
              autoComplete="new-password"
              disabled={submitting}
              id="password"
              name="password"
              ref={passwordRef}
              type="password"
            />
            <p className="field-help" id="password-help">
              Entre 12 y 128 caracteres. Los espacios se conservan.
            </p>
          </div>
          <div className="field">
            <label htmlFor="confirmation">Confirmar contraseña</label>
            <input
              autoComplete="new-password"
              disabled={submitting}
              id="confirmation"
              name="confirmation"
              type="password"
            />
          </div>
          <button
            className="primary-button"
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Activando…' : 'Activar cuenta'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
