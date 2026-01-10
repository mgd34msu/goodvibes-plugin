#!/usr/bin/env node

/**
 * Agent Status Checker
 *
 * Reports status of all running background agents by reading local files.
 * Zero token cost - no API calls required.
 *
 * Usage:
 *   node agent-status.js [--cwd /path/to/project] [--json]
 *
 * Options:
 *   --cwd    Project directory (default: current working directory)
 *   --json   Output as JSON instead of formatted text
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    cwd: process.cwd(),
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && args[i + 1]) {
      options.cwd = args[i + 1];
      i++;
    } else if (args[i] === '--json') {
      options.json = true;
    }
  }

  return options;
}

/**
 * Get all running agents from tracking file.
 * @param {string} cwd - Project root directory
 * @returns {Array} Array of agent tracking objects
 */
function getRunningAgents(cwd) {
  const trackingPath = path.join(cwd, '.goodvibes', 'state', 'agent-tracking.json');

  if (!fs.existsSync(trackingPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(trackingPath, 'utf-8');
    const tracking = JSON.parse(content);
    return Object.values(tracking);
  } catch (error) {
    console.error('Error reading tracking file:', error.message);
    return [];
  }
}

/**
 * Read last N lines from a file efficiently.
 * @param {string} filePath - Path to file
 * @param {number} lines - Number of lines to read
 * @returns {Array} Array of parsed JSON lines
 */
function tailFile(filePath, lines = 50) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n').filter(Boolean);
    const lastLines = allLines.slice(-lines);

    return lastLines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
  } catch (error) {
    return [];
  }
}

/**
 * Detect agent completion and error status from transcript.
 * @param {string} transcriptPath - Path to transcript file
 * @returns {Object} Status object
 */
function detectStatus(transcriptPath) {
  const lines = tailFile(transcriptPath, 100);

  const status = {
    isComplete: false,
    hasError: false,
    errorMessage: null,
    lastTool: null,
    lastToolTime: null,
    summary: null,
    lineCount: 0,
  };

  // Get total line count
  if (fs.existsSync(transcriptPath)) {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    status.lineCount = content.split('\n').filter(Boolean).length;
  }

  // Analyze recent events (reverse order to find most recent first)
  for (const event of [...lines].reverse()) {
    // Detect completion
    if (event.type === 'result' || event.type === 'stop') {
      status.isComplete = true;
      if (event.success === false) {
        status.hasError = true;
      }
    }

    // Detect errors
    if (event.type === 'error' || event.is_error === true) {
      status.hasError = true;
      status.errorMessage = event.error || event.message || 'Unknown error';
    }

    // Tool result errors
    if (event.type === 'tool_result' && event.is_error) {
      status.hasError = true;
      if (!status.errorMessage) {
        status.errorMessage = event.output?.slice(0, 200) || 'Tool error';
      }
    }

    // Last tool used
    if (event.type === 'tool_use' && !status.lastTool) {
      status.lastTool = event.name;
      status.lastToolInput = event.input;
    }

    // Last assistant message
    if (event.role === 'assistant' && event.content && !status.summary) {
      const content = typeof event.content === 'string'
        ? event.content
        : JSON.stringify(event.content);
      status.summary = content.slice(0, 300);
    }
  }

  return status;
}

/**
 * Format runtime in human-readable form.
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted string
 */
function formatRuntime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Get status emoji for terminal output.
 * @param {Object} status - Agent status
 * @returns {string} Status indicator
 */
function getStatusIndicator(status) {
  if (status.isComplete && status.hasError) return '[FAILED]';
  if (status.isComplete) return '[DONE]  ';
  if (status.hasError) return '[ERROR] ';
  return '[RUNNING]';
}

/**
 * Main function - check all agents and report status.
 */
function main() {
  const options = parseArgs();
  const agents = getRunningAgents(options.cwd);

  if (agents.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ agents: [], message: 'No running agents found' }));
    } else {
      console.log('No running agents found.');
      console.log(`Checked: ${path.join(options.cwd, '.goodvibes', 'state', 'agent-tracking.json')}`);
    }
    return;
  }

  const results = [];

  for (const agent of agents) {
    const status = detectStatus(agent.transcript_path || agent.transcriptPath);
    const startTime = new Date(agent.started_at).getTime();
    const runtime = Date.now() - startTime;

    results.push({
      id: agent.agent_id,
      type: agent.agent_type,
      startedAt: agent.started_at,
      transcriptPath: agent.transcript_path || agent.transcriptPath,
      runtimeMs: runtime,
      runtimeFormatted: formatRuntime(runtime),
      ...status,
    });
  }

  if (options.json) {
    console.log(JSON.stringify({
      agents: results,
      summary: {
        total: results.length,
        running: results.filter(a => !a.isComplete).length,
        completed: results.filter(a => a.isComplete && !a.hasError).length,
        failed: results.filter(a => a.hasError).length,
      },
    }, null, 2));
    return;
  }

  // Formatted output
  console.log('');
  console.log('=== Background Agent Status ===');
  console.log('');

  for (const agent of results) {
    const indicator = getStatusIndicator(agent);
    console.log(`${indicator} ${agent.type}`);
    console.log(`  ID: ${agent.id}`);
    console.log(`  Runtime: ${agent.runtimeFormatted}`);
    console.log(`  Lines: ${agent.lineCount}`);

    if (agent.lastTool) {
      console.log(`  Last tool: ${agent.lastTool}`);
    }

    if (agent.hasError && agent.errorMessage) {
      console.log(`  Error: ${agent.errorMessage.slice(0, 100)}`);
    }

    if (agent.summary) {
      const shortSummary = agent.summary.slice(0, 80).replace(/\n/g, ' ');
      console.log(`  Summary: ${shortSummary}...`);
    }

    console.log('');
  }

  // Summary line
  const running = results.filter(a => !a.isComplete).length;
  const completed = results.filter(a => a.isComplete && !a.hasError).length;
  const failed = results.filter(a => a.hasError).length;

  console.log('---');
  console.log(`Total: ${results.length} | Running: ${running} | Completed: ${completed} | Failed: ${failed}`);
}

main();
