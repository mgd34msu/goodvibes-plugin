# Next.js Caching Deep Dive

## Caching Overview

| Mechanism | What | Where | Duration | Invalidation |
|-----------|------|-------|----------|--------------|
| Request Memoization | fetch return values | Server | Per-request | N/A |
| Data Cache | fetch responses | Server | Persistent | Time/on-demand |
| Full Route Cache | HTML + RSC payload | Server | Persistent | Revalidation |
| Router Cache | RSC payload | Client | Session | Navigation/refresh |

## Request Memoization

Automatic deduplication within a single render pass:

```tsx
// Both calls use the same cached result
async function Component1() {
  const data = await fetch('https://api.example.com/data')
  return <div>{data}</div>
}

async function Component2() {
  const data = await fetch('https://api.example.com/data') // HIT
  return <div>{data}</div>
}
```

**Limitations:**
- Only GET requests
- Same URL and options required
- Only within React component tree
- Cleared after render completes

**Opt out:**
```tsx
const controller = new AbortController()
const { signal } = controller

fetch(url, { signal })
```

## Data Cache

### Configuration

```tsx
// Force cache (default in pages with no dynamic APIs)
const data = await fetch('https://api.example.com/data', {
  cache: 'force-cache'
})

// No caching
const data = await fetch('https://api.example.com/data', {
  cache: 'no-store'
})

// Time-based revalidation
const data = await fetch('https://api.example.com/data', {
  next: { revalidate: 3600 } // seconds
})

// Tagged for on-demand revalidation
const data = await fetch('https://api.example.com/data', {
  next: { tags: ['posts', 'home'] }
})
```

### Revalidation Strategies

**Time-based (stale-while-revalidate):**
```tsx
// Revalidate at most every hour
export const revalidate = 3600

async function Page() {
  const data = await fetch('https://api.example.com/data', {
    next: { revalidate: 3600 }
  })
  return <div>{data}</div>
}
```

**On-demand revalidation:**
```tsx
// app/actions.ts
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

// Revalidate specific path
export async function revalidatePostPath() {
  revalidatePath('/posts')
}

// Revalidate all paths using a tag
export async function revalidatePosts() {
  revalidateTag('posts')
}

// Revalidate layout and all child pages
export async function revalidateAll() {
  revalidatePath('/', 'layout')
}
```

**Via API Route:**
```tsx
// app/api/revalidate/route.ts
import { revalidateTag, revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { tag, path, secret } = await request.json()

  // Verify secret
  if (secret !== process.env.REVALIDATION_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  if (tag) {
    revalidateTag(tag)
  }

  if (path) {
    revalidatePath(path)
  }

  return NextResponse.json({ revalidated: true, now: Date.now() })
}
```

## Full Route Cache

### Static vs Dynamic Rendering

**Static (cached at build):**
- No dynamic functions used
- All data cached
- HTML pre-rendered

**Dynamic (rendered per request):**
- Uses `cookies()`, `headers()`, `searchParams`
- `cache: 'no-store'` fetch
- Route segment config

### Route Segment Config

```tsx
// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Force static rendering (error if dynamic APIs used)
export const dynamic = 'force-static'

// Control revalidation
export const revalidate = 60 // seconds
export const revalidate = false // never (static)
export const revalidate = 0 // always dynamic

// Runtime
export const runtime = 'nodejs' // or 'edge'

// Preferred region
export const preferredRegion = 'auto' // or specific region
```

### generateStaticParams

Pre-render dynamic routes at build time:

```tsx
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getPosts()

  return posts.map((post) => ({
    slug: post.slug,
  }))
}

// With dynamicParams
export const dynamicParams = false // 404 for unknown params
export const dynamicParams = true // Generate on-demand (default)
```

## Router Cache (Client)

### Behavior

- Caches visited route segments
- Prefetches linked routes
- Enables instant back/forward navigation

### Invalidation

```tsx
'use client'

import { useRouter } from 'next/navigation'

function RefreshButton() {
  const router = useRouter()

  return (
    <button onClick={() => router.refresh()}>
      Refresh
    </button>
  )
}
```

**Server Action invalidation:**
```tsx
'use server'

import { revalidatePath } from 'next/cache'

export async function updateData() {
  // Update database
  await db.update(...)

  // This also invalidates Router Cache
  revalidatePath('/data')
}
```

### Prefetching

```tsx
import Link from 'next/link'

// Default: prefetch static, don't prefetch dynamic
<Link href="/static">Static</Link>

// Full prefetch (including dynamic)
<Link href="/dynamic" prefetch={true}>Dynamic</Link>

// Disable prefetch
<Link href="/heavy" prefetch={false}>Heavy</Link>
```

## Non-fetch Caching

### unstable_cache

Cache database queries or other non-fetch operations:

```tsx
import { unstable_cache } from 'next/cache'

const getCachedUser = unstable_cache(
  async (id: string) => {
    return await db.user.findUnique({ where: { id } })
  },
  ['user'], // Cache key prefix
  {
    tags: ['users'],
    revalidate: 3600,
  }
)

// Usage
const user = await getCachedUser('123')
```

### React cache

Memoize within a request (not persistent):

```tsx
import { cache } from 'react'

const getUser = cache(async (id: string) => {
  return await db.user.findUnique({ where: { id } })
})

// Called multiple times, only one DB query
async function UserName({ id }) {
  const user = await getUser(id)
  return <span>{user.name}</span>
}

async function UserEmail({ id }) {
  const user = await getUser(id) // Uses memoized result
  return <span>{user.email}</span>
}
```

## Caching Patterns

### Static with ISR

```tsx
// Rebuild page every hour
export const revalidate = 3600

export default async function Page() {
  const posts = await getPosts()
  return <PostList posts={posts} />
}
```

### Mixed Static/Dynamic

```tsx
import { Suspense } from 'react'

// Static shell
export default function Page() {
  return (
    <div>
      <StaticHeader />
      <Suspense fallback={<Skeleton />}>
        <DynamicContent />
      </Suspense>
    </div>
  )
}

// Dynamic component
async function DynamicContent() {
  const data = await fetch('https://api.example.com/real-time', {
    cache: 'no-store'
  })
  return <div>{data}</div>
}
```

### Webhook Revalidation

```tsx
// app/api/webhook/route.ts
import { revalidateTag } from 'next/cache'

export async function POST(request: Request) {
  const payload = await request.json()

  // Verify webhook signature
  const signature = request.headers.get('x-webhook-signature')
  if (!verifySignature(payload, signature)) {
    return new Response('Invalid signature', { status: 401 })
  }

  // Revalidate based on event
  if (payload.event === 'content.updated') {
    revalidateTag('content')
  }

  return new Response('OK')
}
```

## Debugging Cache

### Headers

Check response headers:
- `x-nextjs-cache: HIT` - Served from cache
- `x-nextjs-cache: MISS` - Fresh render
- `x-nextjs-cache: STALE` - Stale content, revalidating

### Development Mode

Caching is disabled by default in development. Enable with:

```js
// next.config.js
module.exports = {
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
}
```

### Logging

```js
// next.config.js
module.exports = {
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
}
```
