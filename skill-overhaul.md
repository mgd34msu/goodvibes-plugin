# GoodVibes Skill Library Overhaul

## Status: Proposal
## Date: 2026-02-15

---

## Problem Statement

The GoodVibes skill library has 172 technology-specific skills. Session data across 4,186 sessions (376 main + 3,810 subagent) shows:

| Metric | Count |
|--------|-------|
| `get_skill_content` calls | **2** |
| `recommend_skills` calls | **0** |
| `search_skills` calls | **0** |
| `skill_dependencies` calls | **0** |
| `/load-skill` command uses | **0** |

Two skill loads total. One was a precision engine config file, the other was the companion skill (project-specific knowledge). Zero webdev skills have ever been loaded through the MCP system.

When skills ARE used, they're read as direct file reads (the companion skill was read 51 times via `precision_read`), bypassing the registry engine entirely.

The 172 webdev skills (Clerk, NextAuth, Prisma, Tailwind, etc.) have never been loaded, never searched, never recommended. They exist in registry listings that get injected into context, but nobody ever asks for them.

---

## Root Cause Analysis

### 1. Skills duplicate Claude's training data

Claude already knows how Clerk middleware works, how to set up Prisma, how Tailwind classes resolve. A skill file that says "Prisma is an ORM that provides type-safe database access" adds zero value. The only skill that gets used (companion) contains project-specific knowledge Claude CANNOT know from training — GPS integration, ntfy messaging, Home Assistant entities.

### 2. Skills are ingredient labels, not recipes

Anthropic's official skill guide (January 2026) uses a kitchen analogy:

> **MCP provides the kitchen** (tools, ingredients, equipment).
> **Skills provide the recipes** (step-by-step instructions on how to create something valuable).

GoodVibes has an incredible kitchen — 6 MCP engines, 70+ precision tools. But the 172 skills aren't recipes. They're ingredient labels. They describe technologies rather than orchestrating workflows that use GoodVibes' own tools.

### 3. Too many skills cause context bloat

Anthropic explicitly warns:

> "Evaluate if you have more than **20-50 skills** enabled simultaneously"

172 is 3-8x the recommended cap. The registry listings consume tokens in every session without providing value.

### 4. Skills don't match Anthropic's observed categories

Anthropic identifies three skill categories that work:

1. **Document & Asset Creation** — consistent output (style guides, templates, quality checklists)
2. **Workflow Automation** — multi-step processes with consistent methodology
3. **MCP Enhancement** — workflow guidance that teaches Claude how to use MCP tools effectively

GoodVibes' 172 skills are **none of these categories**. They're technology reference docs — a category Anthropic doesn't even list because it doesn't work.

### 5. Poor trigger phrases

Anthropic says the description field is the most important part — it needs WHAT + WHEN + specific trigger phrases. A skill called `clerk` won't fire because Claude doesn't think "I need to load the Clerk skill to use Clerk" — it already knows Clerk. A skill called `authentication` with the trigger "Use when user mentions login, auth, sign-in, session management, JWT, OAuth, or protected routes" would actually fire.

---

## Proposed Architecture

### Philosophy: Skills are MCP Enhancement Workflows

Every skill should be a **Category 3: MCP Enhancement** — a workflow that orchestrates GoodVibes' own precision tools for a specific outcome. Not "here's what Prisma is" but "here's the workflow for setting up a database layer using discover, get_database_schema, precision_exec, generate_types, and validate_implementation together."

### Target: ~20-30 outcome-oriented skills

Replace 172 technology-specific reference docs with ~20-30 opinionated workflow recipes.

### Structure per skill (following Anthropic's guide)

```
skill-name/
├── SKILL.md              # Workflow instructions (<5,000 words)
├── scripts/              # Deterministic validation scripts
│   └── validate.sh       # Code > language for critical checks
├── references/           # Detailed docs (progressive disclosure)
│   └── decision-tree.md  # Framework selection guidance
└── assets/               # Templates, checklists
    └── checklist.md      # Quality gates
```

### Progressive disclosure (three levels)

1. **YAML frontmatter** — Always loaded. Trigger phrases that actually fire. Under 1024 chars.
2. **SKILL.md body** — Loaded when Claude thinks the skill is relevant. Core workflow steps.
3. **references/** — Loaded only when needed. Decision trees, framework-specific details, examples.

---

## Proposed Skill List

### Development Outcomes (~12 skills)

#### 1. `authentication`
Replaces: clerk, nextauth, lucia, auth0, firebase-auth, supabase-auth, passport (7 skills)

Workflow:
- Step 1: `discover` existing auth patterns in codebase
- Step 2: Decision tree — managed vs self-hosted vs serverless (in references/)
- Step 3: `scaffold_project` or `precision_write` the auth layer
- Step 4: `precision_exec` to install and configure
- Step 5: `suggest_test_cases` for auth flows
- Step 6: `scan_for_secrets` to verify no credentials leaked
- Step 7: `validate_implementation` against security checklist

Triggers: login, auth, sign-in, sign-up, session management, JWT, OAuth, protected routes, middleware auth

#### 2. `database-layer`
Replaces: prisma, drizzle, kysely, postgresql, mongodb, redis, supabase-db, planetscale, turso, sqlite (10 skills)

Workflow:
- `detect_stack` → identify existing DB tech
- `get_database_schema` → understand current schema
- Decision tree for ORM choice based on project context
- `precision_write` for schema/migration files
- `generate_types` from schema
- `get_prisma_operations` to check for N+1 patterns
- `query_database` for verification

Triggers: database, schema, migration, ORM, model, table, query, seed, relations

#### 3. `api-layer`
Replaces: trpc, graphql, rest-api, express, fastify, hono, apollo, openapi (8 skills)

Workflow:
- `get_api_routes` → map existing endpoints
- `discover` → find patterns, middleware, validation
- Decision tree for API style based on project needs
- `precision_write` for route handlers
- `generate_openapi` for documentation
- `validate_api_contract` for response verification
- `sync_api_types` to check frontend/backend alignment

Triggers: API, endpoint, route, REST, GraphQL, tRPC, middleware, request handler

#### 4. `testing-strategy`
Replaces: vitest, playwright, jest, testing-library, cypress, storybook, msw, chromatic (8 skills)

Workflow:
- `find_tests_for_file` → discover existing coverage
- `get_test_coverage` → identify gaps
- `suggest_test_cases` → plan what to write
- `generate_fixture` → create test data
- Decision tree for unit vs integration vs E2E
- `precision_exec` with expectations → run and verify
- Quality gate: 100% coverage target, no skips

Triggers: test, testing, coverage, TDD, unit test, integration test, E2E, fixture, mock, assertion

#### 5. `state-management`
Replaces: zustand, jotai, redux-toolkit, tanstack-query, valtio, nanostores, pinia (7 skills)

Workflow:
- `discover` → find existing state patterns
- `trace_component_state` → map current state flow
- `analyze_render_triggers` → identify performance issues
- Decision tree for state approach based on complexity
- `precision_write` for store/hook implementation
- `validate_implementation` → verify patterns

Triggers: state, store, global state, context, reducer, cache, optimistic update

#### 6. `component-architecture`
Replaces: react, vue, svelte, solidjs, preact, web-components + styling skills (15+ skills)

Workflow:
- `get_react_component_tree` → understand hierarchy
- `discover` → find existing component patterns
- `analyze_layout_hierarchy` → understand layout constraints
- `precision_write` for component files
- `get_accessibility_tree` → verify a11y
- `analyze_tailwind_conflicts` → catch styling issues
- `analyze_render_triggers` → verify performance

Triggers: component, page, layout, form, modal, button, card, table, responsive, UI

#### 7. `styling-system`
Replaces: tailwind, styled-components, css-modules, sass, panda-css, vanilla-extract, unocss (7+ skills)

Workflow:
- `detect_stack` → identify styling approach in use
- `analyze_tailwind_conflicts` → find class conflicts
- `analyze_responsive_breakpoints` → audit responsive coverage
- `get_sizing_strategy` → understand layout approach
- `diagnose_overflow` → fix overflow issues
- Decision tree for styling methodology

Triggers: styling, CSS, Tailwind, theme, dark mode, responsive, breakpoint, overflow, z-index

#### 8. `deployment`
Replaces: vercel, netlify, railway, fly-io, aws, docker, kubernetes (7+ skills)

Workflow:
- `detect_stack` → identify framework and requirements
- `read_config` → parse existing deployment config
- `analyze_bundle` → check build output size
- `env_audit` → verify environment variables
- `scan_for_secrets` → pre-deployment security check
- `precision_exec` → run build and deploy
- Decision tree for platform selection

Triggers: deploy, deployment, hosting, CI/CD, Docker, container, production, staging, environment variables

#### 9. `payment-integration`
Replaces: stripe, lemonsqueezy, paddle (3 skills)

Workflow:
- `discover` → find existing payment patterns
- Decision tree for payment provider based on needs
- `precision_write` → webhook handlers, checkout flows
- `scan_for_secrets` → verify API keys not exposed
- `suggest_test_cases` → payment flow edge cases
- `validate_implementation` → security review

Triggers: payment, checkout, subscription, billing, invoice, Stripe, webhook

#### 10. `email-system`
Replaces: resend, sendgrid, postmark, react-email (4 skills)

Workflow:
- Decision tree for email provider
- `precision_write` → email templates, send functions
- `suggest_test_cases` → email delivery edge cases
- `precision_exec` → test email sending

Triggers: email, transactional email, newsletter, email template, notification

#### 11. `content-management`
Replaces: sanity, contentful, strapi, payload, directus (5 skills)

Workflow:
- `discover` → find existing CMS patterns
- Decision tree for CMS selection
- `generate_types` → type-safe content access
- `precision_write` → content fetching, rendering
- `validate_implementation` → verify content pipeline

Triggers: CMS, content management, blog, headless CMS, content model, rich text

#### 12. `file-upload`
Replaces: uploadthing, cloudinary, s3 (3 skills)

Workflow:
- Decision tree for upload strategy
- `precision_write` → upload handlers, components
- `check_permissions` → verify file access patterns
- `suggest_test_cases` → upload edge cases (size limits, types, errors)

Triggers: upload, file upload, image upload, media, S3, cloud storage

### Quality & Process Outcomes (~8 skills)

#### 13. `code-review`
Already exists as `codebase-review` — the most functional skill pattern. Keep and enhance.

Workflow: Multi-agent parallel review with quantified scoring and remediation.

Triggers: review, audit, code quality, technical debt, PR review

#### 14. `security-audit`
Replaces: security-audit-checklist (1 skill)

Workflow:
- `scan_for_secrets` → credential detection
- `env_audit` → environment variable audit
- `check_permissions` → file/network/system access
- `detect_breaking_changes` → API security implications
- `find_dead_code` → attack surface reduction
- Quality gate checklist in scripts/

Triggers: security, audit, vulnerability, secrets, permissions, OWASP

#### 15. `performance-optimization`
Replaces: (no direct predecessor)

Workflow:
- `analyze_bundle` → bundle size analysis
- `analyze_render_triggers` → React re-render detection
- `get_prisma_operations` → N+1 query detection
- `find_circular_deps` → circular dependency detection
- `analyze_dependencies` → unused package detection
- `analyze_responsive_breakpoints` → responsive audit

Triggers: performance, optimization, slow, bundle size, re-render, N+1, lazy loading

#### 16. `accessibility`
Replaces: (no direct predecessor)

Workflow:
- `get_accessibility_tree` → full a11y tree analysis
- `analyze_event_flow` → keyboard interaction audit
- `get_react_component_tree` → semantic structure check
- WCAG criteria validation
- Quality gate checklist

Triggers: accessibility, a11y, WCAG, screen reader, keyboard navigation, ARIA, focus

#### 17. `refactoring`
Replaces: refactoring, code-organization (2 skills)

Workflow:
- `find_dead_code` → identify unused exports
- `find_circular_deps` → detect circular dependencies
- `safe_delete_check` → pre-deletion safety
- `detect_breaking_changes` → impact analysis
- `semantic_diff` → type-aware change verification
- `analyze_dependencies` → dependency cleanup

Triggers: refactor, clean up, reorganize, dead code, unused, extract, simplify

#### 18. `dependency-management`
Replaces: dependency-management (1 skill)

Workflow:
- `analyze_dependencies` → unused/missing/outdated packages
- `check_versions` → version comparison
- `find_circular_deps` → circular dependency detection
- `upgrade_package` → safe upgrade with breaking change detection
- `detect_breaking_changes` → impact analysis

Triggers: dependencies, packages, outdated, upgrade, npm, version, breaking change

#### 19. `debugging`
Replaces: debugging (1 skill)

Workflow:
- `parse_error_stack` → structured stack trace analysis
- `explain_type_error` → TypeScript error explanation
- `precision_grep` with context expansion → find error source
- `find_tests_for_file` → locate relevant tests
- Check `.goodvibes/memory/failures.json` for known patterns

Triggers: debug, error, bug, crash, stack trace, TypeError, undefined, null

#### 20. `project-setup`
Replaces: (no direct predecessor — addresses onboarding gap)

Workflow:
- `detect_stack` → analyze existing project
- `explain_codebase` → generate project understanding
- `read_config` → parse all configuration
- `get_conventions` → discover coding conventions
- `project_issues` → identify health issues
- `env_audit` → check environment setup
- Output: generate/update CLAUDE.md with findings

Triggers: new project, setup, onboard, initialize, getting started, CLAUDE.md

---

## Migration Strategy

### Phase 1: Build outcome skills
- Create the ~20 outcome-oriented skills following Anthropic's recommended structure
- Each skill includes: SKILL.md (<5,000 words), scripts/ for deterministic validation, references/ for decision trees and framework-specific details
- Strong trigger phrases in frontmatter descriptions
- Each skill explicitly references GoodVibes MCP tools by name

### Phase 2: Test triggering
- Run 10-20 test queries per skill to verify trigger rates
- Target: 90% trigger rate on relevant queries (Anthropic's benchmark)
- Verify no over-triggering on unrelated queries
- Measure token consumption with vs without skills

### Phase 3: Deprecate technology skills
- Remove the 172 technology-specific skills from the active registry
- Move to an archive directory for reference
- Monitor session data to verify outcome skills are being loaded and used

### Phase 4: Measure impact
- Compare skill load rates: before (2/4186 sessions) vs after
- Compare work quality: review scores with vs without skills
- Compare token efficiency: registry bloat reduction
- Track which outcome skills get loaded most frequently

---

## WRFC Compliance Connection

The skill overhaul also addresses the WRFC compliance problem:

1. **Scripts for deterministic validation** — Anthropic recommends bundling validation scripts: "Code is deterministic; language interpretation isn't." Each outcome skill can include `scripts/validate.sh` that programmatically checks whether WRFC was followed (e.g., verify review score exists, verify all issues addressed, verify commit happened).

2. **Quality gate checklists** — Each skill can include explicit quality gates in `assets/checklist.md` that the reviewer agent must check against, making review scoring more consistent.

3. **Workflow steps reference WRFC explicitly** — Each skill's workflow steps can include "Step N: Submit for WRFC review" with specific instructions for what the review must verify.

---

## Key Principles (from Anthropic's Guide)

1. **Skills teach Claude how to handle specific tasks or workflows** — not what a technology is
2. **Progressive disclosure** — frontmatter always loaded, body on demand, references only when needed
3. **SKILL.md under 5,000 words** — move detail to references/
4. **20-50 skills max** — more than this causes context degradation
5. **Description = WHAT + WHEN + trigger phrases** — this is how Claude decides to load
6. **Scripts > language for critical checks** — code is deterministic, language interpretation isn't
7. **Problem-first framing** — users describe outcomes, skills handle tool orchestration
8. **Composability** — skills should work alongside each other, not assume exclusivity

---

## Source Material

- Anthropic: [The Complete Guide to Building Skills for Claude](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf) (January 2026)
- Session audit: 4,186 JSONL files scanned across 11 projects (February 2026)
- Competitive analysis: ucai, GSD, BMAD, Ralph, SuperClaude, Claude-Flow, Spec Kit
