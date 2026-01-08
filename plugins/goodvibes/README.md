# GoodVibes Plugin for Claude Code

A comprehensive automation plugin that enhances Claude Code with intelligent context injection, persistent memory, smart error recovery, and automated quality gates.

## Features

### 1. Smart Context Injection (SessionStart)
Automatically injects project context at session start:
- **Stack Detection**: Identifies frameworks, languages, and tools (Next.js, Vite, TypeScript, etc.)
- **Git Context**: Current branch, uncommitted changes, recent commits
- **Environment Status**: Missing env vars, .env file presence
- **Project Health**: node_modules status, lockfile issues, TypeScript config
- **TODO Scanner**: Finds TODOs/FIXMEs in codebase
- **Recent Activity**: Hotspots, recently modified files
- **Port Checker**: Active dev servers on common ports

### 2. Persistent Memory System
Cross-session memory stored in `.goodvibes/memory/`:
- `decisions.md` - Architectural decisions and rationale
- `patterns.md` - Code patterns and conventions discovered
- `failures.md` - Past failures and solutions
- `preferences.md` - User preferences learned

### 3. PostToolUseFailure Smart Recovery
3-phase error recovery with escalating research:
- **Phase 1**: Fix attempts with existing knowledge
- **Phase 2**: Search official documentation
- **Phase 3**: Search community solutions (Stack Overflow, GitHub)

### 4. Pre-Commit Quality Gates
Automatic quality checks before commits:
- TypeScript type checking
- ESLint with auto-fix
- Prettier formatting
- Test runner

### 5. Subagent Telemetry
Comprehensive tracking of subagent activity:
- Start/stop timestamps and duration
- Task descriptions and outcomes
- Keyword extraction from transcripts
- Monthly JSONL telemetry logs

### 6. Auto-Checkpoint Commits
Automatic checkpoint commits based on:
- File modification count thresholds
- Time intervals
- Agent completion events

### 7. Output Styles
Two specialized output modes:
- **Vibecoding**: Autonomous orchestration with rapid agent delegation
- **JustVibes**: Silent execution mode for maximum autonomy

### 8. Crash Recovery
Detects unclean session terminations and provides recovery context.

## Installation

The plugin is installed as part of the vibeplug ecosystem:

```bash
# Plugin is located at:
plugins/goodvibes/
```

## Configuration

Configure via `.goodvibes/settings.json`:

```json
{
  "autoCheckpoint": {
    "enabled": true,
    "fileThreshold": 5,
    "timeThresholdMinutes": 30
  },
  "qualityGates": {
    "typeCheck": true,
    "lint": true,
    "format": true,
    "test": false
  },
  "contextInjection": {
    "stackDetection": true,
    "gitContext": true,
    "todoScanner": true,
    "healthCheck": true
  }
}
```

## Hooks

| Hook | Purpose |
|------|---------|
| `session-start` | Context injection, crash recovery |
| `session-end` | Session cleanup |
| `pre-tool-use` | Quality gates, git guards |
| `post-tool-use` | File tracking, checkpoints, dev server monitoring |
| `post-tool-use-failure` | 3-phase error recovery |
| `subagent-start` | Telemetry capture |
| `subagent-stop` | Output validation, test verification |
| `pre-compact` | State preservation before context compaction |

## Development

### Build

```bash
cd plugins/goodvibes/hooks/scripts
npm install
npm run build
```

### Test

```bash
npm test
```

3,780 tests covering:
- State management
- Automation modules (fix-loop, git-operations, build/test runners)
- Context modules (stack-detector, git-context, health-checker, etc.)
- Memory system
- Hook utilities

### Directory Structure

```
plugins/goodvibes/
├── agents/           # Specialized subagent definitions
├── hooks/
│   ├── hooks.yaml    # Hook configuration
│   └── scripts/      # TypeScript hook implementations
│       ├── src/
│       │   ├── automation/     # Build, test, git automation
│       │   ├── context/        # Context gathering modules
│       │   ├── memory/         # Persistent memory system
│       │   ├── post-tool-use/  # File tracking, checkpoints
│       │   ├── pre-tool-use/   # Quality gates
│       │   ├── session-start/  # Context injection
│       │   ├── subagent-*/     # Telemetry and validation
│       │   └── types/          # TypeScript definitions
│       └── dist/               # Compiled JavaScript
├── output-styles/    # Vibecoding and JustVibes modes
├── skills/           # Domain-specific skills
└── tools/            # MCP tool definitions
```

## License

Part of the goodvibes ecosystem.
