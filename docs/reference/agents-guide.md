# Agents Guide

VibePlug/GoodVibes provides 9 specialized agents, each designed for specific development tasks. This guide covers when to use each agent and how to spawn them effectively.

## Table of Contents

- [Engineer](#engineer)
- [Reviewer](#reviewer)
- [Tester](#tester)
- [Architect](#architect)
- [Deployer](#deployer)
- [Integrator](#integrator)
- [Planner](#planner)
- [Agent Factory](#agent-factory)
- [Skill Factory](#skill-factory)

---

## Engineer

**Purpose:** Full-stack development with deep expertise across backend systems (APIs, databases, authentication) and frontend development (components, pages, layouts, styling).

**Specialization:**
- Backend: REST/GraphQL/tRPC APIs, database schema design, authentication flows, caching strategies
- Frontend: Component architectures, routing, responsive UI, styling solutions, performance optimization
- Production-ready implementations with proper error handling, validation, and security

**When to Use:**
- Implementing new features (API endpoints, components, pages)
- Building authentication systems
- Creating database schemas and migrations
- Setting up API integrations
- Adding UI components and layouts

**Key Capabilities:**
- Type-safe API implementations (REST, GraphQL, tRPC)
- Database design with Prisma, Drizzle, or raw SQL
- Authentication with Clerk, NextAuth, or Lucia
- Component development with React, Vue, or Svelte
- Styling with Tailwind, CSS Modules, or styled-components
- Performance optimization and accessibility

**Example Spawn Commands:**

```bash
# Implement a new API endpoint
agent spawn engineer "Create a POST /api/posts endpoint with Zod validation and Prisma"

# Build a component
agent spawn engineer "Create a Button component with primary/secondary/ghost variants using Tailwind and Radix"

# Add authentication
agent spawn engineer "Implement authentication using Clerk with protected routes"

# Database schema
agent spawn engineer "Design a database schema for a blog with users, posts, comments, and categories"
```

**Decision Frameworks:**

The engineer uses built-in decision frameworks for:
- **API patterns**: Choosing between tRPC, REST, GraphQL, Hono, Fastify
- **Databases**: PostgreSQL, PlanetScale, MongoDB, Supabase, Redis
- **ORMs**: Prisma, Drizzle, Kysely
- **Authentication**: Clerk, NextAuth, Lucia, Auth0
- **Frameworks**: Next.js, Remix, Astro, Nuxt, SvelteKit
- **Styling**: Tailwind, Panda CSS, Vanilla Extract, styled-components
- **Components**: shadcn/ui, Radix UI, Chakra UI, Mantine

**Guardrails:**
- Never creates mocks or placeholders
- Always validates input and handles errors
- Enforces TypeScript strictness (no `any`)
- Confirms before breaking changes
- Runs type-checking and linting after edits

---

## Reviewer

**Purpose:** Code quality assurance, security analysis, and architectural feedback. Ensures code meets enterprise standards before merging.

**Specialization:**
- Type safety and correctness
- Security vulnerabilities (XSS, SQL injection, auth bypasses)
- Performance bottlenecks (N+1 queries, bundle size)
- Code organization and maintainability
- Best practices for the detected tech stack

**When to Use:**
- Before merging pull requests
- After major feature implementations
- When refactoring existing code
- To audit security practices
- To identify performance issues

**Key Capabilities:**
- Detects unsafe type operations (`any` usage, unchecked member access)
- Identifies error handling issues (floating promises, silent catches)
- Spots async/await anti-patterns
- Validates security best practices
- Checks documentation completeness
- Analyzes code complexity and organization

**Example Spawn Commands:**

```bash
# Review a specific file
agent spawn reviewer "Review src/api/auth.ts for security issues"

# Review recent changes
agent spawn reviewer "Review all changes in the current PR for type safety and error handling"

# Full codebase audit
agent spawn reviewer "Audit the entire codebase for security vulnerabilities"

# Performance review
agent spawn reviewer "Review src/app/dashboard for performance issues and N+1 queries"
```

**Review Dimensions:**

1. **Type Safety** - Unsafe assignments, member access, function calls
2. **Error Handling** - Floating promises, empty catches, thrown non-Error objects
3. **Async Patterns** - Unnecessary async, sequential operations, await non-promises
4. **Security** - XSS, SQL injection, auth bypasses, exposed secrets
5. **Performance** - N+1 queries, large bundles, unnecessary re-renders
6. **Code Organization** - Cyclomatic complexity, file size, deep nesting
7. **Documentation** - Missing JSDoc, incomplete comments, unclear intent
8. **Import Ordering** - Incorrect import organization
9. **Naming Conventions** - Unclear names, abbreviations, unused variables
10. **Best Practices** - Framework-specific anti-patterns

**Output Format:**

The reviewer generates structured reports with:
- **Critical** - Must fix before merging
- **Warning** - Should fix soon
- **Info** - Consider improving

Each issue includes file location, explanation, and suggested fix.

---

## Tester

**Purpose:** Comprehensive testing strategy and implementation. Writes unit tests, integration tests, and end-to-end tests.

**Specialization:**
- Unit testing with Vitest, Jest, or Bun
- Integration testing for APIs and databases
- E2E testing with Playwright or Cypress
- Test data generation and fixtures
- Coverage analysis and gap identification

**When to Use:**
- After implementing new features
- To validate bug fixes
- When adding edge case coverage
- Before major refactors
- To improve test coverage metrics

**Key Capabilities:**
- Writes comprehensive test suites
- Generates realistic test fixtures
- Tests error paths and edge cases
- Validates API contracts
- Tests component behavior and accessibility
- Analyzes coverage gaps

**Example Spawn Commands:**

```bash
# Test a new feature
agent spawn tester "Write tests for the new authentication flow in src/features/auth"

# Add edge case coverage
agent spawn tester "Add edge case tests for src/utils/date-formatter.ts"

# E2E testing
agent spawn tester "Create Playwright tests for the checkout flow"

# Coverage improvement
agent spawn tester "Analyze coverage for src/api and add missing tests"
```

**Testing Patterns:**

```typescript
// Unit test example
describe('createPost', () => {
  it('creates a post with valid data', async () => {
    const post = await createPost({
      title: 'Test Post',
      content: 'Content here',
    });

    expect(post.id).toBeDefined();
    expect(post.title).toBe('Test Post');
  });

  it('throws error when title is empty', async () => {
    await expect(createPost({ title: '', content: 'Content' }))
      .rejects.toThrow('Title is required');
  });
});
```

**Test Organization:**
- Unit tests alongside source files (`*.test.ts`)
- Integration tests in `tests/integration/`
- E2E tests in `tests/e2e/`
- Fixtures in `tests/fixtures/`

---

## Architect

**Purpose:** System design, architecture decisions, and technical planning. Focuses on scalability, maintainability, and technology choices.

**Specialization:**
- System architecture design
- Technology stack recommendations
- Database modeling and relationships
- API design and versioning
- Performance architecture
- Security architecture

**When to Use:**
- Starting a new project
- Planning major features
- Evaluating technology choices
- Designing database schemas
- Planning API structures
- Refactoring large systems

**Key Capabilities:**
- Designs scalable system architectures
- Recommends appropriate technologies
- Creates database models with relationships
- Defines API contracts and patterns
- Plans for performance and security
- Documents architectural decisions

**Example Spawn Commands:**

```bash
# New project planning
agent spawn architect "Design architecture for a SaaS platform with multi-tenancy"

# Technology selection
agent spawn architect "Recommend tech stack for a real-time collaboration app"

# Database design
agent spawn architect "Design database schema for an e-commerce platform with inventory and orders"

# API design
agent spawn architect "Design REST API structure for a content management system"
```

**Architectural Deliverables:**

1. **System Diagrams** - Component relationships and data flow
2. **Technology Recommendations** - Stack choices with justifications
3. **Database Schema** - Entity relationships and indexes
4. **API Contracts** - Endpoints, request/response formats, versioning
5. **Security Plan** - Authentication, authorization, data protection
6. **Performance Strategy** - Caching, optimization, scaling

**Decision Records:**

The architect creates Architecture Decision Records (ADRs) documenting:
- Context and problem
- Considered options
- Decision and rationale
- Consequences and trade-offs

---

## Deployer

**Purpose:** Deployment automation, DevOps workflows, and infrastructure management. Handles CI/CD, containerization, and cloud deployments.

**Specialization:**
- CI/CD pipeline configuration
- Docker containerization
- Cloud platform deployment (Vercel, Railway, Fly.io, AWS)
- Environment management
- Build optimization
- Monitoring and logging setup

**When to Use:**
- Setting up deployment pipelines
- Configuring Docker containers
- Deploying to cloud platforms
- Managing environment variables
- Optimizing build processes
- Setting up monitoring

**Key Capabilities:**
- Creates GitHub Actions workflows
- Writes Dockerfiles and docker-compose
- Configures Vercel, Railway, Fly.io deployments
- Manages environment variables securely
- Optimizes build times and bundle sizes
- Sets up error tracking and monitoring

**Example Spawn Commands:**

```bash
# CI/CD setup
agent spawn deployer "Create GitHub Actions workflow for testing and deploying to Vercel"

# Dockerization
agent spawn deployer "Create production-ready Dockerfile for Next.js app"

# Deployment
agent spawn deployer "Configure deployment to Railway with PostgreSQL database"

# Environment management
agent spawn deployer "Set up environment variable management for staging and production"
```

**Deployment Patterns:**

```yaml
# GitHub Actions example
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - run: npm run deploy
```

**Platform Support:**
- **Vercel** - Next.js, static sites
- **Railway** - Full-stack apps with databases
- **Fly.io** - Dockerized apps, global edge
- **AWS** - ECS, Lambda, S3
- **Cloudflare** - Pages, Workers

---

## Integrator

**Purpose:** Third-party service integration specialist. Handles APIs, SDKs, webhooks, and external service setup.

**Specialization:**
- Payment processing (Stripe, PayPal)
- Authentication providers (Auth0, Okta, Clerk)
- Email services (SendGrid, Resend, Postmark)
- Analytics (PostHog, Mixpanel, Amplitude)
- File storage (S3, Cloudinary, UploadThing)
- Real-time services (Pusher, Ably)

**When to Use:**
- Integrating payment systems
- Setting up email services
- Adding analytics tracking
- Configuring file uploads
- Implementing webhooks
- Connecting to external APIs

**Key Capabilities:**
- SDK setup and configuration
- Webhook handling and verification
- API client implementation
- Error handling for external services
- Type-safe API wrappers
- Environment configuration

**Example Spawn Commands:**

```bash
# Payment integration
agent spawn integrator "Integrate Stripe checkout with webhook handling"

# Email service
agent spawn integrator "Set up Resend for transactional emails"

# Analytics
agent spawn integrator "Add PostHog analytics with custom event tracking"

# File uploads
agent spawn integrator "Implement file uploads with UploadThing"
```

**Integration Patterns:**

```typescript
// Stripe webhook example
export async function POST(request: Request) {
  const sig = request.headers.get('stripe-signature');
  const body = await request.text();

  const event = stripe.webhooks.constructEvent(
    body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET
  );

  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentSuccess(event.data.object);
      break;
    case 'payment_intent.failed':
      await handlePaymentFailure(event.data.object);
      break;
  }

  return new Response('OK', { status: 200 });
}
```

**Service Categories:**

1. **Payments** - Stripe, PayPal, Paddle
2. **Auth** - Clerk, Auth0, WorkOS
3. **Email** - Resend, SendGrid, Postmark
4. **Analytics** - PostHog, Mixpanel, Amplitude
5. **Storage** - S3, Cloudinary, UploadThing
6. **Real-time** - Pusher, Ably, Socket.io
7. **Search** - Algolia, Typesense, Meilisearch

---

## Planner

**Purpose:** Project planning, task breakdown, and workflow orchestration. Creates detailed implementation plans.

**Specialization:**
- Feature breakdown into tasks
- Sprint planning and estimation
- Dependency analysis
- Risk identification
- Milestone planning
- Multi-agent coordination

**When to Use:**
- Planning large features
- Breaking down complex projects
- Coordinating multiple agents
- Estimating timelines
- Identifying blockers and risks

**Key Capabilities:**
- Breaks features into granular tasks
- Identifies task dependencies
- Estimates effort and complexity
- Plans agent coordination
- Creates rollout strategies
- Tracks milestones

**Example Spawn Commands:**

```bash
# Feature planning
agent spawn planner "Create implementation plan for user dashboard with analytics"

# Project breakdown
agent spawn planner "Break down e-commerce checkout flow into tasks"

# Multi-agent coordination
agent spawn planner "Plan agent coordination for building a SaaS billing system"

# Sprint planning
agent spawn planner "Plan two-week sprint for implementing real-time notifications"
```

**Planning Output:**

```markdown
## Feature: User Dashboard

### Phase 1: Backend (Engineer)
- [ ] Create user stats API endpoint (2h)
- [ ] Add analytics aggregation queries (3h)
- [ ] Implement caching layer (2h)

### Phase 2: Frontend (Engineer)
- [ ] Build dashboard layout component (2h)
- [ ] Create stats card components (3h)
- [ ] Add charts with Chart.js (4h)

### Phase 3: Testing (Tester)
- [ ] Unit tests for API endpoints (2h)
- [ ] E2E tests for dashboard (3h)

### Phase 4: Review & Deploy (Reviewer + Deployer)
- [ ] Code review (1h)
- [ ] Performance optimization (2h)
- [ ] Deploy to staging (1h)

**Total Estimate:** 25 hours
**Dependencies:** Analytics data pipeline must be ready
**Risks:** Chart performance with large datasets
```

---

## Agent Factory

**Purpose:** Creates new specialized agents with custom capabilities, rules, and workflows.

**Specialization:**
- Agent design and architecture
- Custom agent capabilities
- Agent-specific rules and guardrails
- Integration with existing systems
- Agent testing and validation

**When to Use:**
- Need a specialized agent not in the core set
- Building domain-specific automation
- Creating custom workflows
- Extending agent capabilities

**Key Capabilities:**
- Designs agent personas and specializations
- Defines agent capabilities and limitations
- Creates agent-specific rules
- Writes agent prompt templates
- Tests agent behavior
- Integrates agents with the system

**Example Spawn Commands:**

```bash
# Create a custom agent
agent spawn agent-factory "Create a 'database-optimizer' agent specialized in query optimization"

# Domain-specific agent
agent spawn agent-factory "Create a 'content-writer' agent for generating marketing copy"

# Workflow agent
agent spawn agent-factory "Create a 'release-manager' agent for coordinating releases"
```

**Agent Creation Process:**

1. **Define Purpose** - What problem does this agent solve?
2. **Specify Capabilities** - What can it do?
3. **Set Boundaries** - What should it NOT do?
4. **Create Rules** - Guardrails and decision frameworks
5. **Write Prompt** - Agent persona and instructions
6. **Test Behavior** - Validate with example tasks
7. **Document** - Usage guide and examples

**Custom Agent Template:**

```yaml
name: database-optimizer
version: 1.0.0
category: backend

capabilities:
  - Analyze query execution plans
  - Suggest index optimizations
  - Identify N+1 queries
  - Optimize slow queries
  - Generate migration scripts

rules:
  - Never drop indexes in production
  - Always backup before schema changes
  - Benchmark before and after optimization
  - Document optimization rationale

guardrails:
  confirm_before:
    - Creating new indexes
    - Modifying existing indexes
    - Changing table structures
  never:
    - Drop tables or columns
    - Disable constraints
    - Run migrations on production without approval
```

---

## Skill Factory

**Purpose:** Creates reusable skills (knowledge modules) for agents to consume. Skills provide specialized domain knowledge.

**Specialization:**
- Skill design and documentation
- Framework-specific knowledge
- Best practices and patterns
- Tool-specific guidance
- Skill categorization and tagging

**When to Use:**
- Documenting framework patterns
- Creating library-specific guides
- Building knowledge modules
- Standardizing practices
- Sharing domain expertise

**Key Capabilities:**
- Structures knowledge for agent consumption
- Creates framework-specific guides
- Documents best practices
- Provides code examples
- Tags and categorizes skills
- Maintains skill registry

**Example Spawn Commands:**

```bash
# Create framework skill
agent spawn skill-factory "Create a skill for Remix framework patterns"

# Library skill
agent spawn skill-factory "Create a skill for Zod validation best practices"

# Pattern skill
agent spawn skill-factory "Create a skill for implementing RBAC authorization"

# Tool skill
agent spawn skill-factory "Create a skill for Playwright testing patterns"
```

**Skill Structure:**

```markdown
# Skill: Remix Framework Patterns

## Category
framework

## Tags
remix, react, ssr, full-stack

## Overview
Comprehensive guide to Remix framework patterns including loaders, actions, routing, and data mutations.

## Core Concepts

### Loaders
Server-side data loading for routes:

```typescript
export async function loader({ params }: LoaderFunctionArgs) {
  const post = await db.post.findUnique({
    where: { id: params.id },
  });

  if (!post) throw new Response('Not Found', { status: 404 });
  return json({ post });
}
```

### Actions
Form submissions and mutations:

```typescript
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const title = formData.get('title');

  await db.post.create({ data: { title } });
  return redirect('/posts');
}
```

## Best Practices

1. Use loaders for GET requests
2. Use actions for POST/PUT/DELETE
3. Leverage progressive enhancement
4. Implement optimistic UI
5. Handle errors with error boundaries

## Common Patterns

- Nested routing with layout routes
- Form validation with Zod
- Authentication with sessions
- File uploads with multipart forms
- Real-time updates with useFetcher

## Anti-Patterns

- Client-side data fetching (use loaders)
- Managing state for server data (Remix handles it)
- Implementing custom form libraries (use Remix forms)

## References

- Official docs: https://remix.run/docs
- Examples: https://github.com/remix-run/examples
```

**Skill Categories:**

- **Frameworks** - Next.js, Remix, Astro, SvelteKit
- **Libraries** - React, Vue, Zod, Prisma
- **Patterns** - Auth, RBAC, real-time, file uploads
- **Tools** - Playwright, Vitest, Docker
- **Domains** - Payments, email, analytics

---

## Agent Coordination

### Multi-Agent Workflows

Multiple agents can work together on complex tasks:

```bash
# 1. Architect designs the system
agent spawn architect "Design API structure for blog platform"

# 2. Engineer implements backend
agent spawn engineer "Implement blog API based on architecture doc"

# 3. Tester adds test coverage
agent spawn tester "Write tests for blog API endpoints"

# 4. Reviewer checks quality
agent spawn reviewer "Review blog API implementation for security"

# 5. Deployer ships it
agent spawn deployer "Deploy blog API to production"
```

### Agent Communication

Agents can share context through:
- **Memory system** - Shared decisions and patterns
- **File artifacts** - Generated documentation and code
- **State tracking** - Task status and results

### Best Practices

1. **Use the right agent** - Don't ask engineer to do architecture
2. **Provide context** - Give agents necessary background
3. **Iterate** - Spawn agents multiple times for refinement
4. **Coordinate** - Plan multi-agent workflows with planner
5. **Review** - Always use reviewer before merging

---

## Choosing the Right Agent

| Task | Agent | Why |
|------|-------|-----|
| Implement API endpoint | Engineer | Code implementation |
| Design database schema | Architect | System design |
| Add test coverage | Tester | Testing expertise |
| Review PR | Reviewer | Quality assurance |
| Deploy to Vercel | Deployer | DevOps automation |
| Integrate Stripe | Integrator | Third-party services |
| Plan feature rollout | Planner | Project coordination |
| Create custom agent | Agent Factory | Agent creation |
| Document framework patterns | Skill Factory | Knowledge creation |

---

## Agent Modes

### vibecoding Mode
- Communicates progress and decisions
- Asks for clarification on ambiguity
- Shows detailed output and diffs
- Creates checkpoints per batch

### justvibes Mode
- Minimal communication
- Autonomous decision-making
- Logs to `.goodvibes/logs/activity.md`
- Auto-chains to next task

Set mode with:
```bash
agent config mode vibecoding  # Interactive
agent config mode justvibes   # Autonomous
```

---

## Advanced Usage

### Precision Tools

All agents use precision tools for maximum efficiency:

- `precision_read` - Extract modes, line ranges, symbols
- `precision_grep` - Batch queries, output modes
- `precision_edit` - Atomic transactions, validation
- `precision_exec` - Batch commands, expectations

### Batch Operations

Agents use batch operations for multi-file changes:

```yaml
batch:
  id: implement-feature
  operations:
    read: [...]
    write: [...]
    exec: [...]
  config:
    transaction:
      mode: atomic
    execution:
      mode: parallel
```

### Memory Integration

Agents read from and write to the memory system:

```yaml
# Query past decisions
state:
  type: query
  filters:
    kinds: [decision, pattern]
    keywords: ["authentication"]

# Track new decisions
state:
  type: track
  entries:
    - kind: decision
      data:
        what: "Use Clerk for authentication"
        why: "Best DX, managed service"
```

---

## Troubleshooting

### Agent Not Available
```bash
# List available agents
agent list

# Check agent status
agent status engineer
```

### Agent Fails to Spawn
- Check cwd is set correctly
- Verify task description is clear
- Ensure required files exist

### Agent Produces Incorrect Output
- Provide more context in task description
- Use reviewer to validate output
- Iterate with refined instructions

---

## Next Steps

- Read [Quick Start Guide](./quick-start.md) for hands-on examples
- Explore [Architecture Overview](./architecture-overview.md) for system design
- Check agent skills in `plugins/goodvibes/skills/`
- Review agent implementations in `plugins/goodvibes/agents/`

---

**Last Updated:** 2026-01-27
