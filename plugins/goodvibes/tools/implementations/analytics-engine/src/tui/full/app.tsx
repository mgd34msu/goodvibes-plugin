/**
 * Full TUI app root with page router.
 * Manages current page state and keyboard input.
 */
import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { DashboardState } from '../../types.js';
import type { GlobalDB } from '../../data/global-db.js';
import { SessionOverview } from './pages/session-overview.js';
import { ActivityHotspots } from './pages/activity-hotspots.js';
import { Historical } from './pages/historical.js';
import { CrossProject } from './pages/cross-project.js';

/** Page numbers supported by the full TUI dashboard. */
export type PageNumber = 1 | 2 | 3 | 4;

export interface AppProps {
  /** Aggregated dashboard state from the daemon. */
  state: DashboardState;
  /** GlobalDB instance for cross-project analytics. Optional — may not be available. */
  globalDb?: GlobalDB | null;
  /** Callback invoked when the user quits (q key). */
  onQuit: () => void;
}

/**
 * Root app component for the full analytics dashboard.
 *
 * Pages:
 *  1 - Session Overview
 *  2 - Activity & Hotspots
 *  3 - Historical & Trends
 *  4 - Cross-Project Analytics
 *
 * Keyboard bindings:
 *  1 / 2 / 3 / 4   — navigate to page
 *  left / right     — previous / next page
 *  q                — quit
 *  ?                — toggle help overlay
 */
export const App: React.FC<AppProps> = ({ state, globalDb, onQuit }) => {
  const { exit } = useApp();
  const [page, setPage] = useState<PageNumber>(1);
  const [showHelp, setShowHelp] = useState(false);

  useInput((input, key) => {
    if (input === 'q' || input === 'Q') {
      onQuit();
      exit();
      return;
    }

    if (input === '?') {
      setShowHelp((prev) => !prev);
      return;
    }

    if (input === '1') { setPage(1); setShowHelp(false); return; }
    if (input === '2') { setPage(2); setShowHelp(false); return; }
    if (input === '3') { setPage(3); setShowHelp(false); return; }
    if (input === '4') { setPage(4); setShowHelp(false); return; }

    if (key.leftArrow) {
      setPage((prev) => (prev > 1 ? ((prev - 1) as PageNumber) : 4));
      setShowHelp(false);
      return;
    }

    if (key.rightArrow) {
      setPage((prev) => (prev < 4 ? ((prev + 1) as PageNumber) : 1));
      setShowHelp(false);
      return;
    }
  });

  const healthColor =
    state.health_status === 'healthy' ? 'green'
    : state.health_status === 'warning' ? 'yellow'
    : 'red';

  return (
    <Box flexDirection="column" width="100%">
      {/* Page content */}
      <Box flexGrow={1}>
        {showHelp ? (
          <HelpOverlay />
        ) : (
          <>
            {page === 1 && <SessionOverview state={state} globalDb={globalDb ?? null} />}
            {page === 2 && <ActivityHotspots state={state} />}
            {page === 3 && <Historical state={state} globalDb={globalDb ?? null} />}
            {page === 4 && <CrossProject state={state} globalDb={globalDb ?? null} />}
          </>
        )}
      </Box>

      {/* Navigation footer */}
      <Box
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
        justifyContent="space-between"
      >
        <Box gap={2}>
          <Text color={page === 1 ? 'cyan' : 'gray'}>[1] Overview</Text>
          <Text color={page === 2 ? 'cyan' : 'gray'}>[2] Activity</Text>
          <Text color={page === 3 ? 'cyan' : 'gray'}>[3] Historical</Text>
          <Text color={page === 4 ? 'cyan' : 'gray'}>[4] Cross-Project</Text>
        </Box>
        <Box gap={2}>
          <Text color={healthColor}>
            {state.health_status === 'healthy' ? '● healthy'
              : state.health_status === 'warning' ? '● warning'
              : '● alert'}
          </Text>
          <Text dimColor>q: quit  ?: help</Text>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * Help overlay showing all keyboard shortcuts.
 */
const HelpOverlay: React.FC = () => (
  <Box flexDirection="column" padding={2} gap={1}>
    <Text bold color="cyan">Analytics Dashboard — Keyboard Shortcuts</Text>
    <Box flexDirection="column" gap={0} marginTop={1}>
      <Text>  <Text bold>1</Text>          Navigate to Overview page</Text>
      <Text>  <Text bold>2</Text>          Navigate to Activity page</Text>
      <Text>  <Text bold>3</Text>          Navigate to Historical page</Text>
      <Text>  <Text bold>4</Text>          Navigate to Cross-Project page</Text>
      <Text>  <Text bold>{'<- / ->'}</Text>   Previous / next page</Text>
      <Text>  <Text bold>?</Text>          Toggle this help overlay</Text>
      <Text>  <Text bold>q</Text>          Quit dashboard</Text>
    </Box>
  </Box>
);
