'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { validateNewPassword } from '@/lib/auth/password-input';
import { useAuth } from '@/providers/auth-provider';

import { AuthFeedback } from './auth-feedback';

export function ChangePasswordForm() {
  const router = useRouter();
  const { changePassword } = useAuth();
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const submissionRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error && !submitting) currentRef.current?.focus();
  }, [error, submitting]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionRef.current) return;
    submissionRef.current = true;
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get('currentPassword') ?? '');
    const newPassword = String(data.get('newPassword') ?? '');
    const confirmation = String(data.get('confirmation') ?? '');
    const validationErrors = validateNewPassword(newPassword, confirmation);
    const validationError =
      validationErrors.password ?? validationErrors.confirmation;
    if (validationError) {
      setError(validationError);
      newRef.current?.focus();
      submissionRef.current = false;
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await changePassword({
        currentPassword,
        newPassword: newPassword.normalize('NFC'),
      });
      router.replace('/login?passwordChanged=1' as Route);
    } catch {
      setError('No fue posible cambiar la contraseña.');
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form aria-busy={submitting} className="auth-form" onSubmit={submit}>
      {error ? <AuthFeedback>{error}</AuthFeedback> : null}
      <div className="field">
        <label htmlFor="currentPassword">Contraseña actual</label>
        <input
          autoComplete="current-password"
          disabled={submitting}
          id="currentPassword"
          name="currentPassword"
          ref={currentRef}
          required
          type="password"
        />
      </div>
      <div className="field">
        <label htmlFor="newPassword">Nueva contraseña</label>
        <input
          aria-describedby="new-password-help"
          autoComplete="new-password"
          disabled={submitting}
          id="newPassword"
          name="newPassword"
          ref={newRef}
          type="password"
        />
        <p className="field-help" id="new-password-help">
          Entre 12 y 128 caracteres. Los espacios se conservan.
        </p>
      </div>
      <div className="field">
        <label htmlFor="confirmation">Confirmar nueva contraseña</label>
        <input
          autoComplete="new-password"
          disabled={submitting}
          id="confirmation"
          name="confirmation"
          type="password"
        />
      </div>
      <button className="primary-button" disabled={submitting} type="submit">
        {submitting ? 'Actualizando…' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
