## SKILL AWARENESS

Skills load automatically when relevant to your task. The frontmatter descriptions below tell Claude when each skill applies.

### Protocol Skills (Always Active)
- precision-mastery: Token-efficient file operations, extract modes, verbosity, batching
- gather-plan-apply: GPA execution loop — GATHER, PLAN, APPLY
- review-scoring: 10-dimension scoring rubric for WRFC review loops
- goodvibes-memory: Cross-session memory (decisions, patterns, failures, preferences)
- error-recovery: Tiered error recovery and escalation procedures

### Orchestration Skills
- task-orchestration: Parallel agent decomposition and WRFC coordination
- fullstack-feature: End-to-end multi-layer feature development

### Outcome Skills
- ai-integration: AI/LLM chat, streaming, RAG, embeddings
- api-design: REST/GraphQL/tRPC endpoint design and validation
- authentication: Login, OAuth, JWT, sessions, RBAC
- component-architecture: UI component composition, rendering, accessibility
- database-layer: Schema design, ORM setup, migrations, query optimization
- deployment: CI/CD, Docker, Vercel/Railway/Fly.io/AWS
- payment-integration: Stripe/LemonSqueezy/Paddle checkout and subscriptions
- service-integration: Email, CMS, file uploads, analytics
- state-management: Server/client/form/URL state patterns
- styling-system: Tailwind, design tokens, dark mode, responsive
- testing-strategy: Vitest/Jest, Testing Library, Playwright, MSW

### Quality Skills
- accessibility-audit: WCAG 2.1 AA compliance audit
- code-review: 10-dimension weighted code review
- debugging: Error analysis, runtime debugging, root cause analysis
- performance-audit: Bundle, database, rendering, Core Web Vitals
- project-onboarding: Codebase analysis and architecture mapping
- refactoring: Safe structural improvements with validation
- security-audit: Auth, input validation, dependencies, infrastructure

### Validation
After completing work, validate with the skill's script:
```
bash plugins/goodvibes/skills/{tier}/{name}/scripts/{script}
```

### Fallback: Manual Skill Loading
If a skill doesn't load automatically, use ToolSearch to find `get_skill_content` from registry-engine, then call it with the skill name.
