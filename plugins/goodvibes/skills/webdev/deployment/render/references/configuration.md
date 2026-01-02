# Render Configuration Reference

## render.yaml Structure

```yaml
# render.yaml
services:
  - type: web
    name: string
    runtime: node | docker | python | go | ruby | rust | elixir | static
    region: oregon | ohio | virginia | frankfurt | singapore

    # Source
    repo: https://github.com/user/repo  # Optional if auto-detected
    branch: main
    rootDir: ./apps/api  # Monorepo support

    # Build
    buildCommand: npm ci && npm run build
    buildFilter:
      paths:
        - src/**
        - package.json
      ignoredPaths:
        - docs/**

    # Start
    startCommand: npm start

    # Docker specific
    dockerfilePath: ./Dockerfile
    dockerContext: .

    # Static specific
    staticPublishPath: ./dist
    pullRequestPreviewsEnabled: true

    # Environment
    envVars: []

    # Scaling
    plan: free | starter | standard | pro | pro-plus | pro-max
    numInstances: 1
    autoDeploy: true

    # Networking
    healthCheckPath: /health

    # Storage
    disk:
      name: data
      mountPath: /data
      sizeGB: 10

    # Headers (static only)
    headers: []

    # Routes (static only)
    routes: []

databases: []
envVarGroups: []
```

## Service Types

### Web Service

```yaml
services:
  - type: web
    name: api
    runtime: node
    buildCommand: npm ci && npm run build
    startCommand: npm start
```

### Static Site

```yaml
services:
  - type: web
    name: frontend
    runtime: static
    buildCommand: npm ci && npm run build
    staticPublishPath: ./dist
```

### Background Worker

```yaml
services:
  - type: worker
    name: queue-worker
    runtime: node
    buildCommand: npm ci && npm run build
    startCommand: npm run worker
```

### Private Service

```yaml
services:
  - type: pserv
    name: internal-api
    runtime: node
    buildCommand: npm ci && npm run build
    startCommand: npm start
```

### Cron Job

```yaml
services:
  - type: cron
    name: daily-job
    runtime: node
    buildCommand: npm ci
    startCommand: npm run cron
    schedule: "0 0 * * *"  # Cron syntax
```

## Environment Variables

### Static Values

```yaml
envVars:
  - key: NODE_ENV
    value: production
  - key: LOG_LEVEL
    value: info
```

### From Database

```yaml
envVars:
  - key: DATABASE_URL
    fromDatabase:
      name: mydb
      property: connectionString
```

Available properties:
- `connectionString` - Full connection URL
- `host` - Database host
- `port` - Database port
- `user` - Username
- `password` - Password
- `database` - Database name

### From Service

```yaml
envVars:
  - key: API_URL
    fromService:
      name: api
      type: web
      property: host

  - key: REDIS_URL
    fromService:
      name: redis
      type: redis
      property: connectionString
```

Available properties:
- `host` - Service hostname
- `hostport` - Hostname with port
- `connectionString` - Full URL (Redis)

### From Group

```yaml
envVars:
  - fromGroup: shared-settings
```

### Sync (Secret)

```yaml
envVars:
  - key: API_SECRET
    sync: false  # Only set in dashboard, not in YAML
```

## Environment Variable Groups

```yaml
envVarGroups:
  - name: shared-settings
    envVars:
      - key: LOG_LEVEL
        value: info
      - key: TZ
        value: UTC

  - name: production-secrets
    envVars:
      - key: API_KEY
        sync: false  # Set in dashboard
```

## Databases

### PostgreSQL

```yaml
databases:
  - name: mydb
    plan: free | starter | standard | pro | pro-plus
    databaseName: myapp
    user: myuser
    region: oregon
    postgresMajorVersion: "16"
    ipAllowList: []  # IP whitelist
```

### Redis

```yaml
services:
  - type: redis
    name: cache
    plan: free | starter | standard | pro
    maxmemoryPolicy: noeviction | allkeys-lru | volatile-lru
    ipAllowList: []
```

## Plans & Pricing

### Web Service Plans

| Plan | RAM | CPU | Bandwidth | Price |
|------|-----|-----|-----------|-------|
| Free | 512 MB | Shared | 100 GB | $0 |
| Starter | 512 MB | 0.5 | 100 GB | $7 |
| Standard | 2 GB | 1 | 100 GB | $25 |
| Pro | 4 GB | 2 | 100 GB | $85 |
| Pro Plus | 8 GB | 4 | 100 GB | $175 |

### Database Plans

| Plan | RAM | Storage | Connections |
|------|-----|---------|-------------|
| Free | 256 MB | 1 GB | 1 |
| Starter | 256 MB | 1 GB | 10 |
| Standard | 1 GB | 10 GB | 50 |
| Pro | 4 GB | 50 GB | 100 |

## Static Site Configuration

### Routes

```yaml
services:
  - type: web
    runtime: static
    routes:
      # SPA fallback
      - type: rewrite
        source: /*
        destination: /index.html

      # Redirect
      - type: redirect
        source: /old
        destination: /new
        status: 301

      # Proxy
      - type: rewrite
        source: /api/*
        destination: https://api.example.com/*
```

### Headers

```yaml
services:
  - type: web
    runtime: static
    headers:
      - path: /*
        name: X-Frame-Options
        value: DENY

      - path: /*
        name: X-Content-Type-Options
        value: nosniff

      - path: /static/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
```

## Docker Configuration

```yaml
services:
  - type: web
    name: docker-app
    runtime: docker
    dockerfilePath: ./Dockerfile
    dockerContext: .

    # Build args
    envVars:
      - key: BUILD_ARG_NAME
        value: value
```

## Build Configuration

### Build Filter

```yaml
services:
  - type: web
    buildFilter:
      paths:
        - src/**
        - package.json
        - tsconfig.json
      ignoredPaths:
        - "**/*.test.ts"
        - docs/**
```

### Monorepo

```yaml
services:
  - type: web
    name: web
    rootDir: packages/web
    buildCommand: npm ci && npm run build

  - type: web
    name: api
    rootDir: packages/api
    buildCommand: npm ci && npm run build
```

## Disk Storage

```yaml
services:
  - type: web
    disk:
      name: uploads
      mountPath: /app/uploads
      sizeGB: 20
```

## Health Checks

```yaml
services:
  - type: web
    healthCheckPath: /health

    # Or custom health check
    healthCheckHost: localhost
    healthCheckTimeout: 30
```

## Auto-Deploy

```yaml
services:
  - type: web
    autoDeploy: true  # Deploy on push

    # Or manual
    autoDeploy: false
```

## Preview Environments

```yaml
services:
  - type: web
    pullRequestPreviewsEnabled: true
    # Generates unique URL per PR
```

## Regions

| Region | Code |
|--------|------|
| Oregon (US West) | oregon |
| Ohio (US East) | ohio |
| Virginia (US East) | virginia |
| Frankfurt (EU) | frankfurt |
| Singapore (Asia) | singapore |

```yaml
services:
  - type: web
    region: frankfurt
```

## Example: Full Stack App

```yaml
# render.yaml
services:
  # Frontend
  - type: web
    name: frontend
    runtime: static
    buildCommand: cd frontend && npm ci && npm run build
    staticPublishPath: frontend/dist
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
    envVars:
      - key: VITE_API_URL
        fromService:
          name: api
          type: web
          property: host

  # API
  - type: web
    name: api
    runtime: node
    buildCommand: cd api && npm ci && npm run build
    startCommand: cd api && npm start
    healthCheckPath: /health
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: db
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: redis
          type: redis
          property: connectionString

  # Redis
  - type: redis
    name: redis
    plan: starter

databases:
  - name: db
    plan: starter
    databaseName: myapp

envVarGroups:
  - name: shared
    envVars:
      - key: NODE_ENV
        value: production
```
