'use client';

import { useEffect, useState } from 'react';
import type { AlexaLinkStatusData } from '@sgi/contracts';

import { alexaApi } from '@/lib/http/alexa-api';
import { useAuth } from '@/providers/auth-provider';

export function AlexaLinkStatus() {
  const { getCsrfToken } = useAuth();
  const [status, setStatus] = useState<AlexaLinkStatusData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void alexaApi
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status?.linked) return null;
  return (
    <section className="detail-section">
      <h2>Alexa</h2>
      <p>La cuenta está vinculada para consultas de inventario y ventas.</p>
      {error ? <p role="alert">{error}</p> : null}
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void getCsrfToken()
            .then((token) => alexaApi.revoke(token))
            .then(() =>
              setStatus({ authorizedAt: null, linked: false, scopes: [] }),
            )
            .catch(() =>
              setError('No fue posible desvincular Alexa. Intenta nuevamente.'),
            )
            .finally(() => setBusy(false));
        }}
        type="button"
      >
        {busy ? 'Desvinculando…' : 'Desvincular Alexa'}
      </button>
    </section>
  );
}
