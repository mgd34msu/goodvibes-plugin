# API Style Guide

Comprehensive reference for API design decisions, patterns, and best practices.

## Decision Tree: Choosing an API Paradigm

### Overview

```
Start Here
│
├─ Same codebase + TypeScript?
│  └─ YES → tRPC
│
├─ Complex nested data requirements?
│  └─ YES → GraphQL
│
├─ Public API for multiple clients?
│  └─ YES → REST
│
├─ Form-heavy mutations in Next.js?
│  └─ YES → Server Actions
│
└─ Default → REST (most flexible)
```

### Detailed Decision Criteria

#### Use REST When:

**Requirements:**
- Public API consumed by external clients
- Multiple client types (web, mobile, third-party)
- Resource-based operations (CRUD)
- Caching is critical (CDN, browser cache)
- HTTP semantics are important
- Stateless communication preferred

**Advantages:**
- Universal client support
- Well-understood patterns
- HTTP caching built-in
- Easy to version (v1, v2)
- Tooling ecosystem (Postman, Swagger)

**Disadvantages:**
- Over-fetching or under-fetching data
- Multiple round trips for related data
- Manual type synchronization
- Verbose client code

**Best With:**
- OpenAPI/Swagger for documentation
- Zod or Yup for validation
- Next.js Route Handlers, Express, Fastify, or Hono

#### Use GraphQL When:

**Requirements:**
- Complex, nested data relationships
- Clients need flexible queries
- Multiple related resources per request
- Strong typing and schema introspection needed
- Real-time subscriptions required

**Advantages:**
- Single endpoint for all queries
- Clients request exactly what they need
- Strong typing with schema
- Built-in introspection
- Real-time via subscriptions
- Reduces over-fetching

**Disadvantages:**
- Complex setup and learning curve
- Caching is harder (no HTTP caching)
- Query complexity attacks (requires rate limiting)
- N+1 query problem (needs DataLoader)
- Larger bundle size

**Best With:**
- Apollo Server or GraphQL Yoga
- TypeGraphQL or Pothos for schema building
- DataLoader for batching
- GraphQL Code Generator for types

#### Use tRPC When:

**Requirements:**
- Full TypeScript stack in same repo
- End-to-end type safety required
- Rapid iteration on API contract
- No need for public API
- Monorepo or shared types

**Advantages:**
- Automatic type inference (no codegen)
- Minimal boilerplate
- Great developer experience
- Type-safe from DB to UI
- No manual schema maintenance

**Disadvantages:**
- TypeScript only (no other languages)
- Not suitable for public APIs
- Limited ecosystem compared to REST/GraphQL
- Requires shared types between client/server

**Best With:**
- Next.js App Router or Pages Router
- Prisma or Drizzle ORM
- Zod for validation
- React Query (TanStack Query)

#### Use Server Actions When:

**Requirements:**
- Next.js 13+ with App Router
- Form submissions and mutations
- Progressive enhancement needed
- Co-located with React components
- Simplified data mutations

**Advantages:**
- Zero-config setup
- Automatic progressive enhancement
- Co-located with components
- No separate API layer needed
- Type-safe by default

**Disadvantages:**
- Next.js only (not portable)
- Limited to mutations (not queries)
- No direct HTTP endpoint (harder to test)
- Less suitable for complex business logic

**Best With:**
- Next.js App Router
- React Server Components
- Zod for validation
- Form libraries (React Hook Form, Conform)

## REST API Patterns

### Resource Naming Conventions

**Rules:**
1. Use nouns, not verbs (resources, not actions)
2. Plural for collections, singular for items
3. Kebab-case for multi-word resources
4. Nest resources only when tightly coupled

**Examples:**

```
GOOD:
GET    /users              # List users
GET    /users/:id          # Get user
POST   /users              # Create user
PUT    /users/:id          # Update user
DELETE /users/:id          # Delete user
GET    /users/:id/posts    # User's posts (nested resource)

BAD:
GET    /getUsers           # Verb in URL
GET    /user               # Singular for collection
GET    /Users              # Capitalized
GET    /user_posts         # Snake case
```

### HTTP Method Semantics

| Method | Purpose | Idempotent | Safe | Success Status |
|--------|---------|------------|------|----------------|
| GET | Read resource | Yes | Yes | 200 |
| POST | Create resource | No | No | 201 |
| PUT | Replace resource | Yes | No | 200 or 204 |
| PATCH | Update resource | No | No | 200 or 204 |
| DELETE | Delete resource | Yes | No | 204 or 200 |

**Idempotent:** Multiple identical requests have the same effect as one request.
**Safe:** Does not modify server state.

### Status Code Reference

#### Success (2xx)

- `200 OK` - Request succeeded (GET, PUT, PATCH)
- `201 Created` - Resource created (POST)
- `204 No Content` - Success with no response body (DELETE, PUT)

#### Client Errors (4xx)

- `400 Bad Request` - Validation error, malformed request
- `401 Unauthorized` - Not authenticated (missing or invalid token)
- `403 Forbidden` - Authenticated but not authorized (permission denied)
- `404 Not Found` - Resource does not exist
- `409 Conflict` - Duplicate resource, version conflict
- `422 Unprocessable Entity` - Semantic validation error
- `429 Too Many Requests` - Rate limit exceeded

#### Server Errors (5xx)

- `500 Internal Server Error` - Unexpected server error
- `502 Bad Gateway` - Upstream service failure
- `503 Service Unavailable` - Temporary unavailability
- `504 Gateway Timeout` - Upstream timeout

### Pagination Patterns

#### Cursor-Based Pagination (Recommended)

**Best for:** Large datasets, real-time data, infinite scroll.

```typescript
GET /users?cursor=abc123&limit=20

Response:
{
  "data": [...],
  "pagination": {
    "next_cursor": "def456",
    "prev_cursor": "xyz789",
    "has_more": true
  }
}
```

**Advantages:**
- Consistent results (no missed/duplicate items)
- Efficient for large datasets
- Works with real-time data

**Disadvantages:**
- Cannot jump to arbitrary pages
- More complex to implement

#### Offset-Based Pagination

**Best for:** Small datasets, known page count, traditional pagination UI.

```typescript
GET /users?page=2&limit=20  // or offset=20&limit=20

Response:
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

**Advantages:**
- Simple to implement
- Can jump to any page
- Familiar UX pattern

**Disadvantages:**
- Inconsistent with real-time data
- Inefficient for large offsets (OFFSET 10000)

### Error Response Format

**Standard structure:**

```typescript
interface APIError {
  error: string;           // Human-readable message
  code?: string;           // Machine-readable error code
  details?: unknown;       // Validation errors or context
  trace_id?: string;       // Request ID for debugging
}
```

**Example validation error:**

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "fieldErrors": {
      "email": ["Invalid email format"],
      "age": ["Must be at least 18"]
    }
  },
  "trace_id": "req_abc123"
}
```

## Authentication Patterns

### JWT Bearer Token

**Pattern:**

```typescript
// Request
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// Verify in middleware
import { verify } from 'jsonwebtoken';

export async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.split(' ')[1];
  
  if (!token) {
    throw new Error('No token provided');
  }

  const payload = verify(token, process.env.JWT_SECRET!);
  return payload;
}
```

**When to use:**
- Stateless authentication
- Mobile apps
- Microservices
- Short-lived tokens with refresh mechanism

### Session-Based Auth

**Pattern:**

```typescript
import { getServerSession } from 'next-auth';

export async function GET(request: Request) {
  const session = await getServerSession();
  
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Use session.user
}
```

**When to use:**
- Traditional web apps
- Server-side rendering
- Cookie-based auth
- Social login integration

### API Key

**Pattern:**

```typescript
// Request
X-API-Key: sk_live_abc123...

// Verify
export async function authenticate(request: Request) {
  const apiKey = request.headers.get('x-api-key');
  
  if (!apiKey) {
    throw new Error('No API key provided');
  }

  const keyRecord = await db.apiKey.findUnique({
    where: { key: apiKey },
  });

  if (!keyRecord) {
    throw new Error('Invalid API key');
  }

  return keyRecord;
}
```

**When to use:**
- Public APIs
- Server-to-server communication
- Third-party integrations
- Long-lived credentials

## tRPC Patterns

### Procedure Types

```typescript
import { router, publicProcedure, protectedProcedure } from './trpc';
import { z } from 'zod';

export const userRouter = router({
  // Query (read)
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      return await ctx.db.user.findUnique({
        where: { id: input.id },
      });
    }),

  // Mutation (write)
  create: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      return await ctx.db.user.create({
        data: input,
      });
    }),

  // Subscription (real-time)
  onUpdate: publicProcedure
    .subscription(async ({ ctx }) => {
      return observable<User>((emit) => {
        // Emit updates
      });
    }),
});
```

### Error Handling

```typescript
import { TRPCError } from '@trpc/server';

export const userRouter = router({
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.id },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      if (user.id !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to delete this user',
        });
      }

      return await ctx.db.user.delete({
        where: { id: input.id },
      });
    }),
});
```

**Error codes:**
- `BAD_REQUEST` - Validation error
- `UNAUTHORIZED` - Not authenticated
- `FORBIDDEN` - Not authorized
- `NOT_FOUND` - Resource missing
- `CONFLICT` - Duplicate resource
- `INTERNAL_SERVER_ERROR` - Unexpected error

## GraphQL Patterns

### Schema Definition

```graphql
type User {
  id: ID!
  email: String!
  name: String!
  posts: [Post!]!
  createdAt: DateTime!
}

type Post {
  id: ID!
  title: String!
  content: String!
  published: Boolean!
  author: User!
}

type Query {
  user(id: ID!): User
  users(limit: Int, offset: Int): [User!]!
  post(id: ID!): Post
}

type Mutation {
  createUser(email: String!, name: String!): User!
  updateUser(id: ID!, email: String, name: String): User!
  deleteUser(id: ID!): Boolean!
}
```

### Resolver Implementation

```typescript
import { GraphQLResolveInfo } from 'graphql';

interface Context {
  db: PrismaClient;
  user?: User;
}

export const resolvers = {
  Query: {
    user: async (
      _parent: unknown,
      args: { id: string },
      ctx: Context,
      _info: GraphQLResolveInfo
    ) => {
      return await ctx.db.user.findUnique({
        where: { id: args.id },
      });
    },
  },

  Mutation: {
    createUser: async (
      _parent: unknown,
      args: { email: string; name: string },
      ctx: Context
    ) => {
      if (!ctx.user) {
        throw new Error('Unauthorized');
      }

      return await ctx.db.user.create({
        data: args,
      });
    },
  },

  User: {
    posts: async (parent: User, _args: unknown, ctx: Context) => {
      return await ctx.db.post.findMany({
        where: { authorId: parent.id },
      });
    },
  },
};
```

### N+1 Problem Solution (DataLoader)

```typescript
import DataLoader from 'dataloader';

const userLoader = new DataLoader<string, User>(async (ids) => {
  const users = await db.user.findMany({
    where: { id: { in: [...ids] } },
  });

  const userMap = new Map(users.map(u => [u.id, u]));
  return ids.map(id => userMap.get(id) || null);
});

// In resolver
const author = await ctx.loaders.userLoader.load(post.authorId);
```

## Rate Limiting

### Token Bucket (Recommended)

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'), // 10 requests per 10 seconds
  analytics: true,
});

export async function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  const { success, limit, reset, remaining } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
        },
      }
    );
  }

  return NextResponse.next();
}
```

### Per-User Rate Limiting

```typescript
export async function rateLimit(userId: string) {
  const { success } = await ratelimit.limit(`user:${userId}`);
  
  if (!success) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Rate limit exceeded',
    });
  }
}
```

## Versioning Strategies

### URL Versioning (Recommended for REST)

```
GET /v1/users
GET /v2/users
```

**Advantages:**
- Clear and explicit
- Easy to route
- Version-specific documentation

**Disadvantages:**
- URL changes between versions

### Header Versioning

```
GET /users
Accept: application/vnd.myapi.v2+json
```

**Advantages:**
- URL stays the same
- More RESTful

**Disadvantages:**
- Less discoverable
- Harder to test in browser

### Query Parameter Versioning

```
GET /users?version=2
```

**Advantages:**
- Simple to implement
- Easy to test

**Disadvantages:**
- Pollutes query parameters
- Not RESTful

## Security Checklist

- [ ] All inputs validated with strict schemas
- [ ] Authentication required for protected endpoints
- [ ] Authorization checks for resource ownership
- [ ] Rate limiting implemented
- [ ] CORS configured correctly
- [ ] Secrets loaded from environment variables
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (proper escaping)
- [ ] CSRF protection for state-changing operations
- [ ] HTTPS enforced in production
- [ ] Error messages don't expose internals
- [ ] Logging excludes sensitive data

## Performance Checklist

- [ ] Database queries use indexes
- [ ] N+1 queries avoided (use DataLoader, eager loading)
- [ ] Pagination implemented for large datasets
- [ ] Response caching where appropriate
- [ ] Large payloads compressed (gzip)
- [ ] Unnecessary data excluded from responses
- [ ] Database connection pooling configured
- [ ] Background jobs for slow operations

## Testing Checklist

- [ ] Happy path tests for all endpoints
- [ ] Validation error tests
- [ ] Authentication/authorization tests
- [ ] Edge case tests (empty lists, null values)
- [ ] Rate limiting tests
- [ ] Error handling tests
- [ ] Integration tests with real database
- [ ] Load tests for critical endpoints
