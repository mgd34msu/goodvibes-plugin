---
name: documentation
description: Generates README files, API documentation, changelogs, runbooks, and SDK code from project analysis. Use when creating documentation, generating changelogs, documenting APIs, creating runbooks, or generating client SDKs.
---

# Documentation

Automated documentation generation for READMEs, APIs, changelogs, runbooks, and SDK clients.

## Quick Start

**Generate README:**
```
Generate a README for this project based on its structure and dependencies
```

**Generate API docs:**
```
Generate API documentation for the endpoints in src/routes/
```

**Create changelog:**
```
Generate a changelog from git commits since the last release tag
```

**Generate runbook:**
```
Create an operational runbook for deploying and monitoring this service
```

## Capabilities

### 1. README Generation

Generate comprehensive README files from project analysis.

#### Analysis Process

```
1. Detect project type from config files
2. Extract name, description from package.json/pyproject.toml
3. Identify technologies and dependencies
4. Find existing documentation
5. Detect build/test commands
6. Generate structured README
```

#### README Template

```markdown
# {Project Name}

{Brief description from package.json or generated}

## Features

- {Auto-detected from code structure}
- {Key exports and capabilities}

## Installation

```bash
{Detected package manager install command}
```

## Quick Start

```{language}
{Basic usage example from tests or docs}
```

## Documentation

- [API Reference](docs/api.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Development

### Prerequisites

- {Detected runtime}: {version from config}
- {Other requirements from docker-compose, etc.}

### Setup

```bash
{Clone, install, configure steps}
```

### Testing

```bash
{Detected test command}
```

## License

{Detected from LICENSE file or package.json}
```

See [references/readme-templates.md](references/readme-templates.md) for project-specific templates.

---

### 2. API Documentation

Generate comprehensive API documentation from code.

#### OpenAPI/Swagger Generation

**From Express routes:**
```javascript
/**
 * @openapi
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User found
 */
router.get('/users/:id', getUser);
```

**Generation workflow:**
1. Scan route files for endpoint definitions
2. Extract HTTP methods, paths, parameters
3. Identify request/response schemas
4. Document authentication requirements
5. Generate OpenAPI YAML or markdown

#### REST API Documentation Template

```markdown
# API Reference

## Base URL
`https://api.example.com/v1`

## Authentication
```
Authorization: Bearer <token>
```

## Endpoints

### Users

#### Get User
`GET /users/{id}`

**Parameters**
| Name | Type | In | Required | Description |
|------|------|-------|----------|-------------|
| id | integer | path | Yes | User ID |

**Response 200**
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe"
}
```
```

See [references/api-doc-patterns.md](references/api-doc-patterns.md) for framework-specific patterns.

---

### 3. TypeDoc/JSDoc Generation

Generate documentation from TypeScript/JavaScript comments.

#### JSDoc Comment Patterns

```javascript
/**
 * Creates a new user in the system.
 *
 * @param {Object} userData - The user data
 * @param {string} userData.email - User's email address
 * @param {string} userData.name - User's full name
 * @param {string} [userData.role='user'] - User's role (optional)
 * @returns {Promise<User>} The created user object
 * @throws {ValidationError} If email is invalid
 * @example
 * const user = await createUser({
 *   email: 'john@example.com',
 *   name: 'John Doe'
 * });
 */
async function createUser(userData) {
  // ...
}
```

#### TypeDoc Configuration

```json
{
  "entryPoints": ["src/index.ts"],
  "out": "docs/api",
  "excludePrivate": true,
  "excludeInternal": true,
  "readme": "README.md",
  "plugin": ["typedoc-plugin-markdown"]
}
```

```bash
npx typedoc --options typedoc.json
```

---

### 4. Changelog Generation

Generate changelogs from git history following Keep a Changelog format.

#### Git History Analysis

```bash
# Get commits since last tag
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"%h %s"

# Get commits with conventional commit parsing
git log --pretty=format:"%s" | grep -E "^(feat|fix|docs):"
```

#### Conventional Commits Mapping

| Prefix | Changelog Section |
|--------|-------------------|
| `feat:` | Added |
| `fix:` | Fixed |
| `docs:` | Documentation |
| `perf:` | Performance |
| `BREAKING CHANGE:` | Breaking Changes |

#### Changelog Template

```markdown
# Changelog

## [Unreleased]

### Added
- New user authentication flow (#123)

### Changed
- Updated dependencies to latest versions

### Fixed
- Fixed race condition in queue processing (#124)

## [1.2.0] - 2024-01-15

### Added
- Initial release features...

[Unreleased]: https://github.com/owner/repo/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/owner/repo/releases/tag/v1.2.0
```

---

### 5. Database Schema Documentation

Document database tables, relationships, and migrations.

#### Schema Documentation Template

```markdown
# Database Schema

## Tables

### users

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| email | varchar(255) | No | | User's email |
| name | varchar(255) | Yes | | Display name |
| created_at | timestamp | No | now() | Creation time |

**Indexes:**
- `users_pkey` - PRIMARY KEY (id)
- `users_email_key` - UNIQUE (email)

**Foreign Keys:**
- None

### orders

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | gen_random_uuid() | Primary key |
| user_id | uuid | No | | FK to users |
| total | decimal(10,2) | No | | Order total |

**Foreign Keys:**
- `orders_user_id_fkey` - REFERENCES users(id)

## Entity Relationship Diagram

```
┌─────────┐       ┌─────────┐
│  users  │───<───│ orders  │
└─────────┘       └─────────┘
```
```

#### Generation from ORM

```bash
# Prisma
npx prisma generate --generator erd

# TypeORM
npx typeorm-uml ormconfig.json

# Django
python manage.py graph_models -a -o schema.png
```

---

### 6. Runbook Generation

Create operational runbooks for deployment and incident response.

#### Runbook Template

```markdown
# {Service Name} Runbook

## Overview
- **Service:** {name}
- **Team:** {owning team}
- **On-call:** {PagerDuty/OpsGenie link}
- **Repository:** {git repo URL}

## Architecture

{Brief architecture description with diagram}

## Dependencies
| Service | Purpose | Criticality |
|---------|---------|-------------|
| PostgreSQL | Primary data store | Critical |
| Redis | Session cache | High |
| Stripe API | Payment processing | Critical |

## Deployment

### Prerequisites
- [ ] Access to {deployment system}
- [ ] VPN connected
- [ ] Latest code on main branch

### Standard Deployment
```bash
{deployment commands}
```

### Rollback Procedure
```bash
{rollback commands}
```

## Monitoring

### Key Metrics
| Metric | Normal Range | Alert Threshold |
|--------|--------------|-----------------|
| Response time (p99) | < 200ms | > 500ms |
| Error rate | < 0.1% | > 1% |
| CPU usage | < 60% | > 80% |

### Dashboards
- [Grafana Dashboard]({link})
- [Application Logs]({link})

## Common Issues

### Issue: High response times
**Symptoms:** p99 latency > 500ms
**Possible causes:**
1. Database connection pool exhausted
2. External API degradation
3. Memory pressure

**Resolution:**
1. Check database connection count
2. Verify external service status
3. Review memory usage and restart if needed

### Issue: Authentication failures
**Symptoms:** 401 errors increasing
**Resolution:**
1. Verify JWT signing key is correct
2. Check token expiration settings
3. Review auth service logs

## Escalation

| Severity | Response Time | Contact |
|----------|---------------|---------|
| P1 - Critical | 15 min | On-call + Manager |
| P2 - High | 1 hour | On-call |
| P3 - Medium | 4 hours | Team queue |
```

See [references/runbook-patterns.md](references/runbook-patterns.md) for more templates.

---

### 7. API Client/SDK Generation

Generate client SDKs from OpenAPI specifications.

#### Generator Tools

```bash
# OpenAPI Generator (multi-language)
npx @openapitools/openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-fetch \
  -o src/api-client

# Available generators: typescript-fetch, python, go, java, ruby, etc.

# Orval (TypeScript focused)
npx orval --config orval.config.ts

# openapi-typescript (types only)
npx openapi-typescript openapi.yaml -o types.ts
```

#### Generated Client Example

```typescript
// Generated from OpenAPI spec
export class UsersApi {
  constructor(private config: Configuration) {}

  async getUser(id: string): Promise<User> {
    const response = await fetch(
      `${this.config.basePath}/users/${id}`,
      {
        headers: this.config.headers,
      }
    );
    return response.json();
  }

  async createUser(data: CreateUserRequest): Promise<User> {
    const response = await fetch(
      `${this.config.basePath}/users`,
      {
        method: 'POST',
        headers: this.config.headers,
        body: JSON.stringify(data),
      }
    );
    return response.json();
  }
}
```

---

### 8. Migration Guide Generation

Generate migration guides for breaking changes.

#### Migration Guide Template

```markdown
# Migration Guide: v1.x to v2.0

## Overview

This guide covers breaking changes in v2.0 and how to migrate your code.

## Breaking Changes

### 1. API Response Format Change

**Before (v1.x):**
```json
[
  {"id": 1, "name": "Item 1"},
  {"id": 2, "name": "Item 2"}
]
```

**After (v2.0):**
```json
{
  "data": [
    {"id": 1, "name": "Item 1"},
    {"id": 2, "name": "Item 2"}
  ],
  "pagination": {
    "page": 1,
    "totalPages": 5
  }
}
```

**Migration:**
```javascript
// Before
const items = await api.getItems();
items.forEach(item => console.log(item.name));

// After
const response = await api.getItems();
response.data.forEach(item => console.log(item.name));
```

### 2. Removed Deprecated Methods

| Removed Method | Replacement |
|----------------|-------------|
| `getUser(id)` | `users.get(id)` |
| `deleteUser(id)` | `users.delete(id)` |

## Migration Checklist

- [ ] Update API response handling
- [ ] Replace deprecated method calls
- [ ] Update TypeScript types
- [ ] Run test suite
- [ ] Test in staging environment
```

---

### 9. Troubleshooting Documentation

Generate troubleshooting guides from common issues.

#### Troubleshooting Template

```markdown
# Troubleshooting Guide

## Common Issues

### Connection refused errors

**Symptoms:**
- Error: `ECONNREFUSED 127.0.0.1:5432`
- Application fails to start

**Causes:**
1. Database not running
2. Wrong connection string
3. Firewall blocking connection

**Solutions:**

1. **Check database status:**
   ```bash
   docker-compose ps
   # or
   systemctl status postgresql
   ```

2. **Verify connection string:**
   ```bash
   echo $DATABASE_URL
   # Should be: postgres://user:pass@localhost:5432/dbname
   ```

3. **Test connection manually:**
   ```bash
   psql $DATABASE_URL -c "SELECT 1"
   ```

### Out of memory errors

**Symptoms:**
- `JavaScript heap out of memory`
- Process killed by OOM killer

**Solutions:**

1. **Increase Node.js memory:**
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm start
   ```

2. **Check for memory leaks:**
   ```bash
   node --inspect app.js
   # Use Chrome DevTools Memory tab
   ```
```

---

### 10. FAQ Generation

Generate FAQ from code comments, issues, and documentation.

#### FAQ Template

```markdown
# Frequently Asked Questions

## General

### What is {Project Name}?
{Brief description extracted from README}

### What are the system requirements?
- Node.js {version}+
- npm or yarn
- {Other requirements}

## Installation

### How do I install {Project Name}?
```bash
npm install {package-name}
```

### I'm getting installation errors. What should I do?
1. Clear npm cache: `npm cache clean --force`
2. Delete node_modules and reinstall
3. Check Node.js version compatibility

## Usage

### How do I configure {feature}?
{Configuration example}

### Can I use this with {technology}?
{Compatibility information}

## Troubleshooting

### Why am I getting {common error}?
{Error explanation and solution}
```

---

## Environment Variable Documentation

Generate documentation for all environment variables.

```markdown
# Environment Variables

## Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret for JWT signing | `your-256-bit-secret` |

## Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `LOG_LEVEL` | Logging verbosity | `info` |
```

---

## Architecture Decision Records (ADRs)

#### ADR Template

```markdown
# ADR-{number}: {Title}

**Date:** {YYYY-MM-DD}
**Status:** {Proposed | Accepted | Deprecated}

## Context
{Describe the issue motivating this decision}

## Decision
We will use **{chosen option}** because {justification}.

## Consequences
- {positive consequence}
- {negative consequence}
```

---

## Hook Integration

### PostToolUse Hook - Auto-Document Changes

After code changes, suggest documentation updates:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit",
      "command": "check-doc-updates.sh"
    }]
  }
}
```

**Script example:**
```bash
#!/bin/bash
# check-doc-updates.sh

# Check if API routes changed
if echo "$CHANGED_FILES" | grep -q "routes/"; then
  echo "SUGGEST: API routes changed - consider updating API docs"
fi

# Check if README needs update
if echo "$CHANGED_FILES" | grep -q "package.json"; then
  echo "SUGGEST: Dependencies changed - consider updating README"
fi

# Check if environment variables added
if grep -r "process.env\." "$CHANGED_FILES" 2>/dev/null; then
  echo "SUGGEST: New environment variables detected - update .env.example"
fi
```

**Hook response pattern:**
```typescript
interface DocUpdateSuggestion {
  type: 'readme' | 'api' | 'changelog' | 'env';
  reason: string;
  files: string[];
  priority: 'high' | 'medium' | 'low';
}
```

### SessionEnd Hook - Changelog Update

At session end, summarize changes for changelog:

```json
{
  "hooks": {
    "SessionEnd": [{
      "matcher": "",
      "command": "summarize-changes.sh"
    }]
  }
}
```

## CI/CD Integration

### GitHub Actions - Documentation Generation

```yaml
name: Documentation
on:
  push:
    branches: [main]

jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate API docs
        run: |
          npx typedoc --out docs/api src/

      - name: Generate OpenAPI spec
        run: |
          npx swagger-jsdoc -d swaggerDef.js -o openapi.yaml src/routes/*.ts

      - name: Update changelog
        if: startsWith(github.ref, 'refs/tags/')
        run: |
          npx conventional-changelog-cli -p angular -i CHANGELOG.md -s

      - name: Deploy docs
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs
```

### Pre-commit Hook - Doc Sync

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check if .env.example is in sync
if [ -f ".env" ] && [ -f ".env.example" ]; then
  env_vars=$(grep -E "^[A-Z_]+=" .env | cut -d= -f1 | sort)
  example_vars=$(grep -E "^[A-Z_]+=" .env.example | cut -d= -f1 | sort)

  if [ "$env_vars" != "$example_vars" ]; then
    echo "Warning: .env and .env.example are out of sync"
    diff <(echo "$env_vars") <(echo "$example_vars")
  fi
fi
```

## Templates

- [templates/adr-template.md](templates/adr-template.md) - Architecture Decision Record
- [templates/api-endpoint.md](templates/api-endpoint.md) - API endpoint documentation
- [templates/env-vars.md](templates/env-vars.md) - Environment variables template

## Reference Files

- [references/api-doc-patterns.md](references/api-doc-patterns.md) - Framework-specific API documentation
- [references/changelog-conventions.md](references/changelog-conventions.md) - Changelog format guidelines
- [references/readme-templates.md](references/readme-templates.md) - README templates by project type
- [references/runbook-patterns.md](references/runbook-patterns.md) - Operational runbook templates
