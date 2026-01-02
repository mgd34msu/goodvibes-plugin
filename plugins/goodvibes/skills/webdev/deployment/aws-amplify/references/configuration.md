# AWS Amplify Configuration Reference

## amplify.yml Structure

```yaml
version: 1

# For multiple apps (monorepo)
applications:
  - appRoot: apps/web
    frontend:
      phases:
        preBuild:
          commands: []
        build:
          commands: []
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths: []

# For single app
frontend:
  phases:
    preBuild:
      commands: []
    build:
      commands: []
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths: []

# Backend (Amplify Gen 2)
backend:
  phases:
    build:
      commands:
        - amplifyPush --simple

# Custom rules
customRules: []

# Custom headers
customHeaders: []

# Test phase
test:
  phases:
    preTest:
      commands: []
    test:
      commands: []
    postTest:
      commands: []
  artifacts:
    baseDirectory: coverage
    files:
      - '**/*'
```

## Build Phases

### preBuild

Runs before the build. Install dependencies here.

```yaml
preBuild:
  commands:
    - nvm use 20
    - npm ci
    - npm run generate  # Prisma, etc.
```

### build

Main build phase.

```yaml
build:
  commands:
    - npm run build
```

### postBuild

Runs after build (optional).

```yaml
postBuild:
  commands:
    - npm run test:e2e
    - aws s3 sync ./dist s3://my-bucket
```

## Artifacts

### Next.js (SSR)

```yaml
artifacts:
  baseDirectory: .next
  files:
    - '**/*'
```

### Static (CRA, Vite)

```yaml
artifacts:
  baseDirectory: dist
  files:
    - '**/*'
```

### Gatsby

```yaml
artifacts:
  baseDirectory: public
  files:
    - '**/*'
```

### Astro

```yaml
artifacts:
  baseDirectory: dist
  files:
    - '**/*'
```

## Caching

### Node.js

```yaml
cache:
  paths:
    - node_modules/**/*
    - .npm/**/*
```

### Next.js

```yaml
cache:
  paths:
    - node_modules/**/*
    - .next/cache/**/*
```

### pnpm

```yaml
cache:
  paths:
    - node_modules/**/*
    - .pnpm-store/**/*
```

### Yarn

```yaml
cache:
  paths:
    - node_modules/**/*
    - .yarn/cache/**/*
```

## Custom Rules (Redirects/Rewrites)

### Redirect Types

```yaml
customRules:
  # 301 Permanent Redirect
  - source: /old
    target: /new
    status: '301'

  # 302 Temporary Redirect
  - source: /temp
    target: /new
    status: '302'

  # 200 Rewrite (proxy)
  - source: /api/<*>
    target: https://api.example.com/<*>
    status: '200'

  # 404 Not Found
  - source: /deprecated
    target: /404.html
    status: '404'
```

### Pattern Syntax

```yaml
customRules:
  # Exact match
  - source: /about
    target: /about-us
    status: '301'

  # Wildcard
  - source: /docs/<*>
    target: /documentation/<*>
    status: '301'

  # Regex (must be in angle brackets)
  - source: </^\/user\/(\d+)$/>
    target: /users/<1>
    status: '301'

  # SPA fallback (exclude files with extensions)
  - source: </^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>
    target: /index.html
    status: '200'
```

### Conditional Rules

```yaml
customRules:
  # Country-based redirect
  - source: /
    target: /en
    status: '302'
    condition:
      - country: ['US', 'GB']

  # Query string rewrite
  - source: /search?q=<query>
    target: /results/<query>
    status: '200'
```

## Custom Headers

```yaml
customHeaders:
  # All files
  - pattern: '**/*'
    headers:
      - key: X-Frame-Options
        value: DENY
      - key: X-Content-Type-Options
        value: nosniff
      - key: Referrer-Policy
        value: strict-origin-when-cross-origin

  # Static assets
  - pattern: '*.js'
    headers:
      - key: Cache-Control
        value: public, max-age=31536000, immutable

  - pattern: '*.css'
    headers:
      - key: Cache-Control
        value: public, max-age=31536000, immutable

  # Images
  - pattern: '*.{jpg,jpeg,png,gif,webp,svg,ico}'
    headers:
      - key: Cache-Control
        value: public, max-age=31536000

  # Fonts
  - pattern: '*.{woff,woff2,ttf,eot}'
    headers:
      - key: Cache-Control
        value: public, max-age=31536000
      - key: Access-Control-Allow-Origin
        value: '*'

  # API responses (no cache)
  - pattern: /api/*
    headers:
      - key: Cache-Control
        value: no-store, no-cache, must-revalidate
```

## Environment Variables

### Access in Build

```yaml
build:
  commands:
    - echo "Building for $AWS_BRANCH"
    - echo "NEXT_PUBLIC_API=$API_URL" >> .env.production
    - npm run build
```

### Built-in Variables

| Variable | Description |
|----------|-------------|
| `AWS_APP_ID` | Amplify App ID |
| `AWS_BRANCH` | Current branch name |
| `AWS_BRANCH_ARN` | Branch ARN |
| `AWS_CLONE_URL` | Git clone URL |
| `AWS_COMMIT_ID` | Current commit SHA |
| `AWS_JOB_ID` | Build job ID |
| `_LIVE_UPDATES` | Live updates enabled |

### Conditional Builds

```yaml
build:
  commands:
    - |
      if [ "$AWS_BRANCH" = "main" ]; then
        npm run build:production
      elif [ "$AWS_BRANCH" = "develop" ]; then
        npm run build:staging
      else
        npm run build:preview
      fi
```

## Framework Detection

Amplify auto-detects frameworks. Override with:

```yaml
# Force specific framework settings
frontend:
  phases:
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
```

## Build Image

### Node.js Version

```yaml
preBuild:
  commands:
    - nvm use 20
    - node -v
```

### Available Runtimes

- Node.js: 14, 16, 18, 20
- npm, yarn, pnpm
- Python: 3.8, 3.9, 3.10
- Go: 1.20+

### Custom Build Image

Configure in Console:
App settings > Build settings > Build image settings

## Monorepo Configuration

### Turborepo

```yaml
version: 1
applications:
  - appRoot: apps/web
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npx turbo run build --filter=web
      artifacts:
        baseDirectory: apps/web/.next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - apps/web/.next/cache/**/*
```

### Nx

```yaml
version: 1
applications:
  - appRoot: .
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npx nx build web
      artifacts:
        baseDirectory: dist/apps/web
        files:
          - '**/*'
```

## Webhook Triggers

Configure in Console for custom CI/CD:

```bash
# Trigger build via webhook
curl -X POST https://webhooks.amplify.aws/prod/webhooks?id=xxx&token=xxx
```
