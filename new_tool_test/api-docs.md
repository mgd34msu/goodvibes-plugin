# API Documentation

## Endpoints

### GET /users

Returns a list of users.

```json
{
  "users": [
    {"id": 1, "name": "Alice"},
    {"id": 2, "name": "Bob"}
  ]
}
```

### POST /users

Creates a new user.

### DELETE /users/:id

Deletes a user by ID.

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request |
| 401 | Unauthorized |
| 404 | Not Found |
| 500 | Server Error |