# REST API Bulk Operations

## Bulk Create

### Array in Request Body

```typescript
// Request
POST /users/bulk
{
  "users": [
    { "email": "user1@example.com", "name": "User 1" },
    { "email": "user2@example.com", "name": "User 2" },
    { "email": "user3@example.com", "name": "User 3" }
  ]
}

// Response: 200 (partial success) or 201 (all success)
{
  "results": [
    { "status": "created", "id": "usr_1", "email": "user1@example.com" },
    { "status": "created", "id": "usr_2", "email": "user2@example.com" },
    { "status": "error", "error": "DUPLICATE", "email": "user3@example.com" }
  ],
  "summary": {
    "total": 3,
    "created": 2,
    "failed": 1
  }
}
```

### Implementation

```typescript
app.post('/users/bulk', async (req, res) => {
  const { users } = req.body
  const results = []
  let created = 0, failed = 0

  for (const userData of users) {
    try {
      const user = await User.create(userData)
      results.push({ status: 'created', id: user.id, email: userData.email })
      created++
    } catch (error) {
      results.push({
        status: 'error',
        error: error.code,
        email: userData.email,
        message: error.message
      })
      failed++
    }
  }

  const statusCode = failed === 0 ? 201 : (created === 0 ? 400 : 200)

  res.status(statusCode).json({
    results,
    summary: { total: users.length, created, failed }
  })
})
```

## Bulk Update

### PATCH Collection

```typescript
// Update multiple by filter
PATCH /users
{
  "filter": { "role": "guest" },
  "update": { "status": "active" }
}

// Response
{
  "updated": 150,
  "message": "150 users updated"
}
```

### Update by IDs

```typescript
// Request
PATCH /users/bulk
{
  "ids": ["usr_1", "usr_2", "usr_3"],
  "update": { "status": "inactive" }
}

// Or with individual updates
PUT /users/bulk
{
  "users": [
    { "id": "usr_1", "name": "New Name 1" },
    { "id": "usr_2", "name": "New Name 2" }
  ]
}
```

## Bulk Delete

### Delete by IDs

```typescript
// Request
DELETE /users/bulk
{
  "ids": ["usr_1", "usr_2", "usr_3"]
}

// Or query parameter
DELETE /users?ids=usr_1,usr_2,usr_3

// Response
{
  "deleted": 3
}
```

### Delete by Filter

```typescript
// Request
DELETE /users/bulk
{
  "filter": {
    "status": "inactive",
    "lastLoginBefore": "2023-01-01"
  }
}

// Response
{
  "deleted": 42,
  "message": "42 inactive users deleted"
}
```

## Batch Operations

### Mixed Operations

```typescript
// Request
POST /batch
{
  "operations": [
    {
      "method": "POST",
      "path": "/users",
      "body": { "email": "new@example.com", "name": "New User" }
    },
    {
      "method": "PATCH",
      "path": "/users/usr_123",
      "body": { "status": "active" }
    },
    {
      "method": "DELETE",
      "path": "/users/usr_456"
    }
  ]
}

// Response
{
  "results": [
    { "status": 201, "body": { "id": "usr_789", "email": "new@example.com" } },
    { "status": 200, "body": { "id": "usr_123", "status": "active" } },
    { "status": 204, "body": null }
  ]
}
```

### Atomic Batch

All or nothing:

```typescript
// Request
POST /batch?atomic=true

// If any operation fails, all are rolled back
// Response on failure: 400
{
  "error": "BATCH_FAILED",
  "message": "Batch operation failed at index 2",
  "failedOperation": {
    "index": 2,
    "error": "NOT_FOUND",
    "message": "User usr_456 not found"
  }
}
```

## Upsert (Create or Update)

```typescript
// Request
PUT /products/bulk
{
  "products": [
    { "sku": "WIDGET-001", "name": "Widget", "price": 9.99 },
    { "sku": "GADGET-001", "name": "Gadget", "price": 19.99 }
  ]
}

// Response
{
  "results": [
    { "status": "created", "sku": "WIDGET-001" },
    { "status": "updated", "sku": "GADGET-001" }
  ],
  "summary": {
    "created": 1,
    "updated": 1
  }
}
```

## Async Bulk Operations

### For Large Operations

```typescript
// Request
POST /users/bulk-import
{
  "source": "s3://bucket/users.csv",
  "options": { "skipDuplicates": true }
}

// Response: 202 Accepted
{
  "jobId": "job_abc123",
  "status": "pending",
  "links": {
    "status": "/jobs/job_abc123"
  }
}

// Poll status
GET /jobs/job_abc123
{
  "jobId": "job_abc123",
  "status": "processing",
  "progress": {
    "total": 10000,
    "processed": 4500,
    "created": 4400,
    "failed": 100,
    "percentage": 45
  }
}

// Completed
{
  "jobId": "job_abc123",
  "status": "completed",
  "result": {
    "total": 10000,
    "created": 9800,
    "failed": 200,
    "errorReport": "/downloads/job_abc123_errors.csv"
  }
}
```

## Rate Limiting Bulk

```typescript
// Limit bulk operations separately
const bulkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // 10 bulk operations per minute
  message: {
    error: 'RATE_LIMITED',
    message: 'Bulk operation rate limit exceeded'
  }
})

app.use('/*/bulk', bulkLimiter)
```

## Validation

### Pre-Validation

```typescript
// Request
POST /users/bulk/validate
{
  "users": [...]
}

// Response
{
  "valid": false,
  "errors": [
    { "index": 2, "field": "email", "message": "Invalid email" },
    { "index": 5, "field": "email", "message": "Duplicate email" }
  ]
}
```

### Dry Run

```typescript
// Request
POST /users/bulk?dry_run=true

// Response shows what would happen
{
  "wouldCreate": 8,
  "wouldUpdate": 2,
  "wouldFail": 1,
  "preview": [...]
}
```

## Best Practices

1. **Limit batch size** - Max 100-1000 items per request
2. **Return individual results** - Show success/failure per item
3. **Use async for large operations** - Return job ID, poll for status
4. **Support partial success** - Don't fail entire batch for one error
5. **Provide dry run** - Let clients validate before committing
6. **Rate limit separately** - Bulk operations need different limits
7. **Log batch operations** - Track who did what, when
