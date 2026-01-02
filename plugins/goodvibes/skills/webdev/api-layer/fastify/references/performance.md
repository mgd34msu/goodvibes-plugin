# Fastify Performance

## Why Fastify is Fast

1. **Schema-based serialization** - JSON.stringify replacement
2. **Radix tree routing** - O(log n) route matching
3. **Minimal overhead** - No middleware chain
4. **Native Promises** - Async/await first
5. **Pino logging** - Fastest JSON logger

## Benchmarks

Fastify handles ~76,000 requests/second (vs Express ~15,000).

```bash
# Run benchmark
npm install -g autocannon
autocannon -c 100 -d 10 http://localhost:3000/api/users
```

## Schema Serialization

### Enable fast-json-stringify

Fastify uses schemas to generate fast serializers:

```typescript
// Without schema - slow JSON.stringify
fastify.get('/slow', async () => {
  return { data: largeObject }
})

// With response schema - 2-3x faster
fastify.get('/fast', {
  schema: {
    response: {
      200: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' }
        }
      }
    }
  }
}, async () => {
  return { id: '1', name: 'John', email: 'john@example.com' }
})
```

### Shared Schemas

```typescript
// Register reusable schema
fastify.addSchema({
  $id: 'User',
  type: 'object',
  properties: {
    id: { type: 'string' },
    email: { type: 'string' },
    name: { type: 'string' }
  }
})

// Reference in routes
fastify.get('/users', {
  schema: {
    response: {
      200: {
        type: 'array',
        items: { $ref: 'User#' }
      }
    }
  }
}, handler)
```

## Logging Optimization

### Production Logger Config

```typescript
const fastify = Fastify({
  logger: {
    level: 'info',
    // Skip health checks
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          hostname: request.hostname
        }
      }
    }
  }
})

// Disable logging for specific routes
fastify.get('/health', {
  logLevel: 'silent'
}, async () => ({ status: 'ok' }))
```

### Conditional Logging

```typescript
const fastify = Fastify({
  logger: process.env.NODE_ENV === 'production'
    ? {
        level: 'warn',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: false
          }
        }
      }
    : {
        level: 'debug',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true
          }
        }
      }
})
```

## Connection Pooling

### Database Connections

```typescript
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,              // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
})

fastify.decorate('db', pool)
```

### HTTP Keep-Alive

```typescript
import { Agent } from 'undici'

const agent = new Agent({
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 30_000,
  connections: 100
})

fastify.decorate('httpAgent', agent)

// Use in requests
const response = await fetch(url, {
  dispatcher: fastify.httpAgent
})
```

## Caching

### Response Caching

```typescript
import caching from '@fastify/caching'
import redis from '@fastify/redis'

await fastify.register(redis, {
  url: process.env.REDIS_URL
})

await fastify.register(caching, {
  privacy: caching.privacy.PUBLIC,
  expiresIn: 300 // 5 minutes
})

fastify.get('/products', {
  schema: { ... },
  handler: async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=300')
    return db.products.findMany()
  }
})
```

### Manual Caching

```typescript
fastify.get('/expensive', async (request, reply) => {
  const cacheKey = `expensive:${request.query.id}`

  // Check cache
  const cached = await fastify.redis.get(cacheKey)
  if (cached) {
    return JSON.parse(cached)
  }

  // Compute
  const result = await computeExpensiveOperation()

  // Cache for 5 minutes
  await fastify.redis.setex(cacheKey, 300, JSON.stringify(result))

  return result
})
```

## Compression

```typescript
import compress from '@fastify/compress'

await fastify.register(compress, {
  global: true,
  threshold: 1024, // Only compress > 1KB
  encodings: ['gzip', 'deflate'],
  customTypes: /^text\/|application\/json/
})

// Disable for specific routes
fastify.get('/no-compress', {
  compress: false
}, handler)
```

## Rate Limiting

```typescript
import rateLimit from '@fastify/rate-limit'

await fastify.register(rateLimit, {
  max: 1000,
  timeWindow: '1 minute',
  redis: fastify.redis, // Use Redis for distributed limiting

  // Different limits per route
  keyGenerator: (request) => {
    return request.headers['x-api-key'] || request.ip
  }
})
```

## Payload Limits

```typescript
const fastify = Fastify({
  bodyLimit: 1048576 // 1MB
})

// Per-route limit
fastify.post('/upload', {
  bodyLimit: 10485760 // 10MB
}, handler)
```

## Clustering

### Node.js Cluster

```typescript
import cluster from 'cluster'
import os from 'os'

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork()
  }

  cluster.on('exit', (worker) => {
    console.log(`Worker ${worker.process.pid} died`)
    cluster.fork()
  })
} else {
  const fastify = Fastify()
  // ... setup
  await fastify.listen({ port: 3000 })
}
```

### PM2

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'api',
    script: './dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
```

## Performance Checklist

- [ ] Add response schemas for serialization
- [ ] Use shared schemas with $ref
- [ ] Enable compression for large responses
- [ ] Implement caching (Redis/in-memory)
- [ ] Configure proper connection pools
- [ ] Use clustering in production
- [ ] Set appropriate body limits
- [ ] Optimize logging level
- [ ] Disable logging for health checks
- [ ] Use HTTP keep-alive
