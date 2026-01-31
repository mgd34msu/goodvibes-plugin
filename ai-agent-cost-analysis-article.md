# The Real Cost of AI Coding Tools: 105,000 Calls Later

**What 30 days of autonomous AI agents revealed about where the money actually goes**

---

## The Dataset

This analysis draws from **105,218 API calls** across **$3,012.05 in spend** over 30 days of Claude Code usage. This is production data from real coding sessions with up to 6 parallel AI agents running autonomously.

| Metric | Value |
|--------|-------|
| Total API Calls | 105,218 |
| Total Cost | $3,012.05 |
| Native Tool Calls | 79,424 |
| Precision Tool Calls | 8,641 |
| Projects Analyzed | 10+ |
| Models Used | Opus 4.5, Sonnet 4.5, Haiku 4.5 |

---

## The Core Finding

**Precision tools cost 62% less per call than native tools, even after accounting for schema lookup overhead.**

| Tool Type | Calls | Total Cost | Overhead | Adjusted Cost | Per Call |
|-----------|-------|------------|----------|---------------|----------|
| Native | 79,424 | $2,344.44 | $0.00 | $2,344.44 | **$0.0295** |
| Precision | 8,641 | $87.96 | $8.98 | $96.94 | **$0.0112** |

---

## Methodology: Overhead Calculation

Previous analyses averaged MCP schema lookup overhead evenly across all tools. This masks the true cost structure.

### The Correct Approach

For each precision tool:

```
Adjusted Cost Per Call = (Base Cost / Calls) + (Info Cost / Tool Calls)
```

This attributes each tool's info overhead proportionally to its own usage.

### Overhead by Tool (All-Time)

| Tool | Calls | Base Cost | Info Calls | Info Cost | Overhead % |
|------|-------|-----------|------------|-----------|------------|
| precision_read | 3,583 | $34.67 | 566 | $3.29 | 9.5% |
| precision_grep | 1,647 | $20.96 | 302 | $2.01 | 9.6% |
| precision_edit | 1,956 | $19.52 | 343 | $1.89 | 9.7% |
| precision_write | 171 | $3.39 | 77 | $1.00 | 29.5% |
| discover | 684 | $3.99 | 203 | $0.79 | 19.8% |
| precision_exec | 300 | $1.80 | 0 | $0.00 | 0% |

**Key insight**: precision_write has the highest overhead ratio (29.5%) because it is called less frequently.

---

## Head-to-Head: Category Comparisons

| Category | Native Calls | Native/Call | Precision Calls | Precision/Call | Delta |
|----------|--------------|-------------|-----------------|----------------|-------|
| **Exec** | 35,000 | $0.0235 | 300 | $0.0060 | **-74.6%** |
| **Edit** | 13,769 | $0.0373 | 1,956 | $0.0109 | **-70.7%** |
| **Write** | 3,022 | $0.0827 | 171 | $0.0258 | **-68.9%** |
| **Read** | 17,398 | $0.0247 | 3,583 | $0.0106 | **-57.2%** |
| **Search** | 7,052 | $0.0242 | 2,573 | $0.0119 | **-50.9%** |

### Why These Differences Exist

**Exec (-74.6%)**: Native Bash returns full stdout/stderr. Precision_exec returns structured results with configurable verbosity.

**Edit (-70.7%)**: Native Edit returns verbose diff output. Precision_edit can return count_only or minimal confirmation.

**Write (-68.9%)**: Native Write echoes content back for confirmation. Precision_write confirms with minimal output.

**Read (-57.2%)**: Native Read returns full file content. Precision_read supports outline, symbols, and line ranges.

**Search (-50.9%)**: Native Grep returns matching lines with context. Precision tools support files_only mode.

---

## The Native Write Anomaly

Native Write at **$0.0827 per call** is 3x more expensive than Read ($0.0247).

| Tool | Cost/Call | vs Average |
|------|-----------|------------|
| Write | $0.0827 | +180% |
| Edit | $0.0373 | +26% |
| Native Average | $0.0295 | baseline |
| Read | $0.0247 | -16% |
| Grep | $0.0242 | -18% |

**Why?** Write operations include content echoing for confirmation, effectively doubling tokens.

---

## Statistical Significance

| Comparison | Native n | Precision n | Confidence |
|------------|----------|-------------|------------|
| Exec | 35,000 | 300 | High/Medium |
| Edit | 13,769 | 1,956 | High/High |
| Write | 3,022 | 171 | High/Low |
| Read | 17,398 | 3,583 | High/High |
| Search | 7,052 | 2,573 | High/High |

### Confounding Factors

1. **Recent native calls were blocked**: A pre-tool-use hook blocks native tools, returning minimal error output.

2. **Usage patterns differ**: Precision tools are used for batch operations; native tools for ad-hoc work.

3. **Cache effects**: 4.15B cache read tokens at $0.15/M vs $15/M for fresh input.

---

## The Discover Tool: Batch Efficiency Champion

| Tool | Cost/Call | Cost/100 |
|------|-----------|----------|
| discover | $0.0070 | $0.70 |
| precision_grep | $0.0139 | $1.39 |
| Native Grep | $0.0276 | $2.76 |

Discover is **75% cheaper than native Grep** due to batching multiple queries per call.

---

## Model Cost Distribution

| Model | Calls | % of Calls | Cost | % of Cost | Cost/Call |
|-------|-------|------------|------|-----------|----------|
| Opus 4.5 | 60,590 | 57.6% | $2,663.92 | 88.4% | $0.0440 |
| Sonnet 4.5 | 41,640 | 39.6% | $334.78 | 11.1% | $0.0080 |
| Haiku 4.5 | 2,988 | 2.8% | $13.35 | 0.4% | $0.0045 |

Opus handles 57.6% of calls but 88.4% of cost (orchestrator/worker pattern).

---

## Potential Savings

If all 79,424 native tool calls had been precision calls:

| Scenario | Cost |
|----------|------|
| Actual (native tools) | $2,344.44 |
| Hypothetical (all precision) | $889.55 |
| **Potential Savings** | **$1,454.89 (62%)** |

---

## Practical Recommendations

| Instead of | Use | Expected Savings |
|------------|-----|------------------|
| Multiple Grep calls | discover with batched queries | 75% |
| Bash for file operations | precision_exec | 75% |
| Edit with full diff output | precision_edit minimal mode | 71% |
| Write with confirmation | precision_write | 69% |
| Read full file | precision_read with outline/symbols | 57% |

---

## Limitations

1. **Single user data**: Usage patterns vary.
2. **Pro/Max vs API**: Relative efficiency transfers; absolute costs differ.
3. **Selection bias**: Precision tools may be chosen for efficiency-sensitive operations.
4. **Hook effects**: Recent hooks block native tools.

---

## Conclusion

Across 105,218 API calls and $3,012 in spend:

- **Precision tools: $0.0112/call** (overhead-adjusted)
- **Native tools: $0.0295/call**
- **Difference: 62% savings**

The savings come from:
1. **Graduated verbosity**: Return what is needed, not everything
2. **Batching**: Multiple operations per API round-trip
3. **Structured output**: Consistent schemas that cache well

---

*Analysis: 105,218 API calls, 30 days, January 2026*

---

**TL;DR**: Precision tools save 62% per call after overhead. Biggest wins: Exec (-75%), Edit (-71%), Write (-69%). Full migration could save ~60% on tool costs.
