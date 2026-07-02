# GoodVibes Plugin — Deep Review and Premise Trial

Date: 2026-07-01
Method: 38-agent review workflow — 11 parallel subsystem auditors (each also field-testing the precision tools as they worked), a controlled token-measurement agent, an adversarial premise trial (advocate brief vs. skeptic brief, ruled on by a judge), and an adversarial verification pass over the top findings. Roughly 3M tokens of subagent work, 644 tool calls. The orchestrating session itself ran under the plugin (hooks active, native file tools blocked), so several findings were reproduced firsthand during the review itself.

Scale of findings: ~142 distinct issues across 11 audit areas (7 critical, ~41 high). The 24 highest-severity findings were re-checked by independent verifier agents instructed to refute them: 24 confirmed, 0 refuted (2 criticals downgraded to high, 2 highs to medium). Companion documents: `gv-plugin-plan.md` (prior hygiene-focused review — its claims were spot-verified and hold) and `docs/precision-engine-field-issues-2026-07-01.md` (all 7 field issues confirmed and root-caused to specific functions).

---

## The Verdict on the Premise

> "Providing precise, scalable verbosity tooling is better than the default."

**The idea was right — so right that the platform absorbed it.** Range reads, grep output modes, head limits, parallel tool calls, subagent isolation, deferred MCP schema loading, on-demand skills, context compaction: the 2026 harness is, in large part, your premise implemented natively. That is vindication of the concept and simultaneously the reason the *replacement* strategy no longer pays.

**The premise as shipped fails on its own terms.** Measured at default settings — the only configuration the mandatory redirection policy actually enforces — the precision tools cost MORE tokens than the native baseline:

- `precision_read` at defaults loses at every file size tested: +49% (small file) to +3.5% (1,634-line file). It only wins with `include_line_numbers:false`, and only above ~300 lines (best measured: −14.9%).
- `precision_grep` costs 1.79–1.87× native-equivalent bytes in every measured mode, and set a false `truncated:true` flag on a provably complete result set.
- The flagship `extract:symbols` produced output LARGER than the raw file (56.2KB vs 47.2KB) and mislabeled 59 local variables (including a loop counter `i`) as exported.
- The fixed overhead is ~13,500 tokens per main session (prompt chain ~6,070 + active output style ~5,930 + deferred tool names ~1,320 + injections) plus ~7,200 tokens per subagent spawn. A 6-agent orchestration pays ~43k tokens of tax before any work begins. Break-even needs 9–12 file ops/session at the claimed 75–95% savings — savings the measurements show are not realized at defaults — or 23–45 ops at realistic rates. The plugin's own analytics credited a live session with 6.2% realized efficiency.
- The server's self-reported `token_estimate` under-reports the actual delivered payload by 1.16–2.41×, and `output.max_tokens` is not enforced for outline/symbols (one response was 104KB against an 8,000-token cap) — so the token-budgeting workflow the plugin's own docs prescribe cannot be executed on its own numbers.

**The premise survives as a narrow, genuinely excellent capability claim.** These were verified repeatedly, conceded by the skeptic, and are things the 2026 native harness cannot do at comparable cost:

- `extract:outline` — 66% real savings on a 1,634-line file AND sufficient to answer "what does this module export / where is X handled" with exact line spans, zero follow-up reads. The outline-then-ranged-read pipeline is the best thing in the project.
- Multi-query batched grep with keyed results — 9 `count_only` queries across 3 directories in one ~117-token call. Native Grep is one pattern per call; parallel native calls cannot share an envelope or cap budget.
- AST structural search (51 exact call sites across 8 files in 673ms via ast-grep), `expand_to:'function'` (match → exact enclosing function body in one call, via tree-sitter), `preview_replace` dry-run diffs, negation search.
- `precision_glob` `with_stats` — per-file byte sizes for planning batch reads under a budget; native Glob returns paths only.
- `max_line_length` as defense against pathological content — this repo contains a 22.3MB single-line file (`dist/index.cjs.map`) that would poison native content-mode grep.
- Per-response cost metadata and explicit caps — the right idea, currently wrong numbers; no native tool tells the working agent what a result cost.
- analytics-engine's session/cost telemetry — data the harness does not expose at all.

**The policy layer fails unconditionally.** Mandatory redirection, the always-on prompt chain, and hard-blocking are indefensible on the evidence: the hook blocks the exact fallback the plugin's own escalation doctrine documents (confirmed live in this session — the fallback path is impossible); it does not check whether the precision-engine server is even alive before blocking (server down = every file operation in the session is bricked); each blocked call costs ~186 wasted tokens; and the WebFetch replacement made agents strictly worse off (SPA junk, 2KB previews of 79KB fetches, curl workarounds). The five-way-duplicated doctrine (chain + style + skills + hook messages + subagent injections) has drifted into teaching parameter names and enum values the schemas reject (`edits[].file` vs required `path`, a nonexistent `with_diff` verbosity).

**Judge's confidence: high.** Full briefs, concessions, and the ruling are preserved in the workflow record; the strategic recommendation is reproduced in Part 5.

---

## Part 1 — Trust and Consent Items (fix these first, regardless of strategy)

These are not token-efficiency questions. They affect whether users can trust the plugin, and they should be fixed before anything else ships.

1. **The SessionStart hook silently rewrites the user's global `~/.claude/CLAUDE.md` on every session** (`hooks/scripts/src/.../claude-md-manager.ts`), installing the `~/.claude/.goodvibes/` prompt chain with no consent prompt and no uninstall path. The injected text also asserts that native tools "have been deprecated as of 2026-01-01" — presenting the plugin's preference as a platform fact, which is false. Fix: explicit one-time opt-in during install, a real uninstall command, and honest wording.
2. **`precision_agent` hardcodes `--dangerously-skip-permissions` on every headless claude session it spawns**, with no opt-out parameter. Every spawned session runs with permission prompts disabled whether the caller wanted that or not. Fix: default to normal permissions; make skipping an explicit opt-in parameter. (Related: the agent prompt temp file is written world-readable with a fixed 2-second deletion race.)
3. **The justvibes output style's "Implicit Permissions" clause instructs the model to disregard prior restrictions.** Instruction-hierarchy overrides like this are both a safety footgun and counterproductive — current models treat "ignore your other instructions" clauses as a suspicion signal, which degrades compliance with the rest of the style. Fix: state affirmatively what the mode may do autonomously; never negate other instruction sources.
4. **Runtime directives leak across sessions.** The directive-drain guard keys on an `is_subagent` field Claude Code does not send, so orchestrator-bound WRFC directives were drained by unrelated read-only subagent sessions three separate times during this audit. Any agent's hook steals whatever is queued. Fix: scope directives to their intended recipient using a signal the platform actually provides (session id is available in the payloads).
5. **`tool-update.mjs` logs every Bash command verbatim to a shared world-readable tmp file and auto-approves rewritten commands.** Command lines routinely contain tokens and secrets. Fix: stop logging command text, or log to a 0600 file under `.goodvibes/`, and never auto-approve a rewritten command without surfacing the rewrite.

---

## Part 2 — Verified Critical Defects (all root-caused to code)

All seven documented field issues are real; the audit found the exact causes plus several new defects of equal or greater severity. Verifier consensus in parentheses.

### precision-engine

1. **Rolled-back edits report `status:'applied'` inside a `success:true` envelope** (critical, confirmed). `precision-edit.ts` atomic-failure path (~1197–1224) sets a `[ROLLED BACK]` hint but leaves status `applied`; the default `minimal` verbosity drops the hint, so the caller sees pure success for edits that never landed. `precision-write.ts` (461–476) has the identical defect — rolled-back writes stay `created`/`overwritten` and the summary counts them as written. The existing rollback test (`precision-write.test.ts:240–257`) asserts nothing. Fix: first-class `rolled_back` status, `success:false` envelope, recomputed summaries, real tests.
2. **No `base_path` on read/write/edit/grep** (high, confirmed). Each handler hardcodes `const workDir = process.cwd()` (`precision-read.ts:1433`, `precision-write.ts:423`, `precision-edit.ts:1024` + `applyEdit` ~908–935, `precision-grep.ts:378`) while `discover`/`glob`/`exec` already expose base paths. In a git worktree, relative writes silently land in the launch tree. The internal plumbing (`workDir` params) already exists — the fix is one schema property and one line per handler.
3. **Batch reads collapse same-path entries and cache stubs compound it** (critical, confirmed, live-reproduced during this audit). Results are built with `Object.fromEntries` keyed on path, so two range-reads of one file return only the second; `summary.files_read` still says 2. Fix: key results by entry index or path+range+extract.
4. **The cache is server-global and delivery-blind** (high, confirmed). `FileStateCache` marks content "known" when ANY caller (including a write/edit) touches it, then serves content-free stubs to agents who never received the content — reproduced by 7 of 11 auditors, including stubs for first-in-session reads and stubs with `last_read: 0s ago` for content that overflowed to disk and never reached the model. `tokens_saved` is credited for content never delivered; ~1/3 of audit reads required `force:true`, forfeiting the savings the cache claims. Fix: serve the requested extract/range FROM cache on a hit (that is what a cache is for), key by path+range+extract+hash, and never stub a first-in-session read.
5. **Every successful `precision_edit` silently converts CRLF files to LF wholesale** (high, confirmed) — a data-corruption class defect for cross-platform repos.
6. **Atomic write transactions cannot restore overwritten files when `backup:false`** (high, confirmed) — rollback of an overwrite without a backup is silent data loss.
7. **Grep caps are miswired** (high, confirmed) — root cause of field issue 2: the per-file `--max-count` (default 10) leaks into `count_only` totals; `max_total_matches` (100) ceilings `files_only` file lists, making the documented `max_results=100` unreachable (~10–11 files max at defaults, with nondeterministic membership between identical runs); and `truncated` is computed by comparing total matches against the per-file cap, so it fires falsely on virtually every search while `negate` hardcodes it `false` and `discover` drops it entirely.
8. **The project index is corrupt on disk right now and nothing validates it** (critical, confirmed): a path-traversal `/tmp` entry, nested-object trees where flat entries belong, and 24 files recorded for a multi-thousand-file repo — and `discover` auto-injects this corrupt index into every response unrequested.
9. **`exec` `minimal` verbosity omits stdout entirely** (high, confirmed — field issue 5): the `case 'minimal':` branch at `precision-exec.ts:1886` drops output while the `MINIMAL_STDOUT_PREVIEW_CHARS` constants written for it (lines 76/78) were wired into the standard-mode formatter instead. A unit test enshrines the wrong behavior. Same disease elsewhere: `read` `format:'minimal'` strips content that was explicitly requested with `force:true`, and `edit` `minimal`/`count_only` still emit full diff previews (~1,400 tokens each, observed live in this session).
10. **`token_budget` pagination duplicates every line as both a content string and a lines array** (high, confirmed — field issue 6), roughly doubling the cost of the exact feature built to cap cost; `include_line_numbers:false` cannot suppress it.
11. Additional confirmed highs: OCC/conflict detection is dead code for edits (concurrent edits race, last-write-wins); one background command silently backgrounds the ENTIRE exec batch; `precision_notebook`'s position-blind index offset can mutate the wrong cells in mixed-order batches; `normalizePath` mangles legitimate Linux paths matching `/x/...` into Windows drive letters (verifier: medium).

### runtime-engine

12. **Directive delivery is globally unscoped** (critical, confirmed — observed live three times during this audit; see Part 1 item 4).
13. **The watchdog never covers the primary hook-driven WRFC path** (high, confirmed) — hook-driven WRFC chains never become WorkflowEngine instances, so the self-healing layer watches the wrong population.
14. **`session:started` handling wipes cross-session state** (high, confirmed): clears ALL pending directives and removes live sibling engines' socket pointer files. **`killOrphanDaemons` kills healthy daemons belonging to other projects** (high, confirmed).
15. **`max_fix_attempts` is off-by-one** (high, confirmed): the final fix attempt executes but is never reviewed, and the two enforcement paths count different things. The directive queue is memory-only — daemon death between emit and drain loses directives (verifier: medium, given the urgent-file fallback).
16. Hook events are double-emitted onto the EventBus — 60 duplicate entries in this project's live `events.jsonl` (medium, empirically confirmed). Auto-workflow creation spawns reviewer chains for every review-typed agent even when zero files changed — this session paid ~74k tokens for two 10/10 reviews of nothing.

### Packaging, content, and gates

17. **All 25 skills are invisible to Claude Code** (high, confirmed): the tier-nested layout (`skills/<tier>/<name>/SKILL.md`) is not discovered by the current plugin spec — this live session exposes zero of them. The "Protocol Skills (Always Active)" claim is false in practice; the skills are reachable only through registry-engine tools. Fix: flatten to `skills/<name>/SKILL.md`.
18. **Output styles are not migrated to the current spec** (high, confirmed): missing `keep-coding-instructions` (selecting them strips Claude Code's built-in engineering instructions), stale `/output-style` references (removed in CC v2.1.91), and internal contradictions (mandatory agent-count checking via Task Output vs. "NEVER use Task Output"; silent-mode vs. mandatory logging). justvibes and vibecoding are 87% identical with copy-drift.
19. **Every canonical gate is broken** (high, confirmed): root `npm test` deadlocks (hooks vitest threads-pool hang); typecheck fails in 5 of 8 packages — precision-engine alone has 607 errors (47 in production source); root eslint: 2,442 problems; **no CI of any kind**; runtime-engine regressed beyond its recorded baseline (9 failing tests vs 1 known — a review threshold default changed 9.5→9.9 without updating tests). **None of the seven field-defect classes has any test coverage; one is asserted as correct behavior.** `precision-agent.test.ts` has failed collection since ~Feb 2026.
20. **The registry tree-dirtying mystery is solved** (medium, confirmed): `build-registries.ts` stamps `generated: new Date().toISOString()` into all four `_registry.yaml` files and postinstall runs it on every `npm install` — content is otherwise fully deterministic. Drop the timestamp (or move it to a non-tracked sidecar) and the noise disappears.
21. Registry/search defects: `search_skills` returns zero results for its own advertised default category `"all"`; `recommend_skills` returns empty for common tasks and ignores its documented `context` argument; generated trigger words are stopword garbage, degrading all search tools. Both Unix release install scripts have an unclosed `if` and fail immediately; `install:hooks` writes a `.claude/hooks.json` that current Claude Code never reads; `marketplace.json` advertises 1.0.0 for a 1.10.4 plugin; `npm run migrate` crashes on `__dirname` in ESM scope.
22. Auxiliary-engine wrong-answer analyzers (high, confirmed): `project_deps_circular` fabricated a cycle from a doc comment (regex import extraction parses comments); `frontend_tailwind_conflicts` flags any two `text-*` classes and tells the agent to delete legitimate styling; `bundle_analyze` missed the actual 12MB bundle. These cause wrong EDITS, not just wasted tokens — a categorically worse failure mode. Also: `project_runtime_profile`/`memory` execute target-project code inside the shared MCP server process, and `code_breaking`/`semantic_diff` spawn nested `claude` CLI sessions from inside the server.

---

## Part 3 — State of Each Subsystem (strengths included; this project has real engineering)

**precision-engine core** — Well-organized single-process MCP server: clean handler registry + schema separation, robust process hardening (instrumentation failures can never corrupt a tool response), genuine implementations throughout — Levenshtein fuzzy matching, TS-compiler AST matching, ast-grep structural patterns, a thoughtful safe-overwrite layer. Range reads work exactly as advertised. The defects are concentrated in the response/reporting layer (status, envelopes, accounting) and the cache — not in the core mechanics.

**precision-engine search** — The engines are real: ripgrep via `@vscode/ripgrep` JSON events, `@ast-grep/napi`, web-tree-sitter. `expand_to:function` and `preview_replace` verified excellent live. The cap/truncation layer on top is what's broken (see #7). The pretty-printed JSON envelope (`JSON.stringify(result, null, 2)`) is a pure tax — compacting it is likely the single cheapest win in the repo.

**precision-engine exec/fetch/config/agent/notebook** — Substantially real: streaming until-patterns (no polling), issue-classified retry that won't blindly re-run permanently-failing commands, bounded 401 recovery with OAuth2 refresh, 0600 secrets file with triple gitignore guard, real nbformat-aware notebook editing, graceful background-process reaping on shutdown. Sharp edges: the batch-wide background flag, orphaned processes after non-graceful restart, `bg_stop` signaling only the shell PID, no URL allow/deny on fetch, `extract:'summary'` never actually summarizing.

**runtime-engine** — The most mature code in the repo and also the most strategically exposed. The WRFC phase machine is defensively written and genuinely tested (2,721/2,730 passing); the daemon lockfile mutex, hold-drain directive pattern, and EventProcessor guards (re-entrancy, chain-depth breaker, rate limiting) are sound patterns. But the delivery/isolation layer is broken end-to-end (items 12–16), `bootstrap.ts` is a confirmed 998-line god object with a 472-line 25-step `startup()`, and the core loop now competes with native Workflows, background tasks, and task notifications. Genuinely differentiated and worth preserving in some form: the cross-session daemon, external webhook normalizers (github/slack/ci), the cron-like scheduler with active-hours, and the file watcher.

**hooks** — Fail-open discipline is real and verified (garbage stdin → allow, exit 0 — a broken hook never bricks a tool call); tracked dist is byte-identical to a fresh build (honest); warm per-hook overhead is a modest 23–35ms. But: the blocker is unconditional with no liveness check (Part 1), the directive guard is ineffective (Part 1), and a large fraction of the pre-tool-use logic — shell-safety analyzer, git quality gates, MCP validators — is unreachable dead code because `hooks.json` never routes Bash to `dist/pre-tool-use.js`. `agent-tracking.json` uses non-atomic read-modify-write (parallel subagents wipe each other's telemetry). `secrets-commit-guard` is substring matching with near-zero protective value.

**Auxiliary engines** — Not facades: frontend-engine and project-engine do real TS-compiler analysis (verified live: `frontend_component_tree` produced an accurate hierarchy with no running app); analytics-engine has a genuine pipeline over Claude Code JSONL transcripts + telemetry.db with budgets, tags, anomaly detection, and TUI dashboards — and is the clearest keep, because nothing native provides this data. Cost: 3 extra node processes, ~425MB RSS, TS compiler bundled twice. The wrong-answer analyzers (item 22) need retirement or rewrites.

**Registry/build/install** — registry-engine is the cleanest engine audited (lazy cache with promise dedup, strict validation, 380/380 tests in <0.5s). The marketplace install path works by construction (all dist committed, manifests conform to the current spec including `${CLAUDE_PLUGIN_ROOT}` and all 11 hook event names). The npm-lifecycle path is where the rot is (broken installers, dead `.claude/hooks.json`, the timestamp dirty-tree).

**Authored content** — Voluminous, professionally formatted, and drifted: invisible skills (item 17), unmigrated output styles (item 18), 2024/2025-era model guidance, README counts that don't match reality, the precision/GPA doctrine maintained in five places, agents carrying ~40% identical boilerplate and triple-duplicated trigger-word walls. The compact fallback prompts already in `claude-md-manager.ts` prove the guidance compresses ~85% — the steady-state chain could be ~1,200–1,500 tokens instead of ~6,070.

**Tests/CI** — ~287 test files, ~4,600 tests, and fast suites where they run (precision 1,252 in 13s; runtime 2,721; registry 380; analytics 206) — good raw material. But the gates are all red (item 19) and the tests systematically miss the failure modes that matter: no FileStateCache unit tests, a no-op rollback test, zero coverage of any field-defect class.

---

## Part 4 — What This Session Observed Firsthand

While orchestrating this review (not from agent reports — from my own tool calls):

- A 2-file batched `precision_read` of markdown docs returned a 53.6KB JSON envelope that overflowed to disk; the harness persisted it and delivered a 2KB preview. The server then marked both files as cached-read — content I never received — and served content-free stubs on retry until `force:true` (field issue 4, live).
- `output.format:'minimal'` on read returned 67 tokens of metadata and zero content for an explicit content request.
- `precision_edit` with verbosity `minimal` AND `count_only` both emitted ~1,400-token diff previews (the wiring for diff suppression isn't connected — matches the audit finding that `minimal` "is not actually wired").
- The native Read tool is hard-blocked with no fallback, making the plugin's own documented escalation path impossible (hooks audit confirmed: unconditional, no liveness check).
- The WRFC runtime auto-created review chains for this read-only workflow twice and issued spawn directives for reviewers with "No files recorded yet" — ~74k tokens spent reviewing zero changes, both scoring 10/10 by definition.
- `.goodvibes/logs/activity.md` is 54,199 lines / 1.2MB with raw `[DEBUG] SQLiteStore` output from the TUI interleaved into the human activity log — no rotation, no level filtering.
- What worked well firsthand: ranged reads with `include_line_numbers:false` were clean and cheap; the batched multi-query capability is real; directive hold/drain delivered directives reliably to THIS session (the intended recipient case works).

---

## Part 5 — Strategy: What to Do With the Project

The judge's ruling, which this review endorses in full:

**Reposition from a replacement harness to a slim, opt-in code-intelligence MCP server, and retire the policy layer entirely.** The harness absorbed the generic 80% of what you built; competing there is a ~300k-line maintenance treadmill against the vendor, currently being lost at default settings. The defensible 20% — structure-aware search/read plus cost telemetry — is small, differentiated, and measured to win.

### Keep (the product)

- **A ~3-tool code-intelligence server**: `precision_grep` (multi-query keyed results, count/locations verbosity, `expand_to`, AST structural search, `preview_replace`, `negate`, `max_line_length`); `precision_glob` (`with_stats`); `precision_read` (outline + ranged lines). Ship the winning configuration as the DEFAULT: `include_line_numbers:false`, compact (non-pretty-printed) envelope, honest caps.
- **analytics-engine** as a second product — per-session cost telemetry is unique data the harness doesn't expose.
- The genuinely differentiated runtime subsystems — external webhook normalizers, scheduler, file watcher, cross-session daemon — but only after evaluating each against native CronCreate/RemoteTrigger/background tasks, which now cover much of this ground.
- frontend-engine's real analyzers, merged into project-engine to share one TS compiler process.

### Retire

- The native-tool blocking hook, the deprecation notices, and the silent CLAUDE.md rewrite (Part 1).
- The always-on prompt chain — convert the useful content to on-demand skills in the FLAT layout Claude Code actually discovers; delete the 5-way duplication; the contradictory output styles.
- `precision_fetch` as a WebFetch replacement; `precision_write`/`edit`/`exec`/`notebook` as replacements generally (native equivalents are trained-fluent; the edit path has CRLF corruption and false-success rollback).
- The cross-session cache, unless rebuilt with range/extract-aware keying and delivery-aware accounting.
- The WRFC/tmux orchestration core (redundant with native Workflows, subagents, background tasks).
- The wrong-answer analyzers: `deps_circular`, `bundle_analyze`, `tailwind_conflicts`, `runtime_profile`/`memory`, `code_breaking`/`semantic_diff`.

### Suggested sequence

**Phase 0 — Trust + honesty (days):** Part 1 items 1–5; flip read/grep defaults; compact the JSON envelope; fix `token_estimate` to measure the rendered payload; enforce `output.max_tokens`; drop the registry timestamp.

**Phase 1 — Correctness (1–2 weeks):** the seven field issues (all root-caused above — each fix is small); cache rebuild-or-removal; cap/truncated semantics in grep/glob/discover; real gitignore handling; regression tests for every field-defect class; unbreak root `npm test`, burn down the 607 precision-engine tsc errors, add minimal CI (typecheck + test + lint + registry-freshness + version-consistency).

**Phase 2 — The pivot (2–4 weeks):** carve out the slim server; flatten skills; migrate or drop output styles; delete the prompt chain in favor of skills; merge frontend→project engine; retire the lists above; unify versions (prior review's hygiene list still applies).

**Phase 3 — Reposition:** rewrite the README around what's true and differentiated — structure-aware code intelligence + cost telemetry, opt-in, earning adoption on merit. The audit record shows the tools CAN win exactly where context economy binds; the mandate is what turned real engineering into a liability.

---

## Appendix A — Measurement Tables (token cost, request+response, tokens = bytes/3.5)

**EXP1 — Full-file read vs native model:**

| File | Raw bytes | Precision (ln=true, default) | Precision (ln=false) | Native model | Δ default | Δ ln=false |
|---|---|---|---|---|---|---|
| stream-reader.ts (49 ln) | 1,357 | 743t | 628t | 499t | +49% | +26% |
| state-store.ts (287 ln) | 9,717 | 3,749t | 3,091t | 3,432t | +9.2% | −9.9% |
| precision-read.ts (1,634 ln) | 58,345 | 21,124t | 17,387t | 20,405t | +3.5% | −14.8% |
| precision-edit.ts (1,380 ln) | 47,177 | 17,311t | 14,155t | 16,633t | +4.1% | −14.9% |

**EXP2 — Partial read (lines 100–160 of 1,634-line file):** precision 1,036t clean / 1,366t as actually incurred with the cache-stub retry, vs native offset/limit model 684t (2.0× native on the real path). `extract:lines` ignored `include_line_numbers:true`.

**EXP3 — Structure extraction:** outline = 7,027t, −65.6% vs native full read, sufficient with zero follow-ups (the premise's proof point). symbols = 16,062t for a 47.2KB file — larger than the raw file, wrong `exported` flags. Combined call: 104,410 chars actual vs `output.max_tokens: 8000` (ignored) vs `token_estimate: 12,679` (2.35× under).

**EXP4 — Search (ground truth `git grep`):** files_only 7,813t vs native 4,370t (1.79×), count exact after gitignore accounting, but `truncated:true` was FALSE; matches-mode 1,598t vs 853t (1.87×), 14/14 exact, long line capped cleanly. Server said 662t for the 1,598t response and 4,840t for the 7,813t response.

**EXP5 — Batching 8 small files:** one precision call 3,312t vs 8 native reads 2,793t — native wins below ~74t/call framing; batching is only essential relative to UNbatched precision calls (+2.3kt of envelopes).

**EXP6 — Failure paths:** blocked native call ≈186t; cache stub 264t + forced retry (+330t, +48% on the range-read task); `format:minimal` content-strip 173t + full re-read.

**EXP7 — Cache best case (content genuinely unneeded):** stub saves 64% (small) / 93% (medium) / 98.7% (large) — real, but the gate cannot distinguish this case from the failure cases above.

## Appendix B — Fixed-Overhead Arithmetic

| Component | Size |
|---|---|
| Prompt chain (9 files, every session AND every subagent) | 19,858 B ≈ 6,070 tok |
| Active output style (justvibes) | 20,601 B ≈ 5,930 tok |
| Deferred tool names (77 tools) | ≈ 1,320 tok |
| SessionStart injection (fallback path) | ≈ 205 tok |
| **Main-session tax (current harness)** | **≈ 13,530 tok** |
| Per-subagent tax (chain + SubagentStart + mandated reminders) | ≈ 7,215 tok |
| Upfront-schema clients (all 77 schemas) | ≈ 39–41k tok (≈51k total tax) |

Break-even at claimed 75–95% savings: 9–12 file ops/session. At a conservative 20–40%: 23–45 ops. Six-subagent orchestration: ~43k tokens of tax before any work. Redundancy: the four canonical rules are restated across 6–9 always-loaded surfaces; the compact fallback prompts already in the codebase are ~85% smaller than the shipped chain.

## Appendix C — Where the Full Evidence Lives

- Workflow run `wf_4fea526f-70f`: 38 agents, full per-agent findings in the session journal (`subagents/workflows/wf_4fea526f-70f/journal.jsonl`), complete structured result in the task output.
- Verification: 24/24 top findings confirmed, 0 refuted; severity adjustments noted inline above.
- Prior review (`gv-plugin-plan.md`): release hygiene, version drift, bootstrap decomposition plan — spot-verified, still applies, not re-documented here.
- Field issues (`docs/precision-engine-field-issues-2026-07-01.md`): all 7 confirmed with root causes in Part 2.
