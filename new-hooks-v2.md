# Claude Code Hooks: TeammateIdle & TaskCompleted

## Table of Contents

1. [Overview](#overview)
2. [Hook Registration](#hook-registration)
3. [TeammateIdle Hook](#teammateidle-hook)
4. [TaskCompleted Hook](#taskcompleted-hook)
5. [Shared Input Schema (Base Fields)](#shared-input-schema-base-fields)
6. [Output Schema](#output-schema)
7. [Exit Code Contract](#exit-code-contract)
8. [Hook Type Compatibility](#hook-type-compatibility)
9. [Matcher Support](#matcher-support)
10. [Execution Sequence](#execution-sequence)
11. [Settings Configuration](#settings-configuration)
12. [Settings Precedence & Policy Controls](#settings-precedence--policy-controls)
13. [Practical Examples](#practical-examples)
14. [Source File Reference](#source-file-reference)

---

## Overview

Two lifecycle hooks added to Claude Code's hook system for **team/multi-agent sessions**:

| Hook | Purpose | Veto Power |
|------|---------|------------|
| **TeammateIdle** | Fires when a teammate agent is about to go idle | Can prevent idle, forcing the teammate to continue working |
| **TaskCompleted** | Fires when a task is being marked as completed | Can prevent task completion, keeping the task in its current state |

Both hooks fire **before** the state change is finalized, giving them full veto power without needing rollback.

---

## Hook Registration

Both hooks are registered in the `Lx` array — the canonical list of all 15 valid hook event names:

```typescript
Lx = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Notification",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PermissionRequest",
  "Setup",
  "TeammateIdle",
  "TaskCompleted",
];
```

---

## TeammateIdle Hook

### Description

```
summary: "When a teammate is about to go idle"
description: Input to command is JSON with teammate_name and team_name.
  Exit code 0 - stdout/stderr not shown
  Exit code 2 - show stderr to teammate and prevent idle (teammate continues working)
  Other exit codes - show stderr to user only
```

### Input Schema (Zod)

```typescript
QjY = NZ.and(
  b.object({
    hook_event_name: b.literal("TeammateIdle"),
    teammate_name: b.string(),    // required
    team_name: b.string(),        // required
  }),
)
```

**Full input payload (JSON on stdin):**

```json
{
  "session_id": "uuid-string",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/project",
  "permission_mode": "default",
  "hook_event_name": "TeammateIdle",
  "teammate_name": "researcher",
  "team_name": "my-team"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | yes | Current session UUID |
| `transcript_path` | string | yes | Path to session transcript JSONL file |
| `cwd` | string | yes | Current working directory |
| `permission_mode` | string | no | Permission mode (e.g., "default", "plan", "acceptEdits") |
| `hook_event_name` | literal | yes | Always "TeammateIdle" |
| `teammate_name` | string | yes | Name of the teammate agent about to go idle |
| `team_name` | string | yes | Name of the team |

### Executor Function

```typescript
async function* KLA(A, q, K, Y, z = cj) {
  let w = {
    ...hX(K),
    hook_event_name: "TeammateIdle",
    teammate_name: A,
    team_name: q,
  };
  yield* sh({ hookInput: w, toolUseID: bv(), signal: Y, timeoutMs: z });
}
```

**Parameters:**
- `A` = teammate_name (string)
- `q` = team_name (string)
- `K` = permissionMode (string, optional)
- `Y` = AbortSignal
- `z` = timeoutMs (defaults to `cj` — 600,000ms / 10 minutes)

**Context passed to `sh()`:**
- `hookInput` — the payload
- `toolUseID` — generated UUID
- `signal` — AbortSignal
- `timeoutMs` — timeout
- **NOT passed:** `toolUseContext`, `messages`

### Trigger Location

Single call site. Fires when:
1. `Kz()` returns `true` (teammate mode is active)
2. After all TaskCompleted hooks have run for the teammate's in_progress tasks
3. Before idle state is finalized

```typescript
let r = KLA(m, x, P, H.abortController.signal);
for await (let c of r) {
  if (c.message) yield c.message;
  if (c.blockingError) {
    let Y1 = g6({ content: okA(c.blockingError), isMeta: !0 });
    (U.push(Y1), yield Y1);
  }
  if (H.abortController.signal.aborted) return;
}
```

### Veto Behavior

When blocked (exit code 2 or JSON output with `continue: false`):
- Blocking errors are collected into array `U`
- If `U.length > 0`, the teammate gets another turn via `EZ()` with `stopHookActive: true`
- The teammate receives the error as a meta message
- The **team lead is completely unaware** of the veto
- Idle state is **never set**

### Error Formatter

TeammateIdle uses `okA()` to format blocking errors (distinct from TaskCompleted's `$Q1()`).

Format: `"TeammateIdle hook feedback:\n[command]: stderr_output"`

---

## TaskCompleted Hook

### Description

```
summary: "When a task is being marked as completed"
description: Input to command is JSON with task_id, task_subject,
  task_description, teammate_name, and team_name.
  Exit code 0 - stdout/stderr not shown
  Exit code 2 - show stderr to model and prevent task completion
  Other exit codes - show stderr to user only
```

### Input Schema (Zod)

```typescript
UjY = NZ.and(
  b.object({
    hook_event_name: b.literal("TaskCompleted"),
    task_id: b.string(),
    task_subject: b.string(),
    task_description: b.string().optional(),
    teammate_name: b.string().optional(),
    team_name: b.string().optional(),
  }),
)
```

**Full input payload (JSON on stdin):**

```json
{
  "session_id": "uuid-string",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/project",
  "permission_mode": "default",
  "hook_event_name": "TaskCompleted",
  "task_id": "task-42",
  "task_subject": "Implement auth middleware",
  "task_description": "Add JWT validation to all API routes",
  "teammate_name": "engineer",
  "team_name": "my-team"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | string | yes | Current session UUID |
| `transcript_path` | string | yes | Path to session transcript JSONL file |
| `cwd` | string | yes | Current working directory |
| `permission_mode` | string | no | Permission mode |
| `hook_event_name` | literal | yes | Always "TaskCompleted" |
| `task_id` | string | yes | Task identifier |
| `task_subject` | string | yes | Task title/subject |
| `task_description` | string | no | Task description body |
| `teammate_name` | string | no | Which teammate completed it |
| `team_name` | string | no | Which team |

### Executor Function

```typescript
async function* OQ1(A, q, K, Y, z, w, H, $ = cj, O) {
  let _ = {
    ...hX(w),
    hook_event_name: "TaskCompleted",
    task_id: A,
    task_subject: q,
    task_description: K,
    teammate_name: Y,
    team_name: z,
  };
  yield* sh({
    hookInput: _,
    toolUseID: bv(),
    signal: H,
    timeoutMs: $,
    toolUseContext: O,
  });
}
```

**Parameters:**
- `A` = task_id
- `q` = task_subject
- `K` = task_description
- `Y` = teammate_name
- `z` = team_name
- `w` = permissionMode
- `H` = AbortSignal
- `$` = timeoutMs (defaults to `cj`)
- `O` = toolUseContext

**Context passed to `sh()`:**
- `hookInput` — the payload
- `toolUseID` — generated UUID
- `signal` — AbortSignal
- `timeoutMs` — timeout
- `toolUseContext` — **YES, passed** (unlike TeammateIdle)
- **NOT passed:** `messages`

### Trigger Locations

Two call sites:

#### Call Site 1: TaskUpdate Tool Handler

Fires when the TaskUpdate tool changes a task's status TO `"completed"`:

```typescript
if (z !== X.status) {            // status is changing
  if (z === "completed") {       // changing TO completed
    let j = [],
      W = OQ1(
        A,                       // task_id
        X.subject,               // task_subject
        X.description,           // task_description
        B5(),                    // teammate_name (current agent)
        Q3(),                    // team_name (current team)
        void 0,                  // permissionMode
        _?.abortController?.signal,
        void 0,                  // timeoutMs (default)
        _,                       // toolUseContext
      );
    for await (let G of W)
      if (G.blockingError) j.push($Q1(G.blockingError));
    if (j.length > 0)
      return {
        data: {
          success: !1,           // REJECT the completion
          taskId: A,
          updatedFields: [],
          error: j.join("\n"),
        },
      };
  }
  ((M.status = z), D.push("status"));  // Only persists if no blocking errors
}
```

**Veto behavior:**
- If ANY hook yields a `blockingError`, the entire TaskUpdate returns `{ success: false }`
- Task status **never changes** — `M.status = z` and `D.push("status")` are never reached
- The error message is returned to the calling model

#### Call Site 2: Stop Hook Executor

Fires when a teammate goes idle, for ALL their `in_progress` tasks:

```typescript
let g = nM(),
    p = zX(g).filter((c) => c.status === "in_progress" && c.owner === m);
for (let c of p) {
  let Y1 = OQ1(
    c.id,
    c.subject,
    c.description,
    m,                           // teammate_name
    x,                           // team_name
    P,                           // permissionMode
    H.abortController.signal,
    void 0,                      // timeoutMs
    H,                           // toolUseContext
  );
  for await (let f1 of Y1) {
    if (f1.message) yield f1.message;
    if (f1.blockingError) {
      let P1 = g6({ content: $Q1(f1.blockingError), isMeta: !0 });
      (U.push(P1), yield P1);
    }
    if (H.abortController.signal.aborted) return;
  }
}
```

**Veto behavior:**
- Blocking errors are collected into `U` (shared with TeammateIdle errors)
- If `U.length > 0` after both TaskCompleted and TeammateIdle hooks run, teammate continues via `EZ()`

### Error Formatter

TaskCompleted uses `$Q1()` to format blocking errors.

Format: `"TaskCompleted hook feedback:\n[command]: stderr_output"`

---

## Shared Input Schema (Base Fields)

```typescript
NZ = b.object({
  session_id: b.string(),
  transcript_path: b.string(),
  cwd: b.string(),
  permission_mode: b.string().optional(),
})
```

```typescript
function hX(A, q) {
  let K = q ?? U6();             // session ID
  return {
    session_id: K,
    transcript_path: p$(K),      // transcript file path
    cwd: y6(),                   // current working directory
    permission_mode: A,          // permission mode string
  };
}
```

All 15 hooks share these base fields. Event-specific fields are added on top via `.and()` in the Zod schemas.

---

## Output Schema

Both hooks use the **same generic output processing** as all other Claude Code hooks. Output is parsed from stdout.

### Parsing Flow

```typescript
let { json: g, plainText: B, validationError: p } = jd4(U.stdout);
```

1. `jd4()` attempts to parse stdout as JSON
2. **Valid JSON** → passed to `Wd4()` for field processing
3. **Invalid JSON** → yields `non_blocking_error` with `"JSON validation failed: ..."`
4. **Plain text** (not JSON) with exit code 0 → shown to user unless `suppressOutput` is true

### JSON Output Fields

All fields are optional. If stdout is not JSON or is empty, default behavior applies.

```json
{
  "continue": true,
  "stopReason": "Message when continue is false",
  "decision": "approve",
  "reason": "Explanation for decision",
  "systemMessage": "Warning shown to user in UI",
  "suppressOutput": false,
  "hookSpecificOutput": {
    "hookEventName": "TaskCompleted",
    "additionalContext": "Text injected into model context"
  }
}
```

#### Field Details

**`continue`** (boolean, default: `true`)

```typescript
if (J.continue === !1) {
  if (((_.preventContinuation = !0), J.stopReason))
    _.stopReason = J.stopReason;
}
```
When `false`, sets `preventContinuation = true`. This blocks the operation even on exit code 0.

---

**`stopReason`** (string)

```typescript
_.stopReason = J.stopReason;
```
Only meaningful when `continue === false`. Provides a user/model-facing message explaining why the operation was blocked.

---

**`decision`** ("approve" | "block")

```typescript
if (A.decision)
  switch (A.decision) {
    case "approve":
      _.permissionBehavior = "allow";
      break;
    case "block":
      ((_.permissionBehavior = "deny"),
        (_.blockingError = {
          blockingError: A.reason || "Blocked by hook",
          command: q,
        }));
      break;
    default:
      throw Error(
        `Unknown hook decision type: ${A.decision}. Valid types are: approve, block`,
      );
  }
```
`"block"` creates a `blockingError` using the `reason` field as the message. `"approve"` sets permission to allow.

---

**`reason`** (string)

Used as the error message text when `decision === "block"`. Falls back to `"Blocked by hook"` if not provided.

---

**`systemMessage`** (string)

```typescript
if (A.systemMessage) _.systemMessage = A.systemMessage;
```
Displayed to the user in the UI. Works independently of blocking — you can show a warning without stopping execution.

---

**`suppressOutput`** (boolean, default: `false`)

```typescript
if (Vc7(g) && !g.suppressOutput && B && U.status === 0) {
  // Show output only if suppressOutput is NOT true
}
```
When `true`, stdout is hidden from the transcript. Useful for hooks that produce output for internal use only.

---

**`hookSpecificOutput`** (object)

Must include `hookEventName` matching the current event. Sub-fields:

- `additionalContext` (string) — text injected into model context. Works for: PostToolUse, UserPromptSubmit, SessionStart, Setup, SubagentStart.
- `permissionDecision` ("allow" | "deny" | "ask") — **PreToolUse only**
- `permissionDecisionReason` (string) — **PreToolUse only**
- `updatedInput` (any) — **PreToolUse only**

For TeammateIdle and TaskCompleted, the `hookSpecificOutput` processing falls through to the `additionalContext` extraction, but there are no event-specific sub-fields defined.

### Two Ways to Block

You have two mechanisms to veto an operation:

1. **Exit code 2** + stderr message — simple, recommended for scripts
2. **Exit code 0** + JSON stdout with `continue: false` or `decision: "block"` — richer, allows setting `systemMessage`, `stopReason`, etc.

Both produce blocking errors that prevent the state change.

---

## Exit Code Contract

Shared by ALL hook types (command hooks). The branching logic:

### Exit Code 0 — Success

```typescript
if (U.status === 0) {
  Yh({  // telemetry
    hookId: m, hookName: _, hookEvent: O,
    output: U.output, stdout: U.stdout, stderr: U.stderr,
    exitCode: U.status, outcome: "success",
  });
  yield {
    message: Zq({
      type: "hook_success",
      hookName: _, toolUseID: q, hookEvent: O,
      content: U.stdout.trim(),
      stdout: U.stdout, stderr: U.stderr, exitCode: U.status,
    }),
    outcome: "success",
    hook: Z,
  };
  return;
}
```

- Stdout is trimmed and included in the success message
- If stdout is valid JSON, the output fields are processed (see Output Schema above)
- If JSON contains `continue: false` or `decision: "block"`, the operation is still blocked

### Exit Code 2 — Blocking Veto

```typescript
if (U.status === 2) {
  Yh({  // telemetry
    hookId: m, hookName: _, hookEvent: O,
    output: U.output, stdout: U.stdout, stderr: U.stderr,
    exitCode: U.status, outcome: "error",
  });
  yield {
    blockingError: {
      blockingError: `[${Z.command}]: ${U.stderr || "No stderr output"}`,
      command: Z.command,
    },
    outcome: "blocking",
    hook: Z,
  };
  return;
}
```

- **Stderr** is used as the error message (stdout JSON is NOT parsed on exit 2)
- The error format is: `[command]: stderr_content`
- For TeammateIdle: formatted by `okA()` → `"TeammateIdle hook feedback:\n..."`
- For TaskCompleted: formatted by `$Q1()` → `"TaskCompleted hook feedback:\n..."`

### Other Exit Codes — Non-Blocking Warning

```typescript
Yh({  // telemetry
  hookId: m, hookName: _, hookEvent: O,
  output: U.output, stdout: U.stdout, stderr: U.stderr,
  exitCode: U.status, outcome: "error",
});
yield {
  message: Zq({
    type: "hook_non_blocking_error",
    hookName: _, toolUseID: q, hookEvent: O,
    stderr: `Failed with non-blocking status code: ${U.stderr.trim() || "No stderr output"}`,
    stdout: U.stdout, exitCode: U.status,
  }),
  outcome: "non_blocking_error",
  hook: Z,
};
return;
```

- Stderr is shown to the user as a warning
- Operation proceeds normally
- Does NOT block the state change

### Summary Table

| Exit Code | Outcome | Stderr Routing | Blocks Operation | JSON Output Parsed |
|---|---|---|---|---|
| 0 | `"success"` | Not shown directly | Only if JSON has `continue:false` or `decision:"block"` | Yes |
| 2 | `"blocking"` | Sent to teammate/model as feedback | Yes, always | No |
| Other | `"non_blocking_error"` | Shown to user as warning | No | No |

---

## Hook Type Compatibility

The `sh()` generator (`dom.ts:61849-62200`) supports five hook types. Compatibility depends on what context each executor passes.

### What Each Executor Passes

| Context | TeammateIdle (`KLA`) | TaskCompleted (`OQ1`) |
|---------|---------------------|----------------------|
| `hookInput` | Yes | Yes |
| `toolUseID` | Yes | Yes |
| `signal` | Yes | Yes |
| `timeoutMs` | Yes | Yes |
| `toolUseContext` | **No** | **Yes** |
| `messages` | **No** | **No** |

### Hook Type Requirements

```typescript
// Prompt hooks require toolUseContext
if (Z.type === "prompt") {
  if (!w)
    throw Error("ToolUseContext is required for prompt hooks. This is a bug.");
  yield await hc7(Z, _, O, x, u, w, H, q);
  return;
}

// Agent hooks require toolUseContext AND messages
if (Z.type === "agent") {
  if (!w)
    throw Error("ToolUseContext is required for agent hooks. This is a bug.");
  if (!H)
    throw Error("Messages are required for agent hooks. This is a bug.");
  yield await _d4(Z, _, O, x, u, w, q, H);
  return;
}

// Command hooks — no special requirements, fall through to zW6()
let U = await zW6(Z, O, _, x, u, m, k, N, T, $);
```

### Compatibility Matrix

| Hook Type | TeammateIdle | TaskCompleted | Reason |
|-----------|-------------|---------------|--------|
| `command` | **Works** | **Works** | No special context needed |
| `prompt` | **Throws** | **Works** | Needs `toolUseContext` — only TaskCompleted passes it |
| `agent` | **Throws** | **Throws** | Needs `toolUseContext` AND `messages` — neither passes `messages` |
| `callback` | Depends | Depends | Internal hook type, requirements vary |
| `function` | Depends | Depends | Internal hook type, requires `messages` |

**Practical guidance:**
- **TeammateIdle** — use `command` hooks only
- **TaskCompleted** — use `command` or `prompt` hooks

---

## Matcher Support

Neither hook has a `matcherMetadata` property in its hook definition. Compare with hooks that do:

```typescript
// Setup hook HAS matcherMetadata:
Setup: {
  summary: "...",
  description: "...",
  matcherMetadata: { fieldToMatch: "trigger" },
}

// TeammateIdle does NOT:
TeammateIdle: {
  summary: "When a teammate is about to go idle",
  description: "...",
  // no matcherMetadata
}

// TaskCompleted does NOT:
TaskCompleted: {
  summary: "When a task is being marked as completed",
  description: "...",
  // no matcherMetadata
}
```

**Impact on filtering**:

```typescript
let O = (H ? w.filter((W) => !W.matcher || ARY(H, W.matcher)) : w).flatMap(...)
```

Since the match query `H` is `undefined` for both hooks, the condition reduces to `!W.matcher`, which means:
- Hooks with **no matcher** → always run
- Hooks with **a matcher** → filtered out (since there's nothing to match against)

You can put a `matcher` in your config, but it will cause the hook to be **skipped** rather than matched. Effectively, **all registered hooks fire for every event** — there is no filtering by teammate name, task ID, team, or any other field.

---

## Execution Sequence

The full sequence when a teammate's turn ends:

```
1. Agent turn completes
2. Check: Kz() — is teammate mode active?
   ├── No  → normal stop processing
   └── Yes → continue to step 3
3. Get teammate name: m = B5()
4. Get team name: x = Q3()
5. Initialize blocking error array: U = []
6. Get all tasks: g = nM()
7. Filter to in_progress tasks owned by this teammate:
   p = zX(g).filter(c => c.status === "in_progress" && c.owner === m)
8. For EACH in_progress task:
   └── Fire TaskCompleted hook (OQ1)
       ├── If blockingError → format with $Q1(), add to U
       └── If aborted → return
9. Fire TeammateIdle hook (KLA)
   ├── If blockingError → format with okA(), add to U
   └── If aborted → return
10. Check: U.length > 0?
    ├── Yes → Feed errors into EZ() — teammate continues with:
    │         messages: [...originalMessages, ...hookMessages, ...blockingErrors]
    │         stopHookActive: true
    └── No  → Teammate goes idle
```

### Key Observations

1. TaskCompleted fires **first**, for each in_progress task individually
2. TeammateIdle fires **second**, once
3. Blocking errors from **both** hooks are collected together
4. If ANY hook from either event blocks, the teammate continues
5. The teammate receives ALL blocking errors as meta messages in their continuation
6. The team lead sees **nothing** — vetos are invisible to the orchestrator

---

## Settings Configuration

Hooks are configured in any Claude Code settings file under the `hooks` key.

### Configuration Locations

| File | Scope |
|------|-------|
| `~/.claude/settings.json` | User-level (all projects) |
| `.claude/settings.json` | Project-level (committed to repo) |
| `.claude/settings.local.json` | Local project-level (not committed) |
| Managed settings file | Enterprise/policy level |

### Schema

```json
{
  "hooks": {
    "TeammateIdle": [
      {
        "matcher": {},
        "hooks": [
          {
            "type": "command",
            "command": "string — shell command to execute",
            "timeout": 30,
            "statusMessage": "string — spinner message while running",
            "once": false,
            "async": false
          }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "matcher": {},
        "hooks": [
          {
            "type": "command",
            "command": "string — shell command to execute",
            "timeout": 60
          },
          {
            "type": "prompt",
            "prompt": "string — LLM prompt, $ARGUMENTS is replaced with hook input JSON",
            "model": "string — optional model override",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

### Hook Configuration Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string | — | `"command"`, `"prompt"`, `"agent"`, `"callback"`, `"function"` |
| `command` | string | — | Shell command to execute (command type) |
| `prompt` | string | — | LLM prompt text (prompt type) |
| `model` | string | — | Model override for prompt hooks |
| `timeout` | number | — | Timeout in seconds |
| `statusMessage` | string | — | Message shown in spinner during execution |
| `once` | boolean | `false` | Run once then auto-remove |
| `async` | boolean | `false` | Run in background (don't wait for result) |

### Matcher Configuration

While matchers can be specified in config, they are **non-functional** for these hooks (see [Matcher Support](#matcher-support)). Including a non-empty matcher will cause the hook to be **skipped**. Either omit the matcher or use an empty object `{}`.

---

## Settings Precedence & Policy Controls

Hooks are merged from multiple sources, highest priority first:

```typescript
[
  { scope: "managed", source: "policySettings" },
  { scope: "user",    source: "userSettings" },
  { scope: "project", source: "projectSettings" },
  { scope: "local",   source: "localSettings" },
  { scope: "flag",    source: "flagSettings" },
]
```

### Policy Controls

**`allowManagedHooksOnly`** (boolean, in `policySettings` only):

```typescript
function _Az() {
  return k7("policySettings")?.allowManagedHooksOnly === !0;
}
```

When `true`:
- Only hooks from `policySettings` (enterprise managed settings) run
- User, project, and local hooks are all blocked
- Set via `managed-settings.json` (enterprise MDM)

**`disableAllHooks`** (boolean, in `policySettings` only):
- When `true`, ALL hooks are disabled regardless of source

---

## Practical Examples

### Example 1: Verify Task with Tests Before Completion

```json
{
  "hooks": {
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'INPUT=$(cat); SUBJECT=$(echo $INPUT | jq -r .task_subject); npm test 2>&1 || (echo \"Tests failed for task: $SUBJECT\" >&2; exit 2)'",
            "timeout": 120,
            "statusMessage": "Running tests to verify task completion..."
          }
        ]
      }
    ]
  }
}
```

If tests fail, exit code 2 prevents the task from being marked complete. The agent receives the test failure output and can fix the issues.

### Example 2: Prompt-Based Task Review

```json
{
  "hooks": {
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Review whether the task described by $ARGUMENTS was actually completed correctly. Check that all acceptance criteria are met and the implementation is complete. If the task is NOT fully complete, output JSON: {\"decision\": \"block\", \"reason\": \"explanation of what's missing\"}",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

Uses an LLM to review the task. Can output `decision: "block"` with a reason to reject incomplete work.

### Example 3: Prevent Idle If Pending Tasks Exist

```json
{
  "hooks": {
    "TeammateIdle": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'INPUT=$(cat); NAME=$(echo $INPUT | jq -r .teammate_name); TRANSCRIPT=$(echo $INPUT | jq -r .transcript_path); echo \"Teammate $NAME attempting to go idle\" >&2; exit 2'",
            "timeout": 10,
            "statusMessage": "Checking if teammate can go idle..."
          }
        ]
      }
    ]
  }
}
```

Always blocks idle (exit 2). The teammate receives the stderr message and gets another turn. Useful for development/testing — in production you'd add logic to check whether there's actually remaining work.

### Example 4: Log Task Completions Without Blocking

```json
{
  "hooks": {
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'INPUT=$(cat); echo $INPUT >> /tmp/task-completions.jsonl; exit 0'",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

Logs every task completion to a file. Exit code 0 means the operation is never blocked.

### Example 5: Rich JSON Output with System Message

A hook script that returns structured JSON:

```python
#!/usr/bin/env python3
import json
import sys
import subprocess

hook_input = json.load(sys.stdin)
task_subject = hook_input.get("task_subject", "")

# Run tests
result = subprocess.run(["npm", "test"], capture_output=True, text=True)

if result.returncode != 0:
    # Block with rich output
    output = {
        "continue": False,
        "stopReason": f"Tests failed for '{task_subject}'. Fix the failing tests before marking complete.",
        "systemMessage": f"Task completion blocked: test failures detected for '{task_subject}'"
    }
    print(json.dumps(output))
    sys.exit(0)  # Exit 0 — blocking is done via JSON, not exit code
else:
    # Allow with suppress
    output = {
        "continue": True,
        "suppressOutput": True
    }
    print(json.dumps(output))
    sys.exit(0)
```

This demonstrates blocking via JSON output (`continue: false`) rather than exit code 2, which allows setting `stopReason` and `systemMessage` simultaneously.

---

