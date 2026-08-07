'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useAuth } from '@/providers/auth-provider';

export function LogoutButton() {
  const router = useRouter();
  const { logout } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  async function handleLogout() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await logout();
    } finally {
      router.replace('/login' as Route);
    }
  }

  return (
    <button
      className="secondary-button"
      disabled={submitting}
      onClick={() => void handleLogout()}
      type="button"
    >
      {submitting ? 'Cerrando…' : 'Cerrar sesión'}
    </button>
  );
}
