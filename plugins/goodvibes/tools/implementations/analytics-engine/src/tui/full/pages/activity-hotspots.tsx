/**
 * Page 2 — Activity & Hotspots.
 * Shows recent activity timeline, file hotspot heatmap,
 * per-agent token usage, and active anomalies/recommendations.
 */
import React from 'react';
import { Box, Text } from 'ink';
import type { DashboardState } from '../../../types.js';
import { TimelineFeed, Heatmap, BarChart } from '../components/index.js';
import { formatNumber, formatPercent, formatDuration, truncate } from '../../mini/format.js';

export interface ActivityHotspotsProps {
  /** Aggregated dashboard state. */
  state: DashboardState;
}

/** Icon for each anomaly severity. */
const severityIcon = (severity: 'warning' | 'alert'): string =>
  severity === 'alert' ? '!!' : '! ';

/** Color for each anomaly severity. */
const severityColor = (severity: 'warning' | 'alert'): string =>
  severity === 'alert' ? 'red' : 'yellow';

/**
 * Activity & Hotspots page — Page 2 of the full TUI dashboard.
 *
 * Layout:
 *   Top: RECENT ACTIVITY (full-width timeline)
 *   Middle: FILE HOTSPOTS (left) | AGENT BREAKDOWN (right)
 *   Bottom: ANOMALIES & RECOMMENDATIONS
 */
export const ActivityHotspots: React.FC<ActivityHotspotsProps> = ({ state }) => {
  const { recent_activity, file_hotspots, agent_profiles, anomalies } = state;

  // Build agent bar-chart items sorted by tokens descending
  const agentItems = [...agent_profiles]
    .sort((a, b) => b.tokens_in + b.tokens_out - (a.tokens_in + a.tokens_out))
    .slice(0, 10)
    .map((ap) => ({
      label: truncate(ap.agent_type || ap.agent_id, 20),
      value: ap.tokens_in + ap.tokens_out,
      suffix: 'tok',
    }));

  const maxAgentTokens = agentItems.reduce((m, i) => Math.max(m, i.value), 0);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
      {/* Header */}
      <Text bold color="cyan">ACTIVITY &amp; HOTSPOTS</Text>

      {/* Recent activity timeline */}
      <Box flexDirection="column" gap={0}>
        <Text bold color="yellow">RECENT ACTIVITY</Text>
        <TimelineFeed events={recent_activity} maxItems={12} />
      </Box>

      {/* Middle row: file hotspots + agent breakdown */}
      <Box gap={2} flexWrap="wrap">
        {/* File hotspots heatmap */}
        <Box flexDirection="column" gap={0} flexGrow={1} minWidth={30}>
          <Text bold color="yellow">FILE HOTSPOTS</Text>
          <Heatmap files={file_hotspots} maxItems={8} />
        </Box>

        {/* Agent breakdown bar chart */}
        {agentItems.length > 0 && (
          <Box flexDirection="column" gap={0} flexGrow={1} minWidth={30}>
            <Text bold color="yellow">AGENT BREAKDOWN</Text>
            <BarChart
              items={agentItems.map((i) => ({
                label: i.label,
                value: i.value,
                maxValue: maxAgentTokens,
                suffix: i.suffix,
              }))}
            />
          </Box>
        )}
      </Box>

      {/* Anomalies & recommendations */}
      {anomalies.length > 0 && (
        <Box flexDirection="column" gap={0}>
          <Text bold color="yellow">ANOMALIES &amp; RECOMMENDATIONS</Text>
          {anomalies.slice(0, 6).map((anomaly) => (
            <Box key={anomaly.id} gap={1}>
              <Text color={severityColor(anomaly.severity)}>
                {severityIcon(anomaly.severity)}
              </Text>
              <Text
                color={severityColor(anomaly.severity)}
                dimColor={anomaly.severity === 'warning'}
              >
                [{anomaly.type}]
              </Text>
              <Text>{truncate(anomaly.message, 80)}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Agent stats summary */}
      {agent_profiles.length > 0 && (
        <Box gap={3}>
          <Text dimColor>
            Agents: {formatNumber(agent_profiles.length)} total  |  
            {' '}{formatNumber(agent_profiles.filter((a) => a.status === 'active').length)} active  |  
            avg success: {formatPercent(
              agent_profiles.reduce((s, a) => s + a.success_rate, 0) / agent_profiles.length
            )}  |  
            avg duration: {formatDuration(
              agent_profiles.reduce((s, a) => s + a.duration_ms, 0) / agent_profiles.length
            )}
          </Text>
        </Box>
      )}
    </Box>
  );
};
