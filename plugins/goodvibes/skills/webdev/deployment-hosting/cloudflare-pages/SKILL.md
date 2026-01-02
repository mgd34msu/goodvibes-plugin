---
name: cloudflare-pages
description: Deploys applications to Cloudflare Pages including Functions, KV, D1, and R2 bindings. Use when deploying to the edge, building globally distributed applications, or using Cloudflare's ecosystem.
---

# Cloudflare Pages

Full-stack deployment platform with global edge network.

## Quick Start

**Install Wrangler CLI:**
```bash
npm install -g wrangler
```

**Login:**
```bash
wrangler login
```

**Create project:**
```bash
npm create cloudflare@latest my-app
```

**Deploy:**
```bash
wrangler pages deploy dist
```

## Project Setup

### Connect Git Repository

1. Go to dash.cloudflare.com > Pages
2. Create a project > Connect to Git
3. Select repository
4. Configure build settings
5. Deploy

### wrangler.toml Configuration

```toml
name = "my-app"
compatibility_date = "2024-01-01"
pages_build_output_dir = "dist"

# KV Namespace binding
[[kv_namespaces]]
binding = "MY_KV"
id = "abc123"

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "xyz789"

# R2 Bucket binding
[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "my-bucket"

# Environment variables
[vars]
API_URL = "https://api.example.com"

# Secrets (set via CLI)
# wrangler secret put API_KEY
```

## Pages Functions

### Basic Function

```typescript
// functions/api/hello.ts
export const onRequest: PagesFunction = async (context) => {
  return new Response(JSON.stringify({ message: 'Hello, World!' }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

### HTTP Methods

```typescript
// functions/api/users.ts
export const onRequestGet: PagesFunction = async (context) => {
  const users = await getUsers();
  return Response.json(users);
};

export const onRequestPost: PagesFunction = async (context) => {
  const body = await context.request.json();
  const user = await createUser(body);
  return Response.json(user, { status: 201 });
};

export const onRequestDelete: PagesFunction = async (context) => {
  const { id } = context.params;
  await deleteUser(id);
  return new Response(null, { status: 204 });
};
```

### Dynamic Routes

```typescript
// functions/api/users/[id].ts
export const onRequestGet: PagesFunction = async (context) => {
  const { id } = context.params;
  const user = await getUser(id);

  if (!user) {
    return new Response('Not Found', { status: 404 });
  }

  return Response.json(user);
};
```

### Middleware

```typescript
// functions/_middleware.ts
export const onRequest: PagesFunction = async (context) => {
  // Auth check
  const token = context.request.headers.get('Authorization');

  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Continue to next handler
  return context.next();
};
```

### Typed Context

```typescript
// functions/api/data.ts
interface Env {
  MY_KV: KVNamespace;
  DB: D1Database;
  MY_BUCKET: R2Bucket;
  API_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { MY_KV, DB, MY_BUCKET, API_KEY } = context.env;

  // Use bindings
  const value = await MY_KV.get('key');
  const result = await DB.prepare('SELECT * FROM users').all();

  return Response.json({ value, users: result.results });
};
```

## KV Storage

### Basic Operations

```typescript
// functions/api/kv.ts
interface Env {
  MY_KV: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { MY_KV } = context.env;

  // Write
  await MY_KV.put('user:123', JSON.stringify({ name: 'John' }));

  // Write with expiration
  await MY_KV.put('session:abc', 'token', { expirationTtl: 3600 });

  // Read
  const user = await MY_KV.get('user:123', 'json');

  // Delete
  await MY_KV.delete('user:123');

  // List keys
  const keys = await MY_KV.list({ prefix: 'user:' });

  return Response.json({ user, keys: keys.keys });
};
```

## D1 Database

### Queries

```typescript
// functions/api/users.ts
interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  // Simple query
  const { results } = await DB.prepare('SELECT * FROM users').all();

  return Response.json(results);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const { name, email } = await context.request.json();

  // Parameterized query
  const result = await DB.prepare(
    'INSERT INTO users (name, email) VALUES (?, ?)'
  )
    .bind(name, email)
    .run();

  return Response.json({ id: result.meta.last_row_id }, { status: 201 });
};
```

### Migrations

```sql
-- migrations/0001_create_users.sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```bash
# Apply migrations
wrangler d1 migrations apply my-database
```

## R2 Object Storage

```typescript
// functions/api/files.ts
interface Env {
  MY_BUCKET: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { MY_BUCKET } = context.env;
  const { key } = context.params;

  const object = await MY_BUCKET.get(key as string);

  if (!object) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
    },
  });
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { MY_BUCKET } = context.env;
  const { key } = context.params;
  const body = await context.request.arrayBuffer();

  await MY_BUCKET.put(key as string, body, {
    httpMetadata: {
      contentType: context.request.headers.get('Content-Type') ?? undefined,
    },
  });

  return new Response('Uploaded', { status: 201 });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { MY_BUCKET } = context.env;
  const { key } = context.params;

  await MY_BUCKET.delete(key as string);

  return new Response(null, { status: 204 });
};
```

## Environment Variables

### Setting Variables

**Via Dashboard:**
Pages project > Settings > Environment variables

**Via wrangler.toml:**
```toml
[vars]
API_URL = "https://api.example.com"
DEBUG = "false"

[env.production.vars]
API_URL = "https://api.example.com"

[env.preview.vars]
API_URL = "https://staging-api.example.com"
```

### Secrets

```bash
# Set secret
wrangler secret put API_KEY

# List secrets
wrangler secret list

# Delete secret
wrangler secret delete API_KEY
```

## Headers & Redirects

### _headers File

```
# Custom headers
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff

/api/*
  Access-Control-Allow-Origin: *

/*.js
  Cache-Control: public, max-age=31536000
```

### _redirects File

```
# Redirects
/old-page /new-page 301
/blog/* /posts/:splat 301
/api/* /api/:splat 200

# SPA fallback
/* /index.html 200
```

## Durable Objects

```typescript
// src/counter.ts
export class Counter implements DurableObject {
  private value: number = 0;

  async fetch(request: Request) {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/increment':
        this.value++;
        return new Response(String(this.value));

      case '/get':
        return new Response(String(this.value));

      default:
        return new Response('Not Found', { status: 404 });
    }
  }
}

// functions/api/counter.ts
interface Env {
  COUNTER: DurableObjectNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const id = context.env.COUNTER.idFromName('global');
  const stub = context.env.COUNTER.get(id);

  return stub.fetch(context.request);
};
```

## Local Development

```bash
# Start dev server
wrangler pages dev dist

# With bindings
wrangler pages dev dist --kv MY_KV --d1 DB

# With local persistence
wrangler pages dev dist --persist-to .wrangler/state
```

## Deployment

### Production Deploy

```bash
# Deploy to production
wrangler pages deploy dist --project-name my-app
```

### Preview Deploy

```bash
# Deploy to preview
wrangler pages deploy dist --project-name my-app --branch preview
```

### Rollback

Via Dashboard: Pages > Deployments > [deployment] > Rollback

## Analytics

```typescript
// Enable Web Analytics in dashboard
// Or add snippet to HTML
```

```html
<script
  defer
  src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "YOUR_TOKEN"}'
></script>
```

## Best Practices

1. **Use bindings** - KV, D1, R2 for data storage
2. **Set proper headers** - Security and caching
3. **Use environment-specific config** - Separate prod/preview
4. **Enable web analytics** - Monitor performance
5. **Use Durable Objects** - For stateful edge compute

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Missing compatibility_date | Add to wrangler.toml |
| Wrong output directory | Match framework output |
| Binding not configured | Add to wrangler.toml |
| Function not found | Use functions/ directory |
| Secrets in code | Use wrangler secret |

## Reference Files

- [references/bindings.md](references/bindings.md) - KV, D1, R2 bindings
- [references/functions.md](references/functions.md) - Function patterns
- [references/workers.md](references/workers.md) - Workers integration
