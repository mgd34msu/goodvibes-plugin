# Valtio Patterns

Advanced patterns for proxy-based state management.

## Store Organization

### Feature-Based Modules

```typescript
// stores/auth.ts
import { proxy, subscribe } from 'valtio';

interface AuthStore {
  user: User | null;
  token: string | null;
  loading: boolean;
}

export const authStore = proxy<AuthStore>({
  user: null,
  token: null,
  loading: false,
});

export const authActions = {
  async login(email: string, password: string) {
    authStore.loading = true;
    try {
      const { user, token } = await api.login(email, password);
      authStore.user = user;
      authStore.token = token;
    } finally {
      authStore.loading = false;
    }
  },

  logout() {
    authStore.user = null;
    authStore.token = null;
  },

  setUser(user: User) {
    authStore.user = user;
  },
};

// Persist token
subscribe(authStore, () => {
  if (authStore.token) {
    localStorage.setItem('token', authStore.token);
  } else {
    localStorage.removeItem('token');
  }
});
```

### Store Factory

```typescript
function createEntityStore<T extends { id: string }>(name: string) {
  const store = proxy({
    entities: {} as Record<string, T>,
    ids: [] as string[],
    loading: false,
    error: null as string | null,
  });

  return {
    store,
    actions: {
      set(entity: T) {
        store.entities[entity.id] = entity;
        if (!store.ids.includes(entity.id)) {
          store.ids.push(entity.id);
        }
      },
      remove(id: string) {
        delete store.entities[id];
        store.ids = store.ids.filter((i) => i !== id);
      },
      clear() {
        store.entities = {};
        store.ids = [];
      },
      getById(id: string) {
        return store.entities[id];
      },
      getAll() {
        return store.ids.map((id) => store.entities[id]);
      },
    },
  };
}

// Usage
const usersStore = createEntityStore<User>('users');
const postsStore = createEntityStore<Post>('posts');
```

## Async Patterns

### Loading States

```typescript
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function createAsyncStore<T>(fetcher: () => Promise<T>) {
  const store = proxy<AsyncState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  return {
    store,
    async fetch() {
      store.loading = true;
      store.error = null;
      try {
        store.data = await fetcher();
      } catch (e) {
        store.error = e instanceof Error ? e.message : 'Unknown error';
      } finally {
        store.loading = false;
      }
    },
    reset() {
      store.data = null;
      store.loading = false;
      store.error = null;
    },
  };
}

// Usage
const usersAsync = createAsyncStore(() => fetch('/api/users').then(r => r.json()));

function UserList() {
  const snap = useSnapshot(usersAsync.store);

  useEffect(() => {
    usersAsync.fetch();
  }, []);

  if (snap.loading) return <Spinner />;
  if (snap.error) return <Error message={snap.error} />;

  return <ul>{snap.data?.map(user => <li key={user.id}>{user.name}</li>)}</ul>;
}
```

### Optimistic Updates

```typescript
const todoStore = proxy({
  todos: [] as Todo[],
});

async function toggleTodo(id: string) {
  const todo = todoStore.todos.find((t) => t.id === id);
  if (!todo) return;

  // Optimistic update
  const previousCompleted = todo.completed;
  todo.completed = !todo.completed;

  try {
    await api.updateTodo(id, { completed: todo.completed });
  } catch (error) {
    // Rollback on failure
    todo.completed = previousCompleted;
    throw error;
  }
}

async function deleteTodo(id: string) {
  const index = todoStore.todos.findIndex((t) => t.id === id);
  if (index === -1) return;

  // Save for rollback
  const removed = todoStore.todos[index];
  todoStore.todos.splice(index, 1);

  try {
    await api.deleteTodo(id);
  } catch (error) {
    // Rollback
    todoStore.todos.splice(index, 0, removed);
    throw error;
  }
}
```

### Request Deduplication

```typescript
const requestCache = new Map<string, Promise<any>>();

async function fetchWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (requestCache.has(key)) {
    return requestCache.get(key)!;
  }

  const promise = fetcher().finally(() => {
    requestCache.delete(key);
  });

  requestCache.set(key, promise);
  return promise;
}

// Usage
async function fetchUser(id: string) {
  return fetchWithCache(`user-${id}`, () => api.getUser(id));
}
```

## React Patterns

### Context Provider (SSR)

```typescript
import { createContext, useContext, useRef } from 'react';
import { proxy, useSnapshot } from 'valtio';

type Store = { count: number };
type StoreContext = ReturnType<typeof proxy<Store>>;

const StoreContext = createContext<StoreContext | null>(null);

export function StoreProvider({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: Partial<Store>;
}) {
  const storeRef = useRef<StoreContext>();

  if (!storeRef.current) {
    storeRef.current = proxy<Store>({
      count: 0,
      ...initialState,
    });
  }

  return (
    <StoreContext.Provider value={storeRef.current}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('Missing StoreProvider');
  return store;
}

export function useStoreSnapshot() {
  const store = useStore();
  return useSnapshot(store);
}
```

### Selective Subscriptions

```typescript
function UserName() {
  // Only re-renders when user.name changes
  const snap = useSnapshot(store);
  return <span>{snap.user.name}</span>;
}

function UserAvatar() {
  // Only re-renders when user.avatar changes
  const snap = useSnapshot(store);
  return <img src={snap.user.avatar} />;
}

// Parent won't re-render from child's subscriptions
function UserCard() {
  return (
    <div>
      <UserAvatar />
      <UserName />
    </div>
  );
}
```

### Computed in Components

```typescript
function FilteredList() {
  const snap = useSnapshot(store);

  // Computed in render - recalculates on relevant changes
  const filtered = useMemo(
    () => snap.items.filter((item) => item.category === snap.filter),
    [snap.items, snap.filter]
  );

  return (
    <ul>
      {filtered.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

## Persistence

### localStorage

```typescript
import { proxy, subscribe, snapshot } from 'valtio';

const STORAGE_KEY = 'app-state';

// Load initial state
function loadState<T>(defaultState: T): T {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : defaultState;
  } catch {
    return defaultState;
  }
}

// Create store with persistence
const store = proxy(
  loadState({
    theme: 'light',
    language: 'en',
    settings: {},
  })
);

// Auto-save on changes (debounced)
let saveTimeout: NodeJS.Timeout;
subscribe(store, () => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(store)));
  }, 1000);
});
```

### Selective Persistence

```typescript
const store = proxy({
  // Persisted
  settings: {
    theme: 'light',
    language: 'en',
  },
  // Not persisted
  session: {
    user: null,
    token: null,
  },
});

subscribe(store.settings, () => {
  localStorage.setItem('settings', JSON.stringify(snapshot(store.settings)));
});
```

## TypeScript Patterns

### Strict Types

```typescript
interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
}

interface TodoStore {
  todos: Todo[];
  filter: 'all' | 'active' | 'completed';
  editingId: string | null;
}

const store = proxy<TodoStore>({
  todos: [],
  filter: 'all',
  editingId: null,
});
```

### Action Types

```typescript
type TodoActions = {
  add: (text: string) => void;
  remove: (id: string) => void;
  toggle: (id: string) => void;
  edit: (id: string, text: string) => void;
  setFilter: (filter: TodoStore['filter']) => void;
};

const actions: TodoActions = {
  add(text) {
    store.todos.push({
      id: crypto.randomUUID(),
      text,
      completed: false,
      createdAt: new Date(),
    });
  },
  remove(id) {
    store.todos = store.todos.filter((t) => t.id !== id);
  },
  toggle(id) {
    const todo = store.todos.find((t) => t.id === id);
    if (todo) todo.completed = !todo.completed;
  },
  edit(id, text) {
    const todo = store.todos.find((t) => t.id === id);
    if (todo) todo.text = text;
  },
  setFilter(filter) {
    store.filter = filter;
  },
};
```

## Testing Patterns

### Reset State

```typescript
// store.ts
const initialState = {
  count: 0,
  user: null,
};

export const store = proxy({ ...initialState });

export function resetStore() {
  Object.assign(store, initialState);
}

// test.ts
beforeEach(() => {
  resetStore();
});
```

### Mock Actions

```typescript
// store.ts
export const store = proxy({ users: [] });

export const actions = {
  async fetchUsers() {
    store.users = await api.getUsers();
  },
};

// test.ts
import { actions } from './store';

jest.mock('./api', () => ({
  getUsers: jest.fn().mockResolvedValue([{ id: '1', name: 'Test' }]),
}));

test('fetches users', async () => {
  await actions.fetchUsers();
  expect(store.users).toHaveLength(1);
});
```

### Snapshot Comparison

```typescript
import { snapshot } from 'valtio';

test('updates state correctly', () => {
  const before = snapshot(store);

  actions.increment();

  const after = snapshot(store);
  expect(after.count).toBe(before.count + 1);
});
```

## Performance Tips

### Avoid Proxy in Hot Paths

```typescript
// Slow - creates proxy on each render
function Component() {
  const data = proxy({ items: props.items }); // Bad
}

// Fast - use ref for non-reactive data
import { ref } from 'valtio';

const store = proxy({
  config: ref(largeConfigObject), // Not proxied
  items: [], // Proxied
});
```

### Batch Updates

```typescript
// Multiple renders
store.a = 1;
store.b = 2;
store.c = 3;

// Single render - wrap in action
function updateAll() {
  store.a = 1;
  store.b = 2;
  store.c = 3;
}
updateAll();

// Or use Object.assign
Object.assign(store, { a: 1, b: 2, c: 3 });
```

### Memo Components

```typescript
// Child only re-renders when its accessed props change
const TodoItem = memo(function TodoItem({ id }: { id: string }) {
  const snap = useSnapshot(store);
  const todo = snap.todos.find((t) => t.id === id);

  if (!todo) return null;
  return <li>{todo.text}</li>;
});
```
