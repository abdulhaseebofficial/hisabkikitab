import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const tailwind = readFileSync(resolve(process.cwd(), 'tailwind.config.js'), 'utf8');

const luminance = ([r, g, b]) => {
  const channels = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrast = (foreground, background) => {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
};

const cssToken = (scope, token) => {
  const start = css.indexOf(`${scope} {`);
  const end = css.indexOf('}', start);
  const block = start >= 0 && end > start ? css.slice(start, end) : '';
  const value = block.match(new RegExp(`--${token}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
  if (!value) throw new Error(`Missing ${token} in ${scope}`);
  return value.slice(1).map(Number);
};

const configColor = (name) => {
  const value = tailwind.match(new RegExp(`${name}:\\s*'#([0-9a-f]{6})'`, 'i'))?.[1];
  if (!value) throw new Error(`Missing ${name} color`);
  return value.match(/../g).map((pair) => Number.parseInt(pair, 16));
};

describe('theme contrast tokens', () => {
  const white = [255, 255, 255];

  it('keeps the approved blue light and dark identity tokens exact', () => {
    expect(cssToken(':root', 'canvas-background')).toEqual([244, 248, 255]);
    expect(cssToken(':root', 'canvas-surface')).toEqual([255, 255, 255]);
    expect(cssToken(':root', 'brand-600')).toEqual([20, 104, 255]);
    expect(cssToken(':root', 'brand-400')).toEqual([99, 173, 255]);
    expect(cssToken(":root[data-theme='dark']", 'canvas-background')).toEqual([8, 27, 75]);
    expect(cssToken(":root[data-theme='dark']", 'canvas-surface')).toEqual([16, 37, 88]);
  });

  it.each([
    ['Light primary', ':root', 'brand-600'],
    ['Light disabled', ':root', 'brand-800'],
    ['Dark primary', ":root[data-theme='dark']", 'brand-600'],
    ['Dark disabled', ":root[data-theme='dark']", 'brand-800'],
  ])('%s button text meets WCAG AA', (_label, scope, token) => {
    expect(contrast(white, cssToken(scope, token))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['safe', 'danger'])('%s button text meets WCAG AA', (token) => {
    expect(contrast(white, configColor(token))).toBeGreaterThanOrEqual(4.5);
  });
});
