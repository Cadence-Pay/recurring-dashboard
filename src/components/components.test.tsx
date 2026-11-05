import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Health, KeeperClient } from '../lib/keeper-client';
import { KeeperApiError, KeeperNetworkError } from '../lib/keeper-client';
import type { AsyncState } from '../lib/use-async';
import { ConfigProblems, KeeperStatus, KeeperStatusView, formatTime } from './KeeperStatus';
import { NAV_ITEMS, NavList, isCurrent } from './Nav';
import { StateView } from './StateView';

const HEALTH: Health = {
  status: 'ok',
  network: 'testnet',
  contractId: 'CCUXOGU3N5HWMLRDXC5TCQ3QDA23X3RJCDXWHMBIC4SFLD2IABQT465E',
  readOnly: false,
  lastSyncAt: 1_793_886_022,
};

function clientWith(getHealth: KeeperClient['getHealth']): KeeperClient {
  const unused = () => Promise.reject(new Error('not used in this test'));
  return {
    getHealth,
    getPlan: unused,
    listPlans: unused,
    listSubscriptions: unused,
    listCharges: unused,
    getRevenue: unused,
  };
}

describe('StateView', () => {
  const render_ = (state: AsyncState<string[]>, extra: { onRetry?: () => void } = {}) =>
    render(
      <StateView state={state} what="plans" isEmpty={(items) => items.length === 0} {...extra}>
        {(items) => (
          <ul>
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </StateView>,
    );

  it('announces loading politely', () => {
    render_({ status: 'loading' });
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Loading plans');
  });

  it('shows the data when there is some', () => {
    render_({ status: 'ready', data: ['one', 'two'] });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['one', 'two']);
  });

  it('shows an empty message instead of an empty list', () => {
    render_({ status: 'ready', data: [] });
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByText('No plans yet.')).toBeTruthy();
  });

  it('shows an error as an alert with a retry button that works', () => {
    const onRetry = vi.fn();
    render_({ status: 'error', error: new Error('boom') }, { onRetry });
    expect(screen.getByRole('alert').textContent).toContain('Could not load plans');
    expect(screen.getByRole('alert').textContent).toContain('boom');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when no retry is possible', () => {
    render_({ status: 'error', error: new Error('boom') });
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('KeeperStatusView', () => {
  it('loads and shows the keeper', async () => {
    const client = clientWith(() => Promise.resolve(HEALTH));
    render(<KeeperStatusView client={client} expectedNetwork="testnet" />);
    expect(screen.getByRole('status').textContent).toContain('Loading the keeper status');
    expect(await screen.findByText('Charging')).toBeTruthy();
    expect(screen.getByText(HEALTH.contractId)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says when the keeper is read only and has not synced', async () => {
    const client = clientWith(() =>
      Promise.resolve({ ...HEALTH, readOnly: true, lastSyncAt: null }),
    );
    render(<KeeperStatusView client={client} expectedNetwork="testnet" />);
    expect(await screen.findByText(/Read only/)).toBeTruthy();
    expect(screen.getByText('not yet')).toBeTruthy();
  });

  it('warns when the keeper is on another network than the dashboard expects', async () => {
    const client = clientWith(() => Promise.resolve({ ...HEALTH, network: 'mainnet' }));
    render(<KeeperStatusView client={client} expectedNetwork="testnet" />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('keeper is on mainnet');
    expect(alert.textContent).toContain('expects testnet');
  });

  it('shows an error when the keeper cannot be reached, and loads again on retry', async () => {
    const getHealth = vi
      .fn<KeeperClient['getHealth']>()
      .mockRejectedValueOnce(new KeeperNetworkError(new Error('down')))
      .mockResolvedValueOnce(HEALTH);
    render(<KeeperStatusView client={clientWith(getHealth)} expectedNetwork="testnet" />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not reach the keeper');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Charging')).toBeTruthy();
    expect(getHealth).toHaveBeenCalledTimes(2);
  });

  it('shows the keeper error message for an error answer', async () => {
    const client = clientWith(() =>
      Promise.reject(new KeeperApiError(500, 'INTERNAL', 'Internal error')),
    );
    render(<KeeperStatusView client={client} expectedNetwork="testnet" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Internal error');
  });
});

describe('KeeperStatus (reads the settings)', () => {
  it('explains what is missing when the dashboard is not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_KEEPER_URL', '');
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', '');
    try {
      render(<KeeperStatus />);
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('not configured');
      expect(alert.textContent).toContain('NEXT_PUBLIC_KEEPER_URL');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('starts loading when the settings are valid', async () => {
    vi.stubEnv('NEXT_PUBLIC_KEEPER_URL', 'http://127.0.0.1:1');
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE', 'Test SDF Network ; September 2015');
    vi.stubEnv('NEXT_PUBLIC_STELLAR_RPC_URL', 'https://soroban-testnet.stellar.org');
    vi.stubEnv(
      'NEXT_PUBLIC_CONTRACT_ID',
      'CCUXOGU3N5HWMLRDXC5TCQ3QDA23X3RJCDXWHMBIC4SFLD2IABQT465E',
    );
    try {
      render(<KeeperStatus />);
      expect(screen.getByRole('status').textContent).toContain('Loading');
      // Nothing listens on port 1, so the load fails with a clear error and not a crash.
      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toContain('Could not reach the keeper');
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('lists problems in ConfigProblems', () => {
    render(<ConfigProblems problems={['A: bad', 'B: worse']} />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'A: bad',
      'B: worse',
    ]);
  });
});

describe('formatTime', () => {
  it('says "not yet" for null and formats a real time', () => {
    expect(formatTime(null)).toBe('not yet');
    expect(formatTime(0)).toBe(new Date(0).toLocaleString());
  });
});

describe('navigation', () => {
  it('matches the overview only on the exact path', () => {
    expect(isCurrent('/', '/')).toBe(true);
    expect(isCurrent('/', '/plans')).toBe(false);
  });

  it('matches a section and its sub pages, but not a look-alike prefix', () => {
    expect(isCurrent('/plans', '/plans')).toBe(true);
    expect(isCurrent('/plans', '/plans/3')).toBe(true);
    expect(isCurrent('/plans', '/plans-old')).toBe(false);
  });

  it('marks only the current page with aria-current', () => {
    render(
      <nav aria-label="Main">
        <NavList items={NAV_ITEMS} pathname="/plans/2" />
      </nav>,
    );
    expect(screen.getByRole('link', { name: 'Plans' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
  });
});
