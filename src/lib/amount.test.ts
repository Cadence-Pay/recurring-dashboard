import { describe, expect, it } from 'vitest';
import { describePeriod, formatAmount, parseAmount, parsePeriod } from './amount';

describe('parseAmount', () => {
  it('reads whole and decimal amounts into the smallest unit', () => {
    expect(parseAmount('1', 7)).toEqual({ ok: true, value: 10_000_000n });
    expect(parseAmount('12.5', 7)).toEqual({ ok: true, value: 125_000_000n });
    expect(parseAmount('0.0000001', 7)).toEqual({ ok: true, value: 1n });
    expect(parseAmount('  3  ', 2)).toEqual({ ok: true, value: 300n });
    expect(parseAmount('5', 0)).toEqual({ ok: true, value: 5n });
  });

  it('refuses more decimal places than the token has instead of rounding', () => {
    const r = parseAmount('1.00000001', 7);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('at most 7 decimal places');
    const whole = parseAmount('1.5', 0);
    expect(whole.ok).toBe(false);
    if (!whole.ok) expect(whole.message).toContain('whole number');
  });

  it.each(['', ' ', 'abc', '-1', '+1', '1e3', '1,5', '1.', '.5', '1.2.3', '0x10'])(
    'refuses %j',
    (input) => {
      expect(parseAmount(input, 7).ok).toBe(false);
    },
  );

  it('refuses zero', () => {
    const r = parseAmount('0.0', 7);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('greater than zero');
  });

  it('refuses an amount beyond the contract limit but accepts the limit itself', () => {
    const max = (2n ** 127n - 1n).toString();
    expect(parseAmount(max, 0)).toEqual({ ok: true, value: 2n ** 127n - 1n });
    const r = parseAmount((2n ** 127n).toString(), 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('too large');
  });
});

describe('formatAmount', () => {
  it('shows whole tokens without trailing zeros', () => {
    expect(formatAmount('10000000', 7)).toBe('1');
    expect(formatAmount('125000000', 7)).toBe('12.5');
    expect(formatAmount('1', 7)).toBe('0.0000001');
    expect(formatAmount('0', 7)).toBe('0');
    expect(formatAmount('300', 2)).toBe('3');
    expect(formatAmount('7', 0)).toBe('7');
  });

  it('keeps 128-bit amounts exact', () => {
    expect(formatAmount((2n ** 100n).toString(), 0)).toBe((2n ** 100n).toString());
    expect(formatAmount(2n ** 100n, 7)).toBe('126765060022822940149670.3205376');
  });

  it('is the inverse of parseAmount', () => {
    for (const text of ['1', '0.5', '123.4567891', '0.0000001']) {
      const parsed = parseAmount(text, 7);
      expect(parsed.ok && formatAmount(parsed.value, 7)).toBe(text);
    }
  });
});

describe('parsePeriod', () => {
  it('turns a number of units into seconds', () => {
    expect(parsePeriod('1', 60)).toEqual({ ok: true, value: 60 });
    expect(parsePeriod('30', 86_400)).toEqual({ ok: true, value: 2_592_000 });
    expect(parsePeriod('365', 86_400)).toEqual({ ok: true, value: 31_536_000 });
  });

  it('refuses periods outside the contract limits', () => {
    expect(parsePeriod('366', 86_400).ok).toBe(false);
    expect(parsePeriod('0', 60).ok).toBe(false);
    const tooShort = parsePeriod('0', 3600);
    expect(tooShort.ok).toBe(false);
  });

  it.each(['', 'abc', '1.5', '-3', '1e2', ' '])('refuses %j', (input) => {
    expect(parsePeriod(input, 60).ok).toBe(false);
  });

  it('refuses a number so large it loses precision', () => {
    expect(parsePeriod('99999999999999999999', 86_400).ok).toBe(false);
  });
});

describe('describePeriod', () => {
  it('uses the largest exact unit', () => {
    expect(describePeriod(60)).toBe('1 minute');
    expect(describePeriod(120)).toBe('2 minutes');
    expect(describePeriod(3600)).toBe('1 hour');
    expect(describePeriod(86_400 * 30)).toBe('30 days');
    expect(describePeriod(90)).toBe('90 seconds');
    expect(describePeriod(1)).toBe('1 second');
  });
});
