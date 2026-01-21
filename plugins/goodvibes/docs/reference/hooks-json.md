# hooks.json Reference

Complete reference for lifecycle hook configuration.

## Location

`.claude-plugin/hooks/hooks.json`

## Purpose

The `hooks.json` file defines lifecycle hooks that run at specific points during Claude Code's execution. Hooks enable plugins to react to events like session start, agent spawning, and prompt submission.

## Full Schema

```json
{
  "description": "GoodVibes plugin hooks - minimal set for core functionality",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/session-start.js\"",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "resume",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/session-start.js\"",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/session-end.js\"",
            "timeout": 10
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/subagent-start.js\"",
            "timeout": 10
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/subagent-stop.js\"",
            "timeout": 10
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/pre-compact.js\"",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/stop.js\"",
            "timeout": 10
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/notification.js\"",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/user-prompt-submit.js\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

## Top-Level Structure

### `description`
- **Type**: `string`
- **Required**: No
- **Description**: Human-readable description of the hook configuration

### `hooks`
- **Type**: `object`
- **Required**: Yes
- **Description**: Map of hook event names to hook configurations
- **Keys**: Hook event names (see [Hook Events](#hook-events))
- **Values**: Array of hook matchers and handlers

## Hook Events

### Session Lifecycle

#### `SessionStart`
**Trigger**: When a Claude Code session starts

**Use Cases**:
- Initialize plugin state
- Load configuration
- Set up logging
- Display welcome messages
- Check for updates

**Matchers**:
- `"startup"` - New session started
- `"resume"` - Existing session resumed
- `"*"` - Any session start

**Example**:
```json
"SessionStart": [
  {
    "matcher": "startup",
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/session-start.js\"",
        "timeout": 10
      }
    ]
  }
]
```

#### `SessionEnd`
**Trigger**: When a Claude Code session ends

**Use Cases**:
- Save session state
- Clean up resources
- Write logs
- Display summary statistics
- Archive data

**Matchers**:
- `"*"` - Any session end

**Example**:
```json
"SessionEnd": [
  {
    "matcher": "*",
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/session-end.js\"",
        "timeout": 10
      }
    ]
  }
]
```

### Agent Lifecycle

#### `SubagentStart`
**Trigger**: When a subagent is spawned

**Use Cases**:
- Track agent spawning
- Inject agent context
- Set agent-specific configuration
- Log agent start
- Initialize agent-specific resources

**Matchers**:
- `"*"` - Any agent
- `"goodvibes:*"` - Any GoodVibes agent
- `"goodvibes:engineer"` - Specific agent

**Example**:
```json
"SubagentStart": [
  {
    "matcher": "goodvibes:*",
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/subagent-start.js\"",
        "timeout": 10
      }
    ]
  }
]
```

#### `SubagentStop`
**Trigger**: When a subagent completes or is stopped

**Use Cases**:
- Collect agent results
- Clean up agent resources
- Log agent completion
- Update agent statistics
- Archive agent output

**Matchers**:
- `"*"` - Any agent
- `"goodvibes:*"` - Any GoodVibes agent
- `"goodvibes:engineer"` - Specific agent

**Example**:
```json
"SubagentStop": [
  {
    "matcher": "goodvibes:*",
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/subagent-stop.js\"",
        "timeout": 10
      }
    ]
  }
]
```

### Tool Lifecycle

#### `PreToolUse`
**Trigger**: Before a tool is executed

**Use Cases**:
- Validate tool inputs
- Log tool usage
- Modify tool parameters
- Check permissions
- Enforce policies

**Matchers**:
- `"*"` - Any tool
- `"precision-engine/*"` - Any precision-engine tool
- `"precision-engine/precision_read"` - Specific tool

**Example**:
```json
"PreToolUse": [
  {
    "matcher": "*",
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/pre-tool-use.js\"",
        "timeout": 5
      }
    ]
  }
]
```

#### `PostToolUse`
**Trigger**: After a tool completes

**Use Cases**:
- Log tool results
- Validate tool outputs
- Track tool performance
- Update metrics
- Trigger follow-up actions

**Matchers**:
- `"*"` - Any tool
- `"precision-engine/*"` - Any precision-engine tool
- `"precision-engine/precision_read"` - Specific tool

**Example**:
```json
"PostToolUse": [
  {
    "matcher": "*",
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/post-tool-use.js\"",
        "timeout": 5
      }
    ]
  }
]
```

### Context Management

#### `PreCompact`
**Trigger**: Before context is compacted/pruned

**Use Cases**:
- Save important context
- Mark messages for retention
- Log context state
- Create context snapshots
- Update memory system

**Matchers**:
- `"*"` - Any compaction

**Example**:
```json
"PreCompact": [
  {
    "matcher": "*",
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/pre-compact.js\"",
        "timeout": 5
      }
    ]
  }
]
```

### User Interaction

#### `UserPromptSubmit`
**Trigger**: When user submits a prompt

**Use Cases**:
- Log user prompts
- Analyze user intent
- Suggest improvements
- Track usage patterns
- Implement custom commands

**Matchers**:
- `"*"` - Any prompt

**Example**:
```json
"UserPromptSubmit": [
  {
    "matcher": "*",
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/user-prompt-submit.js\"",
        "timeout": 5
      }
    ]
  }
]
```

### System Events

#### `Stop`
**Trigger**: When user clicks Stop or system stops execution

**Use Cases**:
- Clean up in-progress operations
- Save partial state
- Cancel background tasks
- Log stop event
- Display stop message

**Matchers**:
- `"*"` - Any stop

**Example**:
```json
"Stop": [
  {
    "matcher": "*",
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/stop.js\"",
        "timeout": 10
      }
    ]
  }
]
```

#### `Notification`
**Trigger**: When system sends a notification

**Use Cases**:
- Log notifications
- Forward to external systems
- Display custom UI
- Track notification patterns
- Filter notifications

**Matchers**:
- `"*"` - Any notification

**Example**:
```json
"Notification": [
  {
    "matcher": "*",
    "hooks": [
      {
        "type": "command",
        "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/notification.js\"",
        "timeout": 5
      }
    ]
  }
]
```

## Hook Configuration

Each hook event contains an array of hook matchers:

```typescript
interface HookMatcher {
  matcher: string;           // Glob pattern for matching
  hooks: HookHandler[];      // Array of hook handlers
}
```

### Matcher Patterns

#### Wildcard Matching
- `"*"` - Match all events/agents/tools
- `"goodvibes:*"` - Match all GoodVibes agents
- `"precision-engine/*"` - Match all precision-engine tools

#### Exact Matching
- `"goodvibes:engineer"` - Match specific agent
- `"precision-engine/precision_read"` - Match specific tool
- `"startup"` - Match specific session start type

#### Pattern Matching (future)
- `"goodvibes:*engineer*"` - Match agents with "engineer" in name
- `"*/precision_*"` - Match all tools starting with "precision_"

## Hook Handler

Each hook handler defines what to execute:

```typescript
interface HookHandler {
  type: 'command';           // Handler type (only 'command' currently supported)
  command: string;           // Command to execute
  timeout: number;           // Timeout in seconds (default: 30)
}
```

### `type`
- **Type**: `string`
- **Required**: Yes
- **Values**: `"command"`
- **Description**: Type of hook handler (currently only command execution supported)

### `command`
- **Type**: `string`
- **Required**: Yes
- **Description**: Command to execute when hook fires
- **Variable Substitution**: Supports `${CLAUDE_PLUGIN_ROOT}` and environment variables
- **Platform**: Commands should be cross-platform compatible
- **Best Practice**: Use absolute paths to avoid PATH issues

### `timeout`
- **Type**: `number` (seconds)
- **Required**: No
- **Default**: 30
- **Description**: Maximum time to wait for hook to complete
- **Recommendations**:
  - Quick hooks: 5 seconds
  - Standard hooks: 10 seconds
  - Slow hooks: 30 seconds
  - Network hooks: 60 seconds

## Variable Substitution

### `${CLAUDE_PLUGIN_ROOT}`
Absolute path to `.claude-plugin/` directory

**Example**:
```json
"command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/session-start.js\""
```

Resolves to:
```
node "C:\Users\username\AppData\Roaming\Claude\plugins\goodvibes\.claude-plugin\hooks\scripts\dist\session-start.js"
```

### Environment Variables
Standard environment variables are available:

```json
"command": "python ${HOME}/.config/claude/hook.py"
```

## Hook Script Implementation

Hook scripts receive context via environment variables:

### Common Environment Variables

All hooks receive:
- `CLAUDE_PLUGIN_ROOT` - Plugin root directory
- `CLAUDE_HOOK_EVENT` - Event name (e.g., "SessionStart")
- `CLAUDE_HOOK_MATCHER` - Matcher that triggered (e.g., "startup")

### Event-Specific Variables

#### SessionStart
- `CLAUDE_SESSION_TYPE` - "startup" or "resume"
- `CLAUDE_SESSION_ID` - Unique session identifier

#### SubagentStart / SubagentStop
- `CLAUDE_AGENT_NAME` - Agent name (e.g., "goodvibes:engineer")
- `CLAUDE_AGENT_TASK` - Task description
- `CLAUDE_AGENT_ID` - Unique agent instance ID

#### PreToolUse / PostToolUse
- `CLAUDE_TOOL_NAME` - Full tool name (e.g., "precision-engine/precision_read")
- `CLAUDE_TOOL_PARAMS` - JSON-encoded tool parameters
- `CLAUDE_TOOL_RESULT` - JSON-encoded tool result (PostToolUse only)

#### PreCompact
- `CLAUDE_CONTEXT_SIZE` - Current context size in tokens
- `CLAUDE_CONTEXT_LIMIT` - Context limit in tokens

### Example Hook Script (Node.js)

```javascript
// session-start.js
const fs = require('fs');
const path = require('path');

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
const sessionType = process.env.CLAUDE_SESSION_TYPE;
const sessionId = process.env.CLAUDE_SESSION_ID;

const logDir = path.join(pluginRoot, '..', '.goodvibes', 'logs');
fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, 'sessions.log');
const logEntry = `${new Date().toISOString()} - ${sessionType} - ${sessionId}\n`;

fs.appendFileSync(logFile, logEntry);

console.log(`Session ${sessionType}: ${sessionId}`);
process.exit(0);
```

### Example Hook Script (Python)

```python
# session-start.py
import os
import json
from datetime import datetime
from pathlib import Path

plugin_root = Path(os.environ['CLAUDE_PLUGIN_ROOT'])
session_type = os.environ['CLAUDE_SESSION_TYPE']
session_id = os.environ['CLAUDE_SESSION_ID']

log_dir = plugin_root.parent / '.goodvibes' / 'logs'
log_dir.mkdir(parents=True, exist_ok=True)

log_file = log_dir / 'sessions.log'
log_entry = f"{datetime.now().isoformat()} - {session_type} - {session_id}\n"

with open(log_file, 'a') as f:
    f.write(log_entry)

print(f"Session {session_type}: {session_id}")
```

## Best Practices

### Performance
- Keep hooks fast (< 1 second ideal)
- Use async operations when possible
- Avoid blocking I/O in critical hooks
- Set appropriate timeouts

### Reliability
- Handle errors gracefully
- Exit with status code 0 on success
- Log errors to files, not stderr (avoid polluting output)
- Implement retries for network operations

### Security
- Validate all inputs
- Never trust environment variables for sensitive operations
- Use secure file permissions
- Avoid executing user-provided code

### Debugging
- Log to `.goodvibes/logs/hooks.log`
- Include timestamps and context
- Use structured logging (JSON)
- Add verbose mode via environment variable

## Troubleshooting

### Hook Not Firing

1. Check `hooks.json` syntax (valid JSON)
2. Verify hook event name is correct
3. Check matcher pattern matches event
4. Restart Claude Code (hooks loaded at startup)

### Hook Timing Out

1. Increase timeout value
2. Check script has execute permissions
3. Look for infinite loops in script
4. Verify script dependencies are available

### Hook Errors

1. Check hook script exists
2. Verify script has correct shebang (Python)
3. Check Node.js/Python is in PATH
4. Look for errors in `.goodvibes/logs/hooks.log`

### Variable Substitution Not Working

1. Verify variable name is correct
2. Check variable is available in hook context
3. Use quotes around paths with spaces
4. Test substitution manually

## Migration from SPEC-v2

SPEC-v2 defines a simplified hook format:

```json
{
  "hooks": {
    "SessionStart": ["session-start.js"],
    "PreToolUse": ["pre-tool-use.js"],
    "PostToolUse": ["post-tool-use.js"]
  }
}
```

This is equivalent to:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/scripts/dist/session-start.js\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

## See Also

- [plugin.json Reference](./plugin-json.md) - Plugin configuration
- [Mode Configuration Reference](./mode-config.md) - Output style configuration
- [SPEC-v2.md](../../../../SPEC-v2.md) - Complete specification
