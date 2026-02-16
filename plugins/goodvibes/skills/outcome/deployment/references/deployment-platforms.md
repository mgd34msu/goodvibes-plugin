# Deployment Platforms Reference

Comprehensive guide to deploying applications on modern platforms.

## Platform Comparison

| Feature | Vercel | Railway | Fly.io | AWS | Docker (Self-Hosted) |
|---------|--------|---------|--------|-----|----------------------|
| **Best For** | Next.js, Static Sites | Full-stack Apps | Containers, Global Edge | Enterprise | VPS, On-Premise |
| **Pricing (Small)** | Free tier (100GB bandwidth) | $5/month | $3-10/month | Variable | VPS cost (~$5-20/month) |
| **Pricing (Medium)** | $20/month (Pro) | $20-50/month | $30-100/month | $50-200/month | Same |
| **Pricing (Large)** | Enterprise | $200+/month | $500+/month | $1000+/month | Same |
| **Database Hosting** | No (use Vercel Postgres) | Yes (PostgreSQL, Redis, MongoDB) | Yes (PostgreSQL, Redis) | Yes (RDS, DynamoDB, etc.) | Self-managed |
| **Auto-Scaling** | Yes | Yes | Yes | Yes (complex) | Manual |
| **Preview Deployments** | Automatic | Automatic | Manual | Manual | Manual |
| **Global CDN** | Yes | No | Yes (multi-region) | Yes (CloudFront) | No |
| **Cold Start** | ~100ms | ~500ms | ~200ms | Varies | None (always running) |
| **Setup Time** | 5 minutes | 10 minutes | 15 minutes | Hours/Days | 30+ minutes |
| **Maintenance** | Zero | Minimal | Minimal | High | Medium-High |
| **Custom Domains** | Free SSL | Free SSL | Free SSL | ACM (free) + config | Manual (Let's Encrypt) |
| **Environment Variables** | UI + CLI | UI + CLI | CLI only | Many ways | .env files |
| **Logs** | Built-in (7 days free) | Built-in (7 days) | Built-in (limited) | CloudWatch (paid) | Self-managed |
| **Monitoring** | Basic (Analytics addon) | Basic | Basic | CloudWatch (complex) | Self-managed |
| **CI/CD Integration** | GitHub auto-deploy | GitHub auto-deploy | Manual or GitHub Actions | CodePipeline or GitHub Actions | GitHub Actions |

## Vercel

### Quick Start

```bash
# Install CLI
npm install -g vercel

# Deploy from project directory
vercel

# Deploy to production
vercel --prod
```

### Configuration (vercel.json)

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["iad1", "sfo1"],
  "env": {
    "DATABASE_URL": "@database-url"
  },
  "build": {
    "env": {
      "NEXT_PUBLIC_API_URL": "https://api.example.com"
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
  "redirects": [
    {
      "source": "/old-route",
      "destination": "/new-route",
      "permanent": true
    }
  ]
}
```

### Environment Variables

```bash
# Add production secret
vercel env add DATABASE_URL production

# Add preview secret (for PR deployments)
vercel env add DATABASE_URL preview

# Add development secret
vercel env add DATABASE_URL development

# Pull environment variables locally
vercel env pull .env.local
```

### Custom Domains

```bash
# Add domain
vercel domains add example.com

# Point to deployment
vercel alias set my-deployment.vercel.app example.com
```

### Rollback

```bash
# List deployments
vercel ls

# Promote specific deployment to production
vercel promote https://my-app-abc123.vercel.app
```

## Railway

### Quick Start

```bash
# Install CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Deploy
railway up

# Open dashboard
railway open
```

### Configuration (railway.json)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build",
    "watchPatterns": [
      "src/**",
      "package.json"
    ]
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3,
    "numReplicas": 1
  }
}
```

### Adding PostgreSQL Database

```bash
# Add PostgreSQL service
railway add --database postgres

# Connect to database
railway connect postgres

# Get connection string
railway variables
```

Railway automatically injects `DATABASE_URL` as an environment variable.

### Custom Domains

1. Go to project settings in dashboard
2. Click "Domains"
3. Add custom domain
4. Configure DNS:
   - CNAME: `your-domain.com` -> `your-app.up.railway.app`
   - Railway handles SSL automatically

### Deployments

```bash
# Deploy current branch
railway up

# Deploy with watch mode (redeploy on file changes)
railway up --watch

# Rollback to previous deployment
railway rollback
```

## Fly.io

### Quick Start

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch app (creates fly.toml)
fly launch

# Deploy
fly deploy

# Open in browser
fly open
```

### Configuration (fly.toml)

```toml
app = "my-app"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"
  NODE_ENV = "production"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  timeout = "5s"
  path = "/api/health"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256

[[statics]]
  guest_path = "/app/public"
  url_prefix = "/static"
```

### PostgreSQL Database

```bash
# Create Postgres cluster
fly postgres create --name my-app-db --region sjc

# Attach to app
fly postgres attach my-app-db

# Connect to database
fly postgres connect -a my-app-db
```

### Secrets Management

```bash
# Set secret
fly secrets set DATABASE_URL="postgresql://..."

# Set multiple secrets
fly secrets set API_KEY="..." STRIPE_KEY="..."

# List secrets (values hidden)
fly secrets list

# Remove secret
fly secrets unset API_KEY
```

### Multi-Region Deployment

```bash
# Deploy to multiple regions
fly regions add iad ord

# List regions
fly regions list

# Remove region
fly regions remove ord
```

### Scaling

```bash
# Scale to 3 machines
fly scale count 3

# Scale VM size
fly scale vm shared-cpu-1x

# Scale memory
fly scale memory 512
```

### Rollback

```bash
# List releases
fly releases

# Rollback to previous release
fly releases rollback
```

## Docker Templates

### Next.js (App Router) - Production Optimized

```dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "server.js"]
```

**next.config.js:**
```javascript
/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone', // Required for Docker
  experimental: {
    outputFileTracingIncludes: {
      '/api/**/*': ['./node_modules/**/*.wasm', './node_modules/**/*.node'],
    },
  },
};
```

### Node.js + Express

```dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Build TypeScript
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production runtime
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs package.json ./

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "dist/index.js"]
```

### .dockerignore

```
# Dependencies
node_modules
npm-debug.log
yarn-debug.log
yarn-error.log

# Testing
coverage
*.test.ts
*.spec.ts
__tests__
__mocks__

# Build outputs
dist
build
.next
out

# Development
.vscode
.idea
*.swp
*.swo
*~

# Environment
.env
.env.local
.env.*.local

# Git
.git
.gitignore
.gitattributes

# Documentation
*.md
!README.md
docs

# CI/CD
.github
.gitlab-ci.yml
.circleci

# Docker
Dockerfile
.dockerignore
docker-compose*.yml

# Misc
.DS_Store
Thumbs.db
```

## GitHub Actions Templates

### Vercel Deployment

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Vercel CLI
        run: npm install --global vercel@latest
      
      - name: Pull Vercel Environment Information
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
      
      - name: Build Project Artifacts
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}
      
      - name: Deploy to Vercel (Production)
        if: github.ref == 'refs/heads/main'
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
      
      - name: Deploy to Vercel (Preview)
        if: github.event_name == 'pull_request'
        run: vercel deploy --prebuilt --token=${{ secrets.VERCEL_TOKEN }}
```

### Railway Deployment

```yaml
name: Deploy to Railway

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Railway CLI
        run: npm install -g @railway/cli
      
      - name: Deploy to Railway
        run: railway up --service ${{ secrets.RAILWAY_SERVICE }}
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

### Docker Build and Push

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [main]
    tags:
      - 'v*'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      
      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha
      
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### Fly.io Deployment

```yaml
name: Deploy to Fly.io

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: superfly/flyctl-actions/setup-flyctl@master
      
      - name: Deploy to Fly.io
        run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

## Environment Variable Patterns

### Validate with Zod

**src/env.ts:**
```typescript
import { z } from 'zod';

const envSchema = z.object({
  // Server-side only
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  
  // Client-side (must start with NEXT_PUBLIC_)
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[FAIL] Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
```

### Platform-Specific Injection

**Vercel:**
```bash
vercel env add DATABASE_URL production
```

**Railway:**
```bash
railway variables set DATABASE_URL="postgresql://..."
```

**Fly.io:**
```bash
fly secrets set DATABASE_URL="postgresql://..."
```

**Docker:**
```bash
docker run -e DATABASE_URL="postgresql://..." my-app
```

**GitHub Actions:**
```yaml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Rollback Procedures

### Vercel

```bash
# List recent deployments
vercel ls --prod

# Promote specific deployment
vercel promote https://my-app-abc123.vercel.app
```

**Instant rollback** - takes ~5 seconds.

### Railway

```bash
# Rollback to previous deployment
railway rollback
```

Or use the dashboard to select a specific deployment.

### Fly.io

```bash
# List releases
fly releases

# Rollback to previous
fly releases rollback

# Rollback to specific version
fly releases rollback --version 42
```

### Docker (Blue-Green)

```bash
# Deploy new version (green) alongside old (blue)
docker run -d --name app-green -p 3001:3000 my-app:v2

# Test green deployment
curl http://localhost:3001/api/health

# Switch traffic (update load balancer or reverse proxy)
# nginx, Traefik, HAProxy, etc.

# Remove old version
docker stop app-blue
docker rm app-blue
```

### Kubernetes

```bash
# Rollback deployment
kubectl rollout undo deployment/my-app

# Rollback to specific revision
kubectl rollout undo deployment/my-app --to-revision=2

# Check rollout status
kubectl rollout status deployment/my-app
```

## Cost Optimization

### Small Apps (< 10k users/month)

**Recommended: Vercel Free Tier + Vercel Postgres**
- Cost: $0-5/month
- 100GB bandwidth
- Serverless functions
- Automatic scaling

**Alternative: Railway Hobby**
- Cost: $5/month
- Includes PostgreSQL
- No bandwidth limits

### Medium Apps (10k-100k users/month)

**Recommended: Vercel Pro + Supabase**
- Vercel: $20/month
- Supabase: $25/month (Pro tier)
- Total: $45/month

**Alternative: Railway**
- $20-50/month depending on usage
- Database included

### Large Apps (100k+ users/month)

**Recommended: Fly.io or AWS**
- Fly.io: $100-500/month
- AWS: $200-2000/month (varies widely)

**Consider:**
- CDN costs (CloudFront, Cloudflare)
- Database scaling (RDS, Aurora)
- Redis caching
- Monitoring tools

## Monitoring Setup

### Sentry Error Tracking

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

Creates:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`

### Uptime Monitoring

Free options:
- **UptimeRobot**: 50 monitors, 5-minute intervals
- **Better Uptime**: 10 monitors, 3-minute intervals
- **Checkly**: 5 checks, 5-minute intervals

Paid:
- **Pingdom**: $15/month
- **StatusCake**: $25/month

### Performance Monitoring

**Vercel Analytics:**
- Built-in for Vercel deployments
- Web Vitals tracking
- $10/month for Pro features

**Alternatives:**
- **PostHog**: Open-source, self-hosted or cloud
- **Plausible**: Privacy-focused, $9/month
- **Fathom**: Simple analytics, $14/month

## Summary

**Platform Selection Guide:**

- **Vercel**: Best for Next.js, zero config, instant rollback
- **Railway**: Best for full-stack with database, simple pricing
- **Fly.io**: Best for containers, global edge, fine-grained control
- **AWS**: Best for enterprise, compliance, complex infrastructure
- **Docker**: Best for self-hosted, VPS, maximum control

**Key Decisions:**

1. **Framework determines platform**: Next.js -> Vercel, Full-stack -> Railway/Fly.io
2. **Database needs**: Managed (Railway) vs. External (Vercel + Supabase)
3. **Global users**: Fly.io multi-region or Vercel Edge
4. **Budget**: Start with free tiers, scale as needed
5. **Control vs. Convenience**: Managed platforms (less control, easier) vs. Docker/K8s (more control, complex)

**Essential Features:**

- [x] Health check endpoint
- [x] Environment variable validation
- [x] CI/CD pipeline
- [x] Preview deployments
- [x] Instant rollback capability
- [x] Error tracking (Sentry)
- [x] Uptime monitoring
- [x] Database migration strategy
