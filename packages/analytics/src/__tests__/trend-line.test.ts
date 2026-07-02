/**
 * Ported from analytics-engine `tui/full/components/__tests__/trend-line.test.ts`.
 * The pure `trendColor` helper was extracted into `engine/tui/trend-colors.ts`
 * so it can be tested without the ink/React runtime (deferred in the alpha).
 */

import { describe, it, expect } from 'vitest';
import { trendColor } from '../engine/tui/trend-colors.js';

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
    expect(trendColor('—')).toBe('gray');
    expect(trendColor('~0.1% ─')).toBe('gray');
  });
});
