import { describe, expect, it } from 'vitest';
import { readPublicConfig } from './config';

const CONTRACT = 'CCUXOGU3N5HWMLRDXC5TCQ3QDA23X3RJCDXWHMBIC4SFLD2IABQT465E';
const TESTNET = 'Test SDF Network ; September 2015';

function valid(): Record<string, string> {
  return {
    NEXT_PUBLIC_KEEPER_URL: 'http://127.0.0.1:8080',
    NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
    NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: TESTNET,
    NEXT_PUBLIC_STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
    NEXT_PUBLIC_CONTRACT_ID: CONTRACT,
  };
}

function problemsOf(raw: Record<string, string | undefined>): string {
  const result = readPublicConfig(raw);
  if (result.ok) throw new Error('expected the settings to be rejected');
  return result.problems.join(' | ');
}

describe('readPublicConfig', () => {
  it('reads valid settings', () => {
    expect(readPublicConfig(valid())).toEqual({
      ok: true,
      config: {
        keeperUrl: 'http://127.0.0.1:8080',
        network: 'testnet',
        networkPassphrase: TESTNET,
        rpcUrl: 'https://soroban-testnet.stellar.org',
        contractId: CONTRACT,
      },
    });
  });

  it('names every missing variable', () => {
    const text = problemsOf({});
    for (const name of Object.keys(valid())) expect(text).toContain(name);
  });

  it('treats empty values as missing', () => {
    expect(problemsOf({ ...valid(), NEXT_PUBLIC_KEEPER_URL: '' })).toContain(
      'NEXT_PUBLIC_KEEPER_URL',
    );
  });

  it('rejects a keeper URL that is not http or https, without repeating it', () => {
    const text = problemsOf({ ...valid(), NEXT_PUBLIC_KEEPER_URL: 'ftp://secret-host.example' });
    expect(text).toContain('NEXT_PUBLIC_KEEPER_URL');
    expect(text).not.toContain('secret-host');
  });

  it('rejects a malformed contract id', () => {
    expect(problemsOf({ ...valid(), NEXT_PUBLIC_CONTRACT_ID: 'GABC' })).toContain(
      'NEXT_PUBLIC_CONTRACT_ID',
    );
  });

  it('rejects a passphrase that does not match the named network', () => {
    const text = problemsOf({
      ...valid(),
      NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: 'Public Global Stellar Network ; September 2015',
    });
    expect(text).toContain('does not match');
  });

  it('allows a custom network name with its own passphrase', () => {
    const result = readPublicConfig({
      ...valid(),
      NEXT_PUBLIC_STELLAR_NETWORK: 'local',
      NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE: 'Standalone Network ; February 2017',
    });
    expect(result.ok).toBe(true);
  });
});
