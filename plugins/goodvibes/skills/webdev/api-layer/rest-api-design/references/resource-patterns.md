# REST API Resource Patterns

## Common Resource Patterns

### CRUD Operations

```
# Collection
GET    /users          # List users
POST   /users          # Create user

# Resource
GET    /users/:id      # Get user
PUT    /users/:id      # Replace user
PATCH  /users/:id      # Update user
DELETE /users/:id      # Delete user
```

### Nested Resources

```
# One-to-many
GET    /users/:id/orders      # User's orders
POST   /users/:id/orders      # Create order for user
GET    /users/:id/orders/:id  # Specific order

# Many-to-many
GET    /users/:id/roles       # User's roles
PUT    /users/:id/roles       # Set user's roles
POST   /users/:id/roles       # Add role to user
DELETE /users/:id/roles/:id   # Remove role from user
```

### Singleton Resources

Resources that exist once per parent:

```
# User profile (one per user)
GET    /users/:id/profile
PUT    /users/:id/profile

# Current user
GET    /me
PUT    /me

# System settings
GET    /settings
PUT    /settings
```

### Sub-Collections

```
# Deeply nested (avoid if possible)
GET /users/:id/orders/:id/items

# Better: flat with filter
GET /order-items?order=123
```

## Action Resources

When CRUD doesn't fit, use action sub-resources:

```
# State transitions
POST /orders/:id/cancel
POST /orders/:id/ship
POST /users/:id/activate
POST /users/:id/deactivate

# Computed resources
GET /carts/:id/checkout-preview
POST /carts/:id/checkout

# Batch operations
POST /emails/send
POST /notifications/broadcast
```

### Controller Pattern

For complex operations:

```typescript
// POST /orders/:id/ship
app.post('/orders/:id/ship', async (req, res) => {
  const { carrier, trackingNumber } = req.body

  const order = await Order.findById(req.params.id)

  if (order.status !== 'paid') {
    return res.status(422).json({
      error: 'INVALID_STATE',
      message: 'Order must be paid before shipping'
    })
  }

  order.status = 'shipped'
  order.carrier = carrier
  order.trackingNumber = trackingNumber
  order.shippedAt = new Date()
  await order.save()

  res.json({ data: order })
})
```

## Search Resources

### Global Search

```
GET /search?q=term&type=users,products
```

### Scoped Search

```
GET /users/search?q=john
GET /products/search?q=laptop&category=electronics
```

### Advanced Search

```
POST /users/search
{
  "query": "john",
  "filters": {
    "role": ["admin", "user"],
    "createdAt": { "gte": "2024-01-01" }
  },
  "sort": ["-createdAt"],
  "limit": 20
}
```

## Relationship Patterns

### To-One Relationships

```
# Embedded
GET /orders/123
{
  "id": 123,
  "user": {
    "id": 456,
    "name": "John"
  }
}

# Reference
{
  "id": 123,
  "userId": 456,
  "links": {
    "user": "/users/456"
  }
}

# Expandable
GET /orders/123?expand=user
```

### To-Many Relationships

```
# Separate endpoint
GET /orders/123/items

# Embedded (small collections)
GET /orders/123?include=items

# Paginated
GET /orders/123/items?limit=20&cursor=abc
```

### Expansion/Embedding

```typescript
// Request
GET /orders?expand=user,items

// Response
{
  "data": [{
    "id": 123,
    "user": { "id": 456, "name": "John" },
    "items": [
      { "id": 1, "product": "Widget", "qty": 2 }
    ]
  }]
}
```

## Versioning Patterns

### URL Versioning

```
/api/v1/users
/api/v2/users
```

### Header Versioning

```
GET /users
Accept: application/vnd.myapi.v2+json
```

### Query Parameter

```
GET /users?version=2
```

### Deprecation

```typescript
// Headers
Deprecation: true
Sunset: Sat, 31 Dec 2024 23:59:59 GMT
Link: </api/v2/users>; rel="successor-version"

// Response
{
  "data": [...],
  "meta": {
    "deprecation": {
      "message": "This endpoint is deprecated",
      "sunsetDate": "2024-12-31",
      "replacement": "/api/v2/users"
    }
  }
}
```

## Async Operations

### Long-Running Tasks

```typescript
// Start task
POST /exports
{
  "format": "csv",
  "filters": { "status": "active" }
}

// Response: 202 Accepted
{
  "taskId": "task_abc123",
  "status": "pending",
  "links": {
    "self": "/tasks/task_abc123"
  }
}

// Poll for completion
GET /tasks/task_abc123
{
  "taskId": "task_abc123",
  "status": "completed",
  "result": {
    "downloadUrl": "/downloads/export_123.csv",
    "expiresAt": "2024-01-16T10:00:00Z"
  }
}
```

### Webhooks

```typescript
// Register webhook
POST /webhooks
{
  "url": "https://myapp.com/webhook",
  "events": ["order.created", "order.shipped"],
  "secret": "whsec_abc123"
}

// Webhook payload
POST https://myapp.com/webhook
{
  "event": "order.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "orderId": 123,
    "total": 99.99
  }
}
```

## Multi-Tenancy

### Subdomain

```
https://tenant1.api.example.com/users
https://tenant2.api.example.com/users
```

### Path Prefix

```
/tenants/tenant1/users
/tenants/tenant2/users
```

### Header

```
GET /users
X-Tenant-ID: tenant1
```

## Composite Keys

```
# Resource with composite key
GET /orders/2024/ORD-001

# Query parameters
GET /order-items?order_year=2024&order_number=ORD-001&line=1
```

## Soft Delete

```typescript
// Soft delete
DELETE /users/123
// Returns 200 with updated resource or 204

// List includes only active
GET /users

// Include deleted
GET /users?include_deleted=true

// Restore
POST /users/123/restore
```
