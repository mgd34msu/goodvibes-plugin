# Agent Completion Detection Patterns

Patterns for detecting agent completion status, errors, and activity state from transcript analysis.

## Completion Indicators

### Definitive Completion

These events indicate the agent has definitively finished:

```javascript
// Stop event
{ "type": "stop", "stop_reason": "end_turn" }
{ "type": "stop", "stop_reason": "max_tokens" }
{ "type": "stop", "stop_reason": "tool_use" }

// Result event
{ "type": "result", "success": true }
{ "type": "result", "success": false }

// Message stop reasons (in content blocks)
{ "stop_reason": "end_turn" }
```

### Detection Code

```javascript
function isComplete(events) {
  for (const event of events.slice(-20).reverse()) {
    // Check for stop event
    if (event.type === 'stop') {
      return true;
    }

    // Check for result event
    if (event.type === 'result') {
      return true;
    }

    // Check for stop_reason in message
    if (event.stop_reason === 'end_turn') {
      return true;
    }
  }

  return false;
}
```

## Error Detection

### Error Event Types

```javascript
// Explicit error event
{ "type": "error", "error": { "message": "..." } }

// Tool result with error
{ "type": "tool_result", "is_error": true, "output": "Error: ..." }

// API errors
{ "type": "error", "error": { "type": "overloaded_error" } }
{ "type": "error", "error": { "type": "rate_limit_error" } }
{ "type": "error", "error": { "type": "invalid_request_error" } }
```

### Error Patterns in Output

```javascript
const ERROR_PATTERNS = [
  /Error:/i,
  /Exception:/i,
  /FATAL/i,
  /Failed to/i,
  /Cannot /i,
  /Unable to/i,
  /Permission denied/i,
  /ENOENT/,
  /EACCES/,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /exit code [1-9]/i,
  /returned non-zero/i,
  /segmentation fault/i,
  /out of memory/i,
];

function hasErrorPattern(text) {
  return ERROR_PATTERNS.some(pattern => pattern.test(text));
}
```

### Detection Code

```javascript
function detectErrors(events) {
  const errors = [];

  for (const event of events) {
    // Explicit error event
    if (event.type === 'error') {
      errors.push({
        type: 'error_event',
        message: event.error?.message || event.message || 'Unknown error',
        event,
      });
    }

    // Tool error result
    if (event.type === 'tool_result' && event.is_error) {
      errors.push({
        type: 'tool_error',
        tool: event.tool_use_id,
        output: event.output?.slice(0, 500),
        event,
      });
    }

    // Error patterns in output
    if (event.type === 'tool_result' && event.output) {
      if (hasErrorPattern(event.output)) {
        errors.push({
          type: 'output_error',
          output: event.output?.slice(0, 500),
          event,
        });
      }
    }
  }

  return errors;
}
```

## Success Indicators

### Positive Completion Signals

```javascript
const SUCCESS_PATTERNS = [
  /completed successfully/i,
  /all tests pass/i,
  /build succeeded/i,
  /no errors/i,
  /changes applied/i,
  /task complete/i,
  /finished/i,
  /done!/i,
];

function hasSuccessPattern(text) {
  return SUCCESS_PATTERNS.some(pattern => pattern.test(text));
}
```

### Tool Success Indicators

```javascript
function detectSuccess(events) {
  const successIndicators = [];

  for (const event of events) {
    // Successful test runs
    if (event.type === 'tool_result' && !event.is_error) {
      if (/all.*tests? pass/i.test(event.output || '')) {
        successIndicators.push({ type: 'tests_passed', event });
      }

      if (/build succeeded/i.test(event.output || '')) {
        successIndicators.push({ type: 'build_succeeded', event });
      }
    }

    // Stop with success flag
    if (event.type === 'stop' && event.success === true) {
      successIndicators.push({ type: 'explicit_success', event });
    }

    // TodoWrite completion
    if (event.type === 'tool_use' && event.name === 'TodoWrite') {
      const todos = event.input?.todos || [];
      const allComplete = todos.every(t => t.status === 'completed');
      if (allComplete && todos.length > 0) {
        successIndicators.push({ type: 'todos_complete', event });
      }
    }
  }

  return successIndicators;
}
```

## Stale/Stuck Detection

### Time-Based Staleness

```javascript
function detectStaleness(transcriptPath, thresholdMs = 60000) {
  const fs = require('fs');

  try {
    const stats = fs.statSync(transcriptPath);
    const elapsed = Date.now() - stats.mtimeMs;

    return {
      isStale: elapsed > thresholdMs,
      lastActivityMs: elapsed,
      lastModified: new Date(stats.mtimeMs).toISOString(),
    };
  } catch (error) {
    return {
      isStale: true,
      error: error.message,
    };
  }
}
```

### Activity Pattern Analysis

```javascript
function analyzeActivityPattern(events) {
  const recentEvents = events.slice(-50);

  // Check for repeated tool failures
  let consecutiveFailures = 0;
  for (const event of recentEvents.reverse()) {
    if (event.type === 'tool_result' && event.is_error) {
      consecutiveFailures++;
    } else if (event.type === 'tool_result') {
      break;
    }
  }

  // Check for repeated same tool calls (potential loop)
  const toolSequence = recentEvents
    .filter(e => e.type === 'tool_use')
    .slice(-10)
    .map(e => e.name);

  const uniqueTools = new Set(toolSequence);
  const isRepetitive = uniqueTools.size === 1 && toolSequence.length >= 5;

  return {
    consecutiveFailures,
    isRepetitive,
    lastTool: toolSequence[toolSequence.length - 1],
    potentiallyStuck: consecutiveFailures >= 3 || isRepetitive,
  };
}
```

## Combined Status Detection

### Full Status Object

```javascript
function getAgentStatus(transcriptPath, options = {}) {
  const { staleThresholdMs = 60000 } = options;
  const fs = require('fs');

  // Read events
  const events = parseTranscript(transcriptPath);

  if (events.length === 0) {
    return {
      status: 'unknown',
      reason: 'no_events',
      isComplete: false,
      hasError: false,
    };
  }

  // Check completion
  const isComplete = checkCompletion(events);

  // Check errors
  const errors = detectErrors(events);
  const hasError = errors.length > 0;

  // Check success indicators
  const successIndicators = detectSuccess(events);

  // Check staleness
  const staleness = detectStaleness(transcriptPath, staleThresholdMs);

  // Check activity pattern
  const activityPattern = analyzeActivityPattern(events);

  // Determine overall status
  let status;
  if (isComplete && !hasError) {
    status = 'completed';
  } else if (isComplete && hasError) {
    status = 'failed';
  } else if (hasError) {
    status = 'error';
  } else if (staleness.isStale) {
    status = 'stale';
  } else if (activityPattern.potentiallyStuck) {
    status = 'stuck';
  } else {
    status = 'running';
  }

  return {
    status,
    isComplete,
    hasError,
    errors: errors.slice(0, 5), // Limit to recent errors
    successIndicators,
    staleness,
    activityPattern,
    eventCount: events.length,
    lastEvent: events[events.length - 1],
  };
}
```

## Quick Reference: Status Decision Tree

```
                    ┌─────────────────┐
                    │ Has stop/result │
                    │     event?      │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼ Yes                         ▼ No
     ┌────────────────┐            ┌────────────────┐
     │  Has errors?   │            │  File stale?   │
     └───────┬────────┘            └───────┬────────┘
             │                             │
    ┌────────┴────────┐           ┌────────┴────────┐
    ▼ Yes             ▼ No        ▼ Yes             ▼ No
 FAILED           COMPLETED      STALE          ┌─────────────┐
                                                │ Stuck loop? │
                                                └──────┬──────┘
                                                       │
                                              ┌────────┴────────┐
                                              ▼ Yes             ▼ No
                                            STUCK            RUNNING
```

## Event Filtering for Efficiency

When monitoring many agents, filter events efficiently:

```javascript
function quickStatusCheck(transcriptPath) {
  const fs = require('fs');

  // Check file modification time first (cheapest check)
  const stats = fs.statSync(transcriptPath);
  const isRecent = (Date.now() - stats.mtimeMs) < 30000;

  // Read only last few KB for quick check
  const fd = fs.openSync(transcriptPath, 'r');
  const size = stats.size;
  const readSize = Math.min(size, 8192); // Last 8KB
  const buffer = Buffer.alloc(readSize);

  fs.readSync(fd, buffer, 0, readSize, size - readSize);
  fs.closeSync(fd);

  const lastChunk = buffer.toString('utf-8');
  const lines = lastChunk.split('\n').filter(Boolean);

  // Check last few lines for completion
  for (const line of lines.slice(-5).reverse()) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'stop' || event.type === 'result') {
        return { isComplete: true, isRecent };
      }
    } catch {
      continue;
    }
  }

  return { isComplete: false, isRecent };
}
```
