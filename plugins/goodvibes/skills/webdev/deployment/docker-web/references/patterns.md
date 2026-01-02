# Docker Patterns for Web Applications

## Framework-Specific Dockerfiles

### Express.js

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN adduser --system --uid 1001 nodeuser
COPY --from=builder --chown=nodeuser /app/dist ./dist
COPY --from=builder --chown=nodeuser /app/node_modules ./node_modules
COPY --from=builder --chown=nodeuser /app/package.json ./
USER nodeuser
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### NestJS

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN adduser --system --uid 1001 nestuser
COPY --from=builder --chown=nestuser /app/dist ./dist
COPY --from=builder --chown=nestuser /app/node_modules ./node_modules
COPY --from=builder --chown=nestuser /app/package.json ./
USER nestuser
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### Fastify

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Hono (Cloudflare Workers style)

```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["bun", "run", "dist/index.js"]
```

### Remix

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "start"]
```

### Astro (SSR)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
```

### Astro (Static)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

## Development Dockerfiles

### Hot Reload

```dockerfile
# Dockerfile.dev
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

# Don't copy source - mount as volume
EXPOSE 3000

CMD ["npm", "run", "dev"]
```

```yaml
# docker-compose.dev.yml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    volumes:
      - .:/app
      - /app/node_modules
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
```

### Debug Mode

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000 9229

CMD ["node", "--inspect=0.0.0.0:9229", "dist/index.js"]
```

## Database Patterns

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

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 3000

# Run migrations on start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

### With Drizzle

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/node_modules ./node_modules

CMD ["sh", "-c", "npm run db:migrate && node dist/index.js"]
```

## Caching Patterns

### npm Cache

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Use cache mount for npm
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
RUN npm run build
```

### pnpm Cache

```dockerfile
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
```

### Yarn Cache

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json yarn.lock ./
RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install --frozen-lockfile
```

## Nginx Configurations

### SPA with API Proxy

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://api:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
}
```

### With SSL

```nginx
server {
    listen 80;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Compose Patterns

### Full Stack

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - api

  api:
    build:
      context: ./api
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/app
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: app
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### With Traefik

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  app:
    build: .
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.app.rule=Host(`app.localhost`)"
      - "traefik.http.services.app.loadbalancer.server.port=3000"
```

## Build Optimization

### Layer Caching

```dockerfile
# Dependencies change less often - cache them
COPY package*.json ./
RUN npm ci

# Source changes more often - copy last
COPY . .
RUN npm run build
```

### Smaller Images

```dockerfile
# Use alpine
FROM node:20-alpine

# Or distroless
FROM gcr.io/distroless/nodejs20-debian12

# Or scratch (for Go)
FROM scratch
```

### Multi-Platform

```bash
# Build for multiple architectures
docker buildx build --platform linux/amd64,linux/arm64 -t my-app .
```
