# Fastify Plugins

## Plugin Architecture

Fastify uses an encapsulated plugin system where each plugin has its own scope.

```
Root Instance
├── Plugin A (has access to root)
│   └── Plugin A1 (has access to A and root)
└── Plugin B (has access to root, NOT A)
```

## Creating Plugins

### Basic Plugin

```typescript
import { FastifyPluginAsync } from 'fastify'

const myPlugin: FastifyPluginAsync = async (fastify, options) => {
  // Add routes
  fastify.get('/hello', async () => ({ hello: 'world' }))

  // Add decorators
  fastify.decorate('utility', () => 'helper')

  // Add hooks
  fastify.addHook('onRequest', async (request) => {
    request.log.info('Request received')
  })
}

export default myPlugin
```

### Plugin with Options

```typescript
import { FastifyPluginAsync } from 'fastify'

interface PluginOptions {
  prefix?: string
  enableFeature?: boolean
}

const myPlugin: FastifyPluginAsync<PluginOptions> = async (fastify, options) => {
  const { prefix = '/api', enableFeature = false } = options

  if (enableFeature) {
    fastify.get(`${prefix}/feature`, async () => ({ enabled: true }))
  }
}

export default myPlugin
```

### Reusable Plugin (fastify-plugin)

Use `fastify-plugin` to break encapsulation and share decorators:

```typescript
import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    db: Database
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify, options) => {
  const db = await connectToDatabase(options)

  // This decorator will be available in parent scope
  fastify.decorate('db', db)

  // Cleanup on close
  fastify.addHook('onClose', async () => {
    await db.disconnect()
  })
}

export default fp(dbPlugin, {
  name: 'db-plugin',
  fastify: '5.x',
  dependencies: [] // List required plugins
})
```

## Plugin Categories

### Database Plugins

```typescript
// Prisma Plugin
import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export default fp(async (fastify) => {
  const prisma = new PrismaClient()
  await prisma.$connect()

  fastify.decorate('prisma', prisma)

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
}, { name: 'prisma' })
```

```typescript
// Redis Plugin
import fp from 'fastify-plugin'
import { createClient, RedisClientType } from 'redis'

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisClientType
  }
}

export default fp(async (fastify, options) => {
  const redis = createClient({ url: options.url })
  await redis.connect()

  fastify.decorate('redis', redis)

  fastify.addHook('onClose', async () => {
    await redis.quit()
  })
}, { name: 'redis' })
```

### Authentication Plugin

```typescript
import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string }
    user: { id: string; email: string }
  }
}

export default fp(async (fastify, options) => {
  await fastify.register(jwt, {
    secret: options.secret
  })

  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })
}, { name: 'auth', dependencies: [] })
```

### Service Plugin

```typescript
import fp from 'fastify-plugin'

interface UserService {
  findById(id: string): Promise<User | null>
  create(data: CreateUserInput): Promise<User>
  update(id: string, data: UpdateUserInput): Promise<User>
  delete(id: string): Promise<void>
}

declare module 'fastify' {
  interface FastifyInstance {
    userService: UserService
  }
}

export default fp(async (fastify) => {
  const userService: UserService = {
    findById: (id) => fastify.prisma.user.findUnique({ where: { id } }),
    create: (data) => fastify.prisma.user.create({ data }),
    update: (id, data) => fastify.prisma.user.update({ where: { id }, data }),
    delete: (id) => fastify.prisma.user.delete({ where: { id } })
  }

  fastify.decorate('userService', userService)
}, {
  name: 'user-service',
  dependencies: ['prisma']
})
```

## Official Plugins

### @fastify/cors

```typescript
import cors from '@fastify/cors'

await fastify.register(cors, {
  origin: (origin, cb) => {
    const allowed = ['https://app.example.com']
    if (!origin || allowed.includes(origin)) {
      cb(null, true)
    } else {
      cb(new Error('Not allowed'), false)
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
  maxAge: 86400
})
```

### @fastify/rate-limit

```typescript
import rateLimit from '@fastify/rate-limit'

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (request) => request.ip,
  errorResponseBuilder: (request, context) => ({
    error: 'RATE_LIMITED',
    message: `Rate limit exceeded. Retry in ${context.after}`,
    retryAfter: context.after
  })
})

// Per-route rate limit
fastify.get('/expensive', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute'
    }
  }
}, handler)
```

### @fastify/multipart

```typescript
import multipart from '@fastify/multipart'

await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
})

fastify.post('/upload', async (request, reply) => {
  const data = await request.file()

  if (!data) {
    reply.code(400).send({ error: 'No file uploaded' })
    return
  }

  // Stream to storage
  await pipeline(data.file, createWriteStream(`./uploads/${data.filename}`))

  return { filename: data.filename }
})

// Multiple files
fastify.post('/upload-multiple', async (request) => {
  const files = await request.files()
  const uploaded = []

  for await (const file of files) {
    await pipeline(file.file, createWriteStream(`./uploads/${file.filename}`))
    uploaded.push(file.filename)
  }

  return { files: uploaded }
})
```

### @fastify/swagger

```typescript
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'

await fastify.register(swagger, {
  openapi: {
    info: {
      title: 'My API',
      version: '1.0.0'
    },
    servers: [{ url: 'http://localhost:3000' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer'
        }
      }
    }
  }
})

await fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list'
  }
})

// Routes with schemas will be documented
fastify.get('/users', {
  schema: {
    description: 'Get all users',
    tags: ['Users'],
    response: {
      200: {
        type: 'array',
        items: { $ref: 'User#' }
      }
    }
  }
}, handler)
```

### @fastify/sensible

```typescript
import sensible from '@fastify/sensible'

await fastify.register(sensible)

// Now you have httpErrors
fastify.get('/users/:id', async (request, reply) => {
  const user = await db.users.findById(request.params.id)

  if (!user) {
    throw fastify.httpErrors.notFound('User not found')
  }

  return user
})

// And reply helpers
fastify.get('/health', async (request, reply) => {
  return reply.accepted()
})
```

## Plugin Registration Order

```typescript
// 1. Core plugins (no dependencies)
await fastify.register(cors)
await fastify.register(helmet)

// 2. Database plugins
await fastify.register(prismaPlugin)
await fastify.register(redisPlugin)

// 3. Service plugins (depend on db)
await fastify.register(userServicePlugin)
await fastify.register(authPlugin)

// 4. Route plugins (depend on services)
await fastify.register(userRoutes, { prefix: '/users' })
await fastify.register(authRoutes, { prefix: '/auth' })
```

## Autoload

```typescript
import autoLoad from '@fastify/autoload'
import { join } from 'path'

// Load plugins in order
await fastify.register(autoLoad, {
  dir: join(__dirname, 'plugins'),
  options: { /* shared options */ }
})

// Load routes
await fastify.register(autoLoad, {
  dir: join(__dirname, 'routes'),
  options: { prefix: '/api' }
})
```

File naming for autoload:
- `plugins/db.ts` -> registered first (alphabetically)
- `plugins/z-last.ts` -> registered last
- `routes/users/index.ts` -> mounted at `/api/users`
