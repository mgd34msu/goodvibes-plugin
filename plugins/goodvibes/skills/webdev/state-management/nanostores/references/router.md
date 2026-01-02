# Nanostores Router

Tiny SPA router (712 bytes) using store-based navigation.

## Installation

```bash
npm install @nanostores/router
```

## Basic Setup

```typescript
// stores/router.ts
import { createRouter } from '@nanostores/router';

export const $router = createRouter({
  home: '/',
  about: '/about',
  blog: '/blog',
  post: '/blog/:slug',
  user: '/users/:id',
  settings: '/settings/:section?', // Optional param
});
```

## Route Object

```typescript
// When at /blog/hello-world?sort=date#comments
const page = $router.get();
// {
//   path: '/blog/hello-world',
//   route: 'post',
//   params: { slug: 'hello-world' },
//   search: { sort: 'date' },
//   hash: 'comments'
// }
```

## React Integration

```tsx
import { useStore } from '@nanostores/react';
import { $router } from './stores/router';

// Pages
import { HomePage } from './pages/Home';
import { BlogPage } from './pages/Blog';
import { PostPage } from './pages/Post';
import { NotFoundPage } from './pages/NotFound';

function App() {
  const page = useStore($router);

  if (!page) {
    return <NotFoundPage />;
  }

  switch (page.route) {
    case 'home':
      return <HomePage />;
    case 'blog':
      return <BlogPage />;
    case 'post':
      return <PostPage slug={page.params.slug} />;
    case 'user':
      return <UserPage id={page.params.id} />;
    default:
      return <NotFoundPage />;
  }
}
```

## Navigation

### Programmatic Navigation

```typescript
import { openPage, redirectPage, getPagePath } from '@nanostores/router';
import { $router } from './stores/router';

// Push new history entry
openPage($router, 'post', { slug: 'my-post' });

// Replace current entry (good for login redirects)
redirectPage($router, 'home');

// With search params
openPage($router, 'blog', {}, { sort: 'date', page: '1' });

// Generate path without navigating
const path = getPagePath($router, 'post', { slug: 'hello' });
// '/blog/hello'
```

### Link Component

```tsx
import { getPagePath } from '@nanostores/router';
import { $router } from './stores/router';

interface LinkProps {
  to: keyof typeof $router.routes;
  params?: Record<string, string>;
  search?: Record<string, string>;
  children: React.ReactNode;
}

function Link({ to, params, search, children }: LinkProps) {
  const href = getPagePath($router, to, params, search);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openPage($router, to, params, search);
  };

  return (
    <a href={href} onClick={handleClick}>
      {children}
    </a>
  );
}

// Usage
<Link to="post" params={{ slug: 'hello-world' }}>
  Read Post
</Link>
```

### Automatic Link Handling

Router automatically intercepts `<a>` clicks:

```tsx
// These are automatically handled - no onClick needed
<a href="/about">About</a>
<a href="/blog/my-post">Post</a>

// Opt out of automatic handling
<a href="/about" target="_self">External behavior</a>
<a href="https://example.com">External link</a>
```

Disable automatic click tracking:

```typescript
export const $router = createRouter(routes, {
  links: false, // Manual handling only
});
```

## Route Patterns

### Required Parameters

```typescript
const $router = createRouter({
  post: '/posts/:category/:slug',
});

// Matches: /posts/tech/hello-world
// params: { category: 'tech', slug: 'hello-world' }
```

### Optional Parameters

```typescript
const $router = createRouter({
  list: '/items/:category?/:subcategory?',
});

// Matches:
// /items -> { category: undefined, subcategory: undefined }
// /items/books -> { category: 'books', subcategory: undefined }
// /items/books/fiction -> { category: 'books', subcategory: 'fiction' }
```

### RegExp Routes

For complex patterns:

```typescript
const $router = createRouter({
  // Match /files/path/to/file.txt
  file: [
    /^\/files\/(.+)$/,
    (match) => ({ path: match[1] }),
  ],
  // Match /v1/api or /v2/api
  api: [
    /^\/v(\d+)\/api$/,
    (match) => ({ version: parseInt(match[1]) }),
  ],
});
```

## Search Parameters

Automatically parsed from query string:

```typescript
// URL: /blog?sort=date&page=2&tags=js&tags=react

const page = $router.get();
// page.search = {
//   sort: 'date',
//   page: '2',
//   tags: ['js', 'react']  // Arrays for repeated params
// }
```

Disable parsing (treat as literal):

```typescript
const $router = createRouter(routes, {
  search: true, // Keep raw search string
});
```

## Server-Side Rendering

```typescript
// Server: manually set route
$router.open('/blog/my-post');

// Or with full URL
$router.open(request.url);

// Render
const page = $router.get();
```

Node.js environment (no window):

```typescript
import { createRouter } from '@nanostores/router';

// Works in Node - uses internal state instead of location
const $router = createRouter(routes);
$router.open('/about');
```

## Route Guards

```typescript
import { computed } from 'nanostores';
import { $router } from './stores/router';
import { $user } from './stores/user';

// Protected routes
const protectedRoutes = ['settings', 'profile', 'dashboard'];

export const $currentPage = computed(
  [$router, $user],
  (page, user) => {
    if (!page) return null;

    // Redirect to login if protected and not authenticated
    if (protectedRoutes.includes(page.route) && !user) {
      // Use setTimeout to avoid updating during render
      setTimeout(() => redirectPage($router, 'login'), 0);
      return null;
    }

    return page;
  }
);
```

## Active Link Detection

```tsx
import { useStore } from '@nanostores/react';
import { $router } from './stores/router';

function NavLink({
  to,
  params,
  children,
}: {
  to: string;
  params?: Record<string, string>;
  children: React.ReactNode;
}) {
  const page = useStore($router);
  const isActive = page?.route === to;

  return (
    <a
      href={getPagePath($router, to, params)}
      className={isActive ? 'active' : ''}
    >
      {children}
    </a>
  );
}
```

## Nested Routes

Handle with computed stores:

```typescript
const $router = createRouter({
  dashboard: '/dashboard',
  dashboardSection: '/dashboard/:section',
  dashboardItem: '/dashboard/:section/:itemId',
});

// Computed for layout decisions
export const $dashboardSection = computed($router, (page) => {
  if (!page) return null;
  if (page.route.startsWith('dashboard')) {
    return page.params.section || 'overview';
  }
  return null;
});
```

## History State

Store extra data with navigation:

```typescript
// Navigation with state
history.pushState(
  { scrollPosition: window.scrollY },
  '',
  getPagePath($router, 'blog')
);

// Access in popstate
window.addEventListener('popstate', (e) => {
  if (e.state?.scrollPosition) {
    window.scrollTo(0, e.state.scrollPosition);
  }
});
```

## Scroll Restoration

```typescript
import { listen } from 'nanostores';
import { $router } from './stores/router';

// Scroll to top on navigation
listen($router, () => {
  window.scrollTo(0, 0);
});

// Or respect hash
listen($router, (page) => {
  if (page?.hash) {
    document.getElementById(page.hash)?.scrollIntoView();
  } else {
    window.scrollTo(0, 0);
  }
});
```

## TypeScript

Full type inference for routes and params:

```typescript
import { createRouter, getPagePath } from '@nanostores/router';

const $router = createRouter({
  home: '/',
  user: '/users/:id',
  post: '/posts/:category/:slug',
} as const);

// Type-safe navigation
openPage($router, 'user', { id: '123' }); // OK
openPage($router, 'user', {}); // Error: missing 'id'
openPage($router, 'invalid', {}); // Error: invalid route

// Type-safe params access
const page = $router.get();
if (page?.route === 'user') {
  const userId: string = page.params.id; // Typed
}
```
