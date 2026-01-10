---
name: agent-monitoring
description: Monitors background agents efficiently using local file reads instead of TaskOutput API calls. Use when running parallel background agents, checking agent progress, detecting completion status, or minimizing token usage during multi-agent orchestration.
---

# Agent Monitoring

Efficient monitoring of Claude Code background agents through direct file reads. Avoids TaskOutput API calls that cost 100-500 tokens per check.

## Quick Start

**Check all running agents:**
```bash
node scripts/agent-status.js
```

**Tail specific agent output:**
```bash
# Last 50 lines of agent output
tail -n 50 /path/to/agent/transcript.jsonl
```

**Monitor multiple agents in parallel:**
```bash
node scripts/multi-agent-monitor.js --interval 5000
```

## Why Direct File Reads

| Method | Token Cost | Latency | Information |
|--------|------------|---------|-------------|
| TaskOutput API | 100-500 tokens/call | High | Full output |
| Direct file read | 0 tokens | Low | Raw transcript |
| Tail last N lines | 0 tokens | Very low | Recent activity |

For monitoring multiple parallel agents, direct file reads save thousands of tokens per session.

---

## Agent Output Locations

### Transcript Files

Claude Code stores agent transcripts as JSONL files:

```
~/.claude/projects/{project-hash}/{session-id}/transcripts/{agent-id}.jsonl
```

Or on Windows:
```
%USERPROFILE%\.claude\projects\{project-hash}\{session-id}\transcripts\{agent-id}.jsonl
```

### Tracking Data

GoodVibes tracks running agents in:
```
{project}/.goodvibes/state/agent-tracking.json
```

Structure:
```json
{
  "agent-123": {
    "agent_id": "agent-123",
    "agent_type": "backend-engineer",
    "session_id": "session-456",
    "started_at": "2024-01-15T10:30:00.000Z",
    "transcript_path": "/path/to/transcript.jsonl",
    "project": "/path/to/project",
    "project_name": "my-project"
  }
}
```

---

## Workflows

### 1. List Running Agents

Check `.goodvibes/state/agent-tracking.json`:

```javascript
const fs = require('fs');
const path = require('path');

function getRunningAgents(cwd) {
  const trackingPath = path.join(cwd, '.goodvibes', 'state', 'agent-tracking.json');

  if (!fs.existsSync(trackingPath)) {
    return [];
  }

  const tracking = JSON.parse(fs.readFileSync(trackingPath, 'utf-8'));
  return Object.values(tracking).map(agent => ({
    id: agent.agent_id,
    type: agent.agent_type,
    startedAt: agent.started_at,
    transcriptPath: agent.transcript_path,
    runtime: Date.now() - new Date(agent.started_at).getTime()
  }));
}
```

### 2. Tail Agent Output (Zero-Cost)

Read last N lines of transcript without API calls:

```javascript
const fs = require('fs');

function tailTranscript(transcriptPath, lines = 50) {
  if (!fs.existsSync(transcriptPath)) {
    return { error: 'Transcript not found', lines: [] };
  }

  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const allLines = content.split('\n').filter(Boolean);
  const lastLines = allLines.slice(-lines);

  return {
    totalLines: allLines.length,
    lines: lastLines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    })
  };
}
```

### 3. Detect Completion Status

Parse transcript to detect if agent has completed:

```javascript
function detectAgentStatus(transcriptPath) {
  const { lines } = tailTranscript(transcriptPath, 100);

  const status = {
    isComplete: false,
    hasError: false,
    lastActivity: null,
    lastTool: null,
    summary: null
  };

  for (const event of lines.reverse()) {
    // Detect completion markers
    if (event.type === 'result' || event.type === 'stop') {
      status.isComplete = true;
    }

    // Detect errors
    if (event.type === 'error' || event.error) {
      status.hasError = true;
      status.errorMessage = event.error || event.message;
    }

    // Last tool used
    if (event.type === 'tool_use' && !status.lastTool) {
      status.lastTool = event.name;
    }

    // Last assistant message
    if (event.role === 'assistant' && event.content && !status.summary) {
      status.summary = typeof event.content === 'string'
        ? event.content.slice(0, 200)
        : JSON.stringify(event.content).slice(0, 200);
    }

    // Track last activity time
    if (event.timestamp && !status.lastActivity) {
      status.lastActivity = event.timestamp;
    }
  }

  return status;
}
```

### 4. Monitor Multiple Agents

Poll all running agents efficiently:

```javascript
async function monitorAllAgents(cwd, options = {}) {
  const { interval = 5000, onUpdate } = options;
  const agents = getRunningAgents(cwd);

  const statuses = {};

  for (const agent of agents) {
    const status = detectAgentStatus(agent.transcriptPath);
    statuses[agent.id] = {
      ...agent,
      ...status,
      runtimeMs: Date.now() - new Date(agent.startedAt).getTime()
    };
  }

  if (onUpdate) {
    onUpdate(statuses);
  }

  // Check if all agents are done
  const allComplete = Object.values(statuses).every(s => s.isComplete);
  const anyError = Object.values(statuses).some(s => s.hasError);

  return {
    agents: statuses,
    allComplete,
    anyError,
    running: Object.values(statuses).filter(s => !s.isComplete).length,
    completed: Object.values(statuses).filter(s => s.isComplete).length
  };
}
```

---

## Completion Detection Patterns

### Success Indicators

Look for these in transcript events:

```javascript
const SUCCESS_PATTERNS = [
  // Stop event with success
  { type: 'stop', success: true },

  // Result event
  { type: 'result' },

  // Assistant messages with completion phrases
  /completed|finished|done|success|all.*tests.*pass/i,

  // Final tool use patterns
  { type: 'tool_use', name: 'TodoWrite', status: 'completed' }
];
```

### Error Indicators

Detect failures early:

```javascript
const ERROR_PATTERNS = [
  // Explicit errors
  { type: 'error' },
  { error: true },

  // Tool failures
  { type: 'tool_result', is_error: true },

  // Assistant messages with error phrases
  /error|failed|exception|cannot|unable|permission denied/i,

  // Process exit codes
  { exitCode: /[^0]/ }
];
```

### Stalled Agent Detection

Identify agents that may be stuck:

```javascript
function detectStalled(transcriptPath, thresholdMs = 60000) {
  const { lines } = tailTranscript(transcriptPath, 10);

  if (lines.length === 0) {
    return { stalled: true, reason: 'no_activity' };
  }

  // Find most recent timestamp
  const lastEvent = lines.reverse().find(e => e.timestamp);
  if (!lastEvent) {
    return { stalled: false, reason: 'no_timestamps' };
  }

  const lastTime = new Date(lastEvent.timestamp).getTime();
  const elapsed = Date.now() - lastTime;

  if (elapsed > thresholdMs) {
    return {
      stalled: true,
      reason: 'inactive',
      lastActivityMs: elapsed,
      lastEvent: lastEvent.type || 'unknown'
    };
  }

  return { stalled: false, lastActivityMs: elapsed };
}
```

---

## Transcript Event Types

### Common Event Structure

```typescript
interface TranscriptEvent {
  type: string;           // 'tool_use', 'tool_result', 'error', etc.
  timestamp?: string;     // ISO timestamp
  role?: 'user' | 'assistant' | 'system';
  content?: string | object;

  // Tool events
  name?: string;          // Tool name
  input?: object;         // Tool input parameters

  // Result events
  is_error?: boolean;
  error?: string;
  output?: string;
}
```

### Key Event Types

| Type | Description | Fields |
|------|-------------|--------|
| `tool_use` | Tool invocation | `name`, `input` |
| `tool_result` | Tool output | `output`, `is_error` |
| `text` | Assistant message | `content` |
| `error` | Error occurred | `error`, `message` |
| `stop` | Agent stopped | `success`, `reason` |

---

## Integration with GoodVibes Hooks

### Using SubagentStart Hook Data

The GoodVibes SubagentStart hook records agent data:

```javascript
// Access via hook telemetry
const tracking = require('./.goodvibes/state/agent-tracking.json');

// Each entry has:
// - agent_id: Unique identifier
// - agent_type: Type of agent (e.g., 'backend-engineer')
// - transcript_path: Path to output file
// - started_at: ISO timestamp
```

### Combining with SubagentStop

After agent completion, telemetry is written to:
```
.goodvibes/telemetry/YYYY-MM.jsonl
```

Query historical agent performance:
```bash
# Find all completed agents this month
cat .goodvibes/telemetry/2024-01.jsonl | jq 'select(.event == "subagent_complete")'
```

---

## Performance Tips

### Efficient Polling

1. **Start with long intervals** (10s), decrease if needed
2. **Stop polling** when agent completes
3. **Use file modification time** before reading:

```javascript
const fs = require('fs');

function hasNewActivity(transcriptPath, lastCheckMs) {
  try {
    const stats = fs.statSync(transcriptPath);
    return stats.mtimeMs > lastCheckMs;
  } catch {
    return false;
  }
}
```

### Batch Operations

When monitoring multiple agents, read files in parallel:

```javascript
async function batchCheckStatus(agents) {
  const promises = agents.map(async agent => {
    const status = detectAgentStatus(agent.transcriptPath);
    return { id: agent.id, ...status };
  });

  return Promise.all(promises);
}
```

### Memory-Efficient Tailing

For very long transcripts, use streams:

```javascript
const fs = require('fs');
const readline = require('readline');

async function streamTail(filePath, lineCount = 50) {
  const lines = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    lines.push(line);
    if (lines.length > lineCount) {
      lines.shift();
    }
  }

  return lines;
}
```

---

## Example: Full Monitoring Session

```javascript
const fs = require('fs');
const path = require('path');

async function monitorBackgroundAgents(cwd) {
  console.log('Starting agent monitor...\n');

  const checkInterval = setInterval(async () => {
    const result = await monitorAllAgents(cwd);

    console.clear();
    console.log('=== Agent Status ===\n');

    for (const [id, agent] of Object.entries(result.agents)) {
      const runtime = Math.round(agent.runtimeMs / 1000);
      const status = agent.isComplete
        ? (agent.hasError ? 'FAILED' : 'DONE')
        : 'RUNNING';

      console.log(`[${status}] ${agent.type} (${id})`);
      console.log(`  Runtime: ${runtime}s`);
      console.log(`  Last tool: ${agent.lastTool || 'none'}`);
      if (agent.summary) {
        console.log(`  Summary: ${agent.summary.slice(0, 60)}...`);
      }
      console.log('');
    }

    console.log(`Running: ${result.running} | Completed: ${result.completed}`);

    if (result.allComplete) {
      clearInterval(checkInterval);
      console.log('\nAll agents complete!');

      if (result.anyError) {
        console.log('WARNING: Some agents encountered errors.');
      }
    }
  }, 5000);

  return checkInterval;
}

// Usage
monitorBackgroundAgents(process.cwd());
```

---

## Scripts

- [scripts/agent-status.js](scripts/agent-status.js) - Check status of all running agents
- [scripts/multi-agent-monitor.js](scripts/multi-agent-monitor.js) - Continuous monitoring dashboard
- [scripts/tail-agent.js](scripts/tail-agent.js) - Tail specific agent output

## References

- [references/transcript-format.md](references/transcript-format.md) - Complete transcript event schema
- [references/completion-patterns.md](references/completion-patterns.md) - Patterns for detecting agent states

## Related Skills

- [hook-integration](../../create/hook-integration/SKILL.md) - Integrate with SubagentStart/SubagentStop hooks
- [task-decomposition](../planning/task-decomposition/SKILL.md) - Plan parallel agent workflows
