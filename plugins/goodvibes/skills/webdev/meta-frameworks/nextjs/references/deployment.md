# Next.js Deployment Guide

## Vercel (Recommended)

### Quick Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deploy
vercel --prod
```

### vercel.json Configuration

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["iad1"],
  "functions": {
    "app/api/**/*.ts": {
      "memory": 1024,
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" }
      ]
    }
  ],
  "rewrites": [
    { "source": "/old-path", "destination": "/new-path" }
  ],
  "redirects": [
    { "source": "/legacy", "destination": "/", "permanent": true }
  ]
}
```

### Environment Variables

```bash
# Via CLI
vercel env add VARIABLE_NAME

# Via dashboard
# Settings > Environment Variables
```

**Types:**
- `Production` - Only production deployments
- `Preview` - Preview deployments (PRs)
- `Development` - Local development (`vercel dev`)

### Edge Functions

```tsx
// app/api/edge/route.ts
export const runtime = 'edge'

export async function GET() {
  return new Response('Hello from the edge!')
}
```

### Serverless Functions

```tsx
// app/api/serverless/route.ts
export const runtime = 'nodejs'
export const maxDuration = 60 // seconds (hobby: 10, pro: 60)

export async function GET() {
  // Long-running operation
  return new Response('Done')
}
```

## Self-Hosting

### Node.js Server

```bash
# Build
npm run build

# Start production server
npm start
# or
next start -p 3000
```

**PM2 deployment:**
```json
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'next-app',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3000',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
    },
  }],
}
```

```bash
pm2 start ecosystem.config.js
```

### Docker

```dockerfile
# Dockerfile
FROM node:20-alpine AS base

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

**next.config.js for standalone:**
```js
module.exports = {
  output: 'standalone',
}
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  web:
    build: .
    ports:
      - '3000:3000'
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
    depends_on:
      - db
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Static Export

```js
// next.config.js
module.exports = {
  output: 'export',
  images: {
    unoptimized: true, // Required for static export
  },
}
```

```bash
npm run build
# Output in 'out' directory
```

**Limitations:**
- No Server Components
- No API routes
- No ISR/revalidation
- No middleware

## Nginx Configuration

```nginx
# /etc/nginx/sites-available/nextjs
upstream nextjs {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    location / {
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static files
    location /_next/static {
        proxy_pass http://nextjs;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /static {
        alias /var/www/nextjs/public/static;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

## Cloud Platforms

### AWS (Amplify)

```yaml
# amplify.yml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
```

### Cloudflare Pages

```bash
# Build command
npm run build

# Output directory
.next

# Or use @cloudflare/next-on-pages
npm install @cloudflare/next-on-pages
npx @cloudflare/next-on-pages
```

### Railway

```json
// railway.json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

## CI/CD

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

## Performance Optimization

### next.config.js

```js
/** @type {import('next').NextConfig} */
module.exports = {
  // Compression
  compress: true,

  // Image optimization
  images: {
    domains: ['cdn.example.com'],
    formats: ['image/avif', 'image/webp'],
  },

  // Headers
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|png)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // Bundle analysis
  webpack: (config, { isServer }) => {
    if (process.env.ANALYZE) {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: isServer
            ? '../analyze/server.html'
            : './analyze/client.html',
        })
      )
    }
    return config
  },
}
```

### Bundle Analysis

```bash
npm install @next/bundle-analyzer

# Analyze
ANALYZE=true npm run build
```

## Monitoring

### Health Check Endpoint

```tsx
// app/api/health/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { status: 'unhealthy', error: error.message },
      { status: 503 }
    )
  }
}
```

### Error Tracking (Sentry)

```tsx
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
})
```

```js
// next.config.js
const { withSentryConfig } = require('@sentry/nextjs')

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: 'your-org',
  project: 'your-project',
})
```
