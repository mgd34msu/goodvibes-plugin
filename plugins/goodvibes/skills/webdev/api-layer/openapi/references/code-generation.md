# OpenAPI Code Generation

## TypeScript Type Generation

### openapi-typescript

Best for generating types only (no runtime code).

```bash
npm install -D openapi-typescript
```

```bash
# From local file
npx openapi-typescript ./openapi.yaml -o ./types/api.d.ts

# From URL
npx openapi-typescript https://api.example.com/openapi.json -o ./types/api.d.ts

# Watch mode
npx openapi-typescript ./openapi.yaml -o ./types/api.d.ts --watch
```

Configuration (`openapi-ts.config.ts`):

```typescript
import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: './openapi.yaml',
  output: './types',
  exportCore: false,
  exportServices: false,
  exportModels: true
})
```

### Using Generated Types

```typescript
import type { paths, components } from './types/api'

// Extract types
type User = components['schemas']['User']
type CreateUserInput = components['schemas']['CreateUserInput']

// Use with fetch
async function getUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`)
  return response.json()
}
```

## Client Generation

### openapi-fetch

Type-safe fetch wrapper using openapi-typescript types.

```bash
npm install openapi-fetch
npm install -D openapi-typescript
```

```typescript
import createClient from 'openapi-fetch'
import type { paths } from './types/api'

const client = createClient<paths>({
  baseUrl: 'https://api.example.com'
})

// Type-safe requests
const { data, error } = await client.GET('/users/{id}', {
  params: {
    path: { id: 'usr_123' }
  }
})

// data is typed based on OpenAPI spec
console.log(data?.email)
```

### openapi-typescript-codegen

Generates a full client with classes.

```bash
npm install -D openapi-typescript-codegen

npx openapi-typescript-codegen \
  --input ./openapi.yaml \
  --output ./generated/client \
  --client fetch
```

Usage:

```typescript
import { UserService } from './generated/client'

const user = await UserService.getUser({ id: 'usr_123' })
```

### OpenAPI Generator

Most comprehensive generator supporting 50+ languages.

```bash
npm install -g @openapitools/openapi-generator-cli

# TypeScript Fetch client
openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-fetch \
  -o ./generated/client \
  --additional-properties=supportsES6=true,npmName=my-api-client

# TypeScript Axios client
openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-axios \
  -o ./generated/client
```

## Server Stub Generation

### Express Server

```bash
openapi-generator-cli generate \
  -i openapi.yaml \
  -g typescript-express-server \
  -o ./generated/server
```

### Fastify Server

Use `fastify-openapi-glue`:

```typescript
import fastify from 'fastify'
import openapiGlue from 'fastify-openapi-glue'

const app = fastify()

const service = {
  async getUser({ id }) {
    return db.users.findById(id)
  },
  async createUser(req) {
    return db.users.create(req.body)
  }
}

app.register(openapiGlue, {
  specification: './openapi.yaml',
  service
})
```

## Zod Schema Generation

### From OpenAPI to Zod

```bash
npm install -D openapi-zod-client
```

```bash
npx openapi-zod-client ./openapi.yaml -o ./generated/zod-schemas.ts
```

Generated:

```typescript
import { z } from 'zod'

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  createdAt: z.string().datetime()
})

export type User = z.infer<typeof UserSchema>
```

### From Zod to OpenAPI

```typescript
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email()
})

const jsonSchema = zodToJsonSchema(UserSchema, 'User')
```

## CI/CD Integration

### Generate on Build

```json
// package.json
{
  "scripts": {
    "generate:types": "openapi-typescript ./openapi.yaml -o ./types/api.d.ts",
    "generate:client": "openapi-generator-cli generate -i openapi.yaml -g typescript-fetch -o ./generated",
    "prebuild": "npm run generate:types"
  }
}
```

### GitHub Action

```yaml
# .github/workflows/generate-client.yml
name: Generate API Client

on:
  push:
    paths:
      - 'openapi.yaml'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Generate client
        run: |
          npx openapi-typescript ./openapi.yaml -o ./types/api.d.ts

      - name: Commit changes
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add ./types/api.d.ts
          git diff --staged --quiet || git commit -m "chore: regenerate API types"
          git push
```

## SDK Publishing

### NPM Package

```json
// package.json for generated SDK
{
  "name": "@myorg/api-client",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "openapi-fetch": "^0.9.0"
  },
  "peerDependencies": {
    "typescript": "^5.0.0"
  }
}
```

### Wrapper Package

```typescript
// src/index.ts
import createClient from 'openapi-fetch'
import type { paths } from './types/api'

export type { paths, components } from './types/api'

export function createApiClient(options: {
  baseUrl: string
  token?: string
}) {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    headers: options.token
      ? { Authorization: `Bearer ${options.token}` }
      : undefined
  })
}
```

## Best Practices

1. **Regenerate on spec changes** - Automate in CI/CD
2. **Version SDK with API** - Match SDK version to API version
3. **Don't edit generated code** - Customize via wrappers
4. **Type-only when possible** - Prefer openapi-typescript for minimal bundle
5. **Test generated code** - Validate types match runtime behavior
6. **Document usage** - Include examples in SDK README
