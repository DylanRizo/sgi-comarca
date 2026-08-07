'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { validateNewPassword } from '@/lib/auth/password-input';
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
    if (error && ready && !tokenAvailable) feedbackRef.current?.focus();
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
    } catch {
      tokenRef.current = null;
      setTokenAvailable(false);
      setError('No fue posible activar la cuenta. Solicita un enlace nuevo.');
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form aria-busy={submitting} className="auth-form" onSubmit={submit}>
      {error ? (
        <AuthFeedback feedbackRef={feedbackRef}>{error}</AuthFeedback>
      ) : null}
      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <input
          aria-describedby="password-help"
          autoComplete="new-password"
          disabled={!ready || !tokenAvailable || submitting}
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
          disabled={!ready || !tokenAvailable || submitting}
          id="confirmation"
          name="confirmation"
          type="password"
        />
      </div>
      <button
        className="primary-button"
        disabled={!ready || !tokenAvailable || submitting}
        type="submit"
      >
        {submitting ? 'Activando…' : 'Activar cuenta'}
      </button>
    </form>
  );
}
