#!/usr/bin/env node

/**
 * Tail Agent Output
 *
 * Displays the last N lines of a specific agent's transcript.
 * Zero token cost - direct file read.
 *
 * Usage:
 *   node tail-agent.js <agent-id> [options]
 *   node tail-agent.js --path /path/to/transcript.jsonl [options]
 *
 * Options:
 *   --cwd <path>       Project directory (default: current working directory)
 *   --path <path>      Direct path to transcript file
 *   --lines <n>        Number of lines to show (default: 50)
 *   --follow           Continuously watch for new lines
 *   --json             Output raw JSON instead of formatted
 *   --tools-only       Only show tool_use and tool_result events
 *   --messages-only    Only show assistant messages
 *   --interval <ms>    Follow interval in ms (default: 1000)
 */

const fs = require('fs');
const path = require('path');

// ANSI colors
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

// Parse arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    agentId: null,
    cwd: process.cwd(),
    path: null,
    lines: 50,
    follow: false,
    json: false,
    toolsOnly: false,
    messagesOnly: false,
    interval: 1000,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--cwd':
        options.cwd = args[++i];
        break;
      case '--path':
        options.path = args[++i];
        break;
      case '--lines':
      case '-n':
        options.lines = parseInt(args[++i], 10);
        break;
      case '--follow':
      case '-f':
        options.follow = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--tools-only':
        options.toolsOnly = true;
        break;
      case '--messages-only':
        options.messagesOnly = true;
        break;
      case '--interval':
        options.interval = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
Tail Agent Output - View agent transcript (zero token cost)

Usage:
  node tail-agent.js <agent-id> [options]
  node tail-agent.js --path /path/to/transcript.jsonl [options]

Options:
  --cwd <path>       Project directory (default: cwd)
  --path <path>      Direct path to transcript file
  --lines, -n <n>    Number of lines to show (default: 50)
  --follow, -f       Continuously watch for new lines
  --json             Output raw JSON
  --tools-only       Only show tool_use and tool_result events
  --messages-only    Only show assistant messages
  --interval <ms>    Follow interval (default: 1000)
  --help             Show this help

Examples:
  node tail-agent.js agent-abc123 --lines 100
  node tail-agent.js --path ~/.claude/transcripts/xyz.jsonl -f
  node tail-agent.js agent-abc123 --tools-only
`);
        process.exit(0);
      default:
        if (!args[i].startsWith('-') && !options.agentId) {
          options.agentId = args[i];
        }
    }
  }

  return options;
}

/**
 * Find transcript path from agent ID.
 */
function findTranscriptPath(cwd, agentId) {
  const trackingPath = path.join(cwd, '.goodvibes', 'state', 'agent-tracking.json');

  if (!fs.existsSync(trackingPath)) {
    return null;
  }

  try {
    const tracking = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));
    const agent = tracking[agentId];

    if (agent) {
      return agent.transcript_path || agent.transcriptPath;
    }

    // Try partial match
    for (const [id, data] of Object.entries(tracking)) {
      if (id.includes(agentId) || (data.agent_type && data.agent_type.includes(agentId))) {
        return data.transcript_path || data.transcriptPath;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Read and parse transcript lines.
 */
function readTranscript(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(Boolean).map(line => {
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
 * Filter events based on options.
 */
function filterEvents(events, options) {
  if (options.toolsOnly) {
    return events.filter(e => e.type === 'tool_use' || e.type === 'tool_result');
  }
  if (options.messagesOnly) {
    return events.filter(e => e.role === 'assistant' || e.role === 'user');
  }
  return events;
}

/**
 * Format a single event for display.
 */
function formatEvent(event, index) {
  const lines = [];

  // Tool use event
  if (event.type === 'tool_use') {
    lines.push(`${C.cyan}[TOOL]${C.reset} ${C.bright}${event.name}${C.reset}`);

    if (event.input) {
      const input = typeof event.input === 'string'
        ? event.input
        : JSON.stringify(event.input, null, 2);

      // Truncate long inputs
      const preview = input.length > 200
        ? input.slice(0, 200) + '...'
        : input;

      lines.push(`${C.dim}${preview.split('\n').map(l => '  ' + l).join('\n')}${C.reset}`);
    }
    return lines.join('\n');
  }

  // Tool result event
  if (event.type === 'tool_result') {
    const status = event.is_error ? `${C.red}ERROR${C.reset}` : `${C.green}OK${C.reset}`;
    lines.push(`${C.magenta}[RESULT]${C.reset} ${status}`);

    if (event.output) {
      const output = typeof event.output === 'string'
        ? event.output
        : JSON.stringify(event.output, null, 2);

      // Truncate long outputs
      const preview = output.length > 300
        ? output.slice(0, 300) + '...'
        : output;

      const color = event.is_error ? C.red : C.dim;
      lines.push(`${color}${preview.split('\n').map(l => '  ' + l).join('\n')}${C.reset}`);
    }
    return lines.join('\n');
  }

  // Assistant message
  if (event.role === 'assistant') {
    lines.push(`${C.green}[ASSISTANT]${C.reset}`);

    if (event.content) {
      const content = typeof event.content === 'string'
        ? event.content
        : JSON.stringify(event.content, null, 2);

      const preview = content.length > 500
        ? content.slice(0, 500) + '...'
        : content;

      lines.push(preview.split('\n').map(l => '  ' + l).join('\n'));
    }
    return lines.join('\n');
  }

  // User message
  if (event.role === 'user') {
    lines.push(`${C.blue}[USER]${C.reset}`);

    if (event.content) {
      const content = typeof event.content === 'string'
        ? event.content
        : JSON.stringify(event.content, null, 2);

      const preview = content.length > 300
        ? content.slice(0, 300) + '...'
        : content;

      lines.push(`${C.dim}${preview.split('\n').map(l => '  ' + l).join('\n')}${C.reset}`);
    }
    return lines.join('\n');
  }

  // Error event
  if (event.type === 'error') {
    lines.push(`${C.red}[ERROR]${C.reset} ${event.error || event.message || 'Unknown error'}`);
    return lines.join('\n');
  }

  // Stop/result event
  if (event.type === 'stop' || event.type === 'result') {
    const status = event.success === false ? `${C.red}FAILED${C.reset}` : `${C.green}SUCCESS${C.reset}`;
    lines.push(`${C.yellow}[${event.type.toUpperCase()}]${C.reset} ${status}`);
    return lines.join('\n');
  }

  // Other events
  if (event.raw) {
    return `${C.dim}[RAW] ${event.raw.slice(0, 100)}${C.reset}`;
  }

  return `${C.dim}[${event.type || 'unknown'}]${C.reset} ${JSON.stringify(event).slice(0, 100)}`;
}

/**
 * Display events.
 */
function displayEvents(events, options) {
  if (options.json) {
    for (const event of events) {
      console.log(JSON.stringify(event));
    }
    return;
  }

  for (let i = 0; i < events.length; i++) {
    console.log(formatEvent(events[i], i));
    console.log('');
  }
}

/**
 * Follow mode - watch for new lines.
 */
function followTranscript(filePath, options) {
  let lastLineCount = 0;
  const allEvents = readTranscript(filePath);

  // Display initial lines
  const initialEvents = filterEvents(allEvents.slice(-options.lines), options);
  displayEvents(initialEvents, options);
  lastLineCount = allEvents.length;

  console.log(`${C.dim}--- Following ${filePath} (Ctrl+C to stop) ---${C.reset}`);
  console.log('');

  // Poll for new lines
  const intervalId = setInterval(() => {
    const currentEvents = readTranscript(filePath);

    if (currentEvents.length > lastLineCount) {
      const newEvents = currentEvents.slice(lastLineCount);
      const filtered = filterEvents(newEvents, options);
      displayEvents(filtered, options);
      lastLineCount = currentEvents.length;
    }
  }, options.interval);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log(`\n${C.dim}Follow stopped.${C.reset}`);
    process.exit(0);
  });
}

/**
 * Main function.
 */
function main() {
  const options = parseArgs();

  // Determine transcript path
  let transcriptPath = options.path;

  if (!transcriptPath && options.agentId) {
    transcriptPath = findTranscriptPath(options.cwd, options.agentId);
  }

  if (!transcriptPath) {
    console.error('Error: Could not find transcript path.');
    console.error('');
    console.error('Usage:');
    console.error('  node tail-agent.js <agent-id>');
    console.error('  node tail-agent.js --path /path/to/transcript.jsonl');
    console.error('');
    console.error('To see available agents:');
    console.error('  node agent-status.js --json');
    process.exit(1);
  }

  if (!fs.existsSync(transcriptPath)) {
    console.error(`Error: Transcript file not found: ${transcriptPath}`);
    process.exit(1);
  }

  console.log(`${C.dim}Reading: ${transcriptPath}${C.reset}`);
  console.log('');

  if (options.follow) {
    followTranscript(transcriptPath, options);
  } else {
    const events = readTranscript(transcriptPath);
    const filtered = filterEvents(events.slice(-options.lines), options);

    console.log(`${C.dim}Showing last ${filtered.length} events (${events.length} total)${C.reset}`);
    console.log('');

    displayEvents(filtered, options);
  }
}

main();
