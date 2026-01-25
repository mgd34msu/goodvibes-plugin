### Logging & Memory System [location: .goodvibes/]

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

#### Log Entry Templates

**logs/decisions.md:**
```
## YYYY-MM-DD: [Decision Title]

**Context**: [1-2 sentences on what prompted this decision]

**Options Considered**:
1. **[Option A]**: [Brief description]
   - Pros: [advantages]
   - Cons: [disadvantages]
2. **[Option B]**: [Brief description]
   - Pros: [advantages]
   - Cons: [disadvantages]

**Decision**: [Which option was chosen]

**Rationale**: [Why this option was selected over alternatives]

**Implications**: [What this means for future work]

---
```

**logs/errors.md:**
```
## YYYY-MM-DD HH:MM - [ERROR_CATEGORY]

**Error**: [Brief error description]

**Context**:
- Task: [What was being attempted]
- Agent: [Which agent, if applicable]
- File(s): [Relevant files]

**Root Cause**: [Why it happened]

**Resolution**: [How it was fixed]

**Prevention**: [How to avoid this in future, if applicable]

**Status**: [RESOLVED | UNRESOLVED | WORKAROUND]

---
```

Error categories: `TOOL_FAILURE`, `AGENT_FAILURE`, `BUILD_ERROR`, `TEST_FAILURE`, `VALIDATION_ERROR`, `EXTERNAL_ERROR`, `UNKNOWN`

**logs/activity.md:**
```
## YYYY-MM-DD: [Task/Feature Title]

**Task**: [Brief description of what was accomplished]

**Plan**: [Path to plan file, if applicable, or N/A]

**Status**: [COMPLETE | PARTIAL | IN_PROGRESS]

**Completed Items**:
- [Item 1]
- [Item 2]

**Files Modified**:
- [file1.ts]
- [file2.ts]
- [new-file.ts] (new)

**Review Score**: [X/10, if reviewed]

**Commit**: [hash, if committed]

---
```

#### Memory JSON Schemas

**memory/decisions.json** (array of objects):
```json
{
  "id": "dec_YYYYMMDD_NNN",
  "date": "YYYY-MM-DDTHH:MM:SSZ",
  "category": "library|architecture|pattern|convention",
  "what": "Brief description of the decision",
  "why": "Rationale for this choice",
  "scope": ["affected/files.ts", "or/directories/"],
  "confidence": "high|medium|low",
  "status": "active|superseded|reverted"
}
```

**memory/patterns.json** (array of objects):
```json
{
  "id": "pat_YYYYMMDD_NNN",
  "name": "PatternName",
  "description": "What this pattern does and why it's used",
  "when_to_use": "Conditions or triggers for applying this pattern",
  "example_files": ["path/to/example.ts"],
  "keywords": ["relevant", "search", "terms"]
}
```

**memory/failures.json** (array of objects):
```json
{
  "id": "fail_YYYYMMDD_NNN",
  "date": "YYYY-MM-DDTHH:MM:SSZ",
  "error": "Error message or description",
  "context": "What was being attempted when this occurred",
  "root_cause": "Why it happened",
  "resolution": "How it was fixed",
  "prevention": "How to avoid in future",
  "keywords": ["searchable", "terms"]
}
```

**memory/preferences.json** (array of objects):
```json
{
  "key": "category.preference_name",
  "value": "preference value or setting",
  "reason": "Why this preference exists"
}
```
