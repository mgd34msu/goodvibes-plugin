# Valtio Utilities

Utility functions from `valtio/utils` and companion packages.

## proxyWithHistory

Adds undo/redo capability to proxy state.

```bash
npm install valtio-history
```

```typescript
import { proxyWithHistory } from 'valtio-history';

interface EditorState {
  content: string;
  fontSize: number;
}

const state = proxyWithHistory<EditorState>({
  content: '',
  fontSize: 16,
});

// Access current value
state.value.content = 'Hello';
state.value.fontSize = 18;

// Undo/Redo
state.undo();
state.redo();

// Check if undo/redo available
if (state.canUndo()) {
  state.undo();
}

// Get history
console.log(state.history); // Array of snapshots
```

**React usage:**
```tsx
function Editor() {
  const snap = useSnapshot(state);

  return (
    <div>
      <textarea
        value={snap.value.content}
        onChange={(e) => (state.value.content = e.target.value)}
      />
      <button onClick={() => state.undo()} disabled={!snap.canUndo()}>
        Undo
      </button>
      <button onClick={() => state.redo()} disabled={!snap.canRedo()}>
        Redo
      </button>
    </div>
  );
}
```

## proxyWithComputed

Add computed properties with memoization.

```typescript
import { proxyWithComputed } from 'valtio/utils';
import memoize from 'proxy-memoize';

interface Store {
  items: Item[];
  filter: string;
}

const store = proxyWithComputed<
  Store,
  { filteredItems: Item[]; total: number }
>(
  {
    items: [],
    filter: '',
  },
  {
    filteredItems: memoize((snap) =>
      snap.items.filter((item) =>
        item.name.toLowerCase().includes(snap.filter.toLowerCase())
      )
    ),
    total: memoize((snap) =>
      snap.items.reduce((sum, item) => sum + item.price, 0)
    ),
  }
);

// Computed properties are reactive
console.log(store.filteredItems);
console.log(store.total);
```

## derive / underive

Create derived state from multiple proxies.

```bash
npm install derive-valtio
```

```typescript
import { proxy } from 'valtio';
import { derive, underive } from 'derive-valtio';

const userStore = proxy({
  firstName: 'John',
  lastName: 'Doe',
});

const cartStore = proxy({
  items: [] as CartItem[],
});

// Create new derived proxy
const derivedStore = derive({
  fullName: (get) => `${get(userStore).firstName} ${get(userStore).lastName}`,
  cartTotal: (get) =>
    get(cartStore).items.reduce((sum, item) => sum + item.price, 0),
  itemCount: (get) => get(cartStore).items.length,
});

// Use in React
function Summary() {
  const snap = useSnapshot(derivedStore);
  return <p>{snap.fullName} has {snap.itemCount} items</p>;
}

// Stop derivation
underive(derivedStore);
```

**Attach to existing proxy:**
```typescript
derive(
  {
    isAdmin: (get) => get(userStore).role === 'admin',
  },
  { proxy: userStore }
);

// Now userStore has isAdmin property
console.log(userStore.isAdmin);
```

## useProxy

Convenient hook for simple components.

```typescript
import { useProxy } from 'valtio/utils';

function Counter() {
  // Returns mutable proxy that triggers re-renders
  const $state = useProxy(store);

  return (
    <div>
      <p>{$state.count}</p>
      {/* Can mutate directly in JSX */}
      <button onClick={() => $state.count++}>+1</button>
    </div>
  );
}
```

**When to use:**
- Simple components with few state accesses
- Prototyping
- When you prefer mutable syntax everywhere

**When to avoid:**
- Complex components (useSnapshot is more efficient)
- Performance-critical code

## proxySet

Reactive Set implementation.

```typescript
import { proxySet } from 'valtio/utils';

// Create
const selectedIds = proxySet<string>();
const initialSet = proxySet(['a', 'b', 'c']);

// Standard Set operations
selectedIds.add('id1');
selectedIds.add('id2');
selectedIds.delete('id1');
selectedIds.has('id2'); // true
selectedIds.clear();

// Iteration
selectedIds.forEach((id) => console.log(id));
for (const id of selectedIds) {
  console.log(id);
}

// Convert to array
const arr = [...selectedIds];

// Size
console.log(selectedIds.size);
```

**React usage:**
```tsx
const selectedItems = proxySet<string>();

function ItemList({ items }: { items: Item[] }) {
  const snap = useSnapshot(selectedItems);

  return (
    <ul>
      {items.map((item) => (
        <li
          key={item.id}
          onClick={() => {
            if (selectedItems.has(item.id)) {
              selectedItems.delete(item.id);
            } else {
              selectedItems.add(item.id);
            }
          }}
          className={snap.has(item.id) ? 'selected' : ''}
        >
          {item.name}
        </li>
      ))}
    </ul>
  );
}
```

## proxyMap

Reactive Map implementation.

```typescript
import { proxyMap } from 'valtio/utils';

// Create
const users = proxyMap<string, User>();
const initialMap = proxyMap([
  ['user1', { name: 'John' }],
  ['user2', { name: 'Jane' }],
]);

// Standard Map operations
users.set('user3', { name: 'Bob' });
users.get('user3'); // { name: 'Bob' }
users.delete('user1');
users.has('user2'); // true
users.clear();

// Iteration
users.forEach((user, id) => console.log(id, user));
for (const [id, user] of users) {
  console.log(id, user);
}

// Keys/Values/Entries
const ids = [...users.keys()];
const allUsers = [...users.values()];
const entries = [...users.entries()];

// Size
console.log(users.size);
```

**Use case - entity cache:**
```typescript
const entityCache = proxyMap<string, Entity>();

async function fetchEntity(id: string) {
  if (entityCache.has(id)) {
    return entityCache.get(id);
  }

  const entity = await api.getEntity(id);
  entityCache.set(id, entity);
  return entity;
}

function EntityView({ id }: { id: string }) {
  const cache = useSnapshot(entityCache);
  const entity = cache.get(id);

  if (!entity) {
    return <Loading />;
  }

  return <div>{entity.name}</div>;
}
```

## devtools

Connect to Redux DevTools for debugging.

```typescript
import { devtools } from 'valtio/utils';

const store = proxy({
  count: 0,
  user: null,
});

// Enable devtools
const unsub = devtools(store, {
  name: 'MyApp', // Name in DevTools
  enabled: true, // Enable/disable
});

// Cleanup (optional)
unsub();
```

**Development only:**
```typescript
if (process.env.NODE_ENV === 'development') {
  devtools(store, { name: 'AppStore' });
}
```

## watch

Auto-tracking subscription.

```typescript
import { watch } from 'valtio/utils';

// Automatically tracks accessed properties
const stop = watch((get) => {
  const user = get(userStore);
  const settings = get(settingsStore);

  console.log(`${user.name} prefers ${settings.theme} theme`);

  // Side effect
  document.body.className = settings.theme;
});

// Stop watching
stop();
```

**Conditional tracking:**
```typescript
watch((get) => {
  const user = get(userStore);

  // Only tracks role if user exists
  if (user) {
    const role = get(userStore).role;
    console.log('User role:', role);
  }
});
```

## subscribeKey

Subscribe to single property changes.

```typescript
import { subscribeKey } from 'valtio/utils';

// Watch specific key
const unsub = subscribeKey(store, 'count', (value) => {
  console.log('Count changed to:', value);
});

// Useful for persistence
subscribeKey(store, 'theme', (theme) => {
  localStorage.setItem('theme', theme);
});

// Document title
subscribeKey(store, 'unreadCount', (count) => {
  document.title = count > 0 ? `(${count}) My App` : 'My App';
});
```

## addComputed (deprecated)

Use getters or `derive` instead.

```typescript
// Old way (deprecated)
import { addComputed } from 'valtio/utils';
addComputed(store, {
  doubled: (snap) => snap.count * 2,
});

// New way - use getter
const store = proxy({
  count: 1,
  get doubled() {
    return this.count * 2;
  },
});

// Or use derive
import { derive } from 'derive-valtio';
derive({ doubled: (get) => get(store).count * 2 }, { proxy: store });
```
