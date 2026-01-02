# Remix Deployment Guide

## Deployment Targets

Remix can deploy to any JavaScript runtime:

| Platform | Adapter | Runtime |
|----------|---------|---------|
| Node.js | `@remix-run/node` | Node.js |
| Cloudflare | `@remix-run/cloudflare` | Workers |
| Deno | `@remix-run/deno` | Deno |
| Vercel | `@vercel/remix` | Edge/Node |
| Netlify | `@netlify/remix-adapter` | Edge/Node |
| Architect | `@remix-run/architect` | AWS Lambda |
| Fly.io | `@remix-run/node` | Node.js |

## Vercel

### Setup

```bash
npm i @vercel/remix
```

**vite.config.ts:**
```typescript
import { vitePlugin as remix } from "@remix-run/dev";
import { vercelPreset } from "@vercel/remix/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    remix({
      presets: [vercelPreset()],
    }),
  ],
});
```

### Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### vercel.json

```json
{
  "framework": "remix",
  "regions": ["iad1"],
  "functions": {
    "app/**/*.ts": {
      "memory": 1024,
      "maxDuration": 30
    }
  }
}
```

## Cloudflare Pages

### Setup

```bash
npm i @remix-run/cloudflare wrangler
```

**vite.config.ts:**
```typescript
import {
  vitePlugin as remix,
  cloudflareDevProxyVitePlugin,
} from "@remix-run/dev";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflareDevProxyVitePlugin(),
    remix(),
  ],
});
```

**functions/[[path]].ts:**
```typescript
import { createPagesFunctionHandler } from "@remix-run/cloudflare-pages";
import * as build from "../build/server";

export const onRequest = createPagesFunctionHandler({
  build,
  mode: process.env.NODE_ENV,
});
```

### wrangler.toml

```toml
name = "my-remix-app"
compatibility_date = "2024-01-01"
pages_build_output_dir = "./build/client"
```

### Deploy

```bash
npm run build
npx wrangler pages deploy ./build/client
```

## Netlify

### Setup

```bash
npm i @netlify/remix-adapter @netlify/functions
```

**vite.config.ts:**
```typescript
import { vitePlugin as remix } from "@remix-run/dev";
import { netlifyPlugin } from "@netlify/remix-adapter/plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [remix(), netlifyPlugin()],
});
```

**netlify.toml:**
```toml
[build]
  command = "npm run build"
  publish = "build/client"

[functions]
  directory = ".netlify/functions-internal"
  node_bundler = "esbuild"

[[headers]]
  for = "/build/*"
  [headers.values]
    "Cache-Control" = "public, max-age=31536000, immutable"
```

### Deploy

```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod
```

## Fly.io

### Setup

```bash
fly launch
```

**Dockerfile:**
```dockerfile
FROM node:20-slim as base
WORKDIR /app
ENV NODE_ENV=production

FROM base as deps
COPY package*.json ./
RUN npm ci --include=dev

FROM base as build
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
RUN npm run build

FROM base
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=build /app/build /app/build
COPY --from=build /app/public /app/public
COPY package.json ./

EXPOSE 3000
CMD ["npm", "start"]
```

**fly.toml:**
```toml
app = "my-remix-app"
primary_region = "iad"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[env]
  NODE_ENV = "production"
```

### Deploy

```bash
fly deploy
```

## Docker (Self-Hosted)

### Dockerfile

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY package.json ./

EXPOSE 3000
CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
    depends_on:
      - db

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## Node.js Server

### Express Adapter

```typescript
// server.ts
import express from "express";
import { createRequestHandler } from "@remix-run/express";

const app = express();

// Serve static files
app.use(express.static("build/client", { maxAge: "1y" }));

// Remix handler
app.all(
  "*",
  createRequestHandler({
    build: await import("./build/server/index.js"),
    mode: process.env.NODE_ENV,
  })
);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
```

### PM2 Configuration

```json
{
  "apps": [{
    "name": "remix-app",
    "script": "npm",
    "args": "start",
    "instances": "max",
    "exec_mode": "cluster",
    "env": {
      "NODE_ENV": "production",
      "PORT": 3000
    }
  }]
}
```

## AWS Lambda

### Setup

```bash
npm i @remix-run/architect
```

**app.arc:**
```arc
@app
my-remix-app

@http
/*
  method any
  src server

@static

@aws
runtime nodejs18.x
region us-east-1
```

### Deploy

```bash
npm run build
npx arc deploy production
```

## Environment Variables

### Development

```bash
# .env (git ignored)
DATABASE_URL=postgresql://localhost/myapp
SESSION_SECRET=dev-secret
```

### Production

Set via platform dashboard or CLI:

```bash
# Vercel
vercel env add DATABASE_URL

# Fly.io
fly secrets set DATABASE_URL=postgresql://...

# Cloudflare
wrangler secret put DATABASE_URL
```

### Access in Code

```typescript
// Server only
const dbUrl = process.env.DATABASE_URL;

// Pass to client via loader
export const loader = async () => {
  return json({
    ENV: {
      PUBLIC_API_URL: process.env.PUBLIC_API_URL,
    },
  });
};
```

## CI/CD

### GitHub Actions

```yaml
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

      - name: Install
        run: npm ci

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

### Static Asset Caching

```typescript
// server.ts (Express)
app.use(
  "/build",
  express.static("build/client/build", {
    immutable: true,
    maxAge: "1y",
  })
);

app.use(
  express.static("build/client", {
    maxAge: "1h",
  })
);
```

### Response Headers

```typescript
export const headers = () => ({
  "Cache-Control": "public, max-age=300, s-maxage=3600",
});
```

### Compression

```typescript
import compression from "compression";

app.use(compression());
```
