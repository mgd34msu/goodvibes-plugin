# I Saved 60% on AI Coding Costs by Building Smarter Tools

**How custom MCP tools transformed a $161 session into $106—while 6 parallel AI agents shipped production code**

---

## The Experiment

I spent 24 hours letting AI agents work autonomously on my production codebase. Not just one agent—up to **6 running in parallel**, each following a strict Work-Review-Fix-Check loop that required an 8+/10 score before any code was committed.

The results surprised me. Not because of what the agents built, but because of what I learned about **where the money actually goes**.

---

## What Got Built in 24 Hours

| Metric | Result |
|--------|--------|
| TypeScript errors fixed | 213 → 0 |
| Tests passing | 974 |
| Database query reduction | 98% (N+1 fixes) |
| Review loops completed | 20+ |
| Average review score | 8.6/10 |
| Verified commits | 8 |

Four major phases of work:
1. **Type System Cleanup** — Eliminated all 213 TypeScript compilation errors
2. **Performance Optimization** — Added memoization, code splitting, fixed N+1 queries
3. **Test Infrastructure** — Fixed 36 failing test files, established mock patterns
4. **Container Environment** — Docker configuration and service validation

All of this ran autonomously. I didn't write a single line of code.

---

## The Cost Breakdown

Here's where it gets interesting.

### Session Totals (24 Hours)

| Metric | Value |
|--------|-------|
| **Total Cost** | $106.19 |
| **API Calls** | 7,094 |
| **Tokens Processed** | 355M+ (mostly cache) |
| **Agent Sessions** | 6 parallel max |

### By Model

| Model | Calls | Cost | % of Total |
|-------|-------|------|------------|
| Opus 4.5 | 2,203 | $74.40 | 70.1% |
| Sonnet 4.5 | 4,635 | $30.89 | 29.1% |
| Haiku 4.5 | 256 | $0.90 | 0.8% |

The orchestrator ran on Opus (expensive but necessary for coordination). Worker agents ran on Sonnet (the workhorse). Haiku handled quick validation tasks.

---

## The Hidden Cost: Tool Verbosity

Here's what I discovered by analyzing 30 days of session data across **89,443 API calls** and **$2,919 in total spend**:

**Native Claude Code tools are expensive.**

Not because they're slow—because they're *verbose*. Every grep returns full match content. Every file read returns the entire file. Every edit confirmation includes the full diff.

When you're running 6 agents through 20+ review cycles, that verbosity adds up fast.

### Native Tool Costs (All-Time Data)

| Tool | Calls | Total Cost | Cost per 100 Calls |
|------|-------|------------|-------------------|
| Bash | 27,334 | $736.81 | $2.70 |
| Edit | 13,829 | $529.83 | $3.83 |
| Read | 17,287 | $440.29 | $2.55 |
| Write | 3,379 | $328.80 | **$9.73** |
| Grep | 4,246 | $120.13 | $2.83 |
| Glob | 2,762 | $53.58 | $1.94 |
| **Total** | **68,837** | **$2,209.44** | **$3.21** |

Notice anything? **Write costs $9.73 per 100 calls**—3x more than any other tool. The verbose confirmation output ("File written successfully, here's the content...") burns tokens on every operation.

---

## The Solution: Precision Tools

I built a set of MCP (Model Context Protocol) tools that provide **graduated verbosity**. Instead of returning everything, they return exactly what the agent needs.

### Precision Tool Costs (All-Time Data)

| Tool | Calls | Total Cost | Cost per 100 Calls |
|------|-------|------------|-------------------|
| precision_read | 1,096 | $13.48 | $1.23 |
| precision_grep | 754 | $13.13 | $1.74 |
| precision_edit | 518 | $6.79 | $1.31 |
| precision_write | 120 | $2.52 | $2.10 |
| precision_glob | 157 | $2.00 | $1.27 |
| discover | 259 | $1.93 | **$0.74** |
| precision_exec | 99 | $0.67 | $0.68 |
| batch | 52 | $0.72 | $1.39 |
| **Total** | **3,055** | **$41.24** | **$1.35** |

**Cost per 100 calls dropped from $3.21 to $1.35**—a 58% reduction.

---

## The Overhead Question

"But wait," you might say, "MCP tools require a schema lookup first. Doesn't that add overhead?"

Yes. Here's the data:

### MCP Info (Schema Lookup) Overhead

| Tool | Info Calls | Overhead Cost | % of Calls Need Info |
|------|------------|---------------|---------------------|
| precision_read | 256 | $1.91 | 23.4% |
| precision_grep | 146 | $1.12 | 19.4% |
| precision_edit | 108 | $0.82 | 20.8% |
| precision_write | 43 | $0.73 | 35.8% |
| **Total** | **553** | **$4.58** | **18.1%** |

Total info overhead: **$4.58** across 553 lookups.

### Adjusted Cost (Including Overhead)

| Metric | Value |
|--------|-------|
| Raw cost per 100 calls | $1.35 |
| **Adjusted cost per 100 calls** | **$1.50** |
| Overhead ratio | 11.1% |

Even with the schema lookup overhead, precision tools cost **$1.50 per 100 calls** vs native tools at **$3.21 per 100 calls**.

**That's still a 53% savings.**

---

## Grouped Analysis: Apples to Apples

Let's compare like-for-like operations:

### READ Operations

| Metric | Precision | Native | Winner |
|--------|-----------|--------|--------|
| Tool | precision_read | Read | |
| Cost/100 calls | $1.40 | $2.55 | **Precision (45% cheaper)** |
| Secret weapon | `outline` mode returns structure only | Returns full content | |

### SEARCH Operations

| Metric | Precision | Native | Winner |
|--------|-----------|--------|--------|
| Tools | precision_grep + discover | Grep | |
| Cost/100 calls | $1.60 | $2.83 | **Precision (43% cheaper)** |
| Secret weapon | `files_only` mode + query batching | Returns full matches | |

### MODIFY Operations

| Metric | Precision | Native | Winner |
|--------|-----------|--------|--------|
| Tools | precision_edit + precision_write | Edit + Write | |
| Cost/100 calls | $1.70 | $4.99 | **Precision (66% cheaper)** |
| Secret weapon | Atomic transactions, minimal output | Verbose confirmations | |

### GLOB Operations

| Metric | Precision | Native | Winner |
|--------|-----------|--------|--------|
| Tool | precision_glob | Glob | |
| Cost/100 calls | $1.27 | $1.94 | **Precision (35% cheaper)** |
| Secret weapon | Built-in filters | No filtering | |

### EXEC Operations

| Metric | Precision | Native | Winner |
|--------|-----------|--------|--------|
| Tool | precision_exec | Bash | |
| Cost/100 calls | $0.68 | $2.70 | **Precision (75% cheaper)** |
| Secret weapon | Batch execution | Single commands | |

---

## The Math: 24-Hour Session

For my 24-hour session with 929 MCP tool calls:

| Scenario | Cost |
|----------|------|
| **Actual (Precision Tools)** | $8.39 |
| **Hypothetical (Native Tools)** | $62.13 |
| **Savings** | **$53.74 (86%)** |

The entire session cost $106. Without precision tools, it would have been ~$160.

---

## The Star Player: `discover`

At **$0.74 per 100 calls**, the `discover` tool is the efficiency champion.

Why? It batches multiple search queries into a single API call:

```json
{
  "queries": [
    { "id": "enums", "type": "grep", "pattern": "enum\\s+\\w+" },
    { "id": "types", "type": "grep", "pattern": "type\\s+\\w+\\s*=" },
    { "id": "interfaces", "type": "grep", "pattern": "interface\\s+\\w+" }
  ],
  "verbosity": "files_only"
}
```

One call. Three searches. File paths only.

The equivalent native approach would require 3 separate grep calls, each returning full match content. That's 3x the API calls and 10x+ the tokens.

**Discover provides 52.5x efficiency** compared to native grep for multi-pattern searches.

---

## Real-World Impact

### Phase 11: Type System Cleanup (213 errors → 0)

The agents needed to find all files with enum/Record mismatches. Using `discover`:
- **100 discovery operations** became **29 batched calls**
- Each returned **file paths only**, not content
- Agents knew exactly where to look without parsing thousands of lines

### Phase 13: Test Infrastructure (36 failing → 0)

Finding all test files with mock issues:
- `precision_grep` with `files_only` returned **47 paths**
- Native grep would have returned **~2,000 lines of test code**
- Agents planned their work from a clean list, not a wall of text

---

## The Efficiency Formula

After analyzing 89,443 API calls, here's the pattern:

### High-Value Precision Tool Usage

| Scenario | Use This | Efficiency Gain |
|----------|----------|-----------------|
| "Find files matching X" | `precision_grep` + `files_only` | 10x |
| "Find multiple patterns" | `discover` | 52.5x |
| "Understand file structure" | `precision_read` + `outline` | 3x |
| "Batch file changes" | `precision_edit` + atomic | 1.5x |
| "Create multiple files" | `precision_write` + batch | 4.6x |

### When Native Tools Are Fine

- Single file read (full content needed)
- Interactive bash commands
- One-off simple edits

---

## Key Takeaways

### 1. Tool verbosity is a hidden cost multiplier

Native Write costs **$9.73 per 100 calls**. That's 7x more than precision_write ($1.35). Over thousands of calls, this adds up to hundreds of dollars.

### 2. Batching is the biggest win

`discover` at $0.74/100 calls vs native grep at $2.83/100 calls. Batching multiple queries into single calls provides the highest ROI.

### 3. Overhead is worth it

The 11% overhead from schema lookups is more than offset by the 53-86% savings on actual operations.

### 4. Multi-agent workflows amplify everything

Running 6 parallel agents through 20+ review cycles means every per-call cost gets multiplied. A $0.02 difference per call becomes $40+ over a session.

### 5. Graduated verbosity matches agent behavior

Agents don't need full file contents to decide what to do. They need:
- File paths (to know where)
- Signatures (to know what)
- Line numbers (to know where exactly)

Precision tools provide exactly this.

---

## The Bottom Line

| Metric | All-Time (30 Days) |
|--------|-------------------|
| Total MCP calls | 3,055 |
| Total MCP cost (with overhead) | $45.82 |
| Equivalent native cost | $113.17 |
| **Total savings** | **$67.35** |
| **Savings rate** | **59.5%** |

For a 24-hour intensive session:
- **Actual cost**: $106
- **Without precision tools**: ~$160
- **Savings**: ~$55 (34%)

The tools paid for themselves on day one.

---

## What's Next

I'm open-sourcing the precision engine as part of the GoodVibes plugin for Claude Code. If you're running autonomous agents and burning through API credits, graduated verbosity might be your biggest optimization opportunity.

The code doesn't care how much data you send it. But your wallet does.

---

*Data from 30 days of Claude Code usage across 89,443 API calls*
*24-hour session: January 29-30, 2026*
*Models: Claude Opus 4.5, Sonnet 4.5, Haiku 4.5*

---

**TL;DR**: Custom tools that return less data saved 60% on AI coding costs. The biggest win was batching search queries (52x efficiency). Native tool verbosity is a hidden cost multiplier. If you're running multi-agent workflows, precision tools are worth building.
