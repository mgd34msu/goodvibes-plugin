# Runtime Engine Feature Tests

Manual integration tests for the new runtime-engine features.
Created for cross-session testing coordination.

## Test Plan

### Session 1 (this session) tests:
1. Event emission + EventBus history (runtime_emit + runtime_events tail)
2. Trigger system (list builtins, test conditions, fire)
3. WorkflowPersistence (create workflow, check state dir)
4. Heartbeat set_interval (change interval, verify)
5. BuildTestDetector (emit hook:post_tool_use, check for build:* events)

### Session 2 tests:
1. Agent tracker state (runtime_state namespace agent_tracker)
2. External plugin status with port/address (runtime_external status)
3. Schedule management (create/pause/resume/cancel)
4. Workflow WRFC loop (create, advance, check state machine)
5. CI failure bridge (emit webhook:received with failure status, check build:failed)

### Daemon session tests:
1. Daemon status check
2. Memory baseline after restart
