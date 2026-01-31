# GoodVibes Plugin v1.0.6

> **Release Date:** January 30, 2026
> **Type:** Feature Release
> **Status:** Stable

---

## Release Highlights

This release introduces the **Subagent Efficient Work (SEW) Loop** across all 9 agents, comprehensive cost analysis tooling, and enhanced output styles for better autonomous execution.

### What's New?

- **SEW Loop Protocol**: All agents now follow a standardized efficient workflow using `discover` for parallel searches and `batch` for concurrent operations
- **Mandatory Precision Tools**: Agents are required to use precision_engine tools over native tools for token efficiency
- **12 Cost Analysis Scripts**: Complete toolkit for measuring and comparing tool usage costs
- **Enhanced Output Styles**: Improved WRFC loop guidance and agent monitoring

---

## Release Overview

| Component | Count | Description |
|-----------|-------|-------------|
| **Agents** | 9 | All updated with SEW Loop and Mandatory Behavior sections |
| **Skills** | 173 | Reusable knowledge modules across all tech stacks |
| **MCP Tools** | 74 | Precision tools across 6 specialized engines |
| **Hooks** | 9 | Lifecycle event handlers for automation |
| **Output Styles** | 2 | vibecoding (interactive) and justvibes (autonomous) |
| **Analysis Scripts** | 12 | Cost and token analysis utilities |

---

## Major Changes

### 1. SEW Loop (Subagent Efficient Work Loop)

All 9 agents now include the SEW Loop protocol near the top of their files:

```markdown
## Subagent Efficient Work Loop [SEW Loop - SUBAGENTS ONLY]

1. **Plan your work: discover and batch**
   - Use discover to run multiple grep/glob/symbol queries in parallel
   - Use batch to execute multiple precision_engine operations in a single call

2. **Use precision_engine tools for all file operations**
   - precision_read, precision_write, precision_edit
   - precision_grep, precision_glob, precision_symbols
   - precision_exec, precision_fetch

3. **If a precision tool fails**
   - You may use ONE native tool call as fallback
   - Return to precision_engine immediately after
```

### 2. Mandatory Behavior Section

Each agent now enforces these requirements at the bottom of their files:

- **MUST** follow the SEW Loop (Subagent Efficient Work Loop)
- **MUST** use precision_engine tools over native tools (Read, Edit, Write, Grep, Glob)
- **MUST** use discover for multi-query searches before starting work
- **MUST** batch independent operations together when possible
- **MUST** return to precision_engine tools after any fallback to native tools

### 3. Cost Analysis Scripts

12 new scripts in `scripts/` for analyzing tool usage and costs:

| Script | Purpose |
|--------|---------|
| `tool-use-48h.mjs` | Analyze all tool use over 48 hours including subagents |
| `tool-cost-48h.mjs` | Detailed cost breakdown with per-call and overhead costs |
| `agent-cost-analysis.mjs` | Comprehensive agent cost analysis with configurable period |
| `subagent-check.mjs` | Verify subagent inclusion in analysis |
| `mcp-analysis.mjs` | MCP vs Native tool usage comparison |
| `mcp-scan.mjs` | Quick MCP tool scan utility |
| `final-batch-analysis.mjs` | Batch engine cost savings analysis |
| `find-batch-calls.mjs` | Find all batch-engine calls |
| `analyze-batches-v2.mjs` | Advanced batch operation analysis |
| `show-raw-batches.mjs` | Display raw batch command payloads |
| `greatest-batch-detail.mjs` | Highlight highest-savings batch operations |
| `entry-analysis.mjs` | Session entry type analysis |

### 4. Output Styles Updates

**justvibes.md** and **vibecoding.md** improvements:

- Enhanced WRFC loop continuity rules
- Non-blocking TaskOutput for agent completion tracking
- Session file fallback for missed notifications
- Improved agent monitoring guidance (maintain 6 concurrent agents)
- Updated log references to include memory files

### 5. Cost Analysis Parser

Enhanced `plugins/goodvibes/hooks/scripts/src/cost-analysis/parser.ts`:

- Aggregate streaming entries to capture all MCP tools
- Improved tool call extraction from session logs
- Better handling of batched operations

---

## Cost Savings Analysis

Based on 48-hour analysis of 15,157 tool calls (88.9% from subagents):

### MCP vs Native Cost Comparison (with $0.15/100 info overhead)

| Operation | Native Cost/100 | MCP Cost/100 | Savings |
|-----------|-----------------|--------------|----------|
| Write | $9.73 | $2.24 | **76.9%** (4.3x cheaper) |
| Exec | $6.49 | $1.99 | **69.3%** (3.3x cheaper) |
| Edit | $3.83 | $1.46 | **61.9%** (2.6x cheaper) |
| Read | $2.55 | $1.55 | **39.2%** (1.6x cheaper) |
| Glob | $1.94 | $1.46 | **24.7%** (1.3x cheaper) |

### Greatest Batch Achievement

- **6 file writes in a single batch call**
- Single batch cost: $0.0139
- Native equivalent: $0.5838 (6 × $0.0973)
- **Savings: $0.5699 (97.6%)**
- **Efficiency: 42x cheaper than native**

---

## Agents Updated

All 9 agents received +31 lines each:

1. `agent-factory.md` - Meta-agent for creating new agents
2. `architect.md` - System design and planning
3. `deployer.md` - DevOps and deployment
4. `engineer.md` - Full-stack implementation
5. `integrator.md` - Complex feature integration
6. `planner.md` - Task breakdown and planning
7. `reviewer.md` - Code quality assessment
8. `skill-factory.md` - Meta-agent for creating skills
9. `tester.md` - Test engineering

---

## Changelog

### Added
- SEW Loop protocol to all 9 agents
- Mandatory Behavior section to all 9 agents
- 12 cost analysis scripts in `scripts/` directory
- Streaming entry aggregation in cost-analysis parser

### Changed
- Output styles: Enhanced WRFC loop and agent monitoring
- Registry timestamps bumped across all plugins
- Removed temporary analysis/debug files (8.8k lines cleaned)

### Fixed
- Cost-analysis parser now captures all MCP tools via streaming aggregation

---

## Upgrade Notes

### From v1.0.3 to v1.0.6

No breaking changes. The SEW Loop and Mandatory Behavior sections are additive enhancements that improve agent efficiency automatically.

**Recommended actions:**

1. Pull the latest changes
2. Agents will automatically follow the new SEW Loop protocol
3. Use the cost analysis scripts to measure your own savings:

```bash
# Analyze last 48 hours of tool usage
node scripts/tool-use-48h.mjs

# Get detailed cost breakdown
node scripts/tool-cost-48h.mjs

# Analyze batch engine savings
node scripts/final-batch-analysis.mjs
```

---

## Previous Releases

- **v1.0.3** - Initial public release with 74 MCP tools, 173 skills, 9 agents

---

<p align="center">
  <b>Plug in, receive good vibes.</b>
  <br><br>
  <code>claude plugin marketplace add mgd34msu/goodvibes-plugin</code>
  <br>
  <code>claude plugin install goodvibes@goodvibes-market</code>
</p>

---
