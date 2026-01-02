# DataLoader & N+1 Problem

## The N+1 Problem

Without DataLoader, nested queries cause N+1 database calls:

```graphql
query {
  posts {      # 1 query for posts
    author {   # N queries for authors (one per post)
      name
    }
  }
}
```

With 100 posts, this runs 101 queries.

## DataLoader Solution

DataLoader batches and caches requests within a single request lifecycle.

```bash
npm install dataloader
```

### Basic Setup

```typescript
import DataLoader from 'dataloader'

// Batch function receives array of keys, returns array of values
const userLoader = new DataLoader<string, User>(async (userIds) => {
  const users = await db.users.findMany({
    where: { id: { in: userIds as string[] } }
  })

  // Must return results in same order as keys
  const userMap = new Map(users.map(u => [u.id, u]))
  return userIds.map(id => userMap.get(id) || null)
})

// Usage
const user = await userLoader.load('user_123')
```

### Context-Based DataLoaders

Create new loaders per request to ensure proper caching scope:

```typescript
function createLoaders() {
  return {
    user: new DataLoader<string, User>(async (ids) => {
      const users = await db.users.findMany({
        where: { id: { in: ids as string[] } }
      })
      const map = new Map(users.map(u => [u.id, u]))
      return ids.map(id => map.get(id) ?? null)
    }),

    postsByAuthor: new DataLoader<string, Post[]>(async (authorIds) => {
      const posts = await db.posts.findMany({
        where: { authorId: { in: authorIds as string[] } }
      })

      // Group by authorId
      const grouped = new Map<string, Post[]>()
      posts.forEach(post => {
        const existing = grouped.get(post.authorId) || []
        grouped.set(post.authorId, [...existing, post])
      })

      return authorIds.map(id => grouped.get(id) || [])
    })
  }
}

type Loaders = ReturnType<typeof createLoaders>

interface Context {
  user: User | null
  loaders: Loaders
}

// In context creation
app.use(
  '/graphql',
  expressMiddleware(server, {
    context: async ({ req }): Promise<Context> => ({
      user: await getUserFromRequest(req),
      loaders: createLoaders()
    })
  })
)
```

### Using in Resolvers

```typescript
const resolvers = {
  Post: {
    author: (post, _, { loaders }) => {
      return loaders.user.load(post.authorId)
    }
  },
  User: {
    posts: (user, _, { loaders }) => {
      return loaders.postsByAuthor.load(user.id)
    }
  }
}
```

## Advanced Patterns

### Composite Keys

```typescript
// For lookups that need multiple keys
const membershipLoader = new DataLoader<{ orgId: string; userId: string }, Membership>(
  async (keys) => {
    const memberships = await db.memberships.findMany({
      where: {
        OR: keys.map(k => ({ orgId: k.orgId, userId: k.userId }))
      }
    })

    const map = new Map(
      memberships.map(m => [`${m.orgId}:${m.userId}`, m])
    )

    return keys.map(k => map.get(`${k.orgId}:${k.userId}`) ?? null)
  },
  {
    // Custom cache key function
    cacheKeyFn: key => `${key.orgId}:${key.userId}`
  }
)
```

### Priming the Cache

```typescript
// Pre-populate loader with known data
const createPost = async (_, { input }, { loaders }) => {
  const post = await db.posts.create({ data: input })

  // Prime the cache so subsequent loads don't query
  loaders.post.prime(post.id, post)

  return post
}
```

### Clearing Cache

```typescript
// Clear after mutation
const updateUser = async (_, { id, input }, { loaders }) => {
  const user = await db.users.update({ where: { id }, data: input })

  // Clear stale cache entry
  loaders.user.clear(id)

  // Prime with new data
  loaders.user.prime(id, user)

  return user
}

// Clear all
loaders.user.clearAll()
```

## One-to-Many with Filters

```typescript
interface PostFilterKey {
  authorId: string
  status?: 'DRAFT' | 'PUBLISHED'
}

const filteredPostsLoader = new DataLoader<PostFilterKey, Post[]>(
  async (keys) => {
    // Group keys by filter params
    const byStatus = new Map<string, string[]>()
    keys.forEach(key => {
      const status = key.status || 'all'
      const existing = byStatus.get(status) || []
      byStatus.set(status, [...existing, key.authorId])
    })

    // Query each group
    const results = new Map<string, Post[]>()

    for (const [status, authorIds] of byStatus) {
      const where: any = { authorId: { in: authorIds } }
      if (status !== 'all') where.status = status

      const posts = await db.posts.findMany({ where })

      posts.forEach(post => {
        const key = `${post.authorId}:${status}`
        const existing = results.get(key) || []
        results.set(key, [...existing, post])
      })
    }

    return keys.map(k => {
      const key = `${k.authorId}:${k.status || 'all'}`
      return results.get(key) || []
    })
  },
  {
    cacheKeyFn: k => `${k.authorId}:${k.status || 'all'}`
  }
)
```

## With Prisma

```typescript
import { PrismaClient } from '@prisma/client'
import DataLoader from 'dataloader'

const prisma = new PrismaClient()

function createPrismaLoaders() {
  return {
    user: new DataLoader<string, User | null>(async (ids) => {
      const users = await prisma.user.findMany({
        where: { id: { in: [...ids] } }
      })
      const map = new Map(users.map(u => [u.id, u]))
      return ids.map(id => map.get(id) ?? null)
    }),

    usersByEmail: new DataLoader<string, User | null>(async (emails) => {
      const users = await prisma.user.findMany({
        where: { email: { in: [...emails] } }
      })
      const map = new Map(users.map(u => [u.email, u]))
      return emails.map(email => map.get(email) ?? null)
    })
  }
}
```

## Testing

```typescript
import DataLoader from 'dataloader'

describe('UserLoader', () => {
  it('batches requests', async () => {
    const batchFn = jest.fn(async (ids: readonly string[]) => {
      return ids.map(id => ({ id, name: `User ${id}` }))
    })

    const loader = new DataLoader(batchFn)

    // Multiple loads in same tick are batched
    const [user1, user2, user3] = await Promise.all([
      loader.load('1'),
      loader.load('2'),
      loader.load('3')
    ])

    expect(batchFn).toHaveBeenCalledTimes(1)
    expect(batchFn).toHaveBeenCalledWith(['1', '2', '3'])
  })

  it('caches results', async () => {
    const batchFn = jest.fn(async (ids: readonly string[]) => {
      return ids.map(id => ({ id }))
    })

    const loader = new DataLoader(batchFn)

    await loader.load('1')
    await loader.load('1')
    await loader.load('1')

    expect(batchFn).toHaveBeenCalledTimes(1)
  })
})
```

## Best Practices

1. **Create loaders per request** - Never share between requests
2. **Return results in same order as keys** - Required by DataLoader
3. **Handle missing items** - Return null for not found
4. **Use cache key functions** - For composite keys
5. **Prime cache after mutations** - Keep cache consistent
6. **Clear cache when needed** - After deletes/updates
