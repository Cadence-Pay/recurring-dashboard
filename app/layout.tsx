import type { ReactNode } from 'react';
import { AppShell } from '../src/components/AppShell';
import './globals.css';

export const metadata = {
  title: 'Stellar Recurring dashboard',
  description: 'Merchant dashboard for pull-based subscription billing on Stellar.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
