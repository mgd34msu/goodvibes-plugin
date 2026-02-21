import { describe, it, expect } from 'vitest';
import { trendColor } from '../trend-line.js';

describe('trendColor', () => {
  it('returns red for + when higherIsBetter is false (default)', () => {
    expect(trendColor('+5.0%')).toBe('red');
  });

  it('returns green for - when higherIsBetter is false (default)', () => {
    expect(trendColor('-2.0%')).toBe('green');
  });

  it('returns green for + when higherIsBetter is true', () => {
    expect(trendColor('+5.0%', true)).toBe('green');
  });

  it('returns red for - when higherIsBetter is true', () => {
    expect(trendColor('-2.0%', true)).toBe('red');
  });

  it('returns gray for stable/no-data trends', () => {
    expect(trendColor('\u2014')).toBe('gray');
    expect(trendColor('~0.1% \u2500')).toBe('gray');
  });
});
