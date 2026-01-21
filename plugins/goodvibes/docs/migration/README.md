# GoodVibes v2 Migration Documentation

This directory contains comprehensive migration guides for upgrading from GoodVibes v1 to v2.

## Overview

GoodVibes v2 is a complete architectural rewrite focused on:
- **Batch-first operations**: All work happens in batches for efficiency
- **Parallel execution**: Operations run in parallel by default
- **Token efficiency**: 85-95% token reduction through precision tools
- **Transaction safety**: Atomic operations with automatic rollback
- **Self-healing**: Automatic error recovery and fix loops
- **Unified agents**: Consolidated from 15+ to 6 multi-skilled agents

## Migration Guides

### 1. [Tool Migration Guide](./tool-migration.md)

**Read this first if you use tools directly.**

Documents how v1 system tools map to v2 batch operations and precision tools.

**Key Topics:**
- Tool mapping table (Read → precision_read, etc.)
- Batch operation patterns
- Output mode strategies for token efficiency
- Transaction modes (atomic, isolated, best_effort)
- Discovery → Batch workflow
- Performance comparisons

**Quick Reference:**

| v1 Tool | v2 Equivalent | Token Savings |
|---------|---------------|---------------|
| Read (10 files) | batch.read.files + outline | 90% |
| Grep + context | precision_grep + locations | 85% |
| Edit (20 files) | batch.write.edit + minimal | 95% |
| Multiple operations | Single batch | 80%+ |

### 2. [Agent Migration Guide](./agent-migration.md)

**Read this if you spawn agents or use agent workflows.**

Documents how v1 specialized agents map to v2 unified agents with enhanced capabilities.

**Key Topics:**
- Agent consolidation map (15+ agents → 6 unified agents)
- Behavior changes (batch-first, budget tracking, result persistence)
- Mode-aware behavior (vibecoding vs justvibes)
- Agent spawning in batches
- Inter-agent communication
- Skills integration

**Quick Reference:**

| v2 Agent | Replaces v1 Agents |
|----------|-------------------|
| engineer | backend-engineer, frontend-engineer, fullstack-engineer, api-engineer, database-engineer, component-engineer |
| reviewer | code-reviewer, pr-reviewer, security-reviewer, performance-reviewer |
| tester | unit-tester, integration-tester, e2e-tester, test-analyzer |
| architect | system-architect, api-designer, database-designer, state-architect |
| deployer | deployment-specialist, devops-engineer, ci-engineer, infra-engineer |
| integrator | api-integrator, state-manager, form-specialist, content-manager |

### 3. [Configuration Migration Guide](./config-migration.md)

**Read this to migrate your configuration files.**

Documents changes to configuration structure and new configuration options.

**Key Topics:**
- New configuration files (config.json, hooks.json, modes.json)
- Plugin manifest migration
- MCP configuration updates
- Project state directory structure
- Environment-specific configurations
- Schema validation

**Quick Reference:**

| v1 File | v2 File | Changes |
|---------|---------|---------|
| preferences.json + agent-config.json | config.json | Unified configuration |
| N/A | hooks.json | New: Lifecycle hook configuration |
| N/A | modes.json | New: Custom mode definitions |
| plugin.json | .claude-plugin/plugin.json | New location, enhanced schema |
| mcp.json | .mcp.json | Enhanced with 6 MCP servers |

## Migration Path

Follow this sequence for a smooth migration:

### Phase 1: Understand Changes (30 min)

1. Read [SPEC-v2.md Overview](../../SPEC-v2.md) for architecture understanding
2. Skim all three migration guides to understand scope
3. Review your current v1 usage patterns
4. Identify which features you use most

### Phase 2: Configuration (1 hour)

1. **Backup everything**
   ```bash
   cp -r .goodvibes .goodvibes.v1.backup
   cp -r plugins/goodvibes plugins/goodvibes.v1.backup
   ```

2. **Follow [Configuration Migration Guide](./config-migration.md)**
   - Create new `.goodvibes/config.json`
   - Update plugin manifest
   - Update `.mcp.json`
   - Create directory structure

3. **Verify configuration**
   ```bash
   mcp-cli servers  # Should show 6 MCP servers
   mcp-cli tools    # Should show ~73 tools
   ```

### Phase 3: Tool Usage (2 hours)

1. **Follow [Tool Migration Guide](./tool-migration.md)**
   - Replace individual tool calls with batch operations
   - Add output modes for token efficiency
   - Enable transaction safety
   - Add validation hooks

2. **Test basic operations**
   ```bash
   # Test precision tools
   mcp-cli call plugin_goodvibes_precision-engine/precision_read \
     '{"files": ["package.json"], "extract": "outline", "output": {"mode": "minimal"}}'

   # Test batch operations
   mcp-cli call plugin_goodvibes_batch-engine/batch \
     '{"operations": {"read": [{"type": "files", "targets": ["package.json"]}]}}'
   ```

### Phase 4: Agent Workflows (2 hours)

1. **Follow [Agent Migration Guide](./agent-migration.md)**
   - Map v1 agents to v2 unified agents
   - Update task descriptions
   - Add budget constraints
   - Use agent chaining for workflows

2. **Test agent spawning**
   ```bash
   # Test single agent
   mcp-cli call plugin_goodvibes_batch-engine/batch '{
     "operations": {
       "exec": [{
         "type": "agent",
         "agent": "engineer",
         "task": "Add a console.log to index.ts",
         "budget": {"turns": 3, "tokens": 10000}
       }]
     }
   }'
   ```

### Phase 5: Optimization (ongoing)

1. Monitor telemetry for token usage
2. Optimize output modes
3. Tune agent budgets
4. Refine validation hooks
5. Create custom modes for specific workflows

## Quick Wins

Start with these high-impact, low-effort changes:

### 1. Use `discover` Before Batch Operations

**Before:**
```markdown
1. Grep for pattern
2. Manually count results
3. Read files
4. Make changes
```

**After:**
```yaml
discover:
  queries:
    - id: scope
      type: grep
      pattern: "oldFunction"
  output_mode: count_only

# User sees: "Found 45 matches in 12 files"
# Then proceed with batch
```

**Benefit**: Know the scope before committing to work.

### 2. Use `output.mode: minimal` Everywhere

**Before:**
```yaml
# Default output, full verbosity
precision_read:
  files: ["file1.ts", "file2.ts"]
```

**After:**
```yaml
precision_read:
  files: ["file1.ts", "file2.ts"]
  output:
    mode: minimal
```

**Benefit**: 80% token reduction with same information.

### 3. Enable Atomic Transactions

**Before:**
```yaml
# No transaction safety
# Manual rollback if something fails
```

**After:**
```yaml
batch:
  operations: {...}
  config:
    transaction:
      mode: atomic
      rollback_on_fail: true
```

**Benefit**: Automatic rollback on failure, never leave partial changes.

### 4. Use Batch Instead of Sequential Operations

**Before:**
```markdown
1. Read file1.ts
2. Read file2.ts
3. Read file3.ts
```

**After:**
```yaml
batch:
  operations:
    read:
      - type: files
        targets: ["file1.ts", "file2.ts", "file3.ts"]
```

**Benefit**: 3x faster (parallel), 90% fewer tokens.

### 5. Add Validation Hooks

**Before:**
```markdown
1. Make changes
2. Manually run typecheck
3. Fix errors
4. Repeat
```

**After:**
```yaml
batch:
  operations: {...}
  config:
    validation:
      after: [typecheck, lint]
      on_fail: fix_loop  # Automatic fixes!
```

**Benefit**: Automatic validation and fixes.

## Common Pitfalls

### 1. Not Using Discovery First

**Problem**: Wasting tokens on unnecessary reads

**Solution**: Always `discover` with `count_only` first

```yaml
# Good
discover:
  queries:
    - id: scope
      type: grep
      pattern: "target"
  output_mode: count_only

# Then use results
batch:
  operations:
    read:
      - targets: "{{scope.files}}"
```

### 2. Using Full Output Modes

**Problem**: 10x token usage

**Solution**: Use progressive detail

```yaml
# Good - progressive
1. count_only (just numbers)
2. files_only (just paths)
3. minimal (results without verbose formatting)

# Bad - always full
output: { mode: standard }
```

### 3. Not Enabling Transaction Safety

**Problem**: Partial changes when errors occur

**Solution**: Use atomic mode for critical changes

```yaml
# Good
batch:
  config:
    transaction:
      mode: atomic
      rollback_on_fail: true
```

### 4. Manual Agent Orchestration

**Problem**: Spawning agents one-by-one

**Solution**: Use batch agent operations with dependencies

```yaml
# Good - automatic orchestration
batch:
  operations:
    exec:
      - agent: architect
        chain_on_complete: [engineer, tester, reviewer]
```

### 5. Ignoring Budget Limits

**Problem**: Agents running indefinitely

**Solution**: Set realistic budgets

```yaml
# Good - appropriate budgets
budget:
  turns: 10        # ~5-10 for features
  tokens: 50000    # ~$0.15 on Sonnet
  timeout_ms: 300000  # 5 minutes
```

## Performance Comparison

### Token Usage

| Operation | v1 Tokens | v2 Tokens | Savings |
|-----------|-----------|-----------|---------|
| Read 10 files (full) | 50,000 | 5,000 (outline) | 90% |
| Search 1000 files | 30,000 | 500 (files_only) | 98% |
| Edit 20 files | 40,000 | 2,000 (minimal) | 95% |
| Feature implementation | 150,000 | 45,000 | 70% |

### Execution Time

| Operation | v1 Time | v2 Time | Improvement |
|-----------|---------|---------|-------------|
| Read 10 files | 10s | 2s | 5x faster |
| Multi-file edit | 20s | 4s | 5x faster |
| Feature implementation | 20 min | 6 min | 3.3x faster |

### Reliability

| Metric | v1 | v2 |
|--------|----|----|
| First-time success | 65% | 85% |
| Requires manual fixes | 35% | 10% |
| Rollback capability | No | Yes |
| Auto-recovery success | N/A | 80% |

## Verification

After migration, verify everything works:

```bash
# 1. Check plugin status
mcp-cli call plugin_goodvibes_project-engine/plugin_status '{}'

# 2. List available tools
mcp-cli tools | grep goodvibes

# 3. Test precision tools
mcp-cli call plugin_goodvibes_precision-engine/precision_read \
  '{"files": ["package.json"], "extract": "outline", "output": {"mode": "minimal"}}'

# 4. Test batch operations
mcp-cli call plugin_goodvibes_batch-engine/batch \
  '{"operations": {"read": [{"type": "files", "targets": ["package.json"]}]}}'

# 5. Test state management
mcp-cli call plugin_goodvibes_batch-engine/batch_state \
  '{"operation": "get", "keys": ["session"]}'

# 6. Test agent spawning
mcp-cli call plugin_goodvibes_batch-engine/batch '{
  "operations": {
    "exec": [{
      "type": "agent",
      "agent": "engineer",
      "task": "Add a comment to package.json",
      "budget": {"turns": 3, "tokens": 10000}
    }]
  }
}'
```

## Support Resources

### Documentation
- [SPEC-v2.md](../../SPEC-v2.md) - Complete v2 specification
- [Tool Migration](./tool-migration.md) - Tool mapping reference
- [Agent Migration](./agent-migration.md) - Agent consolidation guide
- [Config Migration](./config-migration.md) - Configuration changes

### Examples
- [Example Batches](../../examples/batches/) - Working batch examples
- [Agent Workflows](../../examples/workflows/) - Multi-agent patterns
- [Templates](../../templates/) - Project templates

### Troubleshooting
- Check `.goodvibes/logs/activity.md` for detailed logs
- Review `.goodvibes/telemetry/current.json` for metrics
- Use `batch_status` tool to monitor running batches
- Use `batch_recover` tool to rollback or retry

## Migration Checklist

Use this checklist to track your migration progress:

### Configuration
- [ ] Backup v1 files
- [ ] Create `.goodvibes/config.json`
- [ ] Update plugin manifest
- [ ] Update `.mcp.json`
- [ ] Create directory structure
- [ ] Validate configuration

### Tools
- [ ] Identify tool usage patterns
- [ ] Replace with batch operations
- [ ] Add output modes
- [ ] Enable transaction safety
- [ ] Add validation hooks
- [ ] Test basic operations

### Agents
- [ ] Map v1 to v2 agents
- [ ] Update task descriptions
- [ ] Add budget constraints
- [ ] Set up agent chaining
- [ ] Test agent spawning
- [ ] Verify result persistence

### Optimization
- [ ] Monitor token usage
- [ ] Tune output modes
- [ ] Optimize agent budgets
- [ ] Refine validation hooks
- [ ] Create custom modes

### Verification
- [ ] All tools available
- [ ] Batch operations work
- [ ] Agents spawn correctly
- [ ] State persists properly
- [ ] Telemetry collecting
- [ ] Memory recording

## Next Steps

1. **Read the appropriate guide** based on your usage
2. **Start with configuration** to get infrastructure ready
3. **Migrate incrementally** - don't do everything at once
4. **Test thoroughly** after each phase
5. **Optimize based on telemetry** once running

## Questions?

- **SPEC-v2**: See [SPEC-v2.md](../../SPEC-v2.md) for complete specification
- **Examples**: See [examples/](../../examples/) for working code
- **Issues**: Check [troubleshooting sections](#troubleshooting) in each guide

---

**Migration Support:**
- Estimated time: 4-6 hours for typical project
- Recommended approach: Incremental (configuration → tools → agents)
- Difficulty: Medium (clear documentation, many examples)

---

*Last updated: 2026-01-21*
*SPEC version: v2.0.0*
