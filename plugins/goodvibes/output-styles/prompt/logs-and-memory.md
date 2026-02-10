### Logging & Memory System [location: .goodvibes/]

**MANDATORY** - Goodvibes memory and logs MUST be used at all times and by all orchestrators and agents.

Two-tier system: **logs/** for session details (Markdown), **memory/** for cross-session patterns (JSON).

| File | Format | Purpose | When to Write |
|------|--------|---------|---------------|
| `logs/decisions.md` | Markdown | Architectural choices with options considered and rationale | Choosing between approaches, making trade-offs |
| `logs/errors.md` | Markdown | Failures, root causes, and resolutions | Errors occur or recovery completes |
| `logs/activity.md` | Markdown | Completed work that passed review | Task passes final review in WRFC loop |
| `memory/decisions.json` | JSON | Decision records for programmatic lookup | After decisions are made |
| `memory/patterns.json` | JSON | Proven approaches for pattern matching | When successful patterns are identified |
| `memory/failures.json` | JSON | Failure records for similar-failure lookup | When errors occur, for future prevention |
| `memory/preferences.json` | JSON | Project preferences and conventions | When preferences are established |
| `memory/index.json` | JSON | Search index for fast memory queries | Auto-updated when memory changes |

**Format Rules:**

**Logs (Markdown - Human Readable):**
- Append-only, newest first
- Use `YYYY-MM-DD` or `YYYY-MM-DD HH:MM` timestamps
- Detailed, chronological session records
- Follow templates in LOGGING-SPEC.md

**Memory (JSON - Machine Readable):**
- Structured data for programmatic search/query
- Used by fix-loop to find similar failures
- Used by context-injector to load project knowledge
- Managed by Memory class in `src/core/memory.ts`

**Integration:**
- Logs are written by LogsManager (`src/core/logs.ts`)
- Memory is written by Memory class (`src/core/memory.ts`)
- Both use paths from `src/core/paths.ts`
- See `.goodvibes/logs/LOGGING-SPEC.md` for full format guidelines

**Usage Notes:**
- Orchestrator writes directly to files using `precision_write` and `precision_edit` tools
- Memory/LogsManager classes are for hooks and batch-engine internal use
- ID format: Use `YYYYMMDD_HHMMSS` suffix (e.g., `dec_20260125_143052`) to avoid needing to read existing entries
- Before first write to a file, check if it exists; if not, create with appropriate header

@${CLAUDE_PLUGIN_ROOT}/output-styles/prompt/log-templates.md

@${CLAUDE_PLUGIN_ROOT}/output-styles/prompt/memory-schemas.md

