# State Management Patterns

This reference provides detailed decision trees, implementation patterns, and anti-patterns for state management in React applications.

## State Categorization Decision Tree

```
What kind of state are you managing?
├─ From a server API?
│  └─ YES → TanStack Query
│     ├─ Needs caching
│     ├─ Needs background updates
│     ├─ Needs optimistic updates
│     └─ Needs cache invalidation
│
├─ Form input with validation?
│  └─ YES → React Hook Form + Zod
│     ├─ Complex validation rules
│     ├─ Field arrays
│     ├─ Nested objects
│     └─ Type-safe validation
│
├─ Should be in URL (shareable/bookmarkable)?
│  └─ YES → nuqs or searchParams
│     ├─ Pagination
│     ├─ Filters
│     ├─ Search queries
│     └─ Tab selection
│
├─ Shared across multiple components?
│  ├─ YES → How many components?
│  │  ├─ 2-3 nearby → Lift to common parent
│  │  └─ Many/distant → Zustand
│  │
│  └─ NO → useState (component state)
│     └─ Local to one component only
```

## TanStack Query Patterns

### Query Key Structure

Consistent query keys are critical for cache invalidation.

```typescript
// Good: Hierarchical structure
['users'] // All users
['users', userId] // Specific user
['users', userId, 'posts'] // User's posts
['users', userId, 'posts', postId] // Specific post

// Bad: Flat structure
['getUser', userId]
['userPosts', userId, postId]
```

### Query Organization

Organize queries in dedicated hooks:

```typescript
// src/queries/users.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUser, updateUser, getUsers } from '@/lib/api';

export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: string) => [...userKeys.lists(), { filters }] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
};

export function useUsers(filters?: string) {
  return useQuery({
    queryKey: userKeys.list(filters || ''),
    queryFn: () => getUsers(filters),
  });
}

export function useUser(userId: string) {
  return useQuery({
    queryKey: userKeys.detail(userId),
    queryFn: () => getUser(userId),
    enabled: !!userId,
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUser,
    onSuccess: (data) => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: userKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}
```

### Optimistic Updates Pattern

```typescript
export function useUpdatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updatePost,
    onMutate: async (updatedPost) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ 
        queryKey: postKeys.detail(updatedPost.id) 
      });

      // Snapshot previous value
      const previousPost = queryClient.getQueryData(
        postKeys.detail(updatedPost.id)
      );

      // Optimistically update cache
      queryClient.setQueryData(
        postKeys.detail(updatedPost.id),
        updatedPost
      );

      // Return context with snapshot
      return { previousPost };
    },
    onError: (err, updatedPost, context) => {
      // Rollback on error
      if (context?.previousPost) {
        queryClient.setQueryData(
          postKeys.detail(updatedPost.id),
          context.previousPost
        );
      }
    },
    onSettled: (data, error, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ 
        queryKey: postKeys.detail(variables.id) 
      });
    },
  });
}
```

### Infinite Queries

```typescript
import { useInfiniteQuery } from '@tanstack/react-query';

function usePosts() {
  return useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: ({ pageParam = 0 }) => getPosts(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
  });
}

function PostList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = usePosts();

  return (
    <div>
      {data?.pages.map((page) =>
        page.posts.map((post) => <Post key={post.id} post={post} />)
      )}
      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage ? 'Loading...' : 'Load More'}
      </button>
    </div>
  );
}
```

## Zustand Patterns

### Slice Pattern for Large Stores

```typescript
import { create, StateCreator } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface AuthSlice {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
}

interface UISlice {
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
}

interface NotificationSlice {
  notifications: Notification[];
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
}

type AppStore = AuthSlice & UISlice & NotificationSlice;

const createAuthSlice: StateCreator<AppStore, [], [], AuthSlice> = (set) => ({
  user: null,
  login: (user) => set({ user }),
  logout: () => set({ user: null }),
});

const createUISlice: StateCreator<AppStore, [], [], UISlice> = (set) => ({
  sidebarOpen: true,
  theme: 'light',
  toggleSidebar: () => set((state: AppStore) => ({ 
    sidebarOpen: !state.sidebarOpen 
  })),
  setTheme: (theme) => set({ theme }),
});

const createNotificationSlice: StateCreator<AppStore, [], [], NotificationSlice> = (set) => ({
  notifications: [],
  addNotification: (notification) => set((state: AppStore) => ({
    notifications: [...state.notifications, notification],
  })),
  removeNotification: (id) => set((state: AppStore) => ({
    notifications: state.notifications.filter((n) => n.id !== id),
  })),
});

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (...a) => ({
        ...createAuthSlice(...a),
        ...createUISlice(...a),
        ...createNotificationSlice(...a),
      }),
      {
        name: 'app-storage',
        partialize: (state) => ({
          // Only persist theme
          theme: state.theme,
        }),
      }
    )
  )
);
```

### Selector Best Practices

```typescript
// Bad: Causes re-render on any store change
const store = useAppStore();
const { user, theme } = store;

// Good: Only re-renders when specific values change
const user = useAppStore((state) => state.user);
const theme = useAppStore((state) => state.theme);

// Best: Extract actions separately (they never change)
const login = useAppStore((state) => state.login);
const logout = useAppStore((state) => state.logout);
```

### Computed Values with Selectors

```typescript
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (id: string) => void;
}

export const useCartStore = create<CartStore>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ 
    items: [...state.items, item] 
  })),
  removeItem: (id) => set((state) => ({
    items: state.items.filter((item) => item.id !== id),
  })),
}));

// Computed selector
export const useCartTotal = () =>
  useCartStore(
    (state) => state.items.reduce((sum, item) => sum + item.price, 0)
  );

// Multiple values with shallow comparison
export const useCartSummary = () =>
  useCartStore(
    (state) => ({
      itemCount: state.items.length,
      total: state.items.reduce((sum, item) => sum + item.price, 0),
    }),
    shallow
  );
```

## React Hook Form + Zod Patterns

### Reusable Form Components

```typescript
import { useFormContext } from 'react-hook-form';

interface FormFieldProps {
  name: string;
  label: string;
  type?: string;
}

export function FormField({ name, label, type = 'text' }: FormFieldProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  const error = errors[name]?.message as string | undefined;

  return (
    <div>
      <label htmlFor={name}>{label}</label>
      <input id={name} type={type} {...register(name)} />
      {error && <span className="error">{error}</span>}
    </div>
  );
}

// Usage with FormProvider
import { FormProvider, useForm } from 'react-hook-form';

function MyForm() {
  const methods = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)}>
        <FormField name="email" label="Email" type="email" />
        <FormField name="password" label="Password" type="password" />
      </form>
    </FormProvider>
  );
}
```

### Dynamic Validation

```typescript
import { z } from 'zod';

const schema = z.object({
  role: z.enum(['user', 'admin']),
  adminCode: z.string().optional(),
}).refine(
  (data) => {
    // Admin role requires adminCode
    if (data.role === 'admin') {
      return !!data.adminCode && data.adminCode.length >= 6;
    }
    return true;
  },
  {
    message: 'Admin code is required and must be at least 6 characters',
    path: ['adminCode'],
  }
);
```

### Server-Side Validation Integration

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

function SignupForm() {
  const { register, handleSubmit, setError, formState } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      await signup(data);
    } catch (error) {
      // Set server errors
      if (error instanceof ValidationError) {
        error.fields.forEach((field) => {
          setError(field.name, {
            type: 'server',
            message: field.message,
          });
        });
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* fields */}
    </form>
  );
}
```

## URL State Patterns

### Complex Filter State

```typescript
import { useQueryStates, parseAsArrayOf, parseAsString, parseAsInteger } from 'nuqs';

function ProductFilters() {
  const [filters, setFilters] = useQueryStates({
    categories: parseAsArrayOf(parseAsString).withDefault([]),
    minPrice: parseAsInteger,
    maxPrice: parseAsInteger,
    search: parseAsString,
    sort: parseAsString.withDefault('name'),
  });

  // URL: /products?categories=tech,home&minPrice=10&maxPrice=100&search=laptop&sort=price

  const updateCategory = (category: string) => {
    setFilters((prev) => ({
      categories: prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category],
    }));
  };

  const clearFilters = () => {
    setFilters({
      categories: [],
      minPrice: null,
      maxPrice: null,
      search: null,
    });
  };
}
```

### Synchronized Tab State

```typescript
import { useQueryState, parseAsStringEnum } from 'nuqs';

const tabs = ['overview', 'settings', 'billing'] as const;

function TabView() {
  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsStringEnum(tabs).withDefault('overview')
  );

  // URL automatically updates and can be bookmarked
  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* tab content */}
      </Tabs>
    </div>
  );
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Global State for Server Data

```typescript
// BAD: Using Zustand for server data
export const useUserStore = create<UserStore>((set) => ({
  user: null,
  fetchUser: async (id) => {
    const user = await getUser(id);
    set({ user });
  },
}));

// GOOD: Use TanStack Query
export function useUser(id: string) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => getUser(id),
  });
}
```

### Anti-Pattern 2: Manual Form State

```typescript
// BAD: Manual state management
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [emailError, setEmailError] = useState('');
const [passwordError, setPasswordError] = useState('');

const handleSubmit = () => {
  if (!email.includes('@')) {
    setEmailError('Invalid email');
  }
  // ...
};

// GOOD: React Hook Form + Zod
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema),
});
```

### Anti-Pattern 3: Context for Frequently Changing Data

```typescript
// BAD: Context causes all consumers to re-render
const MousePositionContext = createContext<{ x: number; y: number }>({ x: 0, y: 0 });

// GOOD: Zustand with selectors
const useMouseStore = create<{ x: number; y: number }>(() => ({ x: 0, y: 0 }));

// Only re-renders when x changes
const x = useMouseStore((state) => state.x);
```

### Anti-Pattern 4: Not Invalidating Cache

```typescript
// BAD: Mutation without invalidation
const mutation = useMutation({
  mutationFn: updateUser,
  // Data is stale!
});

// GOOD: Invalidate affected queries
const mutation = useMutation({
  mutationFn: updateUser,
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ['user', data.id] });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  },
});
```

## State Colocation Principle

Start with the most local state possible, then lift as needed:

1. **Component state** (`useState`) - Default choice
2. **Lifted state** - When 2-3 nearby components need it
3. **Global state** (Zustand) - When many/distant components need it
4. **Server state** (TanStack Query) - When data comes from API
5. **URL state** (nuqs) - When state should be shareable

```typescript
// Level 1: Component state (most common)
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}

// Level 2: Lifted to parent
function Parent() {
  const [count, setCount] = useState(0);
  return (
    <>
      <ChildA count={count} />
      <ChildB setCount={setCount} />
    </>
  );
}

// Level 3: Global state (only when needed)
const useCountStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```
