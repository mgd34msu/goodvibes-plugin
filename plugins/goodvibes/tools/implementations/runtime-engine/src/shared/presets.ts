/**
 * Named interval presets for the runtime_schedule MCP tool.
 *
 * Callers may pass either a preset name (string) or a raw millisecond
 * value (number) wherever an interval is required. resolveInterval()
 * normalises both forms to a numeric millisecond value.
 */

export const INTERVAL_PRESETS: Record<string, number> = {
  every_minute:     60_000,
  every_5_minutes:  300_000,
  every_15_minutes: 900_000,
  every_hour:       3_600_000,
  every_6_hours:    21_600_000,
  daily:            86_400_000,
};

/**
 * Resolve a preset name or raw millisecond value to a number.
 *
 * @param presetOrMs - A named preset key or a raw number in milliseconds.
 * @returns The resolved interval in milliseconds.
 * @throws If the string value is not a known preset name.
 */
export function resolveInterval(presetOrMs: string | number): number {
  if (typeof presetOrMs === 'number') return presetOrMs;
  const ms = INTERVAL_PRESETS[presetOrMs];
  if (ms === undefined) {
    throw new Error(
      `Unknown preset: ${presetOrMs}. Valid: ${Object.keys(INTERVAL_PRESETS).join(', ')}`,
    );
  }
  return ms;
}
