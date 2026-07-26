import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';
import './opening.css';
import './investigation.css';
import './asset-integration.css';
import './ui-polish.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env['NEXT_PUBLIC_SITE_URL'] ?? 'http://localhost:3000'),
  title: 'The Last Alibi',
  description: 'Investigate The Last Exhibit in a deterministic 64-case detective game.',
  icons: {
    icon: '/assets/brand/favicon.png',
  },
  openGraph: {
    title: 'The Last Alibi · The Last Exhibit',
    description: 'Enter the museum, test every alibi, and make one final accusation.',
    images: [
      {
        url: '/assets/marketing/social-preview.png',
        width: 1200,
        height: 630,
        alt: 'The Last Alibi',
      },
    ],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
