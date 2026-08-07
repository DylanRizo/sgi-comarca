import type { Ref } from 'react';

export function AuthFeedback({
  children,
  feedbackRef,
  id,
  tone = 'error',
}: Readonly<{
  children: string;
  feedbackRef?: Ref<HTMLParagraphElement>;
  id?: string;
  tone?: 'error' | 'success';
}>) {
  return (
    <p
      className="auth-feedback"
      data-tone={tone}
      id={id}
      ref={feedbackRef}
      role={tone === 'success' ? 'status' : 'alert'}
      tabIndex={-1}
    >
      {children}
    </p>
  );
}
