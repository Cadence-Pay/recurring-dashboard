import { describe, expect, it } from 'vitest';
import { explorerTxUrl } from './explorer';

const HASH = '9d5fa7605df7e7be0cad4fb12045cbf46259d536519513a59937aaa1e97f832a';

describe('explorerTxUrl', () => {
  it('links testnet and mainnet transactions to the matching explorer', () => {
    expect(explorerTxUrl('testnet', HASH)).toBe(
      `https://stellar.expert/explorer/testnet/tx/${HASH}`,
    );
    expect(explorerTxUrl('mainnet', HASH)).toBe(
      `https://stellar.expert/explorer/public/tx/${HASH}`,
    );
  });

  it('lowercases the hash', () => {
    expect(explorerTxUrl('testnet', HASH.toUpperCase())).toContain(HASH);
  });

  it('gives no link for a private network or a malformed hash', () => {
    expect(explorerTxUrl('local', HASH)).toBeUndefined();
    expect(explorerTxUrl('testnet', 'not-a-hash')).toBeUndefined();
    expect(explorerTxUrl('testnet', `${HASH}00`)).toBeUndefined();
  });
});
