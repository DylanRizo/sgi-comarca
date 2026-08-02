import type { ReactNode } from 'react';

interface TechnicalStatusProps {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning';
}

export function TechnicalStatus({
  children,
  tone = 'neutral',
}: TechnicalStatusProps) {
  return <span data-tone={tone}>{children}</span>;
}
