# GoodVibes v2.0 — Complete Disposition Plan

Date: 2026-07-01
Inputs: the 38-agent deep review (`docs/deep-review-2026-07-01.md`), the field-issues report (`docs/precision-engine-field-issues-2026-07-01.md`), the directive-loop field report (`docs/runtime-engine-directive-loop-2026-07-01.md`), the prior hygiene review (`gv-plugin-plan.md`), and the design decisions settled in review discussion (WRFC reshape, cache verdict, fetch split, open-mode toggle design, hooks triage, daemon strategy).

Every tool, hook, skill, agent, command, style, template, and background process in the plugin gets a disposition below. Nothing is waved at in bulk; composite features are dissected into parts where the parts deserve different fates.

---

## 0. The v2 Thesis

v1 is a replacement harness: six MCP servers, 77 tools, an always-on prompt chain, and hooks that redirect the model away from native tools. The deep review measured that posture as net-negative at defaults and unconditionally negative at the policy layer, while confirming a set of genuinely differentiated capabilities nothing native provides.

**v2 is three opt-in products on one engineering base:**

1. **`goodvibes-intel`** — one MCP server: structure-aware code search/read plus the verified static analyzers. The winning configuration is the default. (~13–17 tools)
2. **`goodvibes-analytics`** — session/cost telemetry, budgets, dashboards. Unique data the harness doesn't expose. (~7 tools)
3. **`goodvibes-connect`** — the API workbench: `api_request` + the service registry with the restricted/open-mode toggle design. (~3 tools)

**DECIDED 2026-07-02: `goodvibes-automation` is cut** — it does not reach alpha. No standing usage depends on the daemon's webhooks/scheduler/watcher, native scheduling and triggers cover the observed needs, and the delivery layer fights the platform (see the directive-loop report). The runtime daemon retires whole; the WRFC workflow template — which needs no daemon — is the sole orchestration survivor. The gateway ambition remains deferred (question 3).

Everything else — the blocking hooks, the prompt chain, the output styles, the WRFC daemon core, the native-tool replacements — either converts to on-demand skills/workflow templates or retires.

**Disposition legend:**
- **KEEP** — survives as-is or with listed fixes
- **REBUILD** — the concept survives; the implementation is replaced
- **ABSORB** — functionality moves into another component; the standalone thing disappears
- **EXTRACT** — dissected; named parts survive in new homes, the rest retires
- **EVALUATE** — survival test defined below; decided during v2 alpha with evidence
- **RETIRE** — deleted
- **BUILD NEW** — capability with no v1 counterpart, built for v2
- **FIX** — mechanical correction; no design change

---

## 1. precision-engine (12 tools)

The flagship, dissected hardest because it contains both the best and the worst of v1.

### 1.1 `precision_read` — EXTRACT

| Component | Disposition | Notes |
|---|---|---|
| `extract:outline` | **KEEP** → intel `code_read` | The premise's proof point (−66% measured, zero follow-ups). Fix: honest `exported` flags (currently marks private members exported); enforce `output.max_tokens` (currently ignored — 104KB context-bomb observed). |
| `extract:lines` + `range` | **KEEP** → intel `code_read` | Verified excellent. Fix: honor `include_line_numbers` (currently ignored in lines mode); key batch results by entry, not path (same-path range reads currently collapse). |
| `extract:content` (full-file) | **RETIRE** | Native Read wins at every size at defaults; even tuned it wins only ≥14.9% on large files. Not worth carrying a second full-file reader for that margin — outline+ranges is the product. |
| `extract:symbols` | **RETIRE** | Output larger than the raw file, wrong export flags. Native LSP owns symbol truth. |
| `extract:ast` | **EVALUATE** | Test: does any real workflow use raw AST dumps that structural grep doesn't serve better? If no evidence by alpha end, retire. |
| PDF/notebook/image branches | **RETIRE** | Native Read handles all three natively now. |
| `token_budget` pagination | **REBUILD** | Concept useful for huge files; implementation double-pays (content + lines arrays). One representation per response. |
| Size gate | **KEEP** with fix | UTF-8-safe truncation (currently can split multi-byte chars mid-character). |
| `normalizePath` git-bash rewrite | **RETIRE** | Mangles legitimate Linux `/x/...` paths into drive letters. Replace with plain resolution + `base_path`. |
| File cache | **REBUILD** — see §7.1 | Stub-on-read deleted; freshness metadata + probe mode survive. |

### 1.2 `precision_grep` — KEEP (the crown jewel), with the cap layer rebuilt

Keeps: multi-query batched execution with keyed results, `count_only`/`files_only`/`locations`/`matches`/`context` formats, `expand_to` (block/function/class), AST structural queries (ast-grep), `preview_replace`, `negate`, `max_line_length`, per-file `match_count`.

Fixes (all root-caused): per-file `--max-count` leaking into `count_only` totals; `max_total_matches` ceiling making `max_results` unreachable in `files_only`; `truncated` computed against the wrong cap (false-positives on nearly every search, hardcoded `false` in negate); `match_count` counting submatches while caps count lines; real `.gitignore` reading. `ranked` (doubles output for near-zero signal) and `relationships` (analyzes the wrong symbol): **EVALUATE** — survival test: correct, cheap signal demonstrated by alpha end, else both retire.

### 1.3 `precision_glob` — KEEP

Keeps: `with_stats` (byte sizes for read planning — no native equivalent), filters (size/date/content), sorting. Fixes: `respect_gitignore` must actually read `.gitignore` (fast-glob backend never does); un-anchor `DEFAULT_EXCLUDES` (node_modules currently leaks at defaults); honest counts above the 100 cap.

### 1.4 `discover` — RETIRE

Its three jobs all have better homes: multi-query batching lives in `precision_grep`/`precision_glob` natively; symbols go to native LSP; the auto-injected project index is corrupt and unrequested (§7.4). The audit also found it silently ignores its published `verbosity` parameter and drops truncation signals. Nothing here earns a fourth search tool's schema weight.

### 1.5 `precision_edit` — RETIRE, with two EXTRACTs

Native Edit is trained-fluent and doesn't carry this implementation's confirmed defects (silent CRLF→LF conversion on every successful edit; rolled-back edits reported as `applied`/`success:true`; unwired verbosity; dead OCC). Extracted survivors: (a) `preview_replace` already lives in grep — keep it there; (b) the AST/structural match-and-replace engine (ast-grep) is genuinely differentiated — park it as a **v2.1 candidate** `structural_edit` tool, shipped only if rebuilt with honest rollback reporting and newline preservation, and only after intel v2.0 proves the demand.

### 1.6 `precision_write` — RETIRE

Native Write wins. The thoughtful part (safe-overwrite layer with git-status-aware backups) solves a problem the harness's read-before-write tracking already solves. The atomic multi-file transaction cannot restore overwrites when `backup:false` (confirmed silent-data-loss path) — not worth rebuilding when native + git provide the recovery story.

### 1.7 `precision_exec` — RETIRE, with two documented EXTRACTs

Native Bash + `run_in_background` + Monitor cover the core. Two features were genuinely good and are worth preserving as ideas, not as a shell reimplementation: (a) `expect` assertions (declarative exit-code/stdout gates — caught real regressions across dozens of agent runs) and (b) streaming `until` patterns with promote-to-background. Both are documented as workflow-template patterns in v2; a tiny standalone `run_until` utility is a v2.1 candidate only if the templates prove insufficient. Confirmed defects retiring with it: minimal-verbosity stdout omission, batch-wide background flag, shell-PID-only `bg_stop`, orphaned processes after restart.

### 1.8 `precision_fetch` — EXTRACT (the split settled in review)

| Component | Disposition | Notes |
|---|---|---|
| Web-page reading (readable/markdown/summary extraction) | **RETIRE** | Lost to native WebFetch in live use: SPA junk, uncappable 51–79KB responses, cosmetic `summary`. |
| HTTP client (methods, batch, body types, params) | **REBUILD** → connect `api_request` | Renamed so nobody mistakes it for a page reader. Fixes: per-URL error isolation (one malformed spec currently fails the batch), timeout on the 401-retry, working response capping/pagination, honest extract-mode names. |
| Service registry + auth (`goodvibes.secrets.json`) | **KEEP** → connect | The best-engineered feature in the plugin: 0600 secrets, `{$env}` indirection, triple gitignore guard, bounded tiered 401 recovery, credential-free summaries, purge-on-remove. |
| Trust boundary | **BUILD NEW** | Per review decisions: credential pinning to registered origins (invariant, never toggleable); destination allowlist default-on; open mode = human-only toggle, ephemeral by default, signalled by a `mode: open` envelope stamp + session-start announcement (guaranteed) plus a statusline badge where the user's statusline opts into goodvibes state during setup; `dangerously_persist_across_sessions` as a separate loud key that re-announces every session; per-service read-only default with explicit write-methods opt-in; response redaction pass for known secret values. |

### 1.9 `precision_symbols` — RETIRE

Native LSP (`documentSymbol`, references, diagnostics) owns this. The v1 implementation's export detection is confirmed wrong.

### 1.10 `precision_notebook` — RETIRE

Native NotebookEdit exists; the v1 position-blind `indexOffset` can silently edit the wrong cells in mixed-order batches, and it bypasses path validation. The nbformat craftsmanship is real but duplicative.

### 1.11 `precision_agent` — RETIRE, one EXTRACT

Native subagents/Workflows own headless spawning, and the hardcoded `--dangerously-skip-permissions` is disqualifying as shipped. Extract: the **dossier generator** (scope/keyword-filtered memory + stack detection injected into a spawn) is a good idea — it survives as the lean SubagentStart pointer injection (§8) and as a documented workflow-template pattern.

### 1.12 `precision_config` — REBUILD (minimal)

v2 intel/connect need a small config surface: defaults, caps, telemetry opt-in, connect-mode status. It ships as a config file plus `/goodvibes:plugin` / `/goodvibes:services` command surface — **not as an MCP tool** — with read-only mode status echoed in every response envelope; setting the open-mode toggle stays human-only, out-of-band (§1.8). The v1 dotted-key get/set asymmetry and the agent-reachable sandbox toggle do not carry forward. Config keys documented from one source of truth, generated from code.

---

## 2. project-engine (26 tools)

Survival test applied to every tool: *"Would a competent 2026 agent get an equal or better answer by running the obvious CLI or native tool directly?"* If yes, retire.

| Tool | Disposition | Rationale |
|---|---|---|
| `project_code_surface` | **KEEP** → intel | TS-compiler API-surface mapping; differentiated, audit-verified real. |
| `project_code_dead` | **EVALUATE** → intel | Keep only if accuracy-tested against knip on 3 real repos during alpha; the deep review itself used its output (529/37 export figures) successfully, but precision matters here. |
| `project_code_safe_delete` | **KEEP** → intel | Reference-checked deletion is a real agent workflow win. Verify its reference engine is compiler-based, not regex. |
| `project_code_preview_edits` | **ABSORB** | Redundant with grep `preview_replace`; fold any unique diff-preview capability there. |
| `project_code_breaking` | **RETIRE** | Spawns nested `claude` CLI sessions from inside the MCP server — wrong layer, unpredictable cost; a workflow template does this properly. |
| `project_code_semantic_diff` | **RETIRE** | Same nested-session architecture. |
| `project_api_routes` | **KEEP** → intel | Multi-framework parsers (express/fastify/hono/next) are real and differentiated. |
| `project_api_spec` | **KEEP** → intel | Spec generation from parsed routes — pairs with routes. |
| `project_api_validate` | **EVALUATE** | Keep if validation is spec-driven and accurate; retire if it duplicates what running the app's own validators gives. |
| `project_api_sync` | **RETIRE** | Writes code — v2 intel is read-only by design; sync belongs to an agent using native Edit guided by `api_spec` output. |
| `project_db_schema` | **KEEP** → intel | Schema intelligence is read-only structure analysis — on-thesis. |
| `project_db_prisma` | **EVALUATE** | Keep if it does more than wrap `prisma` CLI invocations an agent could run. |
| `project_db_query` | **KEEP** → connect (not intel) | It talks to live databases with credentials — that's connect's job and connect's trust model: registered connection, read-only default, writes opt-in, same open-mode toggle. Praised behavior (loads drivers from target project, honest install hints) carries over. |
| `project_deps_analyze` | **EVALUATE** | Survival test vs `npm ls`/`npm outdated` + native reasoning. |
| `project_deps_circular` | **RETIRE** | Fabricated a cycle from a doc comment (regex import parsing). `madge` exists. |
| `project_deps_upgrade` | **RETIRE** | Mutating action wrapping `npm`; agents do this natively. |
| `project_runtime_logs` | **RETIRE** (decided 2026-07-02) | Was contingent on automation, which is cut. |
| `project_runtime_profile` | **RETIRE** | Executes target-project code inside the shared MCP server process; documented TS path fails. |
| `project_runtime_memory` | **RETIRE** | Same in-process execution problem. |
| `project_security_env` | **EVALUATE** | Keep if it does real env-file/exposure analysis; retire if substring theater (same bar as the commit guard). |
| `project_security_permissions` | **EVALUATE** | Same bar. |
| `project_security_secrets` | **REBUILD or RETIRE** | Prior review's 7 findings were doc examples — detection quality unproven. Either rebuild on entropy + provider-pattern detection with tests (**→ intel**, joining the §11 EVALUATE pool), or retire in favor of gitleaks in CI. No placebo ships in v2. |
| `project_test_coverage` | **RETIRE** | Parses reports an agent can read after running coverage itself. |
| `project_test_find` | **EVALUATE** | Cheap test-file mapping; keep only if measurably better than one glob. |
| `bundle_analyze` | **RETIRE** | Missed the repo's actual 12MB bundle; treats any path as a build dir. |
| `scaffold` | **KEEP** → intel (or plugin command) | Real, consumed by templates. Fix template manifests (§9.5). |

---

## 3. frontend-engine (14 tools) — engine ABSORBED into intel

The engine as a process retires (one node process, one bundled TS compiler in v2). Tools individually:

| Tool | Disposition | Rationale |
|---|---|---|
| `frontend_component_tree` | **KEEP** | Verified accurate live with no running app. |
| `frontend_hook_dependencies` | **KEEP** | Differentiated React static analysis; LSP doesn't do this. |
| `frontend_client_boundary` | **KEEP** | Server/client boundary mapping — real RSC-era value. |
| `frontend_render_triggers` | **KEEP** (verify depth) | Audit classed it real; confirm on 2 external repos in alpha. |
| `frontend_component_state` | **EVALUATE** | Overlaps hook_dependencies; merge if >50% shared output. |
| `frontend_error_boundaries` | **EVALUATE** | Cheap if it's the same AST pass; keep as a mode of component_tree rather than a tool. |
| `frontend_event_flow` | **EVALUATE** | Verify accuracy; fold into component_tree output if shallow. |
| `frontend_accessibility_tree` | **EVALUATE** | Static a11y trees are easy to get wrong; test against axe on real components before keeping. |
| `frontend_layout_hierarchy` | **EVALUATE** (as one merged `layout_analysis` tool with the next three) | Static CSS/layout analysis has value only if accurate against Tailwind v4 reality — the audit found v3-era hardcoded tables in this family. |
| `frontend_overflow` | **EVALUATE** | → merged layout_analysis candidate. |
| `frontend_sizing_strategy` | **EVALUATE** | → merged layout_analysis candidate. |
| `frontend_stacking_context` | **EVALUATE** | → merged layout_analysis candidate. |
| `frontend_responsive_breakpoints` | **EVALUATE** | JS-config-only breakpoint detection is stale (v4 is CSS-first); rebuild or fold. |
| `frontend_tailwind_conflicts` | **RETIRE** | Confirmed false positives instructing deletion of legitimate classes. Wrong-edit-inducing. |

Net: 4 keeps, 1 retire, 9 evaluations that should collapse into ≤3 merged tools.

---

## 4. analytics-engine (7 tools) — all KEEP; the engine is v2's second product

| Tool | Disposition | Fixes |
|---|---|---|
| `analytics_query` | KEEP | Correct 50-token session summaries verified live. |
| `analytics_dashboard` | KEEP | tmux TUI works; document it. |
| `analytics_budget` | KEEP+FIX | Replace flat two-rate cost model with per-model + cache-aware pricing (ship a maintained pricing table; the `.cache/model-pricing.json` fetch already exists). |
| `analytics_export` | KEEP | |
| `analytics_tag` | KEEP | |
| `analytics_sync` | KEEP | |
| `analytics_config` | KEEP | |

Engine-level fixes: source token counts from transcript actuals, never from tool self-estimates (measured 1.16–2.41× off); clear production tsc errors; atomic writes on every shared state file it ingests (see agent-tracking, §8).

---

## 5. registry-engine (7 tools) — RETIRE the server

Its reason to exist — 77 deferred tools and 25 undiscoverable skills — is deleted by v2 (≤25 tools behind native ToolSearch; skills flattened into native discovery). Per tool: `search_tools`, `search_skills`, `search_agents`, `get_skill_content`, `get_agent_content`, `recommend_skills`, `skill_dependencies` — all **RETIRE** with the server. The Fuse.js search core and its 380 tests are the best code in the repo; archive with honor, or reuse the lazy-cache pattern in intel. The `_registry.yaml` generation pipeline retires with it except as a build-time docs generator **if** anything still consumes the YAML (nothing at runtime will). The `generated:` timestamp fix ships in v1.x regardless (one line, ends the perpetual dirty tree).

---

## 6. runtime-engine (11 tools + subsystems)

### 6.1 Subsystems (the real dispositions)

| Subsystem | Disposition | Notes |
|---|---|---|
| WRFC loop (phase machine, score gates, fix budgets) | **REBUILD** as an opt-in **workflow template** | In-band loop; refutation-based verdicts (defect list + severity gate) instead of scalar 10/10; grounded checks (tests/typecheck/run) weighted above model opinion; triggered by non-empty diff, never by agent type; capped attempts with the off-by-one fixed (final fix gets reviewed). The well-tested phase-machine logic informs the template design. |
| Directive queue + hook drain | **REBUILD** (only if automation ships) | Disk-backed durable queue; recipient scoping via session id (present in payloads today — use it); provenance on every directive; consumers validate rather than mechanically obey. Acceptance criteria come from the live directive-loop report (`docs/runtime-engine-directive-loop-2026-07-01.md`): emit on completion events only (never PreToolUse in arbitrary sessions), debounce/dedupe wids to one pending chain per work unit, never emit for zero-file chains, cap chain depth so a spawned reviewer cannot mint a new chain without new work. |
| IPC transport (sockets, pointer files, lockfile mutex, hold-drain) | **KEEP** as plumbing under automation | The verified-good engineering. Fix: `session:started` must not wipe sibling state; `killOrphanDaemons` must match on project identity before killing anything. |
| External webhook listener + normalizers (github/slack/ci) | **KEEP** → automation, behind the new trust boundary | Authenticated ingress, per-source scoping, no path from inbound payload to mechanical execution. |
| Time plugin (cron scheduler, active-hours) | **EVALUATE** vs native CronCreate/scheduled agents | Keep only for what native scheduling can't do locally (active-hours windows, offline-local runs). |
| File watcher | **EVALUATE** | Same bar: what does it trigger that native background tasks + hooks can't? |
| Cross-session CoreStateStore | **KEEP** → automation (if it ships) | Debounced disk-backed state is sound. |
| tmux tick-driver + session keystroke driving | **RETIRE** | The brittle stand-in for headless/SDK session driving. If gateway ambitions return (the OpenClaw question), build on the Agent SDK — option (a) from review, explicitly deferred. |
| EventBus/EventProcessor | **KEEP** (slimmed) under automation | Fix double hook-event emission (60 dupes in live log). |
| Watchdogs | **REBUILD** | Must observe whatever the v2 loop actually is; v1's watches a population that doesn't exist. |
| bootstrap.ts | **REBUILD** | Decompose per the prior review's module plan; a dependency-declared component lifecycle replaces the 25-step ordered startup. |
| Auto-review-on-agent-type triggers | **RETIRE** | Reviewed zero-change work twice this session (~74k tokens for two 10/10s of nothing). Diff-triggered only, in the template. |

### 6.2 MCP tools

| Tool | Disposition |
|---|---|
| `runtime_status` | **REBUILD** → automation `status` — and absorb the prior review's diagnostic-report idea (daemon/PID/socket/queue-depth/last-crash in one call). |
| `runtime_daemon` | **REBUILD** → automation lifecycle control. |
| `runtime_state` | **KEEP** → automation (state store access). |
| `runtime_config` | **REBUILD** → automation config (the string-coercion fix from 2026-06-30 carries forward). |
| `runtime_external` | **KEEP** → automation (webhooks, behind auth). |
| `runtime_schedule` | **EVALUATE** (with time plugin). |
| `runtime_triggers` | **REBUILD** slim (trigger CRUD for watcher/webhook/schedule only). |
| `runtime_events` | **KEEP** slim (event log read — feeds analytics too). |
| `runtime_emit` | **EVALUATE** — manual event injection is a debugging tool; keep behind a dev flag if at all. |
| `runtime_workflow` | **RETIRE** (native Workflow tool + the WRFC template own this). |
| `runtime_agents` | **RETIRE** (agent tracking moves to the hook + analytics pipeline). |

**DECIDED 2026-07-02:** automation is cut before alpha, so this section collapses as anticipated. The WRFC template ships (no daemon required); every KEEP/REBUILD/EVALUATE above that pointed at automation moves to RETIRE. The v1.11 directive-scoping fixes stay in place for as long as v1 runs; the gateway ambition stays deferred (question 3).

---

## 7. Cross-cutting machinery

### 7.1 File cache — REBUILD as three features (settled in review)
1. **Freshness metadata on normal responses**: deliver content, attach `unchanged_since_last_read`/hash. Information, never refusal.
2. **Explicit probe mode**: "did these files change?" with no content — caller opts into contentlessness.
3. Stub-on-read behavior: **deleted**. `tokens_saved` self-crediting: **deleted**. (The edit-staleness OCC guard retires with precision_edit; if `structural_edit` ships in v2.1 it gets a content-hash precondition.)

### 7.2 Response envelope + accounting — REBUILD
Compact JSON (no pretty-printing — measured pure tax), one representation per payload, `token_estimate` computed from the rendered payload (must land within ~10%), `output.max_tokens` enforced everywhere, `truncated` true only when truncation happened, plus `effective_caps` echoed whenever any cap trims output. The per-response cost metadata concept is a KEEP — it's the right idea with wrong numbers today.

### 7.3 Telemetry / precision_id / KVState instrumentation — KEEP
Feeds analytics (a keep). Fix accuracy at the source (7.2) and make every shared-state write atomic.

### 7.4 Project index — RETIRE
Corrupt on disk today, trusted by consumers without validation, auto-injected unrequested. `glob with_stats` serves the planning use case honestly. If a persistent index returns later it needs validation on load and an explicit opt-in.

### 7.5 `.goodvibes/` state — KEEP with REBUILD of logging
Memory JSONs (decisions/patterns/failures/preferences) are genuinely useful cross-session — KEEP, document as a feature. Logs: rotation + size caps (activity.md is 1.2MB/54k lines), and debug output (`SQLiteStore: saved to disk` spam from the TUI) never interleaves into human logs again — levels route to separate files. The `.overflow/` spill dir: KEEP (it saved this review's data more than once), with an age-based cleanup.

### 7.6 Secrets file (`goodvibes.secrets.json`) — KEEP → connect (§1.8)

---

## 8. Hooks (15 registrations, 11 events — every one)

| Registration (event · matcher · script) | Disposition | Notes |
|---|---|---|
| PreToolUse · `*` · `pre-tool-use-directive-drain.mjs` | **REBUILD** (only if automation ships) | Well-built IPC; fix recipient scoping (session id), drop the nonexistent `is_subagent` guard. Otherwise RETIRE. |
| PreToolUse · `Bash` · `tool-update.mjs` | **RETIRE** | Logs every command verbatim to world-readable tmp; auto-approves its own rewrites. |
| PreToolUse · `Read\|Edit\|Write\|Glob\|Grep\|WebFetch` · `dist/pre-tool-use.js` | **RETIRE** | The native-tool blocker. Note: Bash was never routed here, so the shell-safety analyzer, git quality gates, platform path mapping, and MCP validators inside are dead code — they retire with it (the one salvage candidate is the commit guard, below). |
| PreToolUse · `Bash` · `secrets-commit-guard.mjs` | **REBUILD or RETIRE** | Current substring matching is a placebo. If rebuilt: real detection with tests, **warn-only by default**, with deny available solely as a user-enabled strict mode — preserving the §11 no-blocking invariant except where the user opts in. Otherwise delete and run gitleaks in CI. Nothing placebo ships. |
| PostToolUseFailure · `Bash` · `dist/post-tool-use-failure.js` | **KEEP** | Model hook citizen: ~330B, fires only on real failures, useful suggestions. |
| SessionStart · `*` · `dist/session-start.js` | **EXTRACT** | Context-gathering half KEEPs (conditional health/TODO/memory injection — verified disciplined); CLAUDE.md/prompt-chain writing half moves to an explicit `/goodvibes:plugin install-prompts` command with uninstall. Gather in background/cache to fix the 10s-timeout silent loss; fix the injection schema (`hookSpecificOutput.additionalContext`). Gains the open-mode announcement duty (§1.8). |
| Setup · `init` · `dist/setup.js` | **KEEP** (verify) | Legitimate one-time setup home — and the consent point for anything that writes outside the project. |
| SessionEnd · `*` · `dist/session-end.js` | **KEEP** (slim) | Flush state/telemetry; nothing else. |
| SubagentStart · `*` · `dist/subagent-start.js` | **KEEP+FIX** | Role-scoped injection shrinks from ~1.8KB of doctrine to pointers ("load skill X for task Y"). |
| SubagentStop · `*` · `dist/subagent-stop.js` | **EVALUATE** | Justify its ~1.5KB injection or slim to telemetry-only. |
| PreCompact · `*` · `dist/pre-compact.js` | **EVALUATE** | Pre-compaction state snapshot is a reasonable idea; verify it does that and only that. |
| Stop · `*` · `dist/stop.js` | **EVALUATE** | Directive-completion bookkeeping; retires or moves under automation with the queue. |
| Notification · `*` · `dist/notification.js` | **EVALUATE** | Justify per the same bar: observe/inform only. |
| UserPromptSubmit · `*` · `dist/user-prompt-submit.js` | **RETIRE** | Confirmed no-op that spawns a node process per prompt. |
| UserPromptSubmit · `*` · `user-prompt-submit-directives.mjs` | **REBUILD** with the drain hook (or RETIRE with it) | Same scoping fix. |

Cross-cutting hook fixes: `agent-tracking.json` writes become atomic (feeds analytics); all hooks keep the verified fail-open discipline; tracked-dist strategy stays (it's honest — byte-identical rebuild verified) with a CI check that src and dist match.

---

## 9. Content

### 9.1 Skills (25) — ALL flatten to `skills/<name>/SKILL.md` first (they are currently invisible to Claude Code)

**Protocol tier:**
| Skill | Disposition |
|---|---|
| precision-mastery | **REBUILD** — rewritten for the v2 intel/connect tools and honest defaults; on-demand, never always-on. |
| gather-plan-apply | **RETIRE** — 2025-era ritual the harness + models now handle; one paragraph of it survives inside the intel skill ("plan batch reads with with_stats"). |
| review-scoring | **REBUILD** — becomes the refutation-based review rubric shipped with the WRFC workflow template. |
| goodvibes-memory | **KEEP+FIX** — documents the `.goodvibes/memory` feature that survives (§7.5). |
| error-recovery | **RETIRE** — its useful content is two paragraphs; fold into precision-mastery's successor. |

**Orchestration tier:** task-orchestration — **REBUILD** around native Workflow + the WRFC template (v1 text predates native workflows). fullstack-feature — **RETIRE** (decided 2026-07-02): a generic feature checklist a 2026 model doesn't need.

**Outcome tier** (ai-integration, api-design, authentication, component-architecture, database-layer, deployment, payment-integration, service-integration, state-management, styling-system, testing-strategy) — **DECIDED 2026-07-02:** these skills existed to serve the v1 agent roster, which consolidates to ~4. The outcome tier **retires except `service-integration`**, which is rewritten for connect. A 2026 model doesn't need the rest, and nothing ships with a stale model table.

**Quality tier:** code-review — **RETIRE** (native /code-review + the WRFC template). **DECIDED 2026-07-02: `project-onboarding` survives**, rewritten around intel's analyzers; security-audit, accessibility-audit, performance-audit, debugging, and refactoring **retire** — they served the v1 agents, and the consolidated roster doesn't need them. Validation scripts across all tiers: **RETIRE** the keyword-presence checks (confirmed theater); keep only scripts that run real commands with real assertions.

### 9.2 Agents (11) — consolidate to ~4

| Agent | Disposition |
|---|---|
| engineer | **KEEP+FIX** — strip the trigger-word wall and the ~40% duplicated boilerplate; current frontmatter spec. |
| reviewer | **REBUILD** — refutation-based (defect list + severity, tries to disprove the work), shipped as the WRFC template's reviewer. |
| tester | **KEEP+FIX** — drop the "100% coverage, no skips" absolutism for honest risk-based coverage language. |
| architect + planner | **ABSORB** into one `architect` — audit confirmed near-identical delegation descriptions. |
| deployer | **EVALUATE** — native agents + deployment skill may cover it. |
| integrator-ai / integrator-services / integrator-state | **RETIRE** as agents — they are domain prompts wearing agent frontmatter; surviving content folds into the corresponding outcome skills. |
| agent-factory / skill-factory | **EVALUATE** — keep only if they produce spec-current output (audit found agent-factory instructing WebFetch use against the plugin's own policy — symptomatic of drift). |

### 9.3 Commands (7 + 1 backup)

| Command | Disposition |
|---|---|
| /goodvibes:analytics | **KEEP** (product UX for analytics). |
| /goodvibes:services | **KEEP+EXTEND** — gains the restrict/open toggle management + status display. |
| /goodvibes:plugin | **KEEP+FIX** — gains install-prompts/uninstall; fix the nonexistent `update.ps1` reference and the phantom `plugin_status` tool mention. |
| /goodvibes:codebase-review | **REBUILD** — becomes the entry point for the WRFC workflow template (the deep-review architecture, productized). |
| /goodvibes:sandbox | **REBUILD or RETIRE** — the precision sandbox it toggles is retiring; either repurpose as the connect-mode command (redundant with /services) or delete. |
| /goodvibes:search | **RETIRE** with registry-engine. |
| /goodvibes:load-skill | **RETIRE** — flat skills load natively; the escape hatch's reason to exist disappears. |
| services.md.backup | **RETIRE** (delete from tree; add ignore rules for `.backup`/`.tmp`). |

### 9.4 Output styles (justvibes.md/.yaml, vibecoding.md/.yaml) — RETIRE all four

The mechanism is deprecated platform-side, both styles omit `keep-coding-instructions` (selecting them strips the built-in engineering instructions), they contradict themselves internally, and the "Implicit Permissions" clause is deleted on principle. The genuinely useful content — autonomous-execution etiquette, checkpoint discipline — survives as a short `autonomous-mode` skill compatible with whatever the platform's current customization surface is. The 87%-identical vibecoding fork is not carried anywhere.

### 9.5 Templates

| Item | Disposition |
|---|---|
| `templates/full/`, `templates/minimal/` (scaffold sets) | **KEEP** — consumed by `scaffold`. Fix: the manifest lists 3 phantom files; replace all-`latest` dependency pins with tested versions (the Tailwind setup is likely broken at scaffold time as-is). |
| `templates/prompt/` (7 files) | **EXTRACT** — these are the masters for the prompt chain, which retires as always-on. The compact ~85%-smaller fallback versions already in `claude-md-manager.ts` become the basis for the on-demand skill content; UPGRADE-NOTIFICATIONS (which deprecates a tool that doesn't exist) is deleted outright. |
| `templates/_registry.yaml` | **RETIRE** — generated but never read. |

### 9.6 Prompt chain (`~/.claude/.goodvibes/**` + CLAUDE.md import) — RETIRE as a mechanism

Installed only by explicit command, removed by explicit command, and even then: a pointer paragraph, not 6,070 tokens of doctrine. Target steady-state fixed tax: **≤1,500 tokens** main session, **≤500 per subagent** (from 13,530 and 7,215 today).

---

## 10. Packaging, install, and process

| Item | Disposition |
|---|---|
| Marketplace install path (committed dist, spec-conformant manifests) | **KEEP** — verified robust by construction. Fix `marketplace.json` version (1.0.0 vs 1.10.4) and make plugin.json the single version source. |
| npm `postinstall` chain (build + install:hooks) | **RETIRE** — heavy install-time execution; marketplace path doesn't need it. Explicit setup command instead. |
| `scripts/install-hooks.js` → `.claude/hooks.json` | **RETIRE** — writes a file the platform never reads; the committed artifact is deleted. |
| `scripts/release/install-plugin.sh` / `.command` / `.bat` | **FIX or RETIRE** — the two Unix installers are syntactically broken (unclosed `if`); the `.bat` sibling shares their fate; if the marketplace path is canonical, delete all three. |
| `update/update.sh` (+ the referenced-but-nonexistent `update.ps1`) | **REBUILD** — one cross-platform update path, or defer entirely to marketplace updates. |
| `bin/` (mcp-cli-auto.cjs, mcp-cli.cmd, test-auto-escape.sh) | **RETIRE** — unreferenced payload. |
| `scripts/build-registries.ts` | **RETIRE** with registry-engine (timestamp fix ships in v1.x regardless). |
| `plugins/goodvibes/scripts/validate.ts` | **EVALUATE** — keep as a CI content-validation check if it validates things v2 still ships; otherwise it retires with the registry pipeline. |
| `npm run migrate` (`__dirname` ESM crash) | **FIX or RETIRE** with whatever it migrates. |
| Root `src/` placeholders, tracked `.backup`/`.tmp`/`temp_check` files | **RETIRE** (prior review's list; still true). |
| Version drift (root 1.2.0 / plugin 1.10.4 / badges 1.9.0 & 1.4.0 / RELEASE.md 1.10.0 / engines assorted) | **FIX** — single source of truth + CI consistency check. |
| Vitest v2/v4 skew, TS version skew across packages | **FIX** — workspace-level dependency policy. |

**Release gates for v2.0 (all red today, all must be green):**
1. CI exists and gates typecheck (0 errors — currently 607 in precision-engine alone), lint (burned down from 2,442), and tests (root `npm test` currently deadlocks — fix the hooks vitest pool hang; runtime-engine's 9 threshold-drift failures fixed).
2. A regression test per field-defect class (all seven currently untested; one is asserted as correct — that test dies).
3. Envelope-accounting tests: `token_estimate` within 10% of rendered payload on fixture responses; `max_tokens` enforcement; `truncated` truthfulness.
4. Determinism: registry/docs generation produces zero diff on repeat runs.
5. The measurement suite from the deep review re-run against v2 defaults: intel must beat the native model on its kept operations *at defaults*, or the claim comes off the README.

---

## 11. Resulting v2.0 surface

**goodvibes-intel (13 named + up to ~4 EVALUATE survivors ≈ 13–17 tools):** `code_read` (outline/lines), `code_grep`, `code_glob`, `code_surface`, `code_safe_delete`, `api_routes`, `api_spec`, `db_schema`, `component_tree`, `hook_dependencies`, `client_boundary`, `render_triggers`, `scaffold`, plus whichever EVALUATE candidates pass their survival tests — expected to be dominated by the merged `layout_analysis`, `code_dead`, and a rebuilt `security_secrets`. The frontend EVALUATEs collapse into at most 3 merged tools and count against this same allowance. (The project-onboarding pairing lives under Skills, not the tool pool.)

**goodvibes-analytics (7 tools):** unchanged surface, fixed inputs and pricing.

**goodvibes-connect (~3 tools):** `api_request`, `service` (registry CRUD), `db_query`; plus `/goodvibes:services` UX and the restricted/open toggle system.

**goodvibes-automation: CUT (decided 2026-07-02).** Does not reach alpha. runtime-engine retires whole; WRFC ships as a workflow template only.

**Skills:** ~6–8 flat, on-demand. **Agents:** ~4. **Commands:** 4–5. **Hooks:** 5–8 (5 unconditional keeps + up to 3 survivors of the EVALUATE/conditional set), all observe/inform/assist — zero block/rewrite/steer, with one user-opted exception (the secrets guard's strict deny mode, if rebuilt and enabled). **Output styles:** 0. **Always-on prompt:** ≤1,500 tokens. **Processes per session:** 2 (intel, analytics) + connect on demand, vs 6 today.

Headline math: 77 tools → ~23–27 (plus automation's ~7–10 only if it ships). Six servers → three, with two always-on processes per session. Fixed tax 13,530 → ≤1,500. Every kept claim measured, every kept tool tested.

---

## 12. Sequencing

**v1.11 (maintenance, ~1 week):** the trust items (CLAUDE.md rewrite → explicit command; remove the hardcoded permissions-skip flag; delete tool-update.mjs; scope directives by session id), registry timestamp, defaults flip + compact envelope + honest accounting (these help v1 users immediately and de-risk v2), unbreak root test, CI skeleton.

**v2.0-alpha (~3–4 weeks):** carve out intel/connect/analytics into their packages; run every EVALUATE with its written survival test; flatten skills; build the WRFC workflow template; port the measurement suite as the regression harness.

**v2.0:** retire everything in the RETIRE column, ship the three products, rewrite the README around what is true: *structure-aware code intelligence, session cost telemetry, and a proper API workbench — opt-in, measured, and honest about when native tools are the right choice.*

## 13. Open questions for Mike

1. ~~Does automation ship?~~ **ANSWERED 2026-07-02: cut.** Mike delegated the call with no standing usage to defend it; ruling recorded in §0/§6/§11.
2. `structural_edit` in v2.1 — is AST-pattern editing worth re-entering the write path for, given the reporting/newline lessons?
3. The gateway ambition (the OpenClaw conversation): deferred, not rejected — revisit after v2.0 ships, on the Agent SDK if at all.
4. ~~Which outcome/quality skills do you reach for?~~ **ANSWERED 2026-07-02:** the skills existed for the agents; with the roster consolidating, only `service-integration` and `project-onboarding` survive (rewritten). Ruling recorded in §9.1.
