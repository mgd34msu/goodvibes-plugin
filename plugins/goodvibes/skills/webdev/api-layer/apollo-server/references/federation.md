# Apollo Federation

## Overview

Apollo Federation allows you to compose multiple GraphQL services (subgraphs) into a single unified graph (supergraph).

```
┌─────────────────────────────────────────┐
│              Apollo Router              │
│            (Supergraph Gateway)         │
└────────────┬──────────┬────────────────┘
             │          │
    ┌────────▼──┐   ┌───▼────────┐
    │  Users    │   │  Products  │
    │ Subgraph  │   │  Subgraph  │
    └───────────┘   └────────────┘
```

## Subgraph Setup

```bash
npm install @apollo/server @apollo/subgraph graphql
```

### Users Subgraph

```typescript
import { ApolloServer } from '@apollo/server'
import { buildSubgraphSchema } from '@apollo/subgraph'
import gql from 'graphql-tag'

const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0",
          import: ["@key", "@shareable"])

  type User @key(fields: "id") {
    id: ID!
    email: String!
    name: String
  }

  type Query {
    users: [User!]!
    user(id: ID!): User
  }
`

const resolvers = {
  Query: {
    users: () => db.users.findMany(),
    user: (_, { id }) => db.users.findById(id)
  },
  User: {
    // Reference resolver for federation
    __resolveReference: (reference) => {
      return db.users.findById(reference.id)
    }
  }
}

const server = new ApolloServer({
  schema: buildSubgraphSchema({ typeDefs, resolvers })
})
```

### Products Subgraph

```typescript
const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0",
          import: ["@key", "@external", "@requires"])

  type Product @key(fields: "id") {
    id: ID!
    name: String!
    price: Float!
    reviews: [Review!]!
  }

  type Review @key(fields: "id") {
    id: ID!
    rating: Int!
    comment: String
    author: User!
  }

  # Extend User from another subgraph
  type User @key(fields: "id") {
    id: ID! @external
    reviews: [Review!]!
  }

  type Query {
    products: [Product!]!
    product(id: ID!): Product
  }
`

const resolvers = {
  Query: {
    products: () => db.products.findMany(),
    product: (_, { id }) => db.products.findById(id)
  },
  Product: {
    __resolveReference: (ref) => db.products.findById(ref.id),
    reviews: (product) => db.reviews.findByProduct(product.id)
  },
  Review: {
    __resolveReference: (ref) => db.reviews.findById(ref.id),
    author: (review) => ({ __typename: 'User', id: review.authorId })
  },
  User: {
    // Add reviews field to User type
    reviews: (user) => db.reviews.findByAuthor(user.id)
  }
}
```

## Federation Directives

### @key

Defines entity's primary key for cross-subgraph references:

```graphql
type User @key(fields: "id") {
  id: ID!
}

# Multiple keys
type User @key(fields: "id") @key(fields: "email") {
  id: ID!
  email: String!
}

# Composite key
type ProductVariant @key(fields: "productId sku") {
  productId: ID!
  sku: String!
}
```

### @external

Marks fields defined in another subgraph:

```graphql
type User @key(fields: "id") {
  id: ID! @external
  email: String! @external
}
```

### @requires

Indicates fields needed from the entity to resolve a field:

```graphql
type Product @key(fields: "id") {
  id: ID!
  price: Float! @external
  weight: Float! @external
  shippingCost: Float! @requires(fields: "price weight")
}
```

### @provides

Indicates which fields an entity resolver can provide:

```graphql
type Review @key(fields: "id") {
  id: ID!
  author: User! @provides(fields: "email name")
}

type User @key(fields: "id") {
  id: ID!
  email: String! @external
  name: String! @external
}
```

### @shareable

Allows multiple subgraphs to resolve the same field:

```graphql
type Product @key(fields: "id") {
  id: ID!
  name: String! @shareable
}
```

### @override

Migrates a field from one subgraph to another:

```graphql
type Product @key(fields: "id") {
  id: ID!
  # Take over from inventory subgraph
  inStock: Boolean! @override(from: "inventory")
}
```

## Apollo Router

### Installation

```bash
curl -sSL https://router.apollo.dev/download/nix/latest | sh
```

### Configuration

```yaml
# router.yaml
supergraph:
  listen: 0.0.0.0:4000
  path: /graphql

health_check:
  listen: 0.0.0.0:8088

headers:
  all:
    request:
      - propagate:
          named: "Authorization"

cors:
  origins:
    - https://app.example.com
  allow_credentials: true
```

### Compose Supergraph

```yaml
# supergraph.yaml
federation_version: 2

subgraphs:
  users:
    routing_url: http://users-service:4001/graphql
    schema:
      file: ./schemas/users.graphql
  products:
    routing_url: http://products-service:4002/graphql
    schema:
      file: ./schemas/products.graphql
```

```bash
rover supergraph compose --config supergraph.yaml > supergraph.graphql
./router --supergraph supergraph.graphql --config router.yaml
```

## Entity Resolution

### __resolveReference

Required for any type with @key:

```typescript
const resolvers = {
  User: {
    __resolveReference: async (reference, context) => {
      // reference contains key fields (e.g., { id: "123" })
      return context.dataSources.users.findById(reference.id)
    }
  }
}
```

### Returning Partial Data

```typescript
const resolvers = {
  Review: {
    author: (review) => {
      // Return partial User for federation to resolve
      return {
        __typename: 'User',
        id: review.authorId
      }
    }
  }
}
```

## Testing Subgraphs

```typescript
import { ApolloServer } from '@apollo/server'
import { buildSubgraphSchema } from '@apollo/subgraph'

describe('Users Subgraph', () => {
  let server: ApolloServer

  beforeAll(() => {
    server = new ApolloServer({
      schema: buildSubgraphSchema({ typeDefs, resolvers })
    })
  })

  it('resolves user reference', async () => {
    const result = await server.executeOperation({
      query: `
        query {
          _entities(representations: [{ __typename: "User", id: "1" }]) {
            ... on User {
              id
              email
            }
          }
        }
      `
    })

    expect(result.body.singleResult.data._entities[0]).toEqual({
      id: '1',
      email: 'user@example.com'
    })
  })
})
```

## Migration Strategy

### Incremental Adoption

1. Start with monolith GraphQL server
2. Extract one domain to subgraph
3. Keep monolith as subgraph
4. Gradually move types to new subgraphs

### Strangler Pattern

```graphql
# Original monolith
type User @key(fields: "id") {
  id: ID!
  email: String!
  orders: [Order!]!  # Will move to Orders subgraph
}

# New Orders subgraph
type User @key(fields: "id") {
  id: ID! @external
  orders: [Order!]! @override(from: "monolith")
}
```

## Best Practices

1. **One entity owner** - Only one subgraph should define the base type
2. **Use @shareable sparingly** - Prefer single source of truth
3. **Keep entities focused** - Follow domain boundaries
4. **Test references** - Ensure __resolveReference works correctly
5. **Version schemas** - Track breaking changes
6. **Monitor performance** - Federation adds network hops
