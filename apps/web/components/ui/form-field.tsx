import type { ReactNode } from 'react';

export function FormField({
  label,
  hint,
  children,
}: Readonly<{
  label: string;
  hint?: string;
  children: ReactNode;
}>) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
