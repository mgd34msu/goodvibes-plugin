# Claude Code Transcript Format

Complete reference for the JSONL transcript format used by Claude Code agents.

## File Structure

Transcripts are stored as JSON Lines (JSONL) files - one JSON object per line.

```
/path/to/transcript.jsonl
```

Each line is a complete JSON object representing a single event.

## Event Types

### Tool Use Event

Emitted when the agent invokes a tool.

```json
{
  "type": "tool_use",
  "id": "toolu_01ABC123...",
  "name": "Bash",
  "input": {
    "command": "npm test",
    "description": "Run tests"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| type | string | Always "tool_use" |
| id | string | Unique tool invocation ID |
| name | string | Tool name (Bash, Edit, Write, Read, etc.) |
| input | object | Tool-specific parameters |

### Tool Result Event

Emitted after a tool completes execution.

```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01ABC123...",
  "output": "All 42 tests passed",
  "is_error": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| type | string | Always "tool_result" |
| tool_use_id | string | References the tool_use event |
| output | string | Tool output text |
| is_error | boolean | True if tool execution failed |

### Text Event

Assistant's text response (thinking/explanation).

```json
{
  "type": "text",
  "text": "I'll run the tests to verify the changes work correctly."
}
```

### Message Events

Full message objects with role designation.

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Let me analyze the code..."
    },
    {
      "type": "tool_use",
      "id": "toolu_01...",
      "name": "Read",
      "input": { "file_path": "/src/index.ts" }
    }
  ]
}
```

```json
{
  "role": "user",
  "content": "Please fix the failing tests"
}
```

### Error Event

Emitted when an error occurs.

```json
{
  "type": "error",
  "error": {
    "type": "overloaded_error",
    "message": "Overloaded"
  }
}
```

### Stop Event

Emitted when the agent stops.

```json
{
  "type": "stop",
  "stop_reason": "end_turn",
  "success": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| type | string | Always "stop" |
| stop_reason | string | Why agent stopped |
| success | boolean | Optional success indicator |

### Result Event

Final result of agent execution.

```json
{
  "type": "result",
  "result": "Task completed successfully",
  "success": true
}
```

## Common Tool Names

| Tool | Purpose | Key Input Fields |
|------|---------|------------------|
| Bash | Run shell commands | command, description |
| Read | Read file contents | file_path |
| Write | Write file | file_path, content |
| Edit | Edit file | file_path, old_string, new_string |
| Glob | Find files by pattern | pattern, path |
| Grep | Search file contents | pattern, path |
| WebFetch | Fetch URL content | url, prompt |
| WebSearch | Search the web | query |
| TodoWrite | Update task list | todos |
| Task | Spawn background agent | prompt, run_in_background |
| TaskOutput | Get agent output | task_id |

## Parsing Example

```javascript
const fs = require('fs');

function parseTranscript(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);

  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch (e) {
      // Skip malformed lines
    }
  }

  return events;
}

function getToolUsage(events) {
  const tools = {};

  for (const event of events) {
    if (event.type === 'tool_use') {
      tools[event.name] = (tools[event.name] || 0) + 1;
    }
  }

  return tools;
}

function getFilesModified(events) {
  const files = new Set();

  for (const event of events) {
    if (event.type === 'tool_use') {
      if (['Write', 'Edit'].includes(event.name) && event.input?.file_path) {
        files.add(event.input.file_path);
      }
    }
  }

  return Array.from(files);
}

function getLastAssistantMessage(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];

    if (event.role === 'assistant' && event.content) {
      if (typeof event.content === 'string') {
        return event.content;
      }
      if (Array.isArray(event.content)) {
        const textBlock = event.content.find(b => b.type === 'text');
        if (textBlock) {
          return textBlock.text;
        }
      }
    }

    if (event.type === 'text' && event.text) {
      return event.text;
    }
  }

  return null;
}
```

## Event Sequence Example

Typical agent execution sequence:

```
1. {"role":"user","content":"Fix the bug in auth.ts"}
2. {"type":"text","text":"I'll analyze the auth module..."}
3. {"type":"tool_use","name":"Read","input":{"file_path":"/src/auth.ts"}}
4. {"type":"tool_result","output":"[file contents]","is_error":false}
5. {"type":"text","text":"I found the issue. The token validation..."}
6. {"type":"tool_use","name":"Edit","input":{"file_path":"/src/auth.ts",...}}
7. {"type":"tool_result","output":"File edited successfully","is_error":false}
8. {"type":"tool_use","name":"Bash","input":{"command":"npm test"}}
9. {"type":"tool_result","output":"All tests passed","is_error":false}
10. {"type":"text","text":"I've fixed the bug and verified tests pass."}
11. {"type":"stop","stop_reason":"end_turn"}
```

## File Locations

### Default Claude Code Paths

**macOS/Linux:**
```
~/.claude/projects/{project-hash}/{session-id}/transcripts/{agent-id}.jsonl
```

**Windows:**
```
%USERPROFILE%\.claude\projects\{project-hash}\{session-id}\transcripts\{agent-id}.jsonl
```

### GoodVibes Tracking

Agent tracking file:
```
{project}/.goodvibes/state/agent-tracking.json
```

Telemetry logs:
```
{project}/.goodvibes/telemetry/YYYY-MM.jsonl
```

## Size Considerations

- Transcripts can grow large (10MB+) for long sessions
- Use efficient tailing for monitoring (read last N lines)
- File modification time (`stat.mtime`) indicates new activity
- Stream processing recommended for files >1MB
