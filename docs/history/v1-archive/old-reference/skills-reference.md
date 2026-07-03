# Skills Reference

Quick reference for discovering, loading, and using GoodVibes skills.

## What are Skills?

Skills are modular knowledge packages that provide agents with specialized expertise. Each skill contains:

- **SKILL.md**: Core knowledge and workflows
- **references/**: Deep-dive documentation and patterns
- **templates/**: Boilerplate code and examples
- **scripts/**: Automation tools

Skills enable agents to apply best practices for specific technologies, frameworks, and development patterns.

## Skill Categories

### Common (29 skills)

Cross-language development knowledge organized into 5 subcategories:

**development/** (5 skills)
- `debugging` - Error diagnosis, profiling, distributed tracing
- `project-understanding` - Architecture analysis, dependency scanning, complexity metrics
- `refactoring` - Code smells, design patterns, migration guides

**quality/** (2 skills)
- `code-quality` - Performance, security, accessibility (WCAG), complexity thresholds
- `testing` - Test patterns, mocking, property testing, mutation testing

**review/** (7 skills)
- `type-safety` - Fix unsafe member access, assignments, returns, calls
- `error-handling` - Fix floating promises, silent catches, non-Error throws
- `async-patterns` - Fix unnecessary async, sequential operations
- `import-ordering` - Auto-fix import organization
- `documentation` - Add JSDoc, module comments, @returns tags
- `code-organization` - Fix high complexity, large files, deep nesting
- `naming-conventions` - Fix unused variables, single-letter names, abbreviations

**tooling/** (3 skills)
- Tools and utility integration patterns

**workflow/** (12 skills)
- `documentation` - README templates, API docs, changelog conventions, runbooks
- `git-workflows` - Branch strategies, PR templates, release notes, conventional commits

### WebDev (138 skills)

Web development expertise organized by subcategory:

**ai-integration/** (1 skill)
- `vercel-ai-sdk` - AI SDK, streaming, tool calling

**animation/** (1 skill)
- `framer-motion` - React animation library

**api-layer/** (4 skills)
- `trpc` - End-to-end type-safe APIs
- `graphql` - Query language, schema design
- `hono` - Edge/serverless TypeScript framework
- `express` - Node.js web framework

**authentication/** (2 skills)
- `clerk` - Full-featured auth platform
- `nextauth` - Next.js authentication (Auth.js)

**build-tools/** (1 skill)
- `vite` - Next-gen build tool

**cms-content/** (1 skill)
- `mdx` - Markdown with JSX

**component-libraries/** (2 skills)
- `shadcn-ui` - Copy-paste components with Radix
- `radix-ui` - Headless accessible primitives

**databases-orms/** (3 skills)
- `prisma` - Type-safe ORM, migrations
- `drizzle` - TypeScript-first ORM
- `postgresql` - Advanced SQL, performance
- `redis` - Caching, sessions, pub/sub

**deployment/** (0 skills)
- See deployment-hosting category

**deployment-hosting/** (3 skills)
- `vercel` - Next.js hosting platform
- `netlify` - Jamstack deployment
- `cloudflare-pages` - Edge deployment

**email/** (1 skill)
- `resend` - Developer email API

**forms/** (0 skills)
- See forms-validation category

**forms-validation/** (2 skills)
- `zod` - TypeScript schema validation
- `react-hook-form` - Performant form library

**frontend-core/** (4 skills)
- `react` - Hooks, Server Components, Suspense
- `typescript` - Advanced types, configuration
- `vue` - Composition API, reactivity
- `svelte` - Compiler-first framework
- `solidjs` - Fine-grained reactivity

**meta-frameworks/** (7 skills)
- `nextjs` - App Router, Server Components, Server Actions
- `remix` - Nested routes, loaders, actions
- `astro` - Content collections, islands architecture
- `nuxt` - Vue meta-framework
- `sveltekit` - Svelte meta-framework
- `gatsby` - GraphQL, static generation
- `qwik` - Resumability, instant apps

**monitoring-analytics/** (1 skill)
- `sentry` - Error tracking, performance monitoring

**payments/** (1 skill)
- `stripe` - Payment processing

**realtime-websockets/** (1 skill)
- `socket-io` - Real-time bidirectional communication

**state-management/** (3 skills)
- `tanstack-query` - Server state management
- `zustand` - Simple React state
- `pinia` - Vue state management
- `jotai` - Atomic React state

**styling/** (1 skill)
- `tailwindcss` - Utility-first CSS

**testing/** (4 skills)
- `vitest` - Vite-native unit testing
- `playwright` - End-to-end testing
- `msw` - API mocking
- `cypress` - E2E testing
- `testing-library` - User-centric testing

### Creation (5 skills)

Skills for creating GoodVibes plugins:

- `agent-sdk-definitions` - Agent SDK patterns and structures
- `hook-integration` - Creating and integrating hooks
- `script-best-practices` - Script development guidelines
- `workflow-patterns` - Workflow automation patterns
- `writing-descriptions` - Writing effective skill descriptions

### Special (1 skill)

- `goodvibes-codebase-review` - Full codebase review with parallel agent remediation

## Discovering Skills

### Search by Name or Description

Use the registry engine to search for skills:

```bash
# Via MCP CLI (check schema first)
mcp-cli info plugin_goodvibes_registry-engine/search_skills
mcp-cli call plugin_goodvibes_registry-engine/search_skills '{"query": "react"}'
```

Returns: Matching skills with names, descriptions, and categories.

### Get Skill Recommendations

Get AI-powered skill recommendations based on your task:

```bash
# Check schema first
mcp-cli info plugin_goodvibes_registry-engine/recommend_skills

# Get recommendations
mcp-cli call plugin_goodvibes_registry-engine/recommend_skills '{
  "task": "implement authentication in Next.js app",
  "context": "using PostgreSQL database",
  "max_results": 5
}'
```

Returns: Ranked skill recommendations with relevance scores.

### Check Skill Dependencies

Some skills depend on others (e.g., `nextjs` depends on `react`):

```bash
mcp-cli info plugin_goodvibes_registry-engine/skill_dependencies
mcp-cli call plugin_goodvibes_registry-engine/skill_dependencies '{"skill": "nextjs"}'
```

Returns: List of required and optional skill dependencies.

## Loading Skills

### Using the /load-skill Command

The fastest way to load a skill into context:

```
/load-skill nextjs
/load-skill type-safety
/load-skill webdev/authentication/clerk
```

This command:
1. Loads the SKILL.md content
2. Makes references and templates available
3. Injects the knowledge into the agent's context

### Using get_skill_content MCP Tool

For programmatic access:

```bash
# Check schema first
mcp-cli info plugin_goodvibes_registry-engine/get_skill_content

# Load skill content
mcp-cli call plugin_goodvibes_registry-engine/get_skill_content '{
  "skill": "nextjs",
  "include_references": true,
  "include_templates": false
}'
```

Returns: Skill content with optional references and templates.

### Loading Multiple Skills

Load related skills together:

```
/load-skill nextjs
/load-skill prisma
/load-skill clerk
/load-skill tailwindcss
```

Or use batch loading if available:

```bash
mcp-cli call plugin_goodvibes_registry-engine/get_skill_content '{
  "skills": ["nextjs", "prisma", "clerk"],
  "include_references": false
}'
```

## Using Skills Effectively

### 1. Load Before Implementing

Always load relevant skills BEFORE starting implementation:

```
User: "Build a Next.js app with Prisma and Clerk auth"
Agent: Let me load the relevant skills first...
/load-skill nextjs
/load-skill prisma
/load-skill clerk
```

### 2. Follow Skill Patterns

Skills contain proven patterns and best practices:

- **Quick Start**: Getting started commands
- **Workflows**: Step-by-step implementation guides
- **Common Patterns**: Frequently used code patterns
- **Best Practices**: What to do and avoid
- **Common Mistakes**: Known pitfalls and fixes

### 3. Use Review Skills for Code Quality

After implementing features, apply review skills:

```
/load-skill type-safety
/load-skill error-handling
/load-skill async-patterns
```

These skills identify and fix common code quality issues.

### 4. Reference Templates and Scripts

Many skills include templates and automation scripts:

```
plugins/goodvibes/skills/webdev/meta-frameworks/nextjs/
  SKILL.md
  references/
    app-router.md
    caching.md
    server-actions.md
  templates/
    page.tsx
    layout.tsx
    server-action.ts
```

Use Read tool to access these files when needed.

## Creating Custom Skills

### Skill Directory Structure

```
plugins/goodvibes/skills/[category]/[subcategory]/[skill-name]/
  SKILL.md              # Main skill content (required)
  references/           # Deep-dive docs (optional)
    patterns.md
    advanced.md
  templates/            # Code templates (optional)
    component.tsx
    config.ts
  scripts/              # Automation tools (optional)
    generate.js
    validate.js
```

### SKILL.md Frontmatter

Every skill must have frontmatter:

```yaml
---
name: skill-name
description: Brief description of what this skill does and when to use it. Should be 1-2 sentences.
---
```

### Skill Content Structure

Recommended sections for SKILL.md:

1. **Quick Start** - Get started in <2 minutes
2. **Core Concepts** - Essential knowledge
3. **Workflows** - Step-by-step guides
4. **Common Patterns** - Frequently used code
5. **Best Practices** - Do's and don'ts
6. **Common Mistakes** - Pitfalls to avoid
7. **Reference Files** - Links to references/ directory
8. **Templates** - Links to templates/ directory

### Registering Custom Skills

After creating a skill, update the registry:

```bash
cd plugins/goodvibes
npm run registry:update
```

This scans all skill directories and updates the registry metadata.

### Skill Naming Conventions

- **Category**: Broad domain (common, webdev, create)
- **Subcategory**: Specific area (meta-frameworks, authentication)
- **Skill Name**: Technology or pattern (nextjs, clerk, type-safety)

Examples:
- `common/review/type-safety`
- `webdev/meta-frameworks/nextjs`
- `webdev/authentication/clerk`
- `create/hook-integration`

## Best Practices

### For Skill Consumers (Agents)

1. **Load before implementing** - Don't guess, load the skill first
2. **Follow the workflows** - Skills contain proven step-by-step guides
3. **Apply review skills** - Use review skills to improve code quality
4. **Check dependencies** - Some skills require others

### For Skill Authors

1. **Write clear descriptions** - Frontmatter description should explain what, when, and why
2. **Include Quick Start** - Users should be productive in <2 minutes
3. **Provide workflows** - Step-by-step guides for common tasks
4. **Add code examples** - Show, don't just tell
5. **Document mistakes** - Help users avoid common pitfalls
6. **Keep it focused** - One skill, one technology or pattern
7. **Link to references** - Put deep-dive content in references/ directory

## Common Workflows

### Full-Stack Feature Implementation

```
/load-skill nextjs          # Framework knowledge
/load-skill prisma          # Database ORM
/load-skill zod             # Validation
/load-skill clerk           # Authentication
```

### Code Quality Improvement

```
/load-skill type-safety     # Fix TypeScript issues
/load-skill error-handling  # Fix async/promise issues
/load-skill async-patterns  # Optimize async code
/load-skill import-ordering # Clean up imports
```

### Testing Setup

```
/load-skill vitest          # Unit testing
/load-skill playwright      # E2E testing
/load-skill msw             # API mocking
```

### Documentation

```
/load-skill documentation   # README, API docs
/load-skill git-workflows   # PR templates, release notes
```

## Registry MCP Tools Reference

All registry tools follow the pattern:
1. Check schema with `mcp-cli info`
2. Make call with `mcp-cli call`

Available tools:
- `search_skills` - Search by name/description
- `recommend_skills` - AI-powered recommendations
- `get_skill_content` - Load skill content
- `skill_dependencies` - Check skill dependencies
- `search_agents` - Find available agents
- `search_tools` - Find available tools

## Further Reading

- [Agent Testing Guide](./agents-guide.md) - How agents use skills
- [Architecture Overview](./architecture-overview.md) - How skills fit into the system
- Load the `create/writing-descriptions` skill for authoring guidelines
