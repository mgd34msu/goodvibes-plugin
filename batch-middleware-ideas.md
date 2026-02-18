# Batch Engine Middleware Architecture Ideas

## Date: 2026-02-18

## Problem

Current batch_engine reimplements file operations independently (fs.readFile, child_process.exec, etc.) instead of delegating to precision_engine. Discovery phase is defined in interfaces but not implemented. Results from large batch calls get truncated.

## Proposed Architecture: MCP Middleware

Batch_engine becomes an orchestration layer between the agent and precision_engine:

```
Agent  ->  [1 batch call]  ->  Interception Layer (batch_engine)
                                    |
                              [N precision calls]
                                    |
                              Execution Layer (precision_engine)
                                    |
                              [N individual responses]
                                    |
                              Interception Layer collates
                                    |
Agent  <-  [1 summary response]  <-  Interception Layer
```

Both engines run in the same Node.js process (goodvibes plugins), so batch_engine can import and call precision_engine handlers directly as function calls — no MCP protocol overhead.

## Key Design Decision: How Results Get Back to the Agent

### Option A: Write Results to Files, Return Paths
- Batch writes each sub-result to `.goodvibes/batch-results/chunk-N.json`
- Returns `{status: "complete", results: ["chunk-1.json", ...], summary: {...}}`
- Agent reads what it needs
- Trade-off: saves write-side batching, adds read-side pagination calls

### Option B: MCP Progress Notifications
- Emit each sub-result as MCP progress notification during execution
- Agent receives intermediate results while call is in-flight
- Final response is just "done"
- Unknown: whether progress notifications enter agent's reasoning context or are just UI chrome

### Option C: Smart Collation with Budget (Recommended)
- Batch executes all sub-calls internally
- Builds return by priority: small results inline, large results filed
- Response always within token limits because interception layer controls inline vs filed
- Example response:
```json
{
  "status": "complete",
  "inline_results": {
    "grep_query_1": { "files": ["a.ts", "b.ts"] },
    "glob_query": { "paths": ["src/handlers/"] },
    "small_read": { "content": "..." }
  },
  "filed_results": [
    { "op": "read src/big-module.ts", "path": ".goodvibes/batch-results/r1.txt", "est_tokens": 3200 }
  ],
  "total_ops": 8,
  "inline_ops": 5,
  "filed_ops": 3
}
```

## Supporting Ideas

### 1. Token Estimates in Project Index
- Add rough token estimate per file at index time (size_bytes / 4)
- Cheap to compute during existing filesystem walk
- Enables batch_engine to estimate return sizes BEFORE execution
- Feeds into smart collation decisions

### 2. Token-Budgeted Priority Execution
- Agent specifies `token_budget` on batch call
- Batch estimates return size per operation using index
- Sorts by priority: count_only/files_only/globs first (cheap, high discovery value), then targeted reads, then full content last
- Executes in order until budget approaches limit
- Remaining operations deferred with estimates

### 3. Auto-Sorting Priority Order
1. count_only / files_only operations (nearly free)
2. Glob/discovery operations (path lists)
3. Grep with locations/matches (medium)
4. Targeted reads with extract modes (outline, symbols, lines)
5. Full content reads (expensive)

## Architectural Wins

1. **Single implementation**: precision_engine owns all file operations, batch_engine is pure orchestration
2. **Feature parity**: batch gets all precision_engine features (fuzzy matching, disambiguation, extract modes, etc.) for free
3. **No truncation**: smart collation ensures responses always fit within limits
4. **Discovery works**: batch can call discover internally as part of Gather phase
5. **GPA documentation becomes accurate**: batch truly does Gather (discovery + reads) and Apply (writes + edits + exec) in one call each

## Open Questions

- Should batch_engine call precision_engine handlers as direct function imports, or go through a thin internal API?
- How to handle precision_engine's caching when called through batch_engine?
- Should filed_results auto-clean up, or require explicit cleanup?
- Does Option B (progress notifications) actually work for delivering intermediate results to Claude's context?
- Should this replace the current batch_engine entirely, or be a v2 alongside it?