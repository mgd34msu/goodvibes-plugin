# Session Analysis: Vanilla Claude Code vs GoodVibes Plugin

## The Value Equation

```
Value = (tokens_saved × usage_rate × sessions)
      - (tokens_injected × sessions)
      + (latency_saved_ms × value_per_ms)
      + (thinking_tokens_saved × usage_rate)
```

First, let me establish the baseline overhead so the per-tier math is grounded.

---

## GoodVibes Injection Cost (Constant Overhead)

| Component | Est. Tokens | Purpose |
|-----------|------------|--------|
| Vibecoding mode config + behavior | ~3,400 | Orchestration rules, WRFC spec, agent constraints |
| Precision tool schemas (9 tools) | ~5,200 | Full JSON schemas for all precision_engine tools |
| Logging/memory spec + templates | ~1,900 | JSON schemas, markdown templates, file paths |
| CLAUDE.md files (×3 overlapping) | ~450 | Mandatory rules reinforcement |
| MEMORY.md | ~1,500 | Cross-session knowledge |
| Skills list + deferred tools | ~900 | Skill routing, lazy tool inventory |
| **Total injection per session** | **~13,350** | |

With prompt caching (Opus pricing: $15/M input, $1.875/M cached):
- **Turn 1 cost**: ~$0.20 (uncached)
- **Turns 2+**: ~$0.025 each (cached)
- This overhead is **fixed per turn regardless of task complexity**

---

## Tier 1: Quick Q&A (2-3 questions, 3-5 turns)

### Vanilla Claude Code
```
User asks a question → Claude reads 0-2 files → answers
User follows up → Claude maybe reads 1 file → answers
Done.
```

| Metric | Value |
|--------|-------|
| Turns | 3-5 |
| File reads | 0-2 |
| Edits | 0 |
| Total input tokens | ~25K-40K |
| Total output tokens | ~2K-4K |
| Wall time | 2-5 min |

### GoodVibes Session
Identical workflow — the orchestration layer has nothing to orchestrate. No agents spawn for simple Q&A. But you pay the injection tax on every turn.

| Metric | Value |
|--------|-------|
| Turns | 3-5 (same) |
| Additional input tokens | ~13.3K × 5 = ~66.7K (mostly cached) |
| Effective cost of overhead | ~$0.32 |
| Agents spawned | 0 |
| WRFC loops | 0 |

### Value Equation — Tier 1

```
tokens_saved      = 0          (no batching opportunity)
usage_rate        = 0%         (no precision tools used)
tokens_injected   = 66,700     (13.3K × 5 turns)
latency_saved_ms  = 0          (no parallel agents)
thinking_tokens_saved = 0      (no complexity reduction)

Value = (0 × 0 × 1) - (66,700 × 1) + (0 × $0.00002) + (0 × 0)
Value = -66,700 tokens
      ≈ -$0.32 per session
```

**Verdict: Pure loss.** GoodVibes adds ~66K tokens of overhead with zero benefit. For quick Q&A sessions, the plugin is dead weight.

---

## Tier 2: Small Task (bug fix, single file edit, 8-15 turns)

### Vanilla Claude Code
```
User describes bug → Claude greps for relevant code → reads 2-3 files
→ identifies issue → edits 1-2 files → runs tests → done
```

| Metric | Value |
|--------|-------|
| Turns | 8-15 |
| File reads | 3-5 |
| Greps | 2-4 |
| Edits | 1-2 |
| Test runs | 1 |
| Total input tokens | ~80K-150K |
| Total output tokens | ~8K-15K |
| Wall time | 10-25 min |

### GoodVibes Session
The orchestrator now activates the WRFC loop:
1. Spawn **engineer agent** (work) — does the fix
2. Spawn **reviewer agent** (review) — checks the fix
3. If issues: spawn **fix agent** + **check agent**
4. Commit, update logs/memory

| Metric | Value |
|--------|-------|
| Orchestrator turns | 8-12 |
| Subagent turns (total) | 15-25 across 2-4 agents |
| Additional injection tokens | ~13.3K × 12 = ~160K |
| Precision tool savings | ~5K-10K (batch reads, verbosity control) |
| Subagent context isolation | Prevents ~20K-40K of history bloat in main context |
| Wall time | 12-30 min (agents run sequentially, review adds time) |

### Value Equation — Tier 2

```
tokens_saved        = 8,000     (batch reads, minimal verbosity)
usage_rate          = 40%       (only some turns use precision tools)
sessions            = 1
tokens_injected     = 160,000   (per-turn overhead × 12 turns)
latency_saved_ms    = -120,000  (review loop ADDS ~2 min)
value_per_ms        = $0.00002
thinking_tokens_saved = 2,000   (structured schemas reduce ambiguity)

Value = (8,000 × 0.4 × 1) - (160,000 × 1) + (-120,000 × $0.00002) + (2,000 × 0.4)
Value = 3,200 - 160,000 + (-2.40) + 800
Value = -155,998 tokens + (-$2.40 latency penalty)
      ≈ -$3.32 per session
```

**Verdict: Net negative.** The WRFC review loop adds time and tokens for a task that a single-pass vanilla session handles fine. The review catches edge cases but the cost exceeds the value for small tasks. Quality gain is real but expensive.

---

## Tier 3: Medium Task (feature implementation, 20-40 turns)

### Vanilla Claude Code
```
User describes feature → Claude explores codebase (5-8 greps/globs)
→ reads 8-15 files → plans approach → edits 4-8 files sequentially
→ runs tests → fixes failures → runs tests again → done
```

| Metric | Value |
|--------|-------|
| Turns | 20-40 |
| File reads | 8-15 |
| Greps/Globs | 5-8 |
| Edits | 4-8 |
| Test runs | 2-3 |
| Total input tokens | ~300K-600K |
| Total output tokens | ~30K-60K |
| Context compressions | 0-1 |
| Wall time | 30-90 min |

### GoodVibes Session
Orchestrator parallelizes work across multiple agents:
1. Spawn **architect agent** for exploration + plan
2. Spawn 2-3 **engineer agents** in parallel (independent file groups)
3. Spawn **reviewer agent** per completed work unit
4. Fix loops as needed
5. Spawn **tester agent** for validation
6. Commit, update logs/memory

| Metric | Value |
|--------|-------|
| Orchestrator turns | 15-25 (coordination only, stays lean) |
| Subagent turns (total) | 40-70 across 4-6 agents |
| Additional injection tokens | ~13.3K × 25 = ~333K |
| Precision tool savings | ~40K-80K |
| — Batch discover calls | ~15K saved (5 queries × 1 call vs 5 calls) |
| — Minimal verbosity reads | ~10K saved (outline/symbols vs full content) |
| — Batch writes | ~8K saved (multi-file writes) |
| — Context isolation | ~30K-50K kept out of main context |
| Subagent parallelism | 2-3 agents simultaneous |
| Wall time | 25-60 min (parallelism starts helping) |

### Value Equation — Tier 3

```
tokens_saved          = 60,000    (batch ops, verbosity, context isolation)
usage_rate            = 65%       (most turns involve file operations)
sessions              = 1
tokens_injected       = 333,000   (orchestrator overhead)
latency_saved_ms      = 600,000   (10 min saved via parallelism)
value_per_ms          = $0.00002
thinking_tokens_saved = 15,000    (structured exploration reduces false starts)

Value = (60,000 × 0.65 × 1) - (333,000 × 1) + (600,000 × $0.00002) + (15,000 × 0.65)
Value = 39,000 - 333,000 + 12.00 + 9,750
Value = -284,250 tokens + $12.00 latency gain
      ≈ -$6.73 token cost + $12.00 time saved
      = +$5.27 net per session
```

**Verdict: Crossover point.** This is where GoodVibes starts breaking even. The parallelism time savings offset the token overhead, and the quality improvement from mandatory review becomes genuinely valuable (catching bugs before they compound across files). The equation is sensitive to `value_per_ms` — at $150K/yr developer salary ($0.00002/ms), the time savings barely cover the token cost. At $200K+ or for production-critical code, it tips positive.

---

## Tier 4: Large Task (major refactor + tests, 60-150 turns)

### Vanilla Claude Code
```
User describes refactor → Claude explores extensively (15-25 searches)
→ reads 20-40 files → plans phased approach → edits 15-30 files
→ context compresses 2-4 times (loses intermediate state)
→ re-reads files to recover context → runs tests → fixes 5-10 failures
→ re-runs tests → iterates 2-3 more times → done (maybe)
```

| Metric | Value |
|--------|-------|
| Turns | 60-150 |
| File reads | 30-60 (including re-reads after compression) |
| Greps/Globs | 15-25 |
| Edits | 15-30 |
| Test runs | 4-8 |
| Total input tokens | ~1.5M-3M |
| Total output tokens | ~100K-200K |
| Context compressions | 2-4 (each loses ~30% fidelity) |
| Wall time | 2-6 hours |
| **Critical risk** | Context loss causes inconsistent edits, missed files |

### GoodVibes Session
Orchestrator breaks work into phases, each with WRFC:
1. **Phase 1**: Architect agent explores + produces plan
2. **Phase 2**: 3-4 engineer agents work parallel subtasks
3. **Phase 3**: Reviewer agents check each subtask
4. **Phase 4**: Fix agents address issues
5. **Phase 5**: Tester agent runs full suite
6. Repeat phases 2-5 for next batch
7. Memory/logs persist state across compressions

| Metric | Value |
|--------|-------|
| Orchestrator turns | 30-50 (coordination only) |
| Subagent turns (total) | 100-200 across 15-25 agent spawns |
| Additional injection tokens | ~13.3K × 50 = ~665K |
| Precision tool savings | ~200K-400K |
| — Batch operations | ~80K saved (discover, batch writes, batch exec) |
| — Verbosity control | ~50K saved (count_only/minimal for exploration) |
| — Context isolation | **~300K-500K kept out of main window** |
| — Re-read avoidance | ~100K saved (subagents don't need re-reads) |
| Context compressions (orchestrator) | 0-1 (lean context) |
| Context compressions (vanilla) | 2-4 (heavy context) |
| Cross-session memory benefit | Patterns from prior sessions inform decisions |
| Wall time | 1.5-4 hours |

### Value Equation — Tier 4

```
tokens_saved          = 350,000   (batch ops, isolation, avoided re-reads)
usage_rate            = 80%       (heavy file operation session)
sessions              = 1
tokens_injected       = 665,000   (orchestrator overhead)
latency_saved_ms      = 3,600,000 (60 min saved via parallelism + fewer re-reads)
value_per_ms          = $0.00002
thinking_tokens_saved = 80,000    (structured orchestration, no context-loss recovery)

Value = (350,000 × 0.8 × 1) - (665,000 × 1) + (3,600,000 × $0.00002) + (80,000 × 0.8)
Value = 280,000 - 665,000 + 72.00 + 64,000
Value = -321,000 tokens + $72.00 latency gain
      ≈ -$7.60 token cost + $72.00 time saved
      = +$64.40 net per session
```

**Verdict: Strongly positive.** The context isolation architecture is the killer feature here. Vanilla Claude Code's biggest enemy at this scale is context compression — losing track of what was already changed, re-reading files unnecessarily, making inconsistent edits across a large refactor. GoodVibes' agent model keeps the orchestrator's context lean while heavy work happens in isolated, disposable contexts. The 60-minute latency saving alone justifies the token overhead by 9×.

---

## Tier 5: Epic Task (full codebase refactor + new features + validation, multi-session)

### Vanilla Claude Code
```
Session 1: Explore codebase, start refactoring → context maxes out
Session 2: Re-explore (no memory of session 1), continue refactoring
Session 3: More refactoring, start hitting inconsistencies from sessions 1-2
Session 4: Write tests, discover bugs from earlier sessions
Session 5: Fix bugs, re-test, realize architectural decisions from session 1 were suboptimal
Session 6-8: Iterate...
```

| Metric | Value |
|--------|-------|
| Sessions | 5-8 |
| Turns (total) | 300-600 |
| Total input tokens | ~8M-15M |
| Total output tokens | ~500K-1M |
| Context compressions (total) | 10-20 |
| Rework due to context loss | ~30-40% of edits touched twice |
| Wall time | 2-4 days |
| **Critical risk** | Architectural drift, inconsistent patterns across sessions |

### GoodVibes Session
```
Session 1: Architect agent produces comprehensive plan, stored in memory.
           3-4 engineer agents execute Phase 1 in parallel.
           Reviewers validate. Committed. Memory updated.
Session 2: Orchestrator loads memory → knows exactly where session 1 left off.
           Continues with Phase 2. No re-exploration needed.
           Failure patterns from session 1 inform session 2 fixes.
Session 3: Continues. Cross-session memory prevents repeated mistakes.
```

| Metric | Value |
|--------|-------|
| Sessions | 2-4 (fewer needed) |
| Orchestrator turns (total) | 80-150 |
| Subagent turns (total) | 300-500 across 40-80 agent spawns |
| Additional injection tokens | ~13.3K × 150 = ~2M |
| Precision tool savings | ~1.2M-2M |
| — Context isolation | ~1M+ kept out of main window |
| — Cross-session memory | ~300K avoided re-exploration |
| — Batch operations | ~200K saved |
| — Avoided rework | ~500K saved (review catches issues early) |
| Context compressions | 2-4 total (vs 10-20 vanilla) |
| Rework rate | ~5-10% (vs 30-40% vanilla) |
| Wall time | 1-2 days |

### Value Equation — Tier 5

```
tokens_saved          = 1,800,000  (isolation, memory, avoided rework)
usage_rate            = 85%        (nearly all turns are file-heavy)
sessions              = 3          (average GoodVibes sessions needed)
tokens_injected       = 665,000    (per session, ×3)
latency_saved_ms      = 28,800,000 (8 hours saved across all sessions)
value_per_ms          = $0.00002
thinking_tokens_saved = 400,000    (memory eliminates re-discovery, structured orchestration)

Value = (1,800,000 × 0.85 × 3) - (665,000 × 3) + (28,800,000 × $0.00002) + (400,000 × 0.85)
Value = 4,590,000 - 1,995,000 + 576.00 + 340,000
Value = +2,935,000 tokens saved + $576.00 latency gain
      ≈ +$69.38 token savings + $576.00 time savings
      = +$645.38 net across the epic
```

**Verdict: Transformative.** At this scale, the GoodVibes architecture isn't just a convenience — it's a different category of capability. The cross-session memory eliminates the "amnesia tax" that vanilla sessions pay. The mandatory review catches drift early instead of letting it compound across days. The parallelism cuts calendar time roughly in half. And the token savings from context isolation actually exceed the injection overhead by ~1.5×.

---

## Summary: Crossover Analysis

| Tier | Turns | Vanilla Tokens | GV Overhead | GV Savings | Time Delta | Net Value |
|------|-------|---------------|-------------|------------|------------|----------|
| 1. Q&A | 3-5 | 25-40K | +67K | 0 | 0 | **-$0.32** |
| 2. Small | 8-15 | 80-150K | +160K | 8K | -2 min | **-$3.32** |
| 3. Medium | 20-40 | 300-600K | +333K | 60K | +10 min | **+$5.27** |
| 4. Large | 60-150 | 1.5-3M | +665K | 350K | +60 min | **+$64.40** |
| 5. Epic | 300-600 | 8-15M | +2M | 1.8M | +8 hrs | **+$645.38** |

### The Crossover

```
Break-even point: ~15-20 turns, ~3-5 file edits
```

Below that threshold, GoodVibes is overhead with no payoff. Above it, the value compounds non-linearly because:

1. **Context isolation** value grows with session length (prevents compression loss)
2. **Parallelism** value grows with task breadth (more independent subtasks)
3. **Memory** value grows with session count (eliminates re-discovery)
4. **Review** value grows with edit count (catches drift early, preventing rework)

### The Hidden Variable: Quality

The equation doesn't capture the quality differential. Vanilla sessions at Tier 4-5 produce code that has been **seen once** by one context window that's been compressed multiple times. GoodVibes sessions produce code that has been **written once and reviewed at least once** in fresh, uncompressed contexts. For production codebases, the cost of a bug that slips through to production dwarfs any token savings — but that's outside the scope of this equation.

### Recommendation by Use Case

| If your typical session is... | Use... |
|------|--------|
| Quick questions, small lookups | Vanilla Claude Code |
| Single bug fixes, small edits | Vanilla Claude Code |
| Multi-file feature work | GoodVibes (marginal) |
| Refactors, large features | GoodVibes (strong) |
| Multi-session epics | GoodVibes (essential) |
