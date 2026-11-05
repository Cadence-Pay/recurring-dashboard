import { describe, expect, it } from 'vitest';
import { readPublicConfig } from './config';

describe('readPublicConfig', () => {
  it('reads valid settings', () => {
    const result = readPublicConfig({
      NEXT_PUBLIC_KEEPER_URL: 'http://127.0.0.1:8080',
      NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
    });
    expect(result).toEqual({
      ok: true,
      config: { keeperUrl: 'http://127.0.0.1:8080', network: 'testnet' },
    });
  });

  it('names every missing variable', () => {
    const result = readPublicConfig({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.problems.join('\n');
      expect(text).toContain('NEXT_PUBLIC_KEEPER_URL');
      expect(text).toContain('NEXT_PUBLIC_STELLAR_NETWORK');
    }
  });

  it('treats empty values as missing', () => {
    const result = readPublicConfig({
      NEXT_PUBLIC_KEEPER_URL: '',
      NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a keeper URL that is not http or https, without repeating it', () => {
    const result = readPublicConfig({
      NEXT_PUBLIC_KEEPER_URL: 'ftp://secret-host.example',
      NEXT_PUBLIC_STELLAR_NETWORK: 'testnet',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join('\n')).toContain('NEXT_PUBLIC_KEEPER_URL');
      expect(result.problems.join('\n')).not.toContain('secret-host');
    }
  });
});
