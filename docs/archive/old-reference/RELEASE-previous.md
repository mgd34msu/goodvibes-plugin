# Release Notes: v1.2.0

**Release Date:** 2026-02-09

This is a minor release featuring a complete precision-engine overhaul with 34+ E2E bug fixes (from 319 tests to 562 tests), a new authentication and service registry system for precision_fetch, new tools (precision_notebook, precision_config), agent architecture improvements, and comprehensive documentation updates. 661 files changed, 381,431 insertions, 27,918 deletions.

---

## Highlights

### 1. Precision Fetch Authentication & Service Registry

precision_fetch now supports service registry integration for named APIs with auto-auth, per-request auth (bearer, basic, API key, custom headers), OAuth2 browser flow, token refresh, cookie jar, rate limiting, and 401 auto-retry. 12 extraction modes (up from 3): raw, text, json, markdown, structured, summary, code_blocks, tables, links, metadata, readable, pdf.

### 2. Precision Engine Hardening

34+ E2E bugs fixed across 8 rounds of remediation with all tools achieving 10/10 review scores. Test suite grew from 319 to 562 tests. New subsystems: FileStateCache with OCC and LRU, context intelligence, batch pagination, safe overwrite, progress reporting, smart retry, and process manager.

### 3. New Tools: precision_notebook & precision_config

precision_notebook for Jupyter notebook cell editing with cell_id targeting (nbformat 4.5+). precision_config for runtime configuration management with sandbox toggle.

### 4. Agent Architecture Overhaul

Integrator agent split into 3 domain-specific agents (integrator-ai, integrator-services, integrator-state). All 11+ agents standardized with memory/logging, precision tools reference, DBE loops, and enhanced decision frameworks.

---

## Features

### Precision Fetch (Authentication & API)

- feat(precision-fetch): Integrate auth orchestrator into fetch handler
- Auth orchestrator with multi-strategy support (static, OAuth2, session-based)
- OAuth2 browser flow with token refresh
- Cookie jar with stale eviction
- Service registry for named API auto-auth and base URL resolution
- Request builder with query params, body encoding (json/form/multipart/raw)
- Rate limiter for API compliance
- Redirect tracker with full chain history
- Secrets guard and secrets store for credential protection
- Content type detection and format negotiation
- 12 extraction modes: raw, text, json, markdown, structured, summary, code_blocks, tables, links, metadata, readable, pdf
- CSS selector-based structured data extraction
- PDF response parsing
- Readability extraction (Mozilla Readability for article content)

### Precision Engine Core

- feat(precision-engine): FileStateCache with optimistic concurrency control (OCC), LRU eviction, and handler integration
- feat(precision-engine): Context intelligence for smart file suggestions and batch pagination
- feat(precision-engine): Safe overwrite modes (fail_if_exists, overwrite, backup)
- feat(precision-engine): ProcessManager for background execution with SessionState and CommandHistory
- feat(precision-engine): Progress reporting and smart retry engine
- feat(precision-engine): precision_grep enhancements (negation, pagination, ranking, relationships, stats, replace preview)
- feat(precision-engine): Token estimation fix and type system improvements

### New Tools

- feat(precision-notebook): Add cell_id targeting with metadata fallback for Jupyter notebooks
- feat: add precision_notebook tool for notebook cell editing
- feat: add precision_config tool for runtime configuration management

### File Type Support

- feat: add image, PDF, and notebook (.ipynb) support to precision_read
- Image files returned as MCP ImageContent blocks for visual inspection
- PDF files with per-page text extraction via `pages` parameter
- SVG files return both text content and image_base64

### Infrastructure

- feat: add runtime sandbox toggle for precision-engine external path access
- feat: extend sandbox path enforcement to all precision-engine handlers
- feat: add key-initialization persistence and harden runtime-config
- feat: add fix_attempt strategy to output styles
- feat: add GoodVibes memory and logging sections to all agents
- feat: add token-efficient precision tools reference to all agents
- feat(agents): add Output Requirements, Skills Library, Decision Frameworks, Context Injection

---

## Bug Fixes

### E2E Bug Fix Rounds (34+ individual bugs)

- fix(precision-engine): Fix 13 E2E bugs — all 10/10 review scores, 544 tests pass
- fix(precision-engine): Fix 9 remaining bugs — all 10/10 review scores, 544 tests pass
- fix(precision-engine): Fix 7 E2E bugs across 4 tools — all 10/10, 511 tests
- fix(precision-engine): Fix 5 E2E bugs across 4 tools — all 10/10, 537 tests
- fix(precision-engine): Final remediation — all 9 items at 10/10, 506/506 tests
- fix(precision-engine): Phase 4 remediation — Items 3, 7, 9 at 10/10, 506/506 tests
- fix(precision-engine): P1-5 remediation — all 14 items at 10/10
- fix(precision-engine): Phase 6+7 final polish — 10/10 review scores, 319/319 tests

Key bugs fixed include:
- format/mode mismatch in MCP schema vs handlers
- Ripgrep --glob silently returning 0 for subdirectory patterns
- Timer leaks in Promise.race
- Cache invalidation using update instead of invalidate
- Zero-length regex guard in global loops
- Image magic byte validation for all 9 formats
- ImageContent suppression in count_only/minimal modes
- Whitespace matching reliability
- Token budget pagination
- Python symbol extraction fallback
- Regex capture group support ($$/&/$`/$')
- near_line + occurrence:all disambiguation

### Auth & Fetch Fixes

- fix(auth-orchestrator): Add try-catch, expired status, edge case tests
- fix(oauth2-browser): Add single-quote escaping, replace string tests with behavioral
- fix(cookie-jar): Fix JSDoc indentation and stale eviction comment
- fix(schemas): Add auth.type description to precision_fetch schema

### Infrastructure Fixes

- fix: eager config initialization at MCP server startup
- fix: setConfigValue reads file before writing to preserve manual edits
- fix: update SEW Loop references to DBE Loop
- fix: remove mcp-cli info reference from CLAUDE.md template
- fix(output-styles): correct justvibes output section consistency

---

## Refactoring

- refactor: split integrator into 3 domain-specific agents (integrator-ai, integrator-services, integrator-state) + fix deployer/skill-factory
- refactor: rename SEW Loop to DBE Loop (Discover Batch Execute Loop)
- refactor: consolidate internal duplication in integrator and planner
- refactor: update MCP tool syntax and remove version references

---

## Documentation

- docs: rewrite README from code-verified data, fix inaccuracies
- docs: overhaul README with accurate counts, user-focused content
- docs(precision-vs-native): comparison document with tool analysis
- Updated precision_fetch schema and narrative descriptions in justvibes.md and vibecoding.md
- Updated precision-fetch.yaml tool definition with full schema

---

## New Files Added (54 new source files in precision-engine)

### Auth system (6 files):
- auth-orchestrator.ts, static-auth.ts, oauth2-browser.ts, oauth2-refresh.ts, session-auth.ts, auth/index.ts

### Fetch subsystem (18 files):
- code-blocks.ts, content-fingerprint.ts, content-type.ts, cookie-jar.ts, css-selectors.ts, format-negotiation.ts, html-utils.ts, links.ts, pdf-routing.ts, rate-limiter.ts, readability.ts, redirect-tracker.ts, request-builder.ts, secrets-guard.ts, secrets-store.ts, service-registry.ts, service-resolver.ts, tables.ts, turndown.ts, structured-data.ts, fetch/index.ts

### State management (5 files):
- file-cache.ts, search-cache.ts, command-history.ts, session-state.ts, process-manager.ts, state/index.ts

### Utilities (11 files):
- context-intelligence.ts, exit-codes.ts, file-suggestions.ts, file-type-detection.ts, fuzzy.ts, grep-negation.ts, grep-pagination.ts, grep-ranking.ts, grep-relationships.ts, grep-replace-preview.ts, grep-stats.ts, lock-detection.ts, overflow-handler.ts, path-validation.ts, progress-collector.ts, retry-engine.ts, safe-overwrite.ts

### New handlers (2 files):
- precision-notebook.ts, precision-config.ts (+ runtime-config.ts)

### New agents (3 files):
- integrator-ai.md, integrator-services.md, integrator-state.md

---

## Stats

| Metric | Value |
|--------|-------|
| Files changed | 661 |
| Insertions | 381,431 |
| Deletions | 27,918 |
| Features | 24 |
| Bug fixes | 21 |
| Test count | 319 → 562 |
| New source files | 54+ |
| Patch versions | v1.1.1 through v1.1.21 |

---

## Changes Since v1.1.0

- v1.1.1: Agent standardization, memory infrastructure
- v1.1.2: Remove mcp-cli reference
- v1.1.3: Plugin.json version sync
- v1.1.4: Registry regeneration
- v1.1.6: Memory path in output styles
- v1.1.7: Runtime sandbox toggle
- v1.1.9: Eager config init, setConfigValue fix
- v1.1.10: WRFC loop scope clarification
- v1.1.11: Image/PDF/notebook support in precision_read
- v1.1.13: precision_notebook tool
- v1.1.14-v1.1.15: E2E bug fixes (7+5 bugs across 4 tools)
- v1.1.16: Registry regeneration
- v1.1.17: Integrator agent split into 3 specializations
- v1.1.18-v1.1.19: E2E bug fixes (13+9 bugs, 544 tests)
- v1.1.20-v1.1.21: Notebook cell_id, auth orchestrator, precision_fetch auth integration

---

## Upgrade Instructions

```bash
/goodvibes:plugin update
```

Then restart your Claude Code session.

---

## Breaking Changes

None. This is a backward-compatible minor release. The `output_mode` parameter in precision_fetch has been renamed to `verbosity` for consistency with other tools - the old parameter name is still accepted via fallback.
