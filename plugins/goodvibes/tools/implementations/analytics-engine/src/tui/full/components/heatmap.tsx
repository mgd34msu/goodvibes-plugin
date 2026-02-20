import React from 'react';
import { Box, Text } from 'ink';
import type { FileHotspot } from '../../../types.js';

/**
 * Props for the Heatmap component.
 */
export interface HeatmapProps {
  /** Array of file hotspots to visualise. */
  files: FileHotspot[];
  /** Maximum number of entries to render. Defaults to 5. */
  maxItems?: number;
  /** Total width of the heatmap in terminal columns. Defaults to 60. */
  width?: number;
}

/** Character used for the heat bar fill. */
const HEAT_CHAR = '█';
/** Character used for the heat bar empty area. */
const HEAT_EMPTY = '░';
/** Maximum bar display width in columns. */
const BAR_COLS = 16;

/**
 * Derive a terminal colour from a normalised heat value (0-1).
 * Hot files trend toward red; cool files toward green.
 */
function heatColor(ratio: number): string {
  if (ratio >= 0.75) return 'red';
  if (ratio >= 0.5) return 'yellow';
  if (ratio >= 0.25) return 'cyan';
  return 'green';
}

/** Truncate a file path so only the last N path segments are shown. */
function shortPath(fullPath: string, maxLen = 28): string {
  const parts = fullPath.replace(/\\/g, '/').split('/');
  let result = parts[parts.length - 1];
  for (let i = parts.length - 2; i >= 0 && result.length + 1 + parts[i].length <= maxLen; i--) {
    result = `${parts[i]}/${result}`;
  }
  if (result.length > maxLen) return '…' + result.slice(-(maxLen - 1));
  return result;
}

/**
 * Heatmap — file access heatmap widget.
 *
 * Renders the top `maxItems` file hotspots ranked by combined read+write
 * activity. Each row shows a truncated filename, a proportional heat bar, and
 * the individual read and write counts.
 *
 * Row format: `{filename}  {bar}  {reads}r {writes}w`
 *
 * Bar colour transitions from green (cool) through cyan, yellow, to red (hot)
 * based on the file's activity relative to the busiest file in the set.
 *
 * Used on Page 2 of the full TUI dashboard.
 *
 * @example
 * ```tsx
 * <Heatmap files={state.file_hotspots} maxItems={8} width={70} />
 * ```
 */
export function Heatmap({
  files,
  maxItems = 5,
  width = 60,
}: HeatmapProps): React.ReactElement {
  if (files.length === 0) {
    return (
      <Box width={width}>
        <Text color="gray" dimColor>No file activity</Text>
      </Box>
    );
  }

  // Sort by total accesses descending, take top N.
  const sorted = [...files]
    .sort((a, b) => (b.reads + b.writes) - (a.reads + a.writes))
    .slice(0, maxItems);

  const maxAccess = Math.max(...sorted.map((f) => f.reads + f.writes), 1);

  // Layout: filename col, 2 spaces, bar (BAR_COLS), 2 spaces, count col.
  const countColWidth = 12; // e.g. "999r 999w"
  const nameColWidth = Math.max(width - BAR_COLS - countColWidth - 4, 10);

  return (
    <Box flexDirection="column" width={width}>
      {sorted.map((file, idx) => {
        const total = file.reads + file.writes;
        const ratio = total / maxAccess;
        const filled = Math.round(ratio * BAR_COLS);
        const empty = BAR_COLS - filled;
        const color = heatColor(ratio);
        const countStr = `${file.reads}r ${file.writes}w`;
        const name = shortPath(file.path, nameColWidth);

        return (
          <Box key={idx} flexDirection="row" width={width}>
            <Text color="white">{name.padEnd(nameColWidth, ' ')}</Text>
            <Text>{'  '}</Text>
            <Text color={color}>{HEAT_CHAR.repeat(filled)}</Text>
            <Text color="gray" dimColor>{HEAT_EMPTY.repeat(empty)}</Text>
            <Text>{'  '}</Text>
            <Text color="yellow">{countStr.padEnd(countColWidth)}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
