# API Documentation

## Overview

This document describes the REST API for the stress-project application.

## Authentication

All API endpoints except `/auth/register` and `/auth/login` require authentication.

Include the JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

## Endpoints

### Authentication

#### POST /auth/register

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "username": "johndoe"
}
```

**Response:**
```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "username": "johndoe",
    "role": "user",
    "status": "active"
  },
  "token": {
    "token": "eyJhbGc...",
    "expiresAt": "2024-01-02T00:00:00.000Z",
    "refreshToken": "refresh_abc123"
  }
}
```

#### POST /auth/login

Authenticate and receive access token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "user": { ... },
  "token": { ... }
}
```

#### POST /auth/logout

Invalidate current token.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{ "success": true }
```

#### POST /auth/refresh

Refresh an expired token.

**Request Body:**
```json
{
  "refreshToken": "refresh_abc123"
}
```

**Response:**
```json
{
  "token": {
    "token": "eyJhbGc...",
    "expiresAt": "2024-01-02T00:00:00.000Z",
    "refreshToken": "refresh_xyz789"
  }
}
```

### Users

#### GET /users/:id

Get user by ID.

**Response:**
```json
{
  "id": "user_123",
  "email": "user@example.com",
  "username": "johndoe",
  "role": "user",
  "status": "active",
  "metadata": {
    "loginCount": 5,
    "lastLogin": "2024-01-01T12:00:00.000Z",
    "preferences": {},
    "tags": []
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T12:00:00.000Z"
}
```

#### PATCH /users/:id

Update user profile.

**Request Body:**
```json
{
  "username": "newusername",
  "preferences": {
    "theme": "dark",
    "language": "en"
  }
}
```

**Response:**
```json
{
  "id": "user_123",
  "username": "newusername",
  ...
}
```

### Products

#### GET /products

List all products with pagination.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `category` (string): Filter by category
- `inStock` (boolean): Filter by stock status

**Response:**
```json
{
  "products": [
    {
      "id": "prod_123",
      "name": "Product Name",
      "description": "Product description",
      "price": 29.99,
      "category": "electronics",
      "inStock": true,
      "quantity": 100,
      "sku": "SKU-123",
      "tags": ["featured", "sale"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

#### GET /products/:id

Get product by ID.

#### POST /products

Create new product (admin only).

**Request Body:**
```json
{
  "name": "New Product",
  "description": "Product description",
  "price": 29.99,
  "category": "electronics",
  "quantity": 100,
  "sku": "SKU-123"
}
```

#### PATCH /products/:id

Update product (admin only).

#### DELETE /products/:id

Delete product (admin only).

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "error": "Validation error",
  "details": [
    { "field": "email", "message": "Invalid email format" }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "Insufficient permissions"
}
```

### 404 Not Found
```json
{
  "error": "Not found",
  "message": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

## Rate Limiting

API requests are rate limited to:
- 100 requests per minute per IP for unauthenticated requests
- 1000 requests per minute per user for authenticated requests

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704067200
```
