# Runtime Engine Daemon-Mode Feature Retest

**Date**: 2026-03-05
**Daemon Status**: Running (PID 3111231, uptime ~600s, healthy)
**Mode**: Daemon (IPC via unix socket)

---

## Test 1: runtime_events tail

**Action**: `runtime_events` with `action: tail`, `limit: 5`

**Result**: FAIL

**Error**:
```
Cannot read properties of null (reading 'getHistory')
```

**Analysis**: EventBus is null in daemon mode. The `tail` action calls `eventBus.getHistory()` but the EventBus reference is not available to the MCP handler when running in daemon mode. The daemon process is healthy and responsive via IPC, but the EventBus plugin instance is not being forwarded or proxied correctly.

---

## Test 2: runtime_schedule heartbeat (status)

**Action**: `runtime_schedule` with `action: heartbeat`

**Result**: FAIL

**Error**:
```
TimePlugin is not available (engine may not be running in local mode)
```

**Analysis**: The TimePlugin (which manages heartbeat/schedules) is not accessible in daemon mode. The MCP handler cannot reach the TimePlugin instance running inside the daemon process.

---

## Test 3: runtime_schedule heartbeat set_interval

**Action**: `runtime_schedule` with `action: heartbeat`, `sub_action: set_interval`, `interval_ms: 5000`

**Result**: FAIL

**Error**:
```
TimePlugin is not available (engine may not be running in local mode)
```

**Analysis**: Same root cause as Test 2 — TimePlugin unavailable in daemon mode.

---

## Test 4: runtime_external status

**Action**: `runtime_external` with `action: status`

**Result**: FAIL

**Error**:
```
ExternalPlugin is not available (engine may not be running in local mode)
```

**Analysis**: The ExternalPlugin (webhook HTTP listener) is not accessible in daemon mode. Cannot verify port/address fields because the plugin reference is null.

---

## Test 5: runtime_emit webhook + runtime_events tail verification

### Step 5a: runtime_emit

**Action**: `runtime_emit` with `event_type: webhook:ci:github`, payload `{status: failure, provider: github-actions, branch: main, commit: abc123}`

**Result**: PASS

**Response**:
```json
{
  "emitted": {
    "id": "evt_613aeb6a-8931-4e4e-ab1b-8a7936d348ad",
    "type": "webhook:ci:github",
    "source": { "kind": "mcp_tool", "tool_name": "runtime_emit" },
    "payload": {
      "type": "webhook:ci:github",
      "data": { "status": "failure", "provider": "github-actions", "branch": "main", "commit": "abc123" }
    }
  }
}
```

**Analysis**: Event emission works — the IPC route for emit correctly forwards to the daemon and returns the emitted event with a valid ID and timestamp.

### Step 5b: runtime_events tail (verify build:failed)

**Action**: `runtime_events` with `action: tail`, filter for `build:failed`

**Result**: FAIL

**Error**:
```
Cannot read properties of null (reading 'getHistory')
```

**Analysis**: Cannot verify whether the webhook normalizer transformed `webhook:ci:github` into `build:failed` because EventBus history is inaccessible (same null reference as Test 1).

---

## Summary

| # | Test | Result |
|---|------|--------|
| 1 | runtime_events tail | **FAIL** — EventBus null |
| 2 | runtime_schedule heartbeat status | **FAIL** — TimePlugin unavailable |
| 3 | runtime_schedule heartbeat set_interval | **FAIL** — TimePlugin unavailable |
| 4 | runtime_external status | **FAIL** — ExternalPlugin unavailable |
| 5a | runtime_emit webhook:ci:github | **PASS** |
| 5b | runtime_events tail (build:failed check) | **FAIL** — EventBus null |

**Overall: 1 PASS / 5 FAIL**

## Root Cause

The daemon process is running and healthy (confirmed via `runtime_status` and `runtime_daemon status`). However, the MCP tool handlers for `runtime_events`, `runtime_schedule`, and `runtime_external` attempt to access plugin instances (EventBus, TimePlugin, ExternalPlugin) directly rather than routing through IPC to the daemon. Only `runtime_emit` and `runtime_status` correctly use IPC, which is why they succeed.

The daemon-mode plugin proxy/forwarding layer is missing or incomplete for these three subsystems. The error messages ("not available", "may not be running in local mode") confirm the handlers detect they lack a local reference but don't fall back to IPC.
