/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/prefer-promise-reject-errors --
   Mocks created with vi.fn are asserted on directly, and wallets really do reject with plain
   { code, message } objects, which these tests must reproduce. */
import { describe, expect, it, vi } from 'vitest';
import {
  WalletError,
  createKitAdapter,
  toWalletError,
  type KitLike,
  type KitLoader,
} from './wallet';

const TESTNET = 'Test SDF Network ; September 2015';
const ADDRESS = 'GACJH7JXHQWIW66GHZFNMCK2I7WOZ562QAOF7B7PUENTAPRGC5RLW24A';

function fakeKit(overrides: Partial<KitLike> = {}) {
  const kit: KitLike = {
    init: vi.fn(),
    authModal: vi.fn(() => Promise.resolve({ address: ADDRESS })),
    getNetwork: vi.fn(() => Promise.resolve({ network: 'TESTNET', networkPassphrase: TESTNET })),
    signTransaction: vi.fn(() => Promise.resolve({ signedTxXdr: 'SIGNED' })),
    disconnect: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  const loader: KitLoader = vi.fn(() => Promise.resolve({ kit, modules: () => ['module-a'] }));
  return { kit, loader };
}

describe('toWalletError', () => {
  it('recognises the SEP-43 "rejected" code', () => {
    const e = toWalletError({ code: -4, message: 'User rejected' });
    expect(e).toBeInstanceOf(WalletError);
    expect(e.code).toBe('REJECTED');
  });

  it('recognises a decline that is only described in words', () => {
    expect(toWalletError(new Error('The user closed the modal')).code).toBe('REJECTED');
    expect(toWalletError('request denied').code).toBe('REJECTED');
  });

  it('keeps other failures as FAILED with the wallet message', () => {
    const e = toWalletError(new Error('device is locked'));
    expect(e.code).toBe('FAILED');
    expect(e.message).toContain('device is locked');
  });

  it('copes with errors that carry nothing useful', () => {
    expect(toWalletError(undefined).message).toBe('The wallet reported an error.');
    expect(toWalletError({ code: -1 }).code).toBe('FAILED');
  });

  it('passes a WalletError through unchanged', () => {
    const original = new WalletError('FAILED', 'x');
    expect(toWalletError(original)).toBe(original);
  });
});

describe('createKitAdapter', () => {
  it('connects, reports the address and the wallet network', async () => {
    const { loader } = fakeKit();
    const session = await createKitAdapter(TESTNET, loader).connect();
    expect(session).toEqual({ address: ADDRESS, networkPassphrase: TESTNET });
  });

  it('loads and initialises the kit once, for the configured network', async () => {
    const { kit, loader } = fakeKit();
    const adapter = createKitAdapter(TESTNET, loader);
    await adapter.connect();
    await adapter.connect();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(kit.init).toHaveBeenCalledTimes(1);
    expect(kit.init).toHaveBeenCalledWith({ modules: ['module-a'], network: TESTNET });
  });

  it('does not touch the kit until it is used', () => {
    const { loader } = fakeKit();
    createKitAdapter(TESTNET, loader);
    expect(loader).not.toHaveBeenCalled();
  });

  it('still connects when the wallet cannot report its network', async () => {
    const { loader } = fakeKit({ getNetwork: () => Promise.reject(new Error('unsupported')) });
    const session = await createKitAdapter(TESTNET, loader).connect();
    expect(session).toEqual({ address: ADDRESS, networkPassphrase: null });
  });

  it('turns a declined connection into a REJECTED WalletError', async () => {
    const { loader } = fakeKit({ authModal: () => Promise.reject({ code: -4, message: 'no' }) });
    const failure = await createKitAdapter(TESTNET, loader)
      .connect()
      .catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(WalletError);
    expect((failure as WalletError).code).toBe('REJECTED');
  });

  it('turns a kit that fails to load into a FAILED WalletError', async () => {
    const loader: KitLoader = () => Promise.reject(new Error('chunk failed to load'));
    const failure = await createKitAdapter(TESTNET, loader)
      .connect()
      .catch((e: unknown) => e);
    expect((failure as WalletError).code).toBe('FAILED');
  });

  it('signs a transaction and returns the signed XDR', async () => {
    const { kit, loader } = fakeKit();
    const signed = await createKitAdapter(TESTNET, loader).signTransaction('XDR', {
      networkPassphrase: TESTNET,
      address: ADDRESS,
    });
    expect(signed).toBe('SIGNED');
    expect(kit.signTransaction).toHaveBeenCalledWith('XDR', {
      networkPassphrase: TESTNET,
      address: ADDRESS,
    });
  });

  it('reports a declined signature as REJECTED', async () => {
    const { loader } = fakeKit({
      signTransaction: () => Promise.reject({ code: -4, message: 'User declined' }),
    });
    const failure = await createKitAdapter(TESTNET, loader)
      .signTransaction('XDR', { networkPassphrase: TESTNET, address: ADDRESS })
      .catch((e: unknown) => e);
    expect((failure as WalletError).code).toBe('REJECTED');
  });

  it('disconnects, and never throws when the wallet refuses', async () => {
    const { kit, loader } = fakeKit();
    const adapter = createKitAdapter(TESTNET, loader);
    await adapter.disconnect();
    expect(kit.disconnect).toHaveBeenCalledTimes(1);

    const broken = fakeKit({ disconnect: () => Promise.reject(new Error('already gone')) });
    await expect(createKitAdapter(TESTNET, broken.loader).disconnect()).resolves.toBeUndefined();
    const unloadable: KitLoader = () => Promise.reject(new Error('no kit'));
    await expect(createKitAdapter(TESTNET, unloadable).disconnect()).resolves.toBeUndefined();
  });
});
