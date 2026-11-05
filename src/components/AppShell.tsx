'use client';

import { useMemo, type ReactNode } from 'react';
import { getPublicConfig } from '../lib/public-env';
import { createKitAdapter } from '../lib/wallet';
import { ConfigProblems } from './KeeperStatus';
import { MainNav } from './Nav';
import { WalletButton } from './WalletButton';
import { WalletProvider } from './WalletProvider';

/**
 * The frame around every page: skip link, header with navigation and wallet, and the main area.
 * If the dashboard is not configured, it shows what is missing instead of the page.
 */
export function AppShell(props: { children: ReactNode }) {
  const config = getPublicConfig();
  const passphrase = config.ok ? config.config.networkPassphrase : undefined;
  const adapter = useMemo(
    () => (passphrase === undefined ? undefined : createKitAdapter(passphrase)),
    [passphrase],
  );

  const frame = (wallet: ReactNode, body: ReactNode) => (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="site-header">
        <div className="site-header__inner">
          <span className="brand">Stellar Recurring</span>
          <MainNav />
          {wallet}
        </div>
      </header>
      <main id="main" className="site-main" tabIndex={-1}>
        {body}
      </main>
    </>
  );

  if (!config.ok || adapter === undefined) {
    return frame(null, <ConfigProblems problems={config.ok ? [] : config.problems} />);
  }
  return (
    <WalletProvider adapter={adapter} expectedPassphrase={config.config.networkPassphrase}>
      {frame(<WalletButton networkLabel={config.config.network} />, props.children)}
    </WalletProvider>
  );
}
