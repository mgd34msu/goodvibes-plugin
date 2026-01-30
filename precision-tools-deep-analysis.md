# The Real Cost of AI Coding Tools: A 90,000-Call Analysis

**What 30 days and $2,919 in API spend taught me about where the money actually goes**

---

## The Dataset

Over the past 30 days, I tracked every API call from my Claude Code sessions—including all subagent activity from parallel autonomous workflows.

| Metric | Value |
|--------|-------|
| **Total API Calls** | 89,443 |
| **Total Spend** | $2,919.37 |
| **Sessions Analyzed** | Main + all subagents |
| **Time Period** | 30 days |

This isn't theoretical. These are real production sessions building real software.

---

## Part 1: Native Tool Economics

Claude Code ships with built-in tools. Here's what they actually cost:

### Cost Per 100 Calls (Native Tools)

| Tool | Total Calls | Total Cost | Cost/100 Calls | Rank |
|------|-------------|------------|----------------|------|
| Write | 3,379 | $328.80 | **$9.73** | Most expensive |
| Edit | 13,829 | $529.83 | $3.83 | |
| Grep | 4,246 | $120.13 | $2.83 | |
| Bash | 27,334 | $736.81 | $2.70 | |
| Read | 17,287 | $440.29 | $2.55 | |
| Glob | 2,762 | $53.58 | $1.94 | Cheapest |
| **Average** | **68,837** | **$2,209.44** | **$3.21** | |

### The Write Problem

**Write costs 5x more than Glob per call.** Why?

Every Write operation returns verbose confirmation:
- Full file path
- Success message
- Often echoes content back

For a 3,379-call sample, that verbosity added up to $328.80—more than the cost of 17,287 Read operations.

### Cost Distribution

```
Write  ████████████████████████████████████████ $9.73
Edit   ███████████████████ $3.83
Grep   ██████████████ $2.83
Bash   █████████████ $2.70
Read   ████████████ $2.55
Glob   █████████ $1.94
```

---

## Part 2: Precision Tool Economics

I built MCP tools with **graduated verbosity**—the ability to return exactly what's needed, nothing more.

### Cost Per 100 Calls (Precision Tools)

| Tool | Total Calls | Total Cost | Cost/100 Calls | vs Native |
|------|-------------|------------|----------------|-----------|
| precision_exec | 99 | $0.67 | **$0.68** | 75% cheaper than Bash |
| discover | 259 | $1.93 | **$0.74** | 74% cheaper than Grep |
| precision_read | 1,096 | $13.48 | $1.23 | 52% cheaper than Read |
| precision_glob | 157 | $2.00 | $1.27 | 35% cheaper than Glob |
| precision_edit | 518 | $6.79 | $1.31 | 66% cheaper than Edit |
| batch | 52 | $0.72 | $1.39 | No equivalent |
| precision_grep | 754 | $13.13 | $1.74 | 39% cheaper than Grep |
| precision_write | 120 | $2.52 | $2.10 | **78% cheaper than Write** |
| **Average** | **3,055** | **$41.24** | **$1.35** | **58% cheaper overall** |

### Cost Distribution (Precision)

```
precision_write ██████████ $2.10
precision_grep  ████████ $1.74
batch           ██████ $1.39
precision_edit  ██████ $1.31
precision_glob  ██████ $1.27
precision_read  █████ $1.23
discover        ███ $0.74
precision_exec  ███ $0.68
```

---

## Part 3: The Overhead Question

MCP tools require a schema lookup (`mcp-cli info`) before first use. Does this overhead kill the savings?

### Info Call Statistics

| Tool | Info Calls | Info Cost | Call:Info Ratio |
|------|------------|-----------|-----------------|
| precision_read | 256 | $1.91 | 4.3:1 |
| precision_grep | 146 | $1.12 | 5.2:1 |
| precision_edit | 108 | $0.82 | 4.8:1 |
| precision_write | 43 | $0.73 | 2.8:1 |
| **Total** | **553** | **$4.58** | **5.5:1** |

**Key finding**: On average, one info lookup serves 5.5 actual calls. Agents cache the schema mentally within a session.

### Adjusted Costs (Including Overhead)

| Metric | Raw | With Overhead | Overhead % |
|--------|-----|---------------|------------|
| Cost per 100 calls | $1.35 | **$1.50** | +11.1% |
| Total precision cost | $41.24 | **$45.82** | +11.1% |

**Even with 11% overhead, precision tools cost $1.50/100 calls vs native at $3.21/100 calls.**

That's still a **53% savings**.

---

## Part 4: Grouped Comparisons

Apples-to-apples comparisons by operation type:

### READ Operations

| Metric | precision_read | Native Read |
|--------|----------------|-------------|
| Calls analyzed | 1,096 | 17,287 |
| Cost per 100 | **$1.40*** | $2.55 |
| Savings | **45%** | — |

*Includes info overhead

**Why precision wins**: `outline` and `symbols` modes return structure without content. Agents get function signatures and line numbers—enough to plan work without reading every line.

---

### SEARCH Operations

| Metric | precision_grep + discover | Native Grep |
|--------|---------------------------|-------------|
| Calls analyzed | 1,013 (754 + 259) | 4,246 |
| Cost per 100 | **$1.60*** | $2.83 |
| Savings | **43%** | — |

*Includes info overhead

**Why precision wins**:
- `files_only` mode returns paths, not content
- `count_only` mode returns just numbers
- `discover` batches 3-5 queries per call

**The discover multiplier**: Each discover call replaces ~3.5 native grep calls. Adjusted for batching, precision search is actually **~60% cheaper**.

---

### MODIFY Operations

| Metric | precision_edit + precision_write | Native Edit + Write |
|--------|----------------------------------|---------------------|
| Calls analyzed | 638 (518 + 120) | 17,208 (13,829 + 3,379) |
| Cost per 100 | **$1.70*** | $4.99 |
| Savings | **66%** | — |

*Includes info overhead

**Why precision wins**: Native Write at $9.73/100 calls drags up the entire group. Precision_write at $2.10/100 calls is 78% cheaper—the single biggest per-tool savings.

---

### GLOB Operations

| Metric | precision_glob | Native Glob |
|--------|----------------|-------------|
| Calls analyzed | 157 | 2,762 |
| Cost per 100 | **$1.27** | $1.94 |
| Savings | **35%** | — |

**Why precision wins**: Built-in filters (size, date, content matching) reduce result sets before returning. Native Glob returns everything and lets the model filter.

---

### EXEC Operations

| Metric | precision_exec | Native Bash |
|--------|----------------|-------------|
| Calls analyzed | 99 | 27,334 |
| Cost per 100 | **$0.68** | $2.70 |
| Savings | **75%** | — |

**Why precision wins**: Batch command execution with expectations checking. Less verbose output formatting.

---

## Part 5: The Efficiency Leaderboard

Ranking all tools by cost per 100 calls:

### Combined Leaderboard (All Tools)

| Rank | Tool | Cost/100 | Type |
|------|------|----------|------|
| 1 | precision_exec | $0.68 | Precision |
| 2 | discover | $0.74 | Precision |
| 3 | precision_read | $1.23 | Precision |
| 4 | precision_glob | $1.27 | Precision |
| 5 | precision_edit | $1.31 | Precision |
| 6 | batch | $1.39 | Precision |
| 7 | precision_grep | $1.74 | Precision |
| 8 | Glob | $1.94 | Native |
| 9 | precision_write | $2.10 | Precision |
| 10 | Read | $2.55 | Native |
| 11 | Bash | $2.70 | Native |
| 12 | Grep | $2.83 | Native |
| 13 | Edit | $3.83 | Native |
| 14 | Write | $9.73 | Native |

**Every precision tool ranks above every native tool except Glob.**

Native Glob ($1.94) beats precision_write ($2.10)—but precision_write competes against Native Write ($9.73), where it wins by 78%.

---

## Part 6: Interesting Patterns

### Pattern 1: The Verbosity Tax

The most expensive tools are the most verbose:

| Tool | Cost/100 | Verbosity Level |
|------|----------|-----------------|
| Write | $9.73 | Returns full confirmation + often echoes content |
| Edit | $3.83 | Returns diff output |
| Grep | $2.83 | Returns full matching lines + context |
| Read | $2.55 | Returns full file content |
| Glob | $1.94 | Returns just paths |

**Glob is cheapest because it returns the least.**

---

### Pattern 2: The Batch Dividend

Tools that batch operations show the best economics:

| Tool | Batching Capability | Cost/100 |
|------|---------------------|----------|
| discover | 3-5 queries per call | $0.74 |
| batch | Multiple operations per call | $1.39 |
| precision_exec | Multiple commands per call | $0.68 |

The top 2 cheapest tools both batch.

---

### Pattern 3: The Write Penalty

Native Write is an outlier:

| Comparison | Cost/100 | Multiple |
|------------|----------|----------|
| Native Write | $9.73 | 1x (baseline) |
| precision_write | $2.10 | 4.6x cheaper |
| Native Read | $2.55 | 3.8x cheaper than Write |
| precision_exec | $0.68 | 14.3x cheaper than Write |

**A single Native Write costs as much as 14 precision_exec calls.**

---

### Pattern 4: The Info Tax is Reasonable

| Tool | Info:Call Ratio | Effective Overhead |
|------|-----------------|-------------------|
| precision_grep | 5.2:1 | 19% |
| precision_edit | 4.8:1 | 21% |
| precision_read | 4.3:1 | 23% |
| precision_write | 2.8:1 | 36% |
| **Average** | **5.5:1** | **18%** |

Higher-frequency tools have better ratios. Agents learn the schema and reuse it.

---

## Part 7: The Grand Totals

### All-Time Summary

| Category | Calls | Cost | Cost/100 |
|----------|-------|------|----------|
| Native Tools | 68,837 | $2,209.44 | $3.21 |
| Precision Tools | 3,055 | $41.24 | $1.35 |
| Precision + Info | 3,608 | $45.82 | $1.50* |

*Adjusted for overhead

### If All Precision Calls Were Native

| Metric | Value |
|--------|-------|
| Actual precision cost | $45.82 |
| Equivalent native cost | $113.17 |
| **Savings** | **$67.35** |
| **Savings rate** | **59.5%** |

### Projected Annual Impact

At current usage rates:

| Scenario | Monthly | Annual |
|----------|---------|--------|
| Current (mixed) | $2,919 | $35,028 |
| All native | ~$3,500 | ~$42,000 |
| All precision | ~$2,400 | ~$28,800 |
| **Max savings** | **~$1,100/mo** | **~$13,200/yr** |

---

## Part 8: Key Metrics Summary

### Per-Tool Economics

| Metric | Best | Worst | Spread |
|--------|------|-------|--------|
| Cheapest tool | precision_exec @ $0.68 | Write @ $9.73 | 14.3x |
| Cheapest native | Glob @ $1.94 | Write @ $9.73 | 5.0x |
| Cheapest precision | precision_exec @ $0.68 | precision_write @ $2.10 | 3.1x |

### Group Economics

| Group | Precision | Native | Savings |
|-------|-----------|--------|---------|
| Read ops | $1.40 | $2.55 | 45% |
| Search ops | $1.60 | $2.83 | 43% |
| Modify ops | $1.70 | $4.99 | 66% |
| Glob ops | $1.27 | $1.94 | 35% |
| Exec ops | $0.68 | $2.70 | 75% |

### Overhead Economics

| Metric | Value |
|--------|-------|
| Info calls per actual call | 5.5:1 |
| Overhead cost percentage | 11.1% |
| Break-even point | 1.2 calls per schema lookup |

---

## Conclusions

### 1. Native tool costs vary 5x
From Glob ($1.94) to Write ($9.73). Tool selection matters.

### 2. Precision tools consistently beat native
Every precision tool except precision_write beats every native tool. And precision_write still beats its counterpart by 78%.

### 3. Batching provides the biggest wins
discover and precision_exec—both batch-capable—are the two cheapest tools in the entire analysis.

### 4. The overhead tax is worth paying
11.1% overhead for 53-75% savings is a good trade.

### 5. Write operations are the low-hanging fruit
Native Write at $9.73/100 calls is the single biggest optimization target. Switching to precision_write saves 78% immediately.

---

## The Formula

For any AI coding workflow:

```
Effective Cost = Base Cost × Verbosity Multiplier × (1 / Batch Factor)
```

- **Reduce verbosity**: Use `files_only`, `count_only`, `outline` modes
- **Increase batching**: Use `discover` for multi-pattern searches
- **Avoid Write**: Native Write is 5x more expensive than average

---

*Analysis: 89,443 API calls over 30 days*
*Total spend analyzed: $2,919.37*
*Tools: Claude Code native + GoodVibes Precision Engine*
