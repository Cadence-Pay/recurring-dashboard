/* eslint-disable @typescript-eslint/unbound-method --
   Mocks created with vi.fn are asserted on directly. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WalletError, type WalletAdapter, type WalletSession } from '../lib/wallet';
import { WalletButton, shortAddress } from './WalletButton';
import { WalletProvider, useWallet } from './WalletProvider';

const TESTNET = 'Test SDF Network ; September 2015';
const MAINNET = 'Public Global Stellar Network ; September 2015';
const ADDRESS = 'GACJH7JXHQWIW66GHZFNMCK2I7WOZ562QAOF7B7PUENTAPRGC5RLW24A';

function adapterWith(connect: () => Promise<WalletSession>): WalletAdapter {
  return {
    connect: vi.fn(connect),
    disconnect: vi.fn(() => Promise.resolve()),
    signTransaction: vi.fn(() => Promise.resolve('SIGNED')),
  };
}

function setup(adapter: WalletAdapter) {
  return render(
    <WalletProvider adapter={adapter} expectedPassphrase={TESTNET}>
      <WalletButton networkLabel="testnet" />
    </WalletProvider>,
  );
}

describe('shortAddress', () => {
  it('shortens a long address and leaves a short one alone', () => {
    expect(shortAddress(ADDRESS)).toBe('GACJH…W24A');
    expect(shortAddress('GABC')).toBe('GABC');
  });
});

describe('WalletButton', () => {
  it('starts disconnected with a connect button', () => {
    setup(adapterWith(() => Promise.resolve({ address: ADDRESS, networkPassphrase: TESTNET })));
    expect(screen.getByRole('button', { name: 'Connect wallet' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('connects, then shows the short address, the network and a disconnect button', async () => {
    setup(adapterWith(() => Promise.resolve({ address: ADDRESS, networkPassphrase: TESTNET })));
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(await screen.findByRole('button', { name: 'Disconnect' })).toBeTruthy();
    const short = screen.getByText('GACJH…W24A');
    expect(short.getAttribute('title')).toBe(ADDRESS);
    expect(screen.getByText('testnet')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows connecting state while waiting and ignores a second click', async () => {
    let finish: (s: WalletSession) => void = () => undefined;
    const adapter = adapterWith(
      () =>
        new Promise<WalletSession>((resolve) => {
          finish = resolve;
        }),
    );
    setup(adapter);
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    const busy = await screen.findByRole('button', { name: 'Connecting…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(busy);
    finish({ address: ADDRESS, networkPassphrase: TESTNET });
    await screen.findByRole('button', { name: 'Disconnect' });
    expect(adapter.connect).toHaveBeenCalledTimes(1);
  });

  it('shows the reason and lets the person try again after a failure', async () => {
    const connect = vi
      .fn<() => Promise<WalletSession>>()
      .mockRejectedValueOnce(
        new WalletError('REJECTED', 'The request was closed or declined in your wallet.'),
      )
      .mockResolvedValueOnce({ address: ADDRESS, networkPassphrase: TESTNET });
    setup(adapterWith(connect));
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect((await screen.findByRole('alert')).textContent).toContain('declined in your wallet');
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(await screen.findByRole('button', { name: 'Disconnect' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a readable message even for an unexpected error', async () => {
    setup(adapterWith(() => Promise.reject(new Error('boom'))));
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect((await screen.findByRole('alert')).textContent).toContain('boom');
  });

  it('disconnects', async () => {
    const adapter = adapterWith(() =>
      Promise.resolve({ address: ADDRESS, networkPassphrase: TESTNET }),
    );
    setup(adapter);
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByRole('button', { name: 'Connect wallet' })).toBeTruthy();
    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
  });

  it('warns when the wallet is on another network', async () => {
    setup(adapterWith(() => Promise.resolve({ address: ADDRESS, networkPassphrase: MAINNET })));
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('different network');
    expect(alert.textContent).toContain('testnet');
  });

  it('does not warn when the wallet is on the right network', async () => {
    setup(adapterWith(() => Promise.resolve({ address: ADDRESS, networkPassphrase: TESTNET })));
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    await screen.findByRole('button', { name: 'Disconnect' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when the wallet did not report its network', async () => {
    setup(adapterWith(() => Promise.resolve({ address: ADDRESS, networkPassphrase: null })));
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    await waitFor(() => {
      expect(screen.getByText(/did not report its network/)).toBeTruthy();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('useWallet', () => {
  it('refuses to work outside a WalletProvider', () => {
    function Lonely() {
      useWallet();
      return null;
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(() => render(<Lonely />)).toThrow(/WalletProvider/);
    } finally {
      spy.mockRestore();
    }
  });
});
