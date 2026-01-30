# All-Time MCP Tool Analysis (30 Days)

> **TL;DR**: Precision Engine tools cost **$0.0150/call** vs native tools at **$0.0321/call** — a 2.1x cost reduction. Total savings: **$67.35 (59.5%)** across 3,055 MCP calls.

---

## MCP Call Tools - Individual Stats

| Tool | Calls | Cost | Per-Call |
|------|-------|------|----------|
| precision_read | 1,096 | $13.48 | $0.0123 |
| precision_grep | 754 | $13.13 | $0.0174 |
| precision_edit | 518 | $6.79 | $0.0131 |
| precision_write | 120 | $2.52 | $0.0210 |
| precision_glob | 157 | $2.00 | $0.0127 |
| discover | 259 | $1.93 | $0.0074 |
| precision_exec | 99 | $0.67 | $0.0068 |
| batch | 52 | $0.72 | $0.0139 |
| **TOTAL** | **3,055** | **$41.24** | **$0.0135** |

---

## MCP Info Overhead

Every MCP tool call requires checking the schema first (`mcp-cli info`). This table shows the overhead cost.

| Tool | Info Calls | Cost | % of Calls Need Info |
|------|------------|------|---------------------|
| precision_read | 256 | $1.91 | 23.4% |
| precision_grep | 146 | $1.12 | 19.4% |
| precision_edit | 108 | $0.82 | 20.8% |
| precision_write | 43 | $0.73 | 35.8% |
| **TOTAL** | **553** | **$4.58** | **18.1%** |

**Note**: Not every call needs an info lookup. Agents often cache the schema mentally after the first lookup in a session, resulting in ~18% overhead rate rather than 100%.

---

## Adjusted Per-Call Rate

| Metric | Value |
|--------|-------|
| Raw per-call (calls only) | $0.0135 |
| **Adjusted per-call (with info)** | **$0.0150** |
| Info overhead ratio | 11.1% |

This is the true cost of using MCP tools when accounting for schema lookups.

---

## Native Tools - Individual Stats

| Tool | Calls | Cost | Per-Call |
|------|-------|------|----------|
| Bash | 27,334 | $736.81 | $0.0270 |
| Edit | 13,829 | $529.83 | $0.0383 |
| Read | 17,287 | $440.29 | $0.0255 |
| Write | 3,379 | $328.80 | $0.0973 |
| Grep | 4,246 | $120.13 | $0.0283 |
| Glob | 2,762 | $53.58 | $0.0194 |
| **TOTAL** | **68,837** | **$2,209.44** | **$0.0321** |

---

## Grouped Comparison

### GROUP 1: READ OPERATIONS

**precision_read vs Read**

| Metric | MCP | Native |
|--------|-----|--------|
| Tool | precision_read | Read |
| Calls | 1,096 | 17,287 |
| Total Cost | $15.39 (incl info) | $440.29 |
| Per-call | **$0.0140** | $0.0255 |
| If MCP were native | $27.91 | — |
| **Savings** | **$12.53** | — |

**Why MCP wins**: `precision_read` offers extraction modes (outline, symbols, lines) that return targeted data instead of full file content, reducing token usage.

---

### GROUP 2: SEARCH OPERATIONS

**precision_grep + discover vs Grep**

| Metric | MCP | Native |
|--------|-----|--------|
| Tools | precision_grep + discover | Grep |
| Calls | 1,013 (754 + 259) | 4,246 |
| Total Cost | $16.18 | $120.13 |
| Per-call | **$0.0160** | $0.0283 |
| Equivalent native calls | 1,661 | — |
| If MCP were native | $46.98 | — |
| **Savings** | **$30.80** | — |

**Why MCP wins**:
- `precision_grep` offers `files_only` and `count_only` modes that avoid returning full match content
- `discover` batches 3-5 queries into a single call, eliminating sequential API round-trips
- Combined effect: 1,013 MCP calls do the work of ~1,661 native grep calls

---

### GROUP 3: MODIFY OPERATIONS

**precision_edit + precision_write vs Edit + Write**

| Metric | MCP | Native |
|--------|-----|--------|
| Tools | precision_edit + precision_write | Edit + Write |
| Calls | 638 (518 + 120) | 17,208 (13,829 + 3,379) |
| Total Cost | $10.86 | $858.63 |
| Per-call | **$0.0170** | $0.0499 |
| If MCP were native | $31.83 | — |
| **Savings** | **$20.97** | — |

**Why MCP wins**:
- `precision_edit` supports atomic transactions with multiple edits per call
- `precision_write` supports batch file creation
- Native Write is especially expensive at $0.0973/call due to verbose confirmation output
- MCP modify ops are **2.9x cheaper** than native equivalents

---

### GROUP 4: GLOB OPERATIONS

**precision_glob vs Glob**

| Metric | MCP | Native |
|--------|-----|--------|
| Tool | precision_glob | Glob |
| Calls | 157 | 2,762 |
| Total Cost | $2.00 | $53.58 |
| Per-call | **$0.0127** | $0.0194 |
| If MCP were native | $3.05 | — |
| **Savings** | **$1.05** | — |

**Why MCP wins**: Built-in filters (size, date, content matching) and graduated output modes reduce unnecessary data transfer.

---

### GROUP 5: EXEC/BASH OPERATIONS

**precision_exec vs Bash**

| Metric | MCP | Native |
|--------|-----|--------|
| Tool | precision_exec | Bash |
| Calls | 99 | 27,334 |
| Total Cost | $0.67 | $736.81 |
| Per-call | **$0.0068** | $0.0270 |
| If MCP were native | $2.67 | — |
| **Savings** | **$1.99** | — |

**Why MCP wins**: `precision_exec` supports batch command execution and expectations checking, reducing output verbosity. However, most bash usage is still native due to interactive/streaming needs.

---

### GROUP 6: BATCH ENGINE

| Metric | Value |
|--------|-------|
| Tool | batch |
| Calls | 52 |
| Total Cost | $0.72 |
| Per-call | $0.0139 |

**No native equivalent** — The batch engine provides unique orchestration capabilities for multi-operation workflows with checkpoints and recovery.

---

## Grand Summary

| Metric | Value |
|--------|-------|
| Total MCP calls | 3,055 |
| Total MCP cost (with info overhead) | $45.82 |
| Estimated native equivalent | $113.17 |
| **TOTAL SAVINGS** | **$67.35** |
| **Savings percentage** | **59.5%** |

---

## Key Insights

### 1. Per-Call Efficiency
MCP tools average **$0.0150/call** vs native **$0.0321/call** — a **2.1x cost reduction**.

### 2. Biggest Winners by Savings

| Group | Savings | Key Factor |
|-------|---------|------------|
| Search (grep + discover) | $30.80 | Batching + files_only mode |
| Modify (edit + write) | $20.97 | Native Write is expensive |
| Read | $12.53 | Extraction modes |
| Exec/Bash | $1.99 | Batch execution |
| Glob | $1.05 | Built-in filters |

### 3. Info Overhead is Reasonable
- 18.1% of calls need `mcp-cli info` schema lookup
- Adds only 11.1% to total cost
- Agents cache schemas within sessions

### 4. Native Write is Expensive
Native Write costs **$0.0973/call** — the most expensive native tool by far. `precision_write` at $0.0210/call is **4.6x cheaper**.

### 5. Discover is the Efficiency Hero
At just **$0.0074/call**, `discover` is the cheapest MCP tool and provides the most value through query batching. Each discover call replaces ~3.5 native grep calls.

---

## Recommendations

### Use MCP Tools For:
- **Any search operation** → precision_grep or discover
- **Reading file structure** → precision_read with outline/symbols mode
- **Batch file operations** → precision_write, precision_edit
- **Multi-query discovery** → discover (batches queries)

### Native Tools Are Fine For:
- Single small file reads (full content needed)
- Interactive bash commands
- Simple one-off edits

### Cost Optimization Tips:
1. Always use `discover` for multi-pattern searches
2. Use `files_only` or `count_only` modes when you don't need content
3. Batch edits into single `precision_edit` calls with atomic transactions
4. Use `precision_read` with `outline` mode to understand file structure

---

*Analysis period: Last 30 days*
*Data source: Claude Code session journals (main + subagent files)*
*Generated: 2026-01-29*
