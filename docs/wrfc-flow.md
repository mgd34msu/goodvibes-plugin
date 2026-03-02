# WRFC Directive Delivery — Full Process Flow

## Phase 1: Agent Spawn

```
Orchestrator calls Agent tool
    │
    ├─► PreToolUse hooks fire (orchestrator context)
    │       └─► pre-tool-use-directive-drain.mjs
    │               hookInput.is_subagent = false
    │               → drains any pending directives (orchestrator is allowed)
    │               → injects via additionalContext if found
    │
    ├─► Claude Code creates subagent subprocess
    │
    └─► SubagentStart hook fires (orchestrator context)
            │
            ├─► Reads hookInput from stdin
            │       session_id = orchestrator's session
            │       agent_id, agent_type from Claude Code
            │
            ├─► Resolves workflow binding
            │       Priority 1: Extract [WRFC:wid] from task description
            │       Priority 2: Query resolve_pending_bind from runtime
            │
            ├─► Sends hook_event to runtime engine via IPC:
            │       { type: "hook_event",
            │         hook_name: "agent:spawned",
            │         hook_input: { session_id, agent_id, agent_type, workflow_id, ... } }
            │
            └─► Runtime IPC Router processes hook_event:
                    │
                    ├─► sweepStaleHolds() — cleans any expired held directives
                    │
                    ├─► eventBus.emit(hook:agent:spawned)
                    │
                    ├─► await triggerRegistry.evaluate()
                    │       Trigger #10 (builtin_wrfc_start_workflow) fires
                    │       → wrfc_agent_spawned handler runs
                    │       → Creates workflow: wrfc_{agent_id}
                    │       → Binds agent to workflow via agentWorkflowMap
                    │       → Advances state: IDLE → GATHERING → PLANNING → WRITING
                    │
                    ├─► Writes orchestrator-session.id file
                    │       Extracts session_id from hook_input
                    │       Writes to .goodvibes/state/orchestrator-session.id
                    │       (Used by Layer 2 of subagent drain guard)
                    │
                    ├─► session:started handling (if applicable)
                    │       Writes session pointer file
                    │       Resets trigger fire counts
                    │
                    └─► Returns ACK: { status: "ok", data: { kind: "ack" } }
```

## Phase 2: Agent Works

```
Subagent runs autonomously
    │
    ├─► Every tool call triggers PreToolUse hooks (subagent context)
    │       └─► pre-tool-use-directive-drain.mjs
    │               hookInput.is_subagent = true     ◄── Layer 1 guard
    │               → return respond(allowResponse())
    │               → SKIPS drain entirely
    │               (Even if Layer 1 fails, Layer 2 checks:
    │                session_id ≠ orchestrator-session.id → skip)
    │
    └─► Agent completes its work (writes code, runs tests, etc.)
```

## Phase 3: Agent Completion

```
Subagent process exits
    │
    └─► SubagentStop hook fires (orchestrator context)
            │
            ├─► Sends hook_event to runtime engine via IPC:
            │       { type: "hook_event",
            │         hook_name: "agent:completed",
            │         hook_input: { agent_id, agent_type, ... } }
            │
            └─► Runtime IPC Router processes hook_event:
                    │
                    ├─► sweepStaleHolds() — cleans expired held directives
                    │
                    ├─► eventBus.emit(hook:agent:completed)
                    │
                    ├─► await triggerRegistry.evaluate()
                    │       Trigger #7 (builtin_wrfc_spawn_reviewer) fires
                    │       → wrfc_chain_next handler runs
                    │       → Looks up workflow via agentWorkflowMap
                    │       → Checks effective state (WRITING)
                    │       → ENQUEUES directive to target 'subagent_stop':
                    │           { type: "inject_system_message",
                    │             content: "<gv>{action:spawn, type:reviewer, ...}</gv>",
                    │             priority: 20,
                    │             workflow_id: "wrfc_{agent_id}" }
                    │       → Advances state: WRITING → REVIEWING
                    │
                    └─► Returns ACK (plain IPCResponse, NOT ResponseEnvelope)
                        → No directives piggybacked on the ACK
                        → Directive stays in queue for next drain
```

## Phase 4: Directive Delivery

```
Claude Code generates task-notification
    │
    ├─► User message submitted: "<task-notification>...</task-notification>"
    │
    └─► UserPromptSubmit hook fires (orchestrator context)
            │
            ├─► Detects <task-notification> in prompt
            │
            ├─► Discovers socket via 5-strategy fallback:
            │       1. GOODVIBES_RUNTIME_SOCKET env var
            │       2. Session-keyed pointer: runtime-{sessionId}.socket
            │       3. PID pointer files: runtime-{pid}.socket
            │       4. Legacy pointer: runtime.socket
            │       5. Well-known tmpdir
            │
            ├─► Sends get_directives query to runtime engine:
            │       { type: "query", query: { kind: "get_directives" } }
            │       (No agent_id = drain ALL pending directives)
            │
            └─► Runtime IPC Router processes query:
                    │
                    ├─► sweepStaleHolds() — re-enqueues any holds > 3s old
                    │
                    ├─► buildDirectivesResponse()
                    │       │
                    │       └─► drainDirectiveMessages()
                    │               │
                    │               └─► directiveQueue.holdDrain('subagent_stop')
                    │                       │
                    │                       ├─► Calls drain() internally
                    │                       │     Removes directives from main queue
                    │                       │
                    │                       ├─► Stores in held map:
                    │                       │     { holdId: crypto.randomUUID(),
                    │                       │       directives: [...],
                    │                       │       heldAt: Date.now() }
                    │                       │
                    │                       └─► Returns { holdId, directives }
                    │
                    └─► Returns ResponseEnvelope:
                            { response: { status: "ok",
                                          data: { directives: [...] } },
                              holdId: "uuid-..." }
```

## Phase 5: Socket Write Confirmation (Hold-and-Release)

```
IPC Server writes response to socket
    │
    ├─► Detects ResponseEnvelope (has holdId)
    │
    ├─► socket.end(payload, 'utf-8', callback)
    │       │
    │       ├─► Stores holdId in WeakMap: inFlightHolds.set(socket, holdId)
    │       │
    │       ├─► ON SUCCESS (callback fires):
    │       │       writeResultCallback(holdId, true)
    │       │       → directiveQueue.releaseHold(holdId)
    │       │       → Held batch deleted permanently ✓
    │       │
    │       └─► ON FAILURE (socket error):
    │               writeResultCallback(holdId, false)
    │               → directiveQueue.reEnqueueHold(holdId)
    │               → Directives back at FRONT of queue
    │               → Available for next drain attempt
    │
    └─► Safety nets:
            ├─► TTL sweep (3s): sweepStaleHolds() on every IPC request
            ├─► Watchdog sweep: secondary call in checkStaleWorkflows()
            └─► In-flight recovery: server close() checks WeakMap
```

## Phase 6: Orchestrator Receives Directive

```
UPS hook receives IPC response
    │
    ├─► Extracts directives from response.data.directives
    │
    ├─► Wraps in <gv> tag:
    │       <gv>{"action":"directives","directives":[...]}</gv>
    │
    ├─► Marks delivery in queue auditor ledger
    │
    └─► Returns to Claude Code:
            { hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext: "<gv>...</gv>" } }

Claude Code injects additionalContext into the model's prompt
    │
    └─► Orchestrator sees:
            Task-notification (agent completed)
            + <gv> directive (spawn reviewer / fix / complete)
            → Executes directive immediately
```

## Fallback: PreToolUse Drain (Belt-and-Suspenders)

```
If UPS misses the directive (timeout, queue empty at query time):
    │
    └─► Next orchestrator tool call triggers PreToolUse
            │
            ├─► is_subagent = false (orchestrator context) → allowed
            │
            ├─► Drains any pending directives from queue
            │
            ├─► Also checks urgent-directives.json (Watchdog Layer 2 fallback)
            │
            └─► Injects via additionalContext on the tool response
```

## Fallback: Watchdog Layer 2 (Deep Recovery)

```
If IPC drain fails entirely (~2.5 min timeout):
    │
    └─► Watchdog detects stale workflow in REVIEWING state
            │
            ├─► sweepStaleHolds() — re-enqueues any stuck holds
            │
            ├─► Writes urgent-directives.json to disk
            │
            └─► Next UPS or PreToolUse hook picks up the file
                    (atomic rename for exactly-once delivery)
```

## Retry Chain (UPS)

```
If first UPS query returns empty:
    │
    ├─► sleep(100ms) → retry
    ├─► sleep(250ms) → retry
    └─► sleep(500ms) → retry
        │
        └─► If still empty, check urgent-directives.json file
```

## Key Invariants

| Property | Guarantee |
|----------|----------|
| Directives never lost on socket failure | Hold-and-release with reEnqueueHold |
| Subagents can't steal directives | `is_subagent` guard + session file fallback |
| Cross-workflow isolation | `holdDrain(target, workflowId)` scoping |
| At-least-once delivery | TTL sweep + watchdog + urgent file fallback |
| Orchestrator always drains | `is_subagent=false`, session_id matches file |
