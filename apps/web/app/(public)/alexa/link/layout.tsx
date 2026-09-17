import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Vincular Alexa' };

export default function AlexaLinkLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
