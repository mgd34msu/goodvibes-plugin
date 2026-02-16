# Performance Anti-Patterns and Optimization Techniques

This reference document catalogs common performance anti-patterns and their optimized solutions, organized by domain.

## Bundle Performance

### Anti-Pattern: Full Library Imports

**Problem:**
```typescript
import _ from 'lodash'; // 71KB gzipped
import * as Icons from 'react-icons/fa'; // 500+ icons
import moment from 'moment'; // 72KB gzipped
```

**Solution:**
```typescript
import debounce from 'lodash/debounce'; // 2KB gzipped
import { FaUser, FaCog } from 'react-icons/fa'; // Only what you need
import { format } from 'date-fns'; // 13KB gzipped, or use native Intl
```

### Anti-Pattern: No Code Splitting

**Problem:**
```typescript
import AdminPanel from './AdminPanel'; // 250KB admin code loaded on all pages
import ChartLibrary from 'chart.js'; // 60KB chart code on pages without charts
```

**Solution:**
```typescript
import dynamic from 'next/dynamic';

const AdminPanel = dynamic(() => import('./AdminPanel'), {
  loading: () => <Spinner />,
});

const ChartLibrary = dynamic(() => import('chart.js'), {
  ssr: false,
});
```

### Anti-Pattern: Duplicate Dependencies

**Problem:**
Multiple versions of React, date libraries, or utility packages bundled.

**Detection:**
```bash
npm ls react
npm ls date-fns
```

**Solution:**
```json
// package.json
{
  "overrides": {
    "react": "^18.2.0"
  }
}
```

## Database Performance

### Anti-Pattern: N+1 Queries

**Problem:**
```typescript
const posts = await db.post.findMany(); // 1 query

const postsWithAuthors = await Promise.all(
  posts.map(async (post) => ({
    ...post,
    author: await db.user.findUnique({ where: { id: post.authorId } }), // N queries
  }))
);
```

**Solution:**
```typescript
const posts = await db.post.findMany({
  include: {
    author: {
      select: {
        id: true,
        name: true,
        avatar: true,
      },
    },
  },
});
```

### Anti-Pattern: Missing Indexes

**Problem:**
```prisma
model Post {
  id        String   @id
  authorId  String   // No index!
  published Boolean  // No index!
  createdAt DateTime
}
```

**Query that scans entire table:**
```typescript
await db.post.findMany({
  where: { published: true },
  orderBy: { createdAt: 'desc' },
});
```

**Solution:**
```prisma
model Post {
  id        String   @id
  authorId  String
  published Boolean
  createdAt DateTime
  
  @@index([authorId])
  @@index([published, createdAt(sort: Desc)])
}
```

### Anti-Pattern: Over-fetching Data

**Problem:**
```typescript
const user = await db.user.findUnique({
  where: { id },
  // Returns ALL fields including password hash, internal IDs, etc.
});
```

**Solution:**
```typescript
const user = await db.user.findUnique({
  where: { id },
  select: {
    id: true,
    name: true,
    email: true,
    avatar: true,
  },
});
```

### Anti-Pattern: Connection Pool Exhaustion

**Problem:**
```typescript
// Creating new PrismaClient on every request
export async function GET() {
  const prisma = new PrismaClient(); // Exhausts connections!
  const data = await prisma.post.findMany();
  return Response.json(data);
}
```

**Solution:**
```typescript
// lib/db.ts - singleton pattern
import { PrismaClient } from '@prisma/client';

// Standard Prisma singleton pattern for Next.js
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

## Rendering Performance

### Anti-Pattern: Unnecessary Re-renders

**Problem:**
```typescript
function Parent() {
  const [count, setCount] = useState(0);
  
  // New object reference on every render!
  const config = { theme: 'dark' };
  
  // New function reference on every render!
  const handleClick = () => console.log('clicked');
  
  return <Child config={config} onClick={handleClick} />;
}
```

**Solution:**
```typescript
function Parent() {
  const [count, setCount] = useState(0);
  
  const config = useMemo(() => ({ theme: 'dark' }), []);
  
  const handleClick = useCallback(() => {
    console.log('clicked'); // Placeholder - use actual handler in production
  }, []);
  
  return <Child config={config} onClick={handleClick} />;
}

const Child = React.memo(function Child({ config, onClick }) {
  // Only re-renders when config or onClick actually changes
  return <div onClick={onClick}>{config.theme}</div>;
});
```

### Anti-Pattern: Large Lists Without Virtualization

**Problem:**
```typescript
function UserList({ users }: { users: User[] }) {
  return (
    <div>
      {users.map(user => (
        <UserRow key={user.id} user={user} />
      ))}
    </div>
  );
}

// Rendering 10,000 rows = slow scrolling, high memory
```

**Solution:**
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function UserList({ users }: { users: User[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: users.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 5,
  });
  
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <UserRow user={users[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Anti-Pattern: Expensive Inline Computations

**Problem:**
```typescript
function ProductList({ products }: Props) {
  return (
    <div>
      {products.map(product => (
        <div key={product.id}>
          {/* Expensive computation on every render! */}
          <Price value={calculateDiscount(product.price, product.category, product.date)} />
        </div>
      ))}
    </div>
  );
}
```

**Solution:**
```typescript
function ProductList({ products }: Props) {
  const discountedProducts = useMemo(
    () => products.map(p => ({
      ...p,
      discountedPrice: calculateDiscount(p.price, p.category, p.date),
    })),
    [products]
  );
  
  return (
    <div>
      {discountedProducts.map(product => (
        <div key={product.id}>
          <Price value={product.discountedPrice} />
        </div>
      ))}
    </div>
  );
}
```

## Network Performance

### Anti-Pattern: Request Waterfalls

**Problem:**
```typescript
async function loadDashboard() {
  const user = await fetch('/api/user').then(r => r.json());
  const posts = await fetch(`/api/posts?userId=${user.id}`).then(r => r.json());
  const comments = await fetch(`/api/comments?userId=${user.id}`).then(r => r.json());
  
  // Total time: 300ms + 200ms + 150ms = 650ms
}
```

**Solution 1: Parallel requests**
```typescript
async function loadDashboard(userId: string) {
  const [user, posts, comments] = await Promise.all([
    fetch(`/api/user/${userId}`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    fetch(`/api/posts?userId=${userId}`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    fetch(`/api/comments?userId=${userId}`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  ]);
  
  // Total time: max(300ms, 200ms, 150ms) = 300ms
}
```

**Solution 2: Server-side aggregation**
```typescript
// API route that aggregates data
export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get('userId');
  
  const [user, posts, comments] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.post.findMany({ where: { authorId: userId } }),
    db.comment.findMany({ where: { authorId: userId } }),
  ]);
  
  return Response.json({ user, posts, comments });
}

// Client makes 1 request instead of 3
const data = await fetch(`/api/dashboard?userId=${userId}`).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
```

### Anti-Pattern: No Caching Headers

**Problem:**
```typescript
export async function GET() {
  const products = await db.product.findMany();
  return Response.json(products); // No cache headers!
}
```

**Solution:**
```typescript
export async function GET() {
  const products = await db.product.findMany();
  
  return Response.json(products, {
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
```

### Anti-Pattern: Unoptimized Images

**Problem:**
```tsx
<img src="/hero.jpg" alt="Hero" /> // 4MB image, no lazy loading, no srcset
```

**Solution:**
```tsx
import Image from 'next/image';

<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  priority
  placeholder="blur"
  blurDataURL="data:image/jpeg;base64,..."
  sizes="(max-width: 768px) 100vw, 1200px"
/>
```

## Memory Management

### Anti-Pattern: Event Listener Leaks

**Problem:**
```typescript
useEffect(() => {
  window.addEventListener('resize', handleResize);
  // Missing cleanup!
}, []);
```

**Solution:**
```typescript
useEffect(() => {
  window.addEventListener('resize', handleResize);
  
  return () => {
    window.removeEventListener('resize', handleResize);
  };
}, []);
```

### Anti-Pattern: Timer Leaks

**Problem:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchUpdates();
  }, 5000);
  // Missing cleanup!
}, []);
```

**Solution:**
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    fetchUpdates();
  }, 5000);
  
  return () => {
    clearInterval(interval);
  };
}, []);
```

### Anti-Pattern: Unbounded Caches

**Problem:**
```typescript
const cache = new Map<string, Data>();

function getData(key: string) {
  if (!cache.has(key)) {
    cache.set(key, fetchData(key)); // Cache grows forever!
  }
  return cache.get(key);
}
```

**Solution 1: LRU Cache**
```typescript
import LRU from 'lru-cache';

const cache = new LRU<string, Data>({
  max: 500,
  ttl: 1000 * 60 * 5, // 5 minutes
});

function getData(key: string) {
  const cached = cache.get(key);
  if (cached) return cached;
  
  const data = fetchData(key);
  cache.set(key, data);
  return data;
}
```

**Solution 2: WeakRef for memory-sensitive caches**
```typescript
class ImageCache {
  private cache = new Map<string, WeakRef<HTMLImageElement>>();
  
  get(url: string): HTMLImageElement | undefined {
    const ref = this.cache.get(url);
    const img = ref?.deref();
    
    if (!img) {
      this.cache.delete(url); // Clean up dead references
    }
    
    return img;
  }
  
  set(url: string, img: HTMLImageElement): void {
    this.cache.set(url, new WeakRef(img));
  }
}
```

## Server-Side Performance

### Anti-Pattern: Blocking Server Components

**Problem:**
```typescript
export default async function DashboardPage() {
  const user = await getUser();
  const posts = await getPosts(); // Blocks entire page!
  const analytics = await getAnalytics(); // Blocks entire page!
  
  return (
    <div>
      <UserProfile user={user} />
      <PostList posts={posts} />
      <Analytics data={analytics} />
    </div>
  );
}
```

**Solution:**
```typescript
import { Suspense } from 'react';

export default async function DashboardPage() {
  const user = await getUser();
  
  return (
    <div>
      <UserProfile user={user} />
      
      <Suspense fallback={<PostListSkeleton />}>
        <PostListAsync />
      </Suspense>
      
      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsAsync />
      </Suspense>
    </div>
  );
}

async function PostListAsync() {
  const posts = await getPosts();
  return <PostList posts={posts} />;
}

async function AnalyticsAsync() {
  const data = await getAnalytics();
  return <Analytics data={data} />;
}
```

### Anti-Pattern: Node.js Runtime for Simple APIs

**Problem:**
```typescript
// app/api/geo/route.ts
export async function GET(request: Request) {
  // Simple geolocation API using Node.js runtime
  // Cold start: 300-500ms
  const geo = await getGeoData(request);
  return Response.json(geo);
}
```

**Solution:**
```typescript
// app/api/geo/route.ts
export const runtime = 'edge';

export async function GET(request: Request) {
  // Edge runtime
  // Cold start: <50ms
  const country = request.headers.get('x-vercel-ip-country');
  const city = request.headers.get('x-vercel-ip-city');
  
  return Response.json({ country, city });
}
```

## Core Web Vitals

### Anti-Pattern: Large LCP Element Not Prioritized

**Problem:**
```tsx
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  // Not prioritized - loaded after other resources
/>
```

**Solution:**
```tsx
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={630}
  priority // Preload this critical image!
/>
```

### Anti-Pattern: Layout Shift from Images

**Problem:**
```tsx
<img src="/photo.jpg" alt="Photo" /> // No dimensions, causes CLS
```

**Solution:**
```tsx
<Image
  src="/photo.jpg"
  alt="Photo"
  width={800}
  height={600}
  // Reserves space, prevents layout shift
/>
```

### Anti-Pattern: Blocking Main Thread

**Problem:**
```typescript
function handleSearch(query: string) {
  // Expensive operation blocks UI
  const results = performExpensiveSearch(query);
  setResults(results);
}

<input onChange={(e) => handleSearch(e.target.value)} />
```

**Solution:**
```typescript
import { useDebouncedCallback } from 'use-debounce';

function SearchInput() {
  const debouncedSearch = useDebouncedCallback(
    (query: string) => {
      const results = performExpensiveSearch(query);
      setResults(results);
    },
    300 // Wait 300ms after user stops typing
  );
  
  return (
    <input onChange={(e) => debouncedSearch(e.target.value)} />
  );
}
```
