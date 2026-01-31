# The Greatest Batch of All Time

> **TL;DR**: A single batch_engine call created 6 test file fixes for $0.0139 — the same work would have cost $0.5838 with native Write calls. That's **42x cheaper** and **97.6% savings**.

---

## 🏆 The Champion: 6 File Writes in One Call

**Timestamp**: 2026-01-29T15:25:35.871Z

### What It Did

Fixed 6 test files in a single atomic operation:
1. `fix_mrr_test` - MRR calculation test fixes
2. `fix_churn_test` - Churn rate test fixes
3. `fix_acquisition_test` - Customer acquisition test fixes
4. `fix_comparison_test` - Metric comparison test fixes
5. `fix_financial_test` - Financial projections test fixes
6. `fix_scenarios_test` - Scenario modeling test fixes

### Cost Analysis

| Metric | Value |
|--------|-------|
| **Batch call cost** | $0.0139 |
| **Native equivalent** | $0.5838 |
| **Savings** | $0.5699 |
| **Savings %** | **97.6%** |
| **Efficiency multiplier** | **42x cheaper** |

### Why This Matters

Native Write is the most expensive Claude Code tool at **$0.0973 per call**. This single batch:
- Avoided 6 separate Write calls
- Saved $0.57 in one operation
- That's more than the total cost of ALL 54 batch calls combined ($0.75)

---

## 🥈 Runner Up: 7 File Reads in One Call

**Timestamp**: 2026-01-28T06:20:44.846Z

### What It Did

Read 7 files to understand database schema and type exports:
1. `packages/database/prisma/schema.prisma`
2. `packages/database/src/index.ts`
3. `apps/axiom/src/lib/wizards/help-types.ts`
4. `apps/axiom/src/lib/wizards/monitoring-types.ts`
5. `apps/axiom/src/lib/wizards/smart-config-types.ts`
6. `apps/axiom/src/lib/wizards/types.ts`
7. `apps/axiom/src/lib/wizards/workflow-types.ts`

### Cost Analysis

| Metric | Value |
|--------|-------|
| **Batch call cost** | $0.0139 |
| **Native equivalent** | $0.1785 |
| **Savings** | $0.1646 |
| **Savings %** | **92.2%** |
| **Efficiency multiplier** | **12.8x cheaper** |

---

## 📊 All-Time Batch Engine Statistics

From 30 days of Claude Code usage:

| Metric | Value |
|--------|-------|
| Total batch calls | 142 |
| Batches with operations | 54 |
| Total operations batched | 91 |
| Max operations in single batch | 7 |
| Average ops per batch | 1.7 |

### Cost Summary

| Metric | Value |
|--------|-------|
| **Total batch cost** | $0.75 |
| **Native equivalent cost** | $5.24 |
| **TOTAL SAVINGS** | **$4.49 (85.7%)** |

---

## Top 10 Batches by Operation Count

| Rank | Operations | Type | Savings | Multiplier |
|------|------------|------|---------|------------|
| 1 | 7 reads | File discovery | $0.16 | 12.8x |
| 2 | 6 writes | Test fixes | $0.57 | **42.0x** |
| 3 | 3 writes | Config creation | $0.28 | 21.0x |
| 4 | 3 mixed | Read + query | $0.04 | 3.7x |
| 5 | 3 writes | Multi-file | $0.28 | 21.0x |
| 6 | 3 writes | Multi-file | $0.28 | 21.0x |
| 7 | 3 mixed | Read + exec + write | $0.11 | 8.8x |
| 8 | 3 mixed | Read + exec + write | $0.11 | 8.8x |
| 9 | 2 reads | Schema check | $0.04 | 3.7x |
| 10 | 2 reads | Type check | $0.04 | 3.7x |

---

## Key Insights

### 1. Write Batching is the Biggest Win

Native Write costs $0.0973/call — by far the most expensive tool. Batching writes provides:
- 42x cost reduction per write operation
- The greatest single-batch savings ($0.57)
- 97.6% savings rate

### 2. Even Small Batches Pay Off

Even 2-operation batches save money:
- 2 reads: 3.7x cheaper
- 2 writes: 21x cheaper
- The overhead of learning the batch_engine schema is recovered on the first use

### 3. The Math

```
Native cost for 91 operations:  ~$5.24
Batch cost for 54 calls:         $0.75
Savings:                         $4.49 (85.7%)
```

The batch_engine essentially gives you **6x the work for the same price**.

---

## The Formula

For any batched operation:

```
Savings = (N × Native_Cost) - Batch_Cost

Where:
- N = number of operations
- Native_Cost = per-operation cost ($0.0973 for Write, $0.0255 for Read)
- Batch_Cost = $0.0139 (fixed per batch call)
```

**Break-even point**: 1 operation for Write, 1 operation for any tool.

A single batched Write saves $0.0834 (86% of Native Write cost).

---

*Analysis period: 30 days (January 2026)*
*Data source: Claude Code session journals*
*Total API calls analyzed: 89,443*
