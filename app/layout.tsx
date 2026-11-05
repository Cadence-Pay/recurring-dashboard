import type { ReactNode } from 'react';
import { MainNav } from '../src/components/Nav';
import './globals.css';

export const metadata = {
  title: 'Stellar Recurring dashboard',
  description: 'Merchant dashboard for pull-based subscription billing on Stellar.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <header className="site-header">
          <div className="site-header__inner">
            <span className="brand">Stellar Recurring</span>
            <MainNav />
          </div>
        </header>
        <main id="main" className="site-main" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
