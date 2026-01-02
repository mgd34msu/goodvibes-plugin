---
name: tanstack-query
description: Manages server state with TanStack Query (React Query) including data fetching, caching, mutations, and optimistic updates. Use when fetching API data, caching responses, handling loading states, or syncing server state.
---

# TanStack Query

Powerful data-fetching and server state management library for React applications.

## Quick Start

**Install:**
```bash
npm install @tanstack/react-query
```

**Setup Provider:**
```tsx
// app/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

## useQuery - Fetching Data

### Basic Query

```tsx
import { useQuery } from '@tanstack/react-query';

function Posts() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      const response = await fetch('/api/posts');
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json();
    },
  });

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

### Query with Parameters

```tsx
function Post({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['posts', id],
    queryFn: async () => {
      const response = await fetch(`/api/posts/${id}`);
      return response.json();
    },
  });

  if (isLoading) return <div>Loading...</div>;
  return <h1>{data.title}</h1>;
}
```

### Query Options

```tsx
const { data } = useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,

  // Timing
  staleTime: 5 * 60 * 1000,    // Data stays fresh for 5 minutes
  gcTime: 10 * 60 * 1000,      // Cache garbage collected after 10 minutes
  refetchInterval: 30 * 1000,   // Refetch every 30 seconds

  // Behavior
  enabled: !!userId,            // Only run if userId exists
  retry: 3,                     // Retry failed requests 3 times
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),

  // Refetch triggers
  refetchOnMount: true,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,

  // Placeholder data
  placeholderData: [],          // Show while loading
  initialData: cachedData,      // Use cached data initially
});
```

### Dependent Queries

```tsx
function UserPosts({ userId }: { userId: string }) {
  // First query
  const { data: user } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  });

  // Dependent query - only runs when user exists
  const { data: posts } = useQuery({
    queryKey: ['posts', user?.id],
    queryFn: () => fetchPostsByUser(user!.id),
    enabled: !!user, // Only run when user is available
  });

  return <div>{/* ... */}</div>;
}
```

### Parallel Queries

```tsx
import { useQueries } from '@tanstack/react-query';

function Dashboard() {
  const results = useQueries({
    queries: [
      { queryKey: ['users'], queryFn: fetchUsers },
      { queryKey: ['posts'], queryFn: fetchPosts },
      { queryKey: ['comments'], queryFn: fetchComments },
    ],
  });

  const isLoading = results.some((result) => result.isLoading);
  const [users, posts, comments] = results.map((r) => r.data);

  if (isLoading) return <div>Loading...</div>;

  return <div>{/* Use users, posts, comments */}</div>;
}
```

## useMutation - Modifying Data

### Basic Mutation

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function CreatePost() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (newPost: { title: string; content: string }) => {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPost),
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch posts
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    mutation.mutate({
      title: formData.get('title') as string,
      content: formData.get('content') as string,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" required />
      <textarea name="content" required />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create Post'}
      </button>
      {mutation.isError && <p>Error: {mutation.error.message}</p>}
    </form>
  );
}
```

### Mutation Callbacks

```tsx
const mutation = useMutation({
  mutationFn: createPost,

  // Called before mutation
  onMutate: async (newPost) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['posts'] });

    // Snapshot previous value
    const previousPosts = queryClient.getQueryData(['posts']);

    // Optimistically update
    queryClient.setQueryData(['posts'], (old) => [...old, newPost]);

    // Return context for rollback
    return { previousPosts };
  },

  // Called on error
  onError: (err, newPost, context) => {
    // Rollback on error
    queryClient.setQueryData(['posts'], context?.previousPosts);
  },

  // Called on success or error
  onSettled: () => {
    // Always refetch after mutation
    queryClient.invalidateQueries({ queryKey: ['posts'] });
  },

  // Called on success only
  onSuccess: (data, variables, context) => {
    console.log('Created:', data);
  },
});
```

### Optimistic Updates

```tsx
function TodoItem({ todo }: { todo: Todo }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (completed: boolean) =>
      updateTodo(todo.id, { completed }),

    onMutate: async (completed) => {
      await queryClient.cancelQueries({ queryKey: ['todos'] });

      const previousTodos = queryClient.getQueryData<Todo[]>(['todos']);

      queryClient.setQueryData<Todo[]>(['todos'], (old) =>
        old?.map((t) =>
          t.id === todo.id ? { ...t, completed } : t
        )
      );

      return { previousTodos };
    },

    onError: (err, completed, context) => {
      queryClient.setQueryData(['todos'], context?.previousTodos);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  return (
    <input
      type="checkbox"
      checked={todo.completed}
      onChange={(e) => mutation.mutate(e.target.checked)}
    />
  );
}
```

## Query Keys

### Key Structure

```tsx
// Simple key
['posts']

// With ID
['posts', postId]

// With filters
['posts', { status: 'published', author: userId }]

// Nested structure
['users', userId, 'posts', { page, limit }]
```

### Key Matching

```tsx
// Invalidate exact match
queryClient.invalidateQueries({ queryKey: ['posts', 1] });

// Invalidate all posts queries
queryClient.invalidateQueries({ queryKey: ['posts'] });

// Invalidate with predicate
queryClient.invalidateQueries({
  predicate: (query) =>
    query.queryKey[0] === 'posts' && query.state.data?.length > 0,
});
```

## Cache Management

### Manual Cache Updates

```tsx
// Set data directly
queryClient.setQueryData(['posts', id], newPost);

// Update with function
queryClient.setQueryData(['posts'], (old) => [...old, newPost]);

// Get cached data
const posts = queryClient.getQueryData(['posts']);

// Remove from cache
queryClient.removeQueries({ queryKey: ['posts'] });
```

### Invalidation

```tsx
// Invalidate and refetch
queryClient.invalidateQueries({ queryKey: ['posts'] });

// Invalidate without refetch
queryClient.invalidateQueries({
  queryKey: ['posts'],
  refetchType: 'none',
});

// Invalidate inactive queries too
queryClient.invalidateQueries({
  queryKey: ['posts'],
  refetchType: 'all',
});
```

### Prefetching

```tsx
// Prefetch on hover
function PostLink({ id }: { id: string }) {
  const queryClient = useQueryClient();

  const prefetch = () => {
    queryClient.prefetchQuery({
      queryKey: ['posts', id],
      queryFn: () => fetchPost(id),
      staleTime: 5 * 60 * 1000,
    });
  };

  return (
    <Link href={`/posts/${id}`} onMouseEnter={prefetch}>
      View Post
    </Link>
  );
}

// Prefetch in loader
export async function loader() {
  await queryClient.prefetchQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  });
  return null;
}
```

## Infinite Queries

```tsx
import { useInfiniteQuery } from '@tanstack/react-query';

function InfinitePosts() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['posts', 'infinite'],
    queryFn: async ({ pageParam }) => {
      const response = await fetch(`/api/posts?cursor=${pageParam}`);
      return response.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  return (
    <div>
      {data?.pages.map((page, i) => (
        <div key={i}>
          {page.posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ))}

      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage
          ? 'Loading...'
          : hasNextPage
          ? 'Load More'
          : 'No more posts'}
      </button>
    </div>
  );
}
```

## Suspense Mode

```tsx
import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';

function Posts() {
  // This will suspend until data is ready
  const { data } = useSuspenseQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  });

  return (
    <ul>
      {data.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Posts />
    </Suspense>
  );
}
```

## Common Patterns

### Fetch Function Factory

```tsx
const api = {
  posts: {
    list: async () => {
      const res = await fetch('/api/posts');
      return res.json();
    },
    get: async (id: string) => {
      const res = await fetch(`/api/posts/${id}`);
      return res.json();
    },
    create: async (data: CreatePostInput) => {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    },
  },
};

// Usage
const { data } = useQuery({
  queryKey: ['posts'],
  queryFn: api.posts.list,
});
```

### Query Keys Factory

```tsx
export const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (filters: PostFilters) => [...postKeys.lists(), filters] as const,
  details: () => [...postKeys.all, 'detail'] as const,
  detail: (id: string) => [...postKeys.details(), id] as const,
};

// Usage
useQuery({
  queryKey: postKeys.detail(id),
  queryFn: () => api.posts.get(id),
});

// Invalidate all posts
queryClient.invalidateQueries({ queryKey: postKeys.all });

// Invalidate only lists
queryClient.invalidateQueries({ queryKey: postKeys.lists() });
```

### Custom Query Hooks

```tsx
// hooks/usePosts.ts
export function usePosts(filters?: PostFilters) {
  return useQuery({
    queryKey: postKeys.list(filters ?? {}),
    queryFn: () => api.posts.list(filters),
  });
}

export function usePost(id: string) {
  return useQuery({
    queryKey: postKeys.detail(id),
    queryFn: () => api.posts.get(id),
    enabled: !!id,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.posts.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postKeys.lists() });
    },
  });
}

// Usage
function PostList() {
  const { data: posts, isLoading } = usePosts({ status: 'published' });
  const createPost = useCreatePost();

  // ...
}
```

## Server-Side Rendering

### Next.js App Router

```tsx
// app/posts/page.tsx
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { PostList } from '@/components/PostList';

export default async function PostsPage() {
  const queryClient = getQueryClient();

  await queryClient.prefetchQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PostList />
    </HydrationBoundary>
  );
}
```

```tsx
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';
import { cache } from 'react';

export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
        },
      },
    })
);
```

## Best Practices

1. **Use query key factories** - Consistent key structure
2. **Create custom hooks** - Encapsulate query logic
3. **Set appropriate staleTime** - Reduce unnecessary refetches
4. **Implement optimistic updates** - Better UX
5. **Use suspense mode** - Cleaner loading states

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Inline query functions | Extract to named functions |
| Missing error handling | Always handle isError |
| Stale closures in callbacks | Use functional updates |
| Not invalidating after mutation | Call invalidateQueries |
| Incorrect query key dependencies | Include all variables in key |

## Reference Files

- [references/patterns.md](references/patterns.md) - Advanced patterns
- [references/ssr.md](references/ssr.md) - Server-side rendering
- [references/testing.md](references/testing.md) - Testing queries
