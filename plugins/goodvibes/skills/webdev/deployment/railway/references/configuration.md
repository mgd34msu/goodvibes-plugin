# Railway Configuration Reference

## railway.json

```json
{
  "$schema": "https://railway.app/railway.schema.json",

  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build",
    "dockerfilePath": "./Dockerfile",
    "watchPatterns": ["src/**", "package.json"]
  },

  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "sleepApplication": false,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3,
    "numReplicas": 1
  }
}
```

## Build Configuration

### Builders

```json
{
  "build": {
    "builder": "NIXPACKS"  // Default, auto-detects
  }
}

{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "./Dockerfile"
  }
}

{
  "build": {
    "builder": "PAKETO"  // Cloud Native Buildpacks
  }
}
```

### Build Command

```json
{
  "build": {
    "buildCommand": "npm run build",
    // Or multiple commands
    "buildCommand": "npm ci && npm run generate && npm run build"
  }
}
```

### Watch Patterns

Trigger rebuilds only for specific files:

```json
{
  "build": {
    "watchPatterns": [
      "src/**",
      "package.json",
      "tsconfig.json"
    ]
  }
}
```

### Root Directory (Monorepo)

```json
{
  "build": {
    "rootDirectory": "apps/api"
  }
}
```

## Deploy Configuration

### Start Command

```json
{
  "deploy": {
    "startCommand": "node dist/index.js"
  }
}
```

### Healthcheck

```json
{
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300  // seconds
  }
}
```

### Restart Policy

```json
{
  "deploy": {
    "restartPolicyType": "ON_FAILURE",  // or "ALWAYS", "NEVER"
    "restartPolicyMaxRetries": 3
  }
}
```

### Replicas

```json
{
  "deploy": {
    "numReplicas": 2
  }
}
```

### Sleep

```json
{
  "deploy": {
    "sleepApplication": true  // Sleep when inactive (Hobby plan)
  }
}
```

## Nixpacks Configuration

### nixpacks.toml

```toml
[phases.setup]
nixPkgs = ["nodejs-20_x", "python3"]

[phases.install]
cmds = ["npm ci"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "npm start"
```

### Language-Specific

```toml
# Node.js
[phases.install]
cmds = ["npm ci --production=false"]

# Python
[phases.install]
cmds = ["pip install -r requirements.txt"]

# Go
[phases.build]
cmds = ["go build -o main ."]
```

### Custom Packages

```toml
[phases.setup]
nixPkgs = ["imagemagick", "ffmpeg", "chromium"]
aptPkgs = ["libfontconfig1"]
```

## Environment Variables

### Built-in Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Assigned port (use this!) |
| `RAILWAY_ENVIRONMENT` | Environment name |
| `RAILWAY_PROJECT_ID` | Project ID |
| `RAILWAY_SERVICE_ID` | Service ID |
| `RAILWAY_REPLICA_ID` | Replica ID |
| `RAILWAY_DEPLOYMENT_ID` | Deployment ID |
| `RAILWAY_STATIC_URL` | Static URL for service |
| `RAILWAY_PUBLIC_DOMAIN` | Public domain if configured |

### Service References

Reference other services in same project:

```bash
# In Variable Editor
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
API_URL=${{api.RAILWAY_PUBLIC_DOMAIN}}
```

### Variable Groups

Share variables across services:
1. Create shared variable group
2. Reference in services

## Database Templates

### PostgreSQL

```bash
railway add postgresql
```

Variables provided:
- `DATABASE_URL`
- `PGHOST`
- `PGPORT`
- `PGUSER`
- `PGPASSWORD`
- `PGDATABASE`

### MySQL

```bash
railway add mysql
```

Variables:
- `MYSQL_URL`
- `MYSQLHOST`
- `MYSQLPORT`
- `MYSQLUSER`
- `MYSQLPASSWORD`
- `MYSQLDATABASE`

### Redis

```bash
railway add redis
```

Variables:
- `REDIS_URL`
- `REDISHOST`
- `REDISPORT`
- `REDISPASSWORD`

### MongoDB

```bash
railway add mongodb
```

Variables:
- `MONGO_URL`

## Dockerfile Configuration

### Basic Node.js

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Build if needed
RUN npm run build

# Use Railway's PORT
EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### Multi-stage

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### With Prisma

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

CMD ["npm", "start"]
```

## GitHub Integration

### Auto Deploy

Configure in dashboard:
1. Connect GitHub repository
2. Select branch to deploy
3. Enable auto-deploy on push

### Branch Environments

```
main     -> Production
staging  -> Staging
PR #123  -> Preview environment
```

### Deploy on Merge

Only deploy after PR merge to main.

## Resource Limits

Configure in dashboard per service:

| Resource | Hobby | Pro |
|----------|-------|-----|
| RAM | 512MB - 8GB | 512MB - 32GB |
| CPU | Shared | Dedicated |
| Build time | 20 min | 60 min |

## Networking

### Internal Networking

Services in same project can communicate via:
- Internal DNS: `service-name.railway.internal`
- TCP: Direct port access

### Private Networking

```bash
# Internal URL (within Railway)
http://api.railway.internal:3000

# External URL
https://api-production.up.railway.app
```

## Cron Jobs

Configure in dashboard:
1. Service settings > Cron
2. Set schedule (cron syntax)

```bash
# Run every hour
0 * * * *

# Run daily at midnight
0 0 * * *

# Run every 5 minutes
*/5 * * * *
```

## Volumes (Persistent Storage)

```bash
# Add volume to service
railway volume add

# Mount path in railway.json
{
  "deploy": {
    "volumeMounts": [
      {
        "mountPath": "/data"
      }
    ]
  }
}
```
