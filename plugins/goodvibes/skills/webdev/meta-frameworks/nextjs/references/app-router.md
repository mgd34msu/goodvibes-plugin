# Next.js App Router Advanced Patterns

## Route Groups

Organize routes without affecting URL structure using `(folder)`:

```
app/
  (marketing)/
    about/page.tsx      # /about
    contact/page.tsx    # /contact
    layout.tsx          # Shared marketing layout
  (shop)/
    products/page.tsx   # /products
    cart/page.tsx       # /cart
    layout.tsx          # Shared shop layout
```

**Use cases:**
- Multiple root layouts
- Organize by feature/team
- Opt segments into/out of layouts

## Parallel Routes

Render multiple pages simultaneously in the same layout using `@folder`:

```
app/
  @analytics/
    page.tsx
  @team/
    page.tsx
  layout.tsx
  page.tsx
```

```tsx
// app/layout.tsx
export default function Layout({
  children,
  analytics,
  team,
}: {
  children: React.ReactNode
  analytics: React.ReactNode
  team: React.ReactNode
}) {
  return (
    <>
      {children}
      {analytics}
      {team}
    </>
  )
}
```

**With conditional rendering:**
```tsx
import { getUser } from '@/lib/auth'

export default async function Layout({
  children,
  admin,
  user,
}) {
  const role = await getUser()

  return (
    <>
      {children}
      {role === 'admin' ? admin : user}
    </>
  )
}
```

### Default.tsx

Handles unmatched parallel routes during navigation:

```tsx
// app/@analytics/default.tsx
export default function Default() {
  return null // Or a fallback UI
}
```

## Intercepting Routes

Show route content in a different context (e.g., modal) using `(.)`:

| Convention | Matches |
|------------|---------|
| `(.)` | Same level |
| `(..)` | One level up |
| `(..)(..)` | Two levels up |
| `(...)` | From root |

**Photo modal pattern:**
```
app/
  @modal/
    (.)photos/[id]/
      page.tsx          # Intercepts /photos/[id]
    default.tsx
  photos/
    [id]/
      page.tsx          # Full page view
  layout.tsx
  page.tsx
```

```tsx
// app/@modal/(.)photos/[id]/page.tsx
import { Modal } from '@/components/modal'

export default async function PhotoModal({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <Modal>
      <Photo id={id} />
    </Modal>
  )
}
```

```tsx
// app/layout.tsx
export default function Layout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <>
      {children}
      {modal}
    </>
  )
}
```

## Dynamic Routes Advanced

### Optional Catch-All

```tsx
// app/docs/[[...slug]]/page.tsx
// Matches: /docs, /docs/a, /docs/a/b

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  const path = slug?.join('/') ?? 'index'

  return <DocContent path={path} />
}
```

### Generate Static Params

```tsx
// app/blog/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getPosts()

  return posts.map((post) => ({
    slug: post.slug,
  }))
}

// With dynamic segments
// app/products/[category]/[id]/page.tsx
export async function generateStaticParams() {
  const products = await getProducts()

  return products.map((product) => ({
    category: product.category,
    id: product.id,
  }))
}
```

### Dynamic Metadata

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPost(slug)

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      images: [post.image],
    },
  }
}
```

## Route Handlers

### Request Handling

```tsx
// app/api/items/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  // URL params
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')

  // Headers
  const authHeader = request.headers.get('authorization')

  // Cookies
  const token = request.cookies.get('token')

  return NextResponse.json({ query, hasAuth: !!authHeader })
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  // Set cookies
  const response = NextResponse.json({ success: true })
  response.cookies.set('session', 'value', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 1 day
  })

  return response
}
```

### Streaming Response

```tsx
export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < 10; i++) {
        controller.enqueue(encoder.encode(`data: ${i}\n\n`))
        await new Promise((r) => setTimeout(r, 1000))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
```

### CORS Headers

```tsx
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

export async function GET() {
  return NextResponse.json(
    { data: 'response' },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    }
  )
}
```

## Navigation

### Link Component

```tsx
import Link from 'next/link'

// Basic
<Link href="/about">About</Link>

// With params
<Link href={`/blog/${post.slug}`}>{post.title}</Link>

// Replace history
<Link href="/dashboard" replace>Dashboard</Link>

// Disable prefetch
<Link href="/large-page" prefetch={false}>Large Page</Link>

// Scroll to top disabled
<Link href="/page#section" scroll={false}>Section</Link>
```

### Programmatic Navigation

```tsx
'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

export function Navigation() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleNavigate = () => {
    // Navigate
    router.push('/dashboard')

    // Replace (no history)
    router.replace('/login')

    // Refresh server components
    router.refresh()

    // Back/forward
    router.back()
    router.forward()
  }

  // Build URL with search params
  const createQueryString = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(name, value)
    return params.toString()
  }

  return (
    <button onClick={() => router.push(`${pathname}?${createQueryString('page', '2')}`)}>
      Page 2
    </button>
  )
}
```

### Redirect

```tsx
// Server Component
import { redirect } from 'next/navigation'

async function Page() {
  const user = await getUser()
  if (!user) {
    redirect('/login')
  }
  return <Dashboard user={user} />
}

// In Server Action
'use server'

export async function createPost(formData: FormData) {
  const post = await db.posts.create({ ... })
  redirect(`/posts/${post.id}`)
}
```

## Loading and Error States

### Loading UI

```tsx
// app/dashboard/loading.tsx
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-1/4 mb-4" />
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
    </div>
  )
}
```

### Error Boundary

```tsx
// app/dashboard/error.tsx
'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  )
}
```

### Global Error

```tsx
// app/global-error.tsx
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  )
}
```

### Not Found

```tsx
// app/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div>
      <h2>Not Found</h2>
      <p>Could not find requested resource</p>
      <Link href="/">Return Home</Link>
    </div>
  )
}
```

**Trigger programmatically:**
```tsx
import { notFound } from 'next/navigation'

async function Page({ params }) {
  const post = await getPost(params.slug)
  if (!post) {
    notFound()
  }
  return <Article post={post} />
}
```
