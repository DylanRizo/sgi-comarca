'use client';

import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { authApi } from '@/lib/http/auth-api';
import { useAuth } from '@/providers/auth-provider';

import { AuthFeedback } from './auth-feedback';

function safeDestination(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/app';
}

export function LoginForm() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const { establish } = useAuth();
  const identifierRef = useRef<HTMLInputElement>(null);
  const submissionRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error && !submitting) identifierRef.current?.focus();
  }, [error, submitting]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionRef.current) return;
    submissionRef.current = true;
    const data = new FormData(event.currentTarget);
    const identifier = String(data.get('identifier') ?? '');
    const password = String(data.get('password') ?? '');
    setError(null);
    setSubmitting(true);
    try {
      const result = await authApi.login({ identifier, password });
      await establish(result);
      router.replace(safeDestination(searchParameters.get('next')) as Route);
    } catch {
      setError('No fue posible iniciar sesión con esos datos.');
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form aria-busy={submitting} className="auth-form" onSubmit={submit}>
      {searchParameters.get('passwordChanged') === '1' ? (
        <AuthFeedback tone="success">
          Contraseña actualizada. Inicia sesión nuevamente.
        </AuthFeedback>
      ) : null}
      {error ? <AuthFeedback>{error}</AuthFeedback> : null}
      <div className="field">
        <label htmlFor="identifier">Usuario</label>
        <input
          autoComplete="username"
          disabled={submitting}
          id="identifier"
          name="identifier"
          ref={identifierRef}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">Contraseña</label>
        <input
          autoComplete="current-password"
          disabled={submitting}
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      <button className="primary-button" disabled={submitting} type="submit">
        {submitting ? 'Ingresando…' : 'Iniciar sesión'}
      </button>
    </form>
  );
}
