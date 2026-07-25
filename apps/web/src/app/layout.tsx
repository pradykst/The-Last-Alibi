import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import './opening.css';
import './investigation.css';

export const metadata: Metadata = {
  title: 'The Last Alibi',
  description: 'Investigate The Last Exhibit in a deterministic 64-case detective game.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
