/**
 * Pure trend-colour helper, extracted from the full-TUI `trend-line.tsx` so it
 * can be typechecked and unit-tested without pulling in ink/React.
 *
 * The full interactive ink dashboard (`tui/full/**`) is deferred in the v2
 * alpha because `@types/react` is not installed in the workspace and the lane
 * may not run `npm install`; the always-on mini dashboard ships fully. This
 * module keeps the one pure function the ported `trend-line` test needs.
 */

/**
 * Determine a colour name from a trend string.
 *
 * By default a rising trend (`+`) is bad (red) and a falling trend (`-`) is good
 * (green) — the cost-style convention. Set `higherIsBetter` true to invert it
 * for efficiency-style metrics.
 *
 * @param trend - the trend string, e.g. "+2.1%", "-0.5%", "stable"
 * @param higherIsBetter - when true, rising = green and falling = red
 */
export function trendColor(trend: string, higherIsBetter = false): string {
  if (trend.startsWith('+')) return higherIsBetter ? 'green' : 'red';
  if (trend.startsWith('-')) return higherIsBetter ? 'red' : 'green';
  return 'gray';
}
