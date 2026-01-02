# PlanetScale Database Branching

## Overview

PlanetScale branching works like Git for your database schema. Create isolated branches for development, test changes safely, then merge to production via deploy requests.

## Branch Types

### Development Branches
- Can be modified directly
- Schema changes take effect immediately
- Use for local development and testing
- No deploy request required

### Production Branches
- Protected by default
- Require deploy requests for changes
- Have safe migrations enabled
- Support schema reverts

## Workflow

### 1. Create Feature Branch

```bash
# Create from main (production)
pscale branch create mydb feature-user-roles

# Create from another branch
pscale branch create mydb feature-permissions --from feature-user-roles
```

### 2. Connect Locally

```bash
# Start proxy connection
pscale connect mydb feature-user-roles --port 3309

# Your app connects to localhost:3309
DATABASE_URL="mysql://root@127.0.0.1:3309/mydb"
```

### 3. Develop Schema

```bash
# Push schema changes
npx prisma db push

# Or use raw SQL
pscale shell mydb feature-user-roles
> ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user';
```

### 4. Create Deploy Request

```bash
# Create deploy request to merge to main
pscale deploy-request create mydb feature-user-roles

# Output: Deploy request #1 created
```

### 5. Review Changes

```bash
# View schema diff
pscale deploy-request diff mydb 1

# Shows:
# + ALTER TABLE `users` ADD COLUMN `role` varchar(50) DEFAULT 'user';
```

### 6. Deploy to Production

```bash
# Deploy (applies changes to main)
pscale deploy-request deploy mydb 1

# Or via Dashboard for team review
```

## Safe Migrations

When enabled on a branch:

### Features
- **Non-blocking DDL**: Schema changes don't lock tables
- **Deploy queue**: Changes apply in order
- **Schema revert**: Undo recent changes
- **Lint checks**: Catch breaking changes before deploy

### Enable Safe Migrations

```bash
# Via CLI
pscale branch safe-migrations enable mydb main

# Or in Dashboard > Branch Settings
```

### Revert Schema Change

```bash
# View recent deploys
pscale deploy-request list mydb --state deployed

# Revert specific deploy
pscale deploy-request revert mydb 5
```

## Branching Strategies

### Feature Branch Strategy

```
main (production)
├── staging
│   ├── feature-auth
│   ├── feature-payments
│   └── feature-notifications
```

```bash
# Create staging from main
pscale branch create mydb staging

# Features branch from staging
pscale branch create mydb feature-auth --from staging

# Merge feature to staging
pscale deploy-request create mydb feature-auth --into staging

# Merge staging to main
pscale deploy-request create mydb staging
```

### Environment Strategy

```bash
# Production
pscale branch create mydb production
pscale branch safe-migrations enable mydb production
pscale branch promote mydb production  # Make default

# Staging (mirrors production schema)
pscale branch create mydb staging --from production

# Development (for experiments)
pscale branch create mydb development --from staging
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/deploy-db.yml
name: Deploy Database Changes

on:
  push:
    branches: [main]
    paths: ['prisma/schema.prisma']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pscale
        uses: planetscale/setup-pscale-action@v1

      - name: Authenticate
        run: pscale auth login --service-token ${{ secrets.PSCALE_TOKEN }}

      - name: Create branch
        run: |
          BRANCH="deploy-${GITHUB_SHA::8}"
          pscale branch create ${{ secrets.PSCALE_DB }} $BRANCH

      - name: Apply schema
        run: |
          pscale connect ${{ secrets.PSCALE_DB }} $BRANCH --port 3309 &
          sleep 5
          DATABASE_URL="mysql://root@127.0.0.1:3309/${{ secrets.PSCALE_DB }}" npx prisma db push

      - name: Create deploy request
        run: |
          pscale deploy-request create ${{ secrets.PSCALE_DB }} $BRANCH \
            --notes "Automated deploy from commit ${GITHUB_SHA}"
```

### Auto-Deploy on Merge

```yaml
# Deploy when PR is merged
on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  deploy:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Deploy pending request
        run: |
          # Find and deploy the matching deploy request
          DR=$(pscale deploy-request list mydb --format json | jq -r '.[0].number')
          pscale deploy-request deploy mydb $DR
```

## Branch Sync

Keep branches up to date with production:

```bash
# Refresh branch with latest main schema
pscale branch refresh mydb feature-branch

# This creates a new branch with:
# - Latest schema from main
# - Your branch's additional changes applied on top
```

## Data Seeding

Development branches start empty. Seed data for testing:

```bash
# Connect to branch
pscale connect mydb dev-branch --port 3309

# Run seed script
DATABASE_URL="mysql://root@127.0.0.1:3309/mydb" npx prisma db seed
```

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.user.createMany({
    data: [
      { email: 'alice@test.com', name: 'Alice' },
      { email: 'bob@test.com', name: 'Bob' }
    ]
  })
}

main()
```

## Cleanup

```bash
# Delete merged branches
pscale branch delete mydb feature-completed

# List stale branches
pscale branch list mydb --format json | jq '.[] | select(.updated_at < "2024-01-01")'
```

## Best Practices

1. **One schema change per branch** - Easier to review and revert
2. **Name branches descriptively** - `add-user-roles` not `feature-1`
3. **Test on branch before deploy request** - Run your app against the branch
4. **Use deploy request notes** - Document why changes were made
5. **Clean up merged branches** - Reduce clutter
6. **Enable safe migrations on production** - Always
