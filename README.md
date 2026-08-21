# GoodVibes

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.3.4-blue.svg)](https://github.com/mgd34msu/goodvibes-plugin)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-purple.svg)](https://claude.com/claude-code)

> Plug in. Receive good vibes.

One Claude Code plugin, three MCP servers, 25 tools: **structure-aware code
intelligence**, **session cost analytics**, and an **API workbench**. These
are opt-in capabilities the native harness doesn't have. The docs stay honest
about the many things the harness already does well.

## What it is

| Server | Tools | What it does |
|---|---|---|
| **intel** | 15 | Structure-first code reading (`code_read` outline/ranges), multi-query search (`code_grep` with count/locations formats, AST structural queries, `expand_to`, `preview_replace`), `code_glob` with per-file stats, TypeScript API-surface and safe-delete analysis on a single compiler host, API route/spec/contract analyzers, DB schema intelligence with Prisma usage analysis, React component/hook/boundary analyzers, a merged layout analyzer, project scaffolding, and `structural_edit`, the one write tool, preview-gated |
| **analytics** | 7 | Per-session and cross-project token/cost analytics from transcript actuals with per-model cache-aware pricing, budgets, tags, export, and a self-contained HTML report (`dashboard {"action":"report"}` writes it to `.goodvibes/reports/`). Live modes: `query {"mode":"live_cost"}` prices the running session, `"doctor"` surfaces host load and orphaned processes with ready-to-run cleanup commands (never auto-runs them), `"agents"` classifies background agents as thinking, executing, or wedged |
| **connect** | 3 | `api_request` (batched HTTP with per-entry error isolation), `service` (a credential registry: 0600 secrets file, env-var indirection, bounded OAuth2 refresh), `db_query` (live databases under the same trust model) |

## Measured, not promised

Every performance claim in this README was measured against the native tool
baseline at **default settings**, with ground-truth verification. The
benchmark harness ships in `packages/intel/bench/` so you can rerun it:

- `code_read` outline: **−40% to −72%** of the token cost of a full native read, sufficient to answer structure questions with zero follow-up reads
- `code_grep` files mode: **−63%** vs native search with identical match counts (76 = 76)
- Responses self-report their cost (`token_estimate` computed from the actual rendered payload), enforce `output.max_tokens`, and set `truncated`/`effective_caps` only when something was actually trimmed

If a claim stops being true, it comes out of the README. That's the policy.

## Design principles

- **Native tools are never blocked, redirected, or deprecated.** These are additions, not replacements. Use whichever tool wins for the job.
- **Hooks observe, inform, and assist. Zero hooks block, rewrite, or steer.** All are fail-open: a broken hook can never brick a tool call.
- **Servers live for the life of your session.** No idle self-exit, ever (regression-tested). Orphan defense is a parent-liveness watchdog that fires only when the session itself dies.
- **Every tool runs under a per-request time budget** and returns an honest partial rather than hanging a client forever.
- **connect is restricted by default**: credentials are pinned to their registered origins (never toggleable), destinations are allowlisted, writes are per-service opt-in, and "open" mode is a human-only, ephemeral toggle that announces itself every session it persists.
- **State is namespaced** under `.goodvibes/` in your project; outside it the plugin writes only its own dependency home under `~/.claude/.goodvibes/` (`/goodvibes:plugin install-prompts` remains opt-in and has a real uninstall).

## Install

```bash
claude plugin marketplace add mgd34msu/goodvibes-plugin
claude plugin install goodvibes@goodvibes-market
```

Restart Claude Code to activate the servers. Tool schemas load on demand when
your client has Tool Search active (the default in current Claude Code); the
fixed context cost is the tool names only.

Native dependencies install automatically in the background: the first session
after install spawns a detached installer and the tools are ready next session.
Installs live in `~/.claude/.goodvibes/deps/` and survive plugin updates. The
SessionStart hook relinks them automatically. If the background install fails,
one line points at the log and `/goodvibes:setup`, the manual foreground repair
path. Until an install lands, the servers still boot and every non-native
capability works; anything that needs a native dependency returns an honest
"run /goodvibes:setup" message instead of failing.

## Commands

- `/goodvibes:plugin`: status, native-dependency repair, prompt-pointer install/uninstall
- `/goodvibes:setup`: re-run the native dependency install in the foreground (repair path)
- `/goodvibes:analytics`: session cost, HTML report, budgets, doctor, agent liveness
- `/goodvibes:services`: connect's registry and the restricted/open toggle
- `/goodvibes:codebase-review`: an in-band review-then-fix workflow with refutation-based verdicts and grounded checks

## History

GoodVibes v1 was a 77-tool replacement harness built in an earlier era of
Claude Code. A measured deep review found its best ideas had been absorbed by
the platform and its policy layer cost more than it saved, so v2 kept the
verified winners, fixed every field defect (all nine are regression-tested),
and retired the rest. The complete v1 lives forever on the
[`v1` branch](https://github.com/mgd34msu/goodvibes-plugin/tree/v1); the full
investigative record (the deep review, the field-issue reports, the plan)
lives in [`docs/history/`](docs/history/). The living architecture record is
[`docs/goodvibes-plan.md`](docs/goodvibes-plan.md) and
[`docs/carveout-architecture.md`](docs/carveout-architecture.md).

## Versioning

Semantic versioning from 2.0.0: patches for fixes, minors for features,
majors for breaking changes.

## License

MIT
