import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');

/** Colour tokens in a block of CSS, by name (without the leading `--color-`). */
function colors(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) out[name] = value;
  }
  return out;
}

const lightBlock = css.slice(
  css.indexOf(':root {'),
  css.indexOf('@media (prefers-color-scheme: dark)'),
);
const darkBlock = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('*,'));
const light = colors(lightBlock);
const dark = { ...light, ...colors(darkBlock) };

function channel(hex: string, start: number): number {
  const v = parseInt(hex.slice(start, start + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  return 0.2126 * channel(h, 0) + 0.7152 * channel(h, 2) + 0.0722 * channel(h, 4);
}

/** WCAG contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Pairs that are used for text on screen. Normal text needs 4.5:1 (WCAG AA).
const PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['primary', 'surface'], // links and secondary buttons
  ['primary', 'bg'],
  ['primary-contrast', 'primary'], // primary buttons and the current nav item
  ['danger', 'surface'],
  ['danger', 'bg'],
  ['success', 'surface'],
  ['warning', 'surface'],
];

describe('design tokens', () => {
  it('define every colour in both themes', () => {
    for (const name of [
      'bg',
      'surface',
      'text',
      'muted',
      'border',
      'primary',
      'primary-contrast',
      'danger',
      'success',
      'warning',
      'focus',
    ]) {
      expect(light[name], `light ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(dark[name], `dark ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(PAIRS)('keep %s on %s readable in the light theme (at least 4.5:1)', (fg, bg) => {
    expect(contrast(light[fg] ?? '', light[bg] ?? '')).toBeGreaterThanOrEqual(4.5);
  });

  it.each(PAIRS)('keep %s on %s readable in the dark theme (at least 4.5:1)', (fg, bg) => {
    expect(contrast(dark[fg] ?? '', dark[bg] ?? '')).toBeGreaterThanOrEqual(4.5);
  });

  it('draw the keyboard focus ring with enough contrast against the page (3:1)', () => {
    expect(contrast(light['focus'] ?? '', light['bg'] ?? '')).toBeGreaterThanOrEqual(3);
    expect(contrast(dark['focus'] ?? '', dark['bg'] ?? '')).toBeGreaterThanOrEqual(3);
  });

  it('are the only place colours are written in the stylesheet', () => {
    const outside = css.replace(lightBlock, '').replace(darkBlock, '');
    expect(outside).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(outside).not.toMatch(/\brgba?\(/);
  });
});
