# Remediation Plan

**Total Tasks**: 22
**Estimated Waves**: 4
**Estimated Agents**: 22 (one per task)

## Execution Rules

- **Max concurrent agents**: 6
- **Agent type**: goodvibes background ONLY
- **Context**: Fresh context per task (no accumulated state)
- **Tool priority**: MCP tools > bash (mandatory)
- **Monitoring**: None - agents self-report via SubagentStop hook

---

## Task Checklist

### Wave 1: Critical/High - Disabled Feature [P0]

These tasks address the disabled `identify_tech_debt` tool. Decision: **Remove the disabled code** since the dependent modules don't exist.

- [ ] TASK-001: Remove disabled identify_tech_debt imports from identify-tech-debt.ts | Severity: high | Files: `plugins/goodvibes/tools/implementations/analysis-engine/src/handlers/analysis/identify-tech-debt.ts`
- [ ] TASK-002: Remove disabled handler import from registry.ts | Severity: high | Files: `plugins/goodvibes/tools/implementations/analysis-engine/src/handlers/registry.ts`
- [ ] TASK-003: Remove disabled schema imports from schemas/index.ts | Severity: high | Files: `plugins/goodvibes/tools/implementations/analysis-engine/src/schemas/index.ts`

### Wave 2: High - Stub Implementations [P1]

These tasks implement the placeholder functions in batch-engine.

- [ ] TASK-004: Implement executeRetry function with actual retry logic | Severity: high | Files: `plugins/goodvibes/tools/implementations/batch-engine/src/handlers/batch-recover.ts`
- [ ] TASK-005: Implement executeFix function with fix loop logic | Severity: high | Files: `plugins/goodvibes/tools/implementations/batch-engine/src/handlers/batch-recover.ts`
- [ ] TASK-006: Implement executeOperationByType with real operation handlers | Severity: high | Files: `plugins/goodvibes/tools/implementations/batch-engine/src/handlers/batch.ts`
- [ ] TASK-007: Implement runValidation with actual validation checks | Severity: high | Files: `plugins/goodvibes/tools/implementations/batch-engine/src/handlers/batch.ts`

### Wave 3: Medium - Hardcoded Values & Config [P2]

- [ ] TASK-008: Extract constraints from batch config instead of empty array | Severity: medium | Files: `plugins/goodvibes/tools/implementations/batch-engine/src/runtime/context.ts`
- [ ] TASK-009: Implement main branch detection instead of hardcoded 'main' | Severity: medium | Files: `plugins/goodvibes/tools/implementations/batch-engine/src/runtime/context.ts`
- [x] TASK-010: Create .env.example (REVERTED - conflicts with remote) | Severity: medium | Files: N/A
- [ ] TASK-011: Add placeholder markers to database URL examples | Severity: medium | Files: `plugins/goodvibes/templates/full/next-saas/files/.env.example.hbs`
- [ ] TASK-012: Add placeholder markers to query-database.yaml examples | Severity: medium | Files: `plugins/goodvibes/tools/definitions/project-engine/query-database.yaml`
- [ ] TASK-013: Add placeholder markers to query-database handler examples | Severity: medium | Files: `plugins/goodvibes/tools/implementations/project-engine/src/handlers/database/query-database/handler.ts`
- [ ] TASK-014: Add placeholder markers to url-parser examples | Severity: medium | Files: `plugins/goodvibes/tools/implementations/project-engine/src/handlers/database/query-database/url-parser.ts`
- [ ] TASK-015: Add placeholder markers to project-schemas examples | Severity: medium | Files: `plugins/goodvibes/tools/implementations/project-engine/src/schemas/project-schemas.ts`
- [ ] TASK-016: Add comments clarifying secrets-scanner patterns are detection patterns | Severity: medium | Files: `plugins/goodvibes/tools/implementations/analysis-engine/src/handlers/security/secrets-scanner.ts`, `plugins/goodvibes/tools/implementations/project-engine/src/handlers/security/secrets-scanner.ts`

### Wave 4: Low - Telemetry & Cleanup [P3]

- [ ] TASK-017: Implement retries tracking in telemetry | Severity: low | Files: `plugins/goodvibes/tools/implementations/batch-engine/src/runtime/telemetry.ts`
- [ ] TASK-018: Implement tool_calls tracking in telemetry | Severity: low | Files: `plugins/goodvibes/tools/implementations/batch-engine/src/runtime/telemetry.ts`
- [ ] TASK-019: Implement files_read tracking in telemetry | Severity: low | Files: `plugins/goodvibes/tools/implementations/batch-engine/src/runtime/telemetry.ts`
- [ ] TASK-020: Implement tools_used tracking in telemetry | Severity: low | Files: `plugins/goodvibes/tools/implementations/batch-engine/src/runtime/telemetry.ts`
- [x] TASK-021: Verify eslint dependency usage (VERIFIED: used by plugin subpackages) | Severity: low | Files: `package.json`
- [ ] TASK-022: Set TODO scanner limit to 100 (increased from investigation's Infinity) | Severity: low | Files: `plugins/goodvibes/hooks/scripts/src/context/todo-scanner.ts`

---

## Task Details

### TASK-001: Remove disabled identify_tech_debt imports

**File**: `plugins/goodvibes/tools/implementations/analysis-engine/src/handlers/analysis/identify-tech-debt.ts`
**Lines**: 30-34
**Action**: Remove the commented-out imports and the TODO comment. The functions `handleGetTestCoverage`, `handleCheckTypes`, `scanDirectory`, and `TodoItem` type are referenced in the file but the modules don't exist.
**Additional**: Also remove the `analyzeCoverage`, `analyzeTypeErrors`, and `analyzeTodos` functions that use these imports (lines 406-507), OR mark them with `@deprecated` and have them return neutral values.

### TASK-002: Remove disabled handler import from registry.ts

**File**: `plugins/goodvibes/tools/implementations/analysis-engine/src/handlers/registry.ts`
**Lines**: 40-41, 78-79
**Action**: Remove the commented-out import and registration for `handleIdentifyTechDebt`.

### TASK-003: Remove disabled schema imports from schemas/index.ts

**File**: `plugins/goodvibes/tools/implementations/analysis-engine/src/schemas/index.ts`
**Lines**: 20-21, 46-47, 58
**Action**: Remove the commented-out import, spread, and re-export for `ANALYSIS_SCHEMAS`.

### TASK-004: Implement executeRetry function

**File**: `plugins/goodvibes/tools/implementations/batch-engine/src/handlers/batch-recover.ts`
**Lines**: 305-319
**Action**: Implement actual retry logic:
1. Load the batch state using `runtime.state.getState()`
2. Find failed operations in the batch
3. Re-execute each failed operation
4. Track success/failure counts
5. Optionally create a new batch for retried operations

### TASK-005: Implement executeFix function

**File**: `plugins/goodvibes/tools/implementations/batch-engine/src/handlers/batch-recover.ts`
**Lines**: 415-430
**Action**: Implement fix loop logic:
1. Analyze the errors from failed operations
2. Determine fix strategy based on error types
3. Apply fixes (code edits, config changes, etc.)
4. Re-validate after fixes
5. Track attempts and actions taken

### TASK-006: Implement executeOperationByType

**File**: `plugins/goodvibes/tools/implementations/batch-engine/src/handlers/batch.ts`
**Lines**: 749-803
**Action**: Instead of returning mock data, delegate to actual operation handlers:
- `files`: Call file reading utilities
- `search`: Call grep/search utilities
- `glob`: Call glob utilities
- `edit`: Call file editing utilities
- `command`: Execute shell commands
- etc.

### TASK-007: Implement runValidation

**File**: `plugins/goodvibes/tools/implementations/batch-engine/src/handlers/batch.ts`
**Lines**: 861-877
**Action**: Implement validation check execution:
1. Parse each check string to determine validation type
2. Execute appropriate validation (typecheck, lint, test, etc.)
3. Collect errors from failed validations
4. Return accurate pass/fail status

### TASK-008: Extract constraints from batch config

**File**: `plugins/goodvibes/tools/implementations/batch-engine/src/runtime/context.ts`
**Line**: 304
**Action**: Replace `constraints: []` with extraction from `batchContext` or the batch configuration object.

### TASK-009: Implement main branch detection

**File**: `plugins/goodvibes/tools/implementations/batch-engine/src/runtime/context.ts`
**Line**: 426
**Action**: Replace `main_branch: 'main'` with detection logic:
```typescript
const mainBranch = await executeGitCommand(['symbolic-ref', 'refs/remotes/origin/HEAD'])
  .then(ref => ref.replace('refs/remotes/origin/', '').trim())
  .catch(() => 'main');
```

### TASK-010: Create .env.example

**File**: `.env.example` (new)
**Action**: Create file with all environment variables:
```env
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
NEXTAUTH_URL=http://localhost:3000

# Optional (have defaults)
GOODVIBES_STDIN_TIMEOUT_MS=5000
CLAUDE_PLUGIN_ROOT=
CLAUDE_PROJECT_DIR=
# ... etc
```

### TASK-011 through TASK-015: Add placeholder markers to examples

**Action**: Replace actual-looking database URLs with clearly marked placeholders:
```
postgresql://<USER>:<PASSWORD>@<HOST>:5432/<DATABASE>
mysql://<USER>:<PASSWORD>@<HOST>:3306/<DATABASE>
```

### TASK-016: Clarify secrets-scanner patterns

**Files**: Both `secrets-scanner.ts` files
**Action**: Add comments above the pattern definitions:
```typescript
// Detection patterns - these strings identify secrets in scanned files
// They are NOT actual secrets
const PRIVATE_KEY_PATTERNS = [
  '-----BEGIN RSA PRIVATE KEY-----',  // Pattern to detect RSA keys
  // ...
];
```

### TASK-017 through TASK-020: Implement telemetry tracking

**File**: `plugins/goodvibes/tools/implementations/batch-engine/src/runtime/telemetry.ts`
**Action**:
1. Add tracking parameters to `recordOperationComplete` and `recordAgentComplete`
2. Accept retries, tool_calls, files_read, tools_used as parameters
3. Pass these values from the actual operation/agent execution

### TASK-021: Verify eslint dependency (COMPLETE)

**File**: `package.json`
**Action**: ~~Check if eslint is used via CLI scripts.~~ **VERIFIED**: eslint is used by plugin subpackages. No action needed - dependency kept.

### TASK-022: Set TODO scanner limit to 100

**File**: `plugins/goodvibes/hooks/scripts/src/context/todo-scanner.ts`
**Line**: 57
**Action**: Change `const DEFAULT_TODO_LIMIT = Infinity;` to `const DEFAULT_TODO_LIMIT = 100;`

---

## Execution Order

```
Wave 1 (3 tasks): TASK-001, TASK-002, TASK-003 - Run in parallel (max 3)
Wave 2 (4 tasks): TASK-004, TASK-005, TASK-006, TASK-007 - Run in parallel (max 4)
Wave 3 (9 tasks): TASK-008 through TASK-016 - Run 6 parallel, then 3
Wave 4 (6 tasks): TASK-017 through TASK-022 - Run 6 parallel
```

Total estimated agent spawns: 22
