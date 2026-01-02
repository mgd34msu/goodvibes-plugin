# API Documentation Patterns

Framework-specific patterns for extracting and generating API documentation.

## Express.js (Node.js)

### Route Detection

```javascript
// Standard routes
router.get('/users', listUsers);
router.post('/users', createUser);
router.get('/users/:id', getUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

// With middleware
router.get('/admin/users', authMiddleware, adminOnly, listAllUsers);
```

### JSDoc/OpenAPI Comments

```javascript
/**
 * @openapi
 * /api/users:
 *   get:
 *     tags:
 *       - Users
 *     summary: List all users
 *     description: Returns a paginated list of users
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 */
router.get('/api/users', listUsers);
```

### swagger-jsdoc Setup

```javascript
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Documentation',
      version: '1.0.0',
    },
    servers: [
      { url: 'https://api.example.com/v1' }
    ],
  },
  apis: ['./src/routes/*.js'],
};

const spec = swaggerJsdoc(options);
```

---

## FastAPI (Python)

### Automatic Documentation

FastAPI generates OpenAPI docs automatically from type hints:

```python
from fastapi import FastAPI, Path, Query
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(
    title="User API",
    description="API for managing users",
    version="1.0.0",
)

class User(BaseModel):
    id: int
    email: str
    name: str

    class Config:
        schema_extra = {
            "example": {
                "id": 1,
                "email": "user@example.com",
                "name": "John Doe"
            }
        }

class UserCreate(BaseModel):
    email: str
    name: str

@app.get(
    "/users/{user_id}",
    response_model=User,
    summary="Get user by ID",
    description="Retrieve a single user by their unique identifier",
    responses={
        404: {"description": "User not found"}
    }
)
async def get_user(
    user_id: int = Path(..., description="The user's unique identifier", ge=1)
):
    """
    Get a user by ID.

    - **user_id**: The unique identifier of the user to retrieve
    """
    return {"id": user_id, "email": "user@example.com", "name": "John"}

@app.get("/users", response_model=List[User])
async def list_users(
    skip: int = Query(0, description="Number of users to skip"),
    limit: int = Query(20, description="Maximum number of users to return", le=100)
):
    """List all users with pagination."""
    return []
```

### Access Documentation

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

---

## Django REST Framework

### ViewSet Documentation

```python
from rest_framework import viewsets, serializers
from rest_framework.decorators import action
from drf_spectacular.utils import extend_schema, OpenApiParameter

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'created_at']

class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and editing user instances.

    list:
        Return a list of all users.

    create:
        Create a new user.

    retrieve:
        Return the given user.

    update:
        Update a user.

    destroy:
        Delete a user.
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer

    @extend_schema(
        parameters=[
            OpenApiParameter(name='status', description='Filter by status', required=False, type=str),
        ],
        responses={200: UserSerializer(many=True)},
    )
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Return only active users."""
        active_users = self.queryset.filter(is_active=True)
        serializer = self.get_serializer(active_users, many=True)
        return Response(serializer.data)
```

### drf-spectacular Configuration

```python
# settings.py
SPECTACULAR_SETTINGS = {
    'TITLE': 'User API',
    'DESCRIPTION': 'API for user management',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

# urls.py
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]
```

---

## Go (Gin/Echo)

### swaggo/swag Comments

```go
// @title User API
// @version 1.0
// @description API for managing users
// @host api.example.com
// @BasePath /v1

package main

// GetUser godoc
// @Summary Get user by ID
// @Description Get a single user by their unique identifier
// @Tags users
// @Accept json
// @Produce json
// @Param id path int true "User ID"
// @Success 200 {object} User
// @Failure 404 {object} ErrorResponse
// @Router /users/{id} [get]
func GetUser(c *gin.Context) {
    // handler implementation
}

// CreateUser godoc
// @Summary Create a new user
// @Description Create a new user with the provided data
// @Tags users
// @Accept json
// @Produce json
// @Param user body CreateUserRequest true "User data"
// @Success 201 {object} User
// @Failure 400 {object} ErrorResponse
// @Router /users [post]
func CreateUser(c *gin.Context) {
    // handler implementation
}
```

### Generate Docs

```bash
# Install swag
go install github.com/swaggo/swag/cmd/swag@latest

# Generate docs
swag init

# Output: docs/swagger.json, docs/swagger.yaml, docs/docs.go
```

---

## OpenAPI Schema Components

### Common Schema Definitions

```yaml
components:
  schemas:
    User:
      type: object
      required:
        - id
        - email
      properties:
        id:
          type: integer
          format: int64
          description: Unique identifier
          example: 1
        email:
          type: string
          format: email
          description: User's email address
          example: user@example.com
        name:
          type: string
          description: User's display name
          example: John Doe
        createdAt:
          type: string
          format: date-time
          description: Account creation timestamp

    Pagination:
      type: object
      properties:
        page:
          type: integer
          example: 1
        limit:
          type: integer
          example: 20
        total:
          type: integer
          example: 100
        totalPages:
          type: integer
          example: 5

    Error:
      type: object
      required:
        - error
        - code
      properties:
        error:
          type: string
          description: Human-readable error message
        code:
          type: string
          description: Machine-readable error code
        details:
          type: object
          description: Additional error details

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

    apiKey:
      type: apiKey
      in: header
      name: X-API-Key

  responses:
    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            error: Resource not found
            code: NOT_FOUND

    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
          example:
            error: Authentication required
            code: UNAUTHORIZED

    ValidationError:
      description: Validation error
      content:
        application/json:
          schema:
            allOf:
              - $ref: '#/components/schemas/Error'
              - type: object
                properties:
                  details:
                    type: array
                    items:
                      type: object
                      properties:
                        field:
                          type: string
                        message:
                          type: string
```

---

## Documentation Best Practices

### Do's

1. **Include examples** for all request/response bodies
2. **Document all status codes** the endpoint can return
3. **Describe parameters** with type, format, and constraints
4. **Version your API** in the URL or header
5. **Group endpoints** by resource or feature
6. **Include authentication** requirements clearly

### Don'ts

1. **Don't document internal endpoints** in public docs
2. **Don't include secrets** in examples
3. **Don't use generic descriptions** like "Gets data"
4. **Don't forget error responses**
5. **Don't skip optional parameters**

### Documentation Checklist

- [ ] All endpoints documented
- [ ] Request parameters documented
- [ ] Request body schema defined
- [ ] Response schemas for all status codes
- [ ] Authentication requirements noted
- [ ] Rate limits documented
- [ ] Examples provided
- [ ] Error codes explained
