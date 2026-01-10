#!/usr/bin/env node

/**
 * Multi-Agent Monitor
 *
 * Continuously monitors all background agents with live updates.
 * Uses local file reads only - zero token cost.
 *
 * Usage:
 *   node multi-agent-monitor.js [options]
 *
 * Options:
 *   --cwd        Project directory (default: current working directory)
 *   --interval   Polling interval in ms (default: 5000)
 *   --json       Output JSON events instead of dashboard
 *   --once       Single check, don't poll continuously
 *   --quiet      Minimal output, only status changes
 *   --stale-ms   Consider stale after this many ms (default: 60000)
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    cwd: process.cwd(),
    interval: 5000,
    json: false,
    once: false,
    quiet: false,
    staleMs: 60000,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--cwd':
        options.cwd = args[++i];
        break;
      case '--interval':
        options.interval = parseInt(args[++i], 10);
        break;
      case '--json':
        options.json = true;
        break;
      case '--once':
        options.once = true;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      case '--stale-ms':
        options.staleMs = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
Multi-Agent Monitor - Zero-cost background agent monitoring

Usage: node multi-agent-monitor.js [options]

Options:
  --cwd <path>      Project directory (default: cwd)
  --interval <ms>   Polling interval in ms (default: 5000)
  --json            Output JSON events instead of dashboard
  --once            Single check, don't poll continuously
  --quiet           Minimal output, only status changes
  --stale-ms <ms>   Consider agent stale after this (default: 60000)
  --help            Show this help message
`);
        process.exit(0);
    }
  }

  return options;
}

/**
 * Get running agents from tracking file.
 */
function getRunningAgents(cwd) {
  const trackingPath = path.join(cwd, '.goodvibes', 'state', 'agent-tracking.json');

  if (!fs.existsSync(trackingPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(trackingPath, 'utf-8');
    return Object.values(JSON.parse(content));
  } catch {
    return [];
  }
}

/**
 * Tail last N lines of a file.
 */
function tailFile(filePath, lines = 100) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n').filter(Boolean);
    return allLines.slice(-lines).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  } catch {
    return [];
  }
}

/**
 * Get file modification time.
 */
function getFileMtime(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Get total line count efficiently.
 */
function getLineCount(filePath) {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * Analyze transcript for status.
 */
function analyzeTranscript(transcriptPath, staleMs) {
  const lines = tailFile(transcriptPath, 100);

  const status = {
    isComplete: false,
    hasError: false,
    isStale: false,
    errorMessage: null,
    lastTool: null,
    toolCount: 0,
    lastAssistantMessage: null,
    lastActivityMs: null,
    lineCount: getLineCount(transcriptPath),
  };

  // File modification time for staleness check
  const mtime = getFileMtime(transcriptPath);
  if (mtime > 0) {
    status.lastActivityMs = Date.now() - mtime;
    status.isStale = status.lastActivityMs > staleMs;
  }

  // Count tools used
  const toolsUsed = new Set();

  for (const event of lines) {
    if (event.type === 'tool_use') {
      toolsUsed.add(event.name);
    }
  }
  status.toolCount = toolsUsed.size;

  // Analyze recent events (most recent first)
  for (const event of [...lines].reverse()) {
    // Completion detection
    if (event.type === 'result' || event.type === 'stop') {
      status.isComplete = true;
      if (event.success === false) {
        status.hasError = true;
      }
    }

    // Error detection
    if (event.type === 'error' || event.is_error === true) {
      status.hasError = true;
      status.errorMessage = event.error || event.message;
    }

    if (event.type === 'tool_result' && event.is_error) {
      status.hasError = true;
      if (!status.errorMessage) {
        status.errorMessage = (event.output || 'Tool error').slice(0, 200);
      }
    }

    // Last tool
    if (event.type === 'tool_use' && !status.lastTool) {
      status.lastTool = event.name;
    }

    // Last assistant message
    if (event.role === 'assistant' && event.content && !status.lastAssistantMessage) {
      const content = typeof event.content === 'string'
        ? event.content
        : JSON.stringify(event.content);
      status.lastAssistantMessage = content.slice(0, 500);
    }
  }

  return status;
}

/**
 * Format time duration.
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Get status color.
 */
function getStatusColor(status) {
  if (status.isComplete && status.hasError) return COLORS.red;
  if (status.isComplete) return COLORS.green;
  if (status.hasError) return COLORS.red;
  if (status.isStale) return COLORS.yellow;
  return COLORS.cyan;
}

/**
 * Get status label.
 */
function getStatusLabel(status) {
  if (status.isComplete && status.hasError) return 'FAILED';
  if (status.isComplete) return 'DONE';
  if (status.hasError) return 'ERROR';
  if (status.isStale) return 'STALE';
  return 'RUNNING';
}

/**
 * Clear terminal screen.
 */
function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

/**
 * Monitor all agents and produce report.
 */
function checkAgents(cwd, staleMs) {
  const agents = getRunningAgents(cwd);

  const results = agents.map(agent => {
    const transcriptPath = agent.transcript_path || agent.transcriptPath;
    const status = analyzeTranscript(transcriptPath, staleMs);
    const startTime = new Date(agent.started_at).getTime();
    const runtime = Date.now() - startTime;

    return {
      id: agent.agent_id,
      type: agent.agent_type,
      startedAt: agent.started_at,
      transcriptPath,
      runtimeMs: runtime,
      ...status,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    agents: results,
    summary: {
      total: results.length,
      running: results.filter(a => !a.isComplete && !a.isStale).length,
      stale: results.filter(a => a.isStale && !a.isComplete).length,
      completed: results.filter(a => a.isComplete && !a.hasError).length,
      failed: results.filter(a => a.hasError).length,
    },
  };
}

/**
 * Render dashboard to terminal.
 */
function renderDashboard(report) {
  clearScreen();

  console.log(`${COLORS.bright}=== Agent Monitor ===${COLORS.reset}`);
  console.log(`${COLORS.dim}${report.timestamp}${COLORS.reset}`);
  console.log('');

  if (report.agents.length === 0) {
    console.log(`${COLORS.dim}No agents currently tracked.${COLORS.reset}`);
    console.log('');
    return;
  }

  for (const agent of report.agents) {
    const color = getStatusColor(agent);
    const label = getStatusLabel(agent);
    const runtime = formatDuration(agent.runtimeMs);

    console.log(`${color}[${label}]${COLORS.reset} ${COLORS.bright}${agent.type}${COLORS.reset}`);
    console.log(`  ${COLORS.dim}ID:${COLORS.reset} ${agent.id.slice(0, 20)}...`);
    console.log(`  ${COLORS.dim}Runtime:${COLORS.reset} ${runtime}`);
    console.log(`  ${COLORS.dim}Lines:${COLORS.reset} ${agent.lineCount} | ${COLORS.dim}Tools:${COLORS.reset} ${agent.toolCount}`);

    if (agent.lastTool) {
      console.log(`  ${COLORS.dim}Last tool:${COLORS.reset} ${agent.lastTool}`);
    }

    if (agent.lastActivityMs) {
      const ago = formatDuration(agent.lastActivityMs);
      const staleIndicator = agent.isStale ? ` ${COLORS.yellow}(stale)${COLORS.reset}` : '';
      console.log(`  ${COLORS.dim}Last activity:${COLORS.reset} ${ago} ago${staleIndicator}`);
    }

    if (agent.hasError && agent.errorMessage) {
      console.log(`  ${COLORS.red}Error: ${agent.errorMessage.slice(0, 60)}${COLORS.reset}`);
    }

    if (agent.lastAssistantMessage) {
      const preview = agent.lastAssistantMessage.slice(0, 60).replace(/\n/g, ' ');
      console.log(`  ${COLORS.dim}Status:${COLORS.reset} ${preview}...`);
    }

    console.log('');
  }

  // Summary bar
  const { summary } = report;
  console.log(`${COLORS.dim}---${COLORS.reset}`);
  console.log(
    `Total: ${summary.total} | ` +
    `${COLORS.cyan}Running: ${summary.running}${COLORS.reset} | ` +
    `${COLORS.yellow}Stale: ${summary.stale}${COLORS.reset} | ` +
    `${COLORS.green}Done: ${summary.completed}${COLORS.reset} | ` +
    `${COLORS.red}Failed: ${summary.failed}${COLORS.reset}`
  );
  console.log('');
  console.log(`${COLORS.dim}Press Ctrl+C to exit${COLORS.reset}`);
}

/**
 * Track previous state for change detection.
 */
let previousState = {};

/**
 * Detect changes from previous check.
 */
function detectChanges(report) {
  const changes = [];

  for (const agent of report.agents) {
    const prev = previousState[agent.id];

    if (!prev) {
      changes.push({ type: 'new', agent });
    } else {
      if (!prev.isComplete && agent.isComplete) {
        changes.push({ type: 'completed', agent });
      }
      if (!prev.hasError && agent.hasError) {
        changes.push({ type: 'error', agent });
      }
      if (!prev.isStale && agent.isStale) {
        changes.push({ type: 'stale', agent });
      }
    }

    previousState[agent.id] = { ...agent };
  }

  return changes;
}

/**
 * Main monitoring loop.
 */
async function main() {
  const options = parseArgs();

  // Single check mode
  if (options.once) {
    const report = checkAgents(options.cwd, options.staleMs);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      renderDashboard(report);
    }
    return;
  }

  // Continuous monitoring
  console.log(`Starting agent monitor...`);
  console.log(`  Interval: ${options.interval}ms`);
  console.log(`  Stale threshold: ${options.staleMs}ms`);
  console.log('');

  const poll = () => {
    const report = checkAgents(options.cwd, options.staleMs);

    if (options.json) {
      // JSON mode: output each update as a line
      console.log(JSON.stringify(report));
    } else if (options.quiet) {
      // Quiet mode: only show changes
      const changes = detectChanges(report);
      for (const change of changes) {
        const time = new Date().toISOString().slice(11, 19);
        console.log(`[${time}] ${change.type.toUpperCase()}: ${change.agent.type} (${change.agent.id.slice(0, 12)})`);
      }
    } else {
      // Full dashboard
      renderDashboard(report);
    }

    // Check if all agents are done
    if (report.summary.running === 0 && report.summary.stale === 0 && report.agents.length > 0) {
      if (!options.json && !options.quiet) {
        console.log(`${COLORS.green}All agents complete!${COLORS.reset}`);
      }
      if (options.json) {
        console.log(JSON.stringify({ event: 'all_complete', timestamp: new Date().toISOString() }));
      }
      process.exit(0);
    }
  };

  // Initial check
  poll();

  // Continue polling
  const intervalId = setInterval(poll, options.interval);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    if (!options.json) {
      console.log('\nMonitor stopped.');
    }
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Monitor error:', err.message);
  process.exit(1);
});
