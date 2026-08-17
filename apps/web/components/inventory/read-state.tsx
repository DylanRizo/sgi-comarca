import type { ReactNode } from 'react';

export function ReadState({
  action,
  children,
  title,
  tone = 'neutral',
}: Readonly<{
  action?: ReactNode;
  children: ReactNode;
  title: string;
  tone?: 'error' | 'neutral' | 'warning';
}>) {
  return (
    <section className="read-state" data-tone={tone} role="status">
      <h2>{title}</h2>
      <div>{children}</div>
      {action ? <div className="read-state-action">{action}</div> : null}
    </section>
  );
}

export function RetryButton({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <button className="secondary-button" onClick={onRetry} type="button">
      Reintentar
    </button>
  );
}
