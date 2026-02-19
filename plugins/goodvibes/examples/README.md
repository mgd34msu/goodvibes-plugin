# GoodVibes Examples

## Batch Examples (Deprecated)

The batch-engine and its YAML-based batch examples have been deprecated. Batch operations are now handled directly through precision-engine's built-in batching capabilities.

### Migration

Instead of YAML batch files, use precision-engine tools with built-in batching:

- **`precision_read`**: `files` array for reading multiple files
- **`precision_write`**: `files` array for writing multiple files
- **`precision_edit`**: `edits` array for editing multiple files
- **`precision_exec`**: `commands` array for running multiple commands
- **`precision_grep`**: `queries` array for searching multiple patterns
- **`discover`**: `queries` array for batched discovery

See the [precision-mastery skill](../skills/protocol/precision-mastery/SKILL.md) for batching patterns and examples.
