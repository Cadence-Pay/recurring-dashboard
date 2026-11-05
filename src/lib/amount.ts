/** Smallest billing period the contract accepts (it is a contract constant). */
export const MIN_PERIOD_SECS = 60;
/** Longest billing period the contract accepts: 365 days. */
export const MAX_PERIOD_SECS = 365 * 24 * 60 * 60;
/** Largest amount the contract can hold (a signed 128-bit integer). */
const MAX_I128 = 2n ** 127n - 1n;

/** Result of reading something the person typed. */
export type Parsed<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

/**
 * Read an amount typed in whole tokens, such as `12` or `12.5`, into the token's smallest unit.
 *
 * Only plain decimal numbers are accepted: no signs, exponents or separators. More decimal places
 * than the token has is an error rather than silently rounded, so nobody pays a different amount
 * than they typed.
 *
 * @param input - What the person typed.
 * @param decimals - How many decimal places the token has.
 */
export function parseAmount(input: string, decimals: number): Parsed<bigint> {
  const text = input.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (match === null) return { ok: false, message: 'Enter a number such as 12 or 12.5.' };
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) {
    return {
      ok: false,
      message:
        decimals === 0
          ? 'This token has no decimal places. Enter a whole number.'
          : `This token has at most ${String(decimals)} decimal places.`,
    };
  }
  const value = BigInt(whole + fraction.padEnd(decimals, '0'));
  if (value === 0n) return { ok: false, message: 'The amount must be greater than zero.' };
  if (value > MAX_I128) return { ok: false, message: 'This amount is too large.' };
  return { ok: true, value };
}

/**
 * Show an amount in the token's smallest unit as whole tokens, without trailing zeros.
 *
 * @param raw - Amount in the smallest unit, as a decimal string or bigint.
 * @param decimals - How many decimal places the token has.
 */
export function formatAmount(raw: string | bigint, decimals: number): string {
  const value = BigInt(raw);
  const digits = value.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
  return fraction === '' ? whole : `${whole}.${fraction}`;
}

/** Units a period can be entered in. */
export const PERIOD_UNITS = [
  { id: 'minutes', label: 'minutes', secs: 60 },
  { id: 'hours', label: 'hours', secs: 3600 },
  { id: 'days', label: 'days', secs: 86_400 },
] as const;

/**
 * Read a period typed as a whole number of a unit, into seconds.
 *
 * @param input - What the person typed.
 * @param unitSecs - Seconds in the chosen unit.
 */
export function parsePeriod(input: string, unitSecs: number): Parsed<number> {
  const text = input.trim();
  if (!/^\d+$/.test(text)) return { ok: false, message: 'Enter a whole number.' };
  const secs = Number(text) * unitSecs;
  if (!Number.isSafeInteger(secs) || secs < MIN_PERIOD_SECS || secs > MAX_PERIOD_SECS) {
    return { ok: false, message: 'The period must be between 1 minute and 365 days.' };
  }
  return { ok: true, value: secs };
}

function plural(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
}

/** Describe a period in plain words, using the largest unit that divides it exactly. */
export function describePeriod(secs: number): string {
  if (secs % 86_400 === 0) return plural(secs / 86_400, 'day');
  if (secs % 3600 === 0) return plural(secs / 3600, 'hour');
  if (secs % 60 === 0) return plural(secs / 60, 'minute');
  return plural(secs, 'second');
}
