import type { ReactNode } from 'react';

export const metadata = { title: 'Stellar Recurring dashboard' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
