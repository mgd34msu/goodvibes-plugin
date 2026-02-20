import React from 'react';
import { Box, Text } from 'ink';
import type { ActivityEvent, ActivityEventType } from '../../../types.js';

/**
 * Props for the TimelineFeed component.
 */
export interface TimelineFeedProps {
  /** Array of activity events to display, ordered newest-last by convention. */
  events: ActivityEvent[];
  /**
   * Maximum number of events to show.
   * The most-recent `maxItems` events are displayed. Defaults to 8.
   */
  maxItems?: number;
}

/** Map from ActivityEventType to a representative icon character. */
const EVENT_ICONS: Record<ActivityEventType, string> = {
  read: '\uD83D\uDCD6', // 📖
  write: '\uD83D\uDCC4', // 📄
  edit: '\u270F\uFE0F', // ✏️
  exec: '\u2699\uFE0F', // ⚙️
  grep: '\uD83D\uDD0D', // 🔍
  glob: '\uD83D\uDD0D', // 🔍
  discover: '\uD83D\uDD0D', // 🔍
  conflict: '\u26A1', // ⚡
  agent_spawn: '\uD83E\uDD16', // 🤖
  agent_complete: '\u2705', // ✅
  fetch: '\uD83C\uDF10', // 🌐
  symbols: '\uD83D\uDD24', // 🔤
  notebook: '\uD83D\uDCD3', // 📓
};

/** Color associated with each event type for the TYPE label. */
const EVENT_COLORS: Record<ActivityEventType, string> = {
  read: 'blue',
  write: 'green',
  edit: 'yellow',
  exec: 'magenta',
  grep: 'cyan',
  glob: 'cyan',
  discover: 'cyan',
  conflict: 'red',
  agent_spawn: 'green',
  agent_complete: 'green',
  fetch: 'blue',
  symbols: 'cyan',
  notebook: 'blue',
};

/** Format a timestamp string (ISO 8601) to a short HH:MM:SS display. */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return '??:??:??';
  }
}

/**
 * TimelineFeed — scrollable activity event timeline.
 *
 * Renders the most-recent `maxItems` events from the `events` array. Each row
 * shows a short timestamp, an emoji icon representing the event type, the
 * uppercased event type label, and the event description.
 *
 * Row format: `{HH:MM:SS}  {icon} {TYPE}  {description}`
 *
 * Icon mapping:
 * - read → 📖  write → 📄  edit → ✏  exec → ⚙  grep/glob/discover → 🔍
 * - conflict → ⚡  agent_spawn/agent_complete → 🤖/✅  fetch → 🌐
 *
 * Used on Page 2 of the full TUI dashboard.
 *
 * @example
 * ```tsx
 * <TimelineFeed events={state.recent_activity} maxItems={10} />
 * ```
 */
export function TimelineFeed({
  events,
  maxItems = 8,
}: TimelineFeedProps): React.ReactElement {
  const visible = events.slice(-maxItems);

  if (visible.length === 0) {
    return (
      <Box>
        <Text color="gray" dimColor>No recent activity</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {visible.map((event, idx) => {
        const icon = EVENT_ICONS[event.type] ?? '?';
        const color = EVENT_COLORS[event.type] ?? 'white';
        const typeLabel = event.type.toUpperCase().padEnd(14, ' ');

        return (
          <Box key={idx} flexDirection="row">
            <Text color="gray">{formatTime(event.timestamp)}</Text>
            <Text>{'  '}</Text>
            <Text>{icon}</Text>
            <Text> </Text>
            <Text color={color} bold>{typeLabel}</Text>
            <Text>{'  '}</Text>
            <Text color="white">{event.description}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
