# batch_engine Reference

## Why batch Over Separate precision_* Calls

| Feature | precision_* arrays | batch_engine |
|---------|-------------------|--------------|
| Multi-phase (read+write+exec) | Separate calls | **One call** |
| Atomic rollback | No | **Yes** (checkpoint-based) |
| Dry run / preview | No | **Yes** (`dry_run: true`) |
| Built-in discovery | No | **Yes** (`discovery.queries`) |
| Retry failed ops | Manual | **Yes** (`batch_recover retry`) |
| Validation (typecheck/lint/test) | Manual | **Yes** (`config.validation`) |

**Rule of thumb:** 2+ phases = use `batch`. Single phase = precision built-in batching. Need atomic rollback on critical ops = use `batch`.

**GPA impact:** batch collapses Gather into 1 call (discovery + reads) and Apply into 1 call (writes + edits + exec). A GPA cycle is 2 calls instead of 3-4.

```
WITHOUT batch (3-4 calls):
  1. discover({queries: [...]})           
  2. precision_read({files: [...]})       
  3. precision_write({files: [...]})      
  4. precision_edit({edits: [...]})       

WITH batch (2 calls):
  1. batch({discovery: ..., operations: {read: [...]}})        ← Gather
  2. batch({operations: {write: [...], edit: [...], exec: [...]}})  ← Apply

Same result. Half the calls. Atomic rollback included free.
```

## Schema

```json
{
  "discovery": {"queries": [{"id": "q1", "type": "grep|glob", "pattern": "..."}], "inject_results": true},
  "operations": {
    "read":  [{"files": [{"path": "...", "extract": "content|outline|symbols"}]}],
    "write": [{"files": [{"path": "...", "content": "..."}]}],
    "exec":  [{"commands": [{"cmd": "...", "expect": {"exit_code": 0}}]}],
    "query": [{"...": "..."}],
    "state": [{"...": "..."}]
  },
  "config": {
    "transaction": {"mode": "atomic|partial|none"},
    "validation": {"after": ["typecheck", "lint", "test"]},
    "recovery": {"checkpoint": true, "rollback_on_fail": true}
  },
  "dry_run": false,
  "verbosity": "count_only|minimal|standard|verbose"
}
```

**Defaults (just pass `operations`):** atomic transaction, parallel execution, fail-fast, checkpoint, rollback-on-fail, cleanup-on-success.

**Phase order:** discovery -> read -> write -> exec -> query -> state. Within each phase, ops run in parallel.

**Don't use batch for:** read-only discovery or single-file edits — precision_* is simpler and equally efficient for single-phase work.

## Example: Gather Phase (discovery + reads in one call)

```json
{
  "discovery": {
    "queries": [
      {"id": "find_handlers", "type": "glob", "patterns": ["src/handlers/**/*.ts"]},
      {"id": "find_usage", "type": "grep", "pattern": "handleFoo", "glob": "src/**/*.ts"}
    ]
  },
  "operations": {
    "read": [{"files": [{"path": "src/handlers/index.ts", "extract": "content"}]}]
  },
  "verbosity": "standard"
}
```

## Lifecycle Tools

On failure: `batch_recover` with `rollback` (undo batch), `retry` (retry failed ops), `fix` (auto-fix), `restore` (from checkpoint), or `cleanup` (delete old checkpoints). Use `batch_status` to check progress. Use `batch_checkpoints` for restore points. Use `batch_state` for shared state get/set/query.

## Output

Returns `batch_id`, `status` (success/partial/failed/rolled_back/dry_run), operation counts, `duration_ms`, `tokens_used`.