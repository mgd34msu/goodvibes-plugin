# OpenAPI Schema Patterns

## Basic Types

### Strings

```yaml
# Simple string
name:
  type: string

# With constraints
username:
  type: string
  minLength: 3
  maxLength: 50
  pattern: '^[a-zA-Z0-9_]+$'

# Enums
status:
  type: string
  enum: [active, inactive, pending]

# Formats
email:
  type: string
  format: email

date:
  type: string
  format: date  # 2024-01-15

datetime:
  type: string
  format: date-time  # 2024-01-15T10:30:00Z

uuid:
  type: string
  format: uuid

uri:
  type: string
  format: uri
```

### Numbers

```yaml
# Integer
age:
  type: integer
  minimum: 0
  maximum: 150

# Float
price:
  type: number
  format: float
  minimum: 0
  exclusiveMinimum: true

# Currency (use string for precision)
amount:
  type: string
  pattern: '^\d+\.\d{2}$'
  example: '99.99'
```

### Arrays

```yaml
# Simple array
tags:
  type: array
  items:
    type: string
  minItems: 1
  maxItems: 10
  uniqueItems: true

# Array of objects
users:
  type: array
  items:
    $ref: '#/components/schemas/User'
```

### Objects

```yaml
User:
  type: object
  required:
    - id
    - email
  properties:
    id:
      type: string
    email:
      type: string
      format: email
    name:
      type: string
    metadata:
      type: object
      additionalProperties: true
```

## Composition

### allOf (Inheritance)

```yaml
# Base schema
BaseEntity:
  type: object
  properties:
    id:
      type: string
    createdAt:
      type: string
      format: date-time
    updatedAt:
      type: string
      format: date-time

# Extended schema
User:
  allOf:
    - $ref: '#/components/schemas/BaseEntity'
    - type: object
      required:
        - email
      properties:
        email:
          type: string
          format: email
        name:
          type: string
```

### oneOf (Union Types)

```yaml
Pet:
  oneOf:
    - $ref: '#/components/schemas/Dog'
    - $ref: '#/components/schemas/Cat'

Dog:
  type: object
  required: [type, breed]
  properties:
    type:
      type: string
      enum: [dog]
    breed:
      type: string

Cat:
  type: object
  required: [type, indoor]
  properties:
    type:
      type: string
      enum: [cat]
    indoor:
      type: boolean
```

### anyOf (Multiple Valid)

```yaml
# Can match one or more schemas
ContactInfo:
  anyOf:
    - type: object
      properties:
        email:
          type: string
          format: email
    - type: object
      properties:
        phone:
          type: string
```

## Discriminators

### Basic Discriminator

```yaml
Event:
  oneOf:
    - $ref: '#/components/schemas/UserEvent'
    - $ref: '#/components/schemas/OrderEvent'
  discriminator:
    propertyName: eventType

UserEvent:
  type: object
  required: [eventType, userId]
  properties:
    eventType:
      type: string
      enum: [user.created, user.updated, user.deleted]
    userId:
      type: string

OrderEvent:
  type: object
  required: [eventType, orderId]
  properties:
    eventType:
      type: string
      enum: [order.created, order.shipped]
    orderId:
      type: string
```

### With Mapping

```yaml
Notification:
  oneOf:
    - $ref: '#/components/schemas/EmailNotification'
    - $ref: '#/components/schemas/SMSNotification'
    - $ref: '#/components/schemas/PushNotification'
  discriminator:
    propertyName: channel
    mapping:
      email: '#/components/schemas/EmailNotification'
      sms: '#/components/schemas/SMSNotification'
      push: '#/components/schemas/PushNotification'
```

## Nullable Values

### OpenAPI 3.0

```yaml
name:
  type: string
  nullable: true
```

### OpenAPI 3.1 (JSON Schema)

```yaml
# Using type array
name:
  type: ['string', 'null']

# Using oneOf
name:
  oneOf:
    - type: string
    - type: 'null'
```

## Read/Write Only

```yaml
User:
  type: object
  properties:
    id:
      type: string
      readOnly: true  # Only in responses
    password:
      type: string
      writeOnly: true  # Only in requests
    email:
      type: string
```

## Default Values

```yaml
status:
  type: string
  enum: [draft, published]
  default: draft

limit:
  type: integer
  default: 20
  minimum: 1
  maximum: 100
```

## Examples

### Inline Examples

```yaml
User:
  type: object
  properties:
    id:
      type: string
      example: usr_abc123
    email:
      type: string
      example: john@example.com
```

### Multiple Examples

```yaml
responses:
  200:
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/User'
        examples:
          admin:
            summary: Admin user
            value:
              id: usr_001
              email: admin@example.com
              role: admin
          regular:
            summary: Regular user
            value:
              id: usr_002
              email: user@example.com
              role: user
```

## Reusable Patterns

### Pagination Schema

```yaml
components:
  schemas:
    PaginatedResponse:
      type: object
      properties:
        pagination:
          type: object
          properties:
            page:
              type: integer
            limit:
              type: integer
            total:
              type: integer
            hasMore:
              type: boolean

    UserList:
      allOf:
        - $ref: '#/components/schemas/PaginatedResponse'
        - type: object
          properties:
            data:
              type: array
              items:
                $ref: '#/components/schemas/User'
```

### Error Schema

```yaml
components:
  schemas:
    Error:
      type: object
      required: [error, message]
      properties:
        error:
          type: string
          description: Machine-readable error code
        message:
          type: string
          description: Human-readable message
        details:
          type: array
          items:
            type: object
            properties:
              field:
                type: string
              message:
                type: string
        requestId:
          type: string
```

### Timestamps

```yaml
components:
  schemas:
    Timestamps:
      type: object
      properties:
        createdAt:
          type: string
          format: date-time
          readOnly: true
        updatedAt:
          type: string
          format: date-time
          readOnly: true
```

## Custom Formats

### Money

```yaml
Money:
  type: object
  required: [amount, currency]
  properties:
    amount:
      type: integer
      description: Amount in smallest currency unit (cents)
      example: 9999
    currency:
      type: string
      pattern: '^[A-Z]{3}$'
      example: USD
```

### Phone Number

```yaml
phone:
  type: string
  pattern: '^\+[1-9]\d{1,14}$'
  description: E.164 format
  example: '+14155552671'
```

### Slug

```yaml
slug:
  type: string
  pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  example: my-blog-post
```
