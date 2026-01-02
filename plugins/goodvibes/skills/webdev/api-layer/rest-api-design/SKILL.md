---
name: rest-api-design
description: Designs RESTful APIs following industry best practices for resource naming, HTTP methods, status codes, and error handling. Use when designing new APIs, refactoring existing endpoints, or establishing API standards.
---

# REST API Design

REST (Representational State Transfer) is an architectural style for designing networked applications. This skill covers best practices for designing clean, consistent, and scalable REST APIs.

## Core Principles

### 1. Resources as Nouns

URLs represent resources (nouns), not actions (verbs).

```
# Good
GET /users
GET /users/123
GET /users/123/orders

# Bad
GET /getUsers
GET /getUserById?id=123
POST /createUser
```

### 2. HTTP Methods for Actions

| Method | Purpose | Idempotent | Safe |
|--------|---------|------------|------|
| GET | Read resource | Yes | Yes |
| POST | Create resource | No | No |
| PUT | Replace resource | Yes | No |
| PATCH | Update resource | Yes | No |
| DELETE | Delete resource | Yes | No |

### 3. Statelessness

Each request contains all information needed. No server-side session state.

```typescript
// Good - Token in header
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

// Bad - Relies on session
Cookie: session_id=abc123
```

## URL Design

### Resource Naming

```
# Collections (plural nouns)
/users
/products
/orders

# Single resource
/users/123
/products/abc

# Nested resources
/users/123/orders
/orders/456/items

# Avoid deep nesting (max 2 levels)
# Bad: /users/123/orders/456/items/789
# Good: /orders/456/items/789
```

### Query Parameters

```
# Filtering
GET /products?category=electronics&status=active

# Sorting
GET /products?sort=price&order=desc
GET /products?sort=-price  # Prefix with - for descending

# Pagination
GET /products?page=2&limit=20
GET /products?offset=20&limit=20
GET /products?cursor=abc123&limit=20

# Field selection
GET /users/123?fields=id,name,email

# Search
GET /products?q=laptop
GET /products?search=laptop
```

### Versioning

```
# URL versioning (most common)
/api/v1/users
/api/v2/users

# Header versioning
Accept: application/vnd.api+json;version=1

# Query parameter
/users?version=1
```

## HTTP Status Codes

### Success (2xx)

```typescript
// 200 OK - Successful GET, PUT, PATCH, DELETE
res.status(200).json({ user })

// 201 Created - Successful POST (with Location header)
res.status(201)
   .header('Location', `/users/${user.id}`)
   .json({ user })

// 204 No Content - Successful DELETE (no body)
res.status(204).send()
```

### Client Errors (4xx)

```typescript
// 400 Bad Request - Invalid input
res.status(400).json({
  error: 'VALIDATION_ERROR',
  message: 'Invalid request body',
  details: [
    { field: 'email', message: 'Invalid email format' }
  ]
})

// 401 Unauthorized - Missing/invalid auth
res.status(401).json({
  error: 'UNAUTHORIZED',
  message: 'Authentication required'
})

// 403 Forbidden - Authenticated but not allowed
res.status(403).json({
  error: 'FORBIDDEN',
  message: 'Insufficient permissions'
})

// 404 Not Found - Resource doesn't exist
res.status(404).json({
  error: 'NOT_FOUND',
  message: 'User not found'
})

// 409 Conflict - State conflict (duplicate, etc.)
res.status(409).json({
  error: 'CONFLICT',
  message: 'Email already registered'
})

// 422 Unprocessable Entity - Semantic errors
res.status(422).json({
  error: 'UNPROCESSABLE_ENTITY',
  message: 'Cannot process request'
})

// 429 Too Many Requests - Rate limited
res.status(429)
   .header('Retry-After', '60')
   .json({
     error: 'RATE_LIMITED',
     message: 'Too many requests',
     retryAfter: 60
   })
```

### Server Errors (5xx)

```typescript
// 500 Internal Server Error
res.status(500).json({
  error: 'INTERNAL_ERROR',
  message: 'An unexpected error occurred',
  requestId: req.id
})

// 503 Service Unavailable
res.status(503)
   .header('Retry-After', '300')
   .json({
     error: 'SERVICE_UNAVAILABLE',
     message: 'Service temporarily unavailable'
   })
```

## Error Response Format

### Standard Error Structure

```typescript
interface ApiError {
  error: string        // Machine-readable code
  message: string      // Human-readable message
  details?: any[]      // Additional details
  requestId?: string   // For debugging
  documentation?: string // Link to docs
}

// Example
{
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    { "field": "email", "message": "Invalid email format" },
    { "field": "age", "message": "Must be at least 18" }
  ],
  "requestId": "req-abc123",
  "documentation": "https://api.example.com/docs/errors#validation"
}
```

### Problem Details (RFC 7807)

```typescript
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Error",
  "status": 400,
  "detail": "One or more fields failed validation",
  "instance": "/users",
  "errors": [
    { "pointer": "/email", "detail": "Invalid email format" }
  ]
}
```

## Pagination

### Offset-Based

```typescript
// Request
GET /products?page=2&limit=20

// Response
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Cursor-Based (Recommended)

```typescript
// Request
GET /products?cursor=eyJpZCI6MTAwfQ&limit=20

// Response
{
  "data": [...],
  "pagination": {
    "limit": 20,
    "hasMore": true,
    "nextCursor": "eyJpZCI6MTIwfQ"
  }
}
```

### Link Headers (RFC 5988)

```
Link: <https://api.example.com/products?cursor=abc>; rel="next",
      <https://api.example.com/products?cursor=xyz>; rel="prev"
```

## Filtering & Sorting

### Filtering Patterns

```
# Exact match
GET /products?status=active

# Multiple values
GET /products?status=active,pending

# Range
GET /products?price_min=10&price_max=100
GET /products?price[gte]=10&price[lte]=100

# Date range
GET /orders?created_after=2024-01-01&created_before=2024-12-31

# Full-text search
GET /products?q=laptop

# Nested filtering
GET /products?category.name=electronics
```

### Sorting Patterns

```
# Single field
GET /products?sort=price
GET /products?sort=-price  # Descending

# Multiple fields
GET /products?sort=category,-price
GET /products?sort=category:asc,price:desc

# Default sort
GET /products  # Defaults to created_at desc
```

## Request/Response Conventions

### Consistent Response Envelope

```typescript
// Success response
{
  "data": { ... },
  "meta": {
    "requestId": "req-123",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}

// Collection response
{
  "data": [...],
  "pagination": { ... },
  "meta": { ... }
}

// Error response
{
  "error": { ... }
}
```

### Timestamps

```typescript
// Use ISO 8601
{
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T14:45:00Z"
}
```

### IDs

```typescript
// String IDs (preferred for external APIs)
{ "id": "usr_abc123" }

// Numeric IDs
{ "id": 12345 }
```

## HATEOAS (Hypermedia)

Include links for discoverability:

```typescript
{
  "data": {
    "id": "usr_123",
    "name": "John Doe",
    "links": {
      "self": "/users/usr_123",
      "orders": "/users/usr_123/orders",
      "profile": "/users/usr_123/profile"
    }
  }
}
```

## Rate Limiting

### Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
Retry-After: 60
```

### Implementation

```typescript
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'RATE_LIMITED',
      message: 'Too many requests',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    })
  }
})
```

## Security Headers

```typescript
// CORS
app.use(cors({
  origin: ['https://app.example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

// Security headers
app.use(helmet())

// Content-Type enforcement
app.use((req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) {
    return res.status(415).json({
      error: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Content-Type must be application/json'
    })
  }
  next()
})
```

## Idempotency

### Idempotency Keys

```typescript
// Client sends
POST /payments
Idempotency-Key: unique-request-id-123

// Server tracks and returns same response for duplicate requests
```

### Implementation

```typescript
const idempotencyCache = new Map()

app.post('/payments', async (req, res) => {
  const key = req.headers['idempotency-key']

  if (key && idempotencyCache.has(key)) {
    return res.json(idempotencyCache.get(key))
  }

  const result = await processPayment(req.body)

  if (key) {
    idempotencyCache.set(key, result)
  }

  res.status(201).json(result)
})
```

## Best Practices Summary

1. **Use plural nouns** for collections
2. **Use HTTP methods correctly** - GET read, POST create, PUT replace, PATCH update, DELETE remove
3. **Return appropriate status codes** - 2xx success, 4xx client error, 5xx server error
4. **Version your API** - URL path versioning is most common
5. **Use cursor pagination** - More reliable than offset
6. **Consistent error format** - Machine-readable codes + human messages
7. **Rate limit endpoints** - Protect against abuse
8. **Add request IDs** - For debugging and support
9. **Use HTTPS** - Always encrypt in transit
10. **Document everything** - OpenAPI/Swagger

## References

- [Resource Patterns](references/resource-patterns.md)
- [Bulk Operations](references/bulk-operations.md)
