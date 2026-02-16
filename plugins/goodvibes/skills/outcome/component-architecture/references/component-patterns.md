# Component Patterns Reference

Comprehensive reference for component architecture patterns, decisions, and best practices across React, Vue, and Svelte.

## Table of Contents

- [Organization Patterns](#organization-patterns)
- [Composition Patterns](#composition-patterns)
- [State Management Patterns](#state-management-patterns)
- [Performance Patterns](#performance-patterns)
- [Framework Comparison](#framework-comparison)
- [Anti-Patterns](#anti-patterns)

## Organization Patterns

### Atomic Design

Organize components by complexity level.

```
src/
  components/
    atoms/          # Smallest building blocks
      Button/
      Input/
      Label/
    molecules/      # Simple combinations
      FormField/    # Label + Input
      SearchBox/    # Input + Button
    organisms/      # Complex combinations
      LoginForm/    # Multiple molecules
      Header/
    templates/      # Page layouts
      DashboardLayout/
    pages/          # Complete pages
      Dashboard/
```

**Use when:**
- Building a design system
- Large team with multiple designers
- Need clear component hierarchy
- Component reusability is critical

**Avoid when:**
- Small applications (<20 components)
- Rapid prototyping phase
- Unclear component boundaries

### Feature-Based Organization

Group components by feature/domain.

```
src/
  features/
    auth/
      components/
        LoginForm.tsx
        SignupForm.tsx
      hooks/
        useAuth.ts
      api/
        authApi.ts
    dashboard/
      components/
        DashboardHeader.tsx
        StatsCard.tsx
      hooks/
        useDashboardData.ts
    shared/
      components/    # Shared across features
        Button.tsx
        Modal.tsx
```

**Use when:**
- Feature teams work independently
- Clear domain boundaries
- Features have isolated state/logic
- Easier to delete entire features

**Avoid when:**
- Heavy component sharing between features
- Unclear feature boundaries
- Small applications

### Flat Organization

All components in a single directory.

```
src/
  components/
    Button.tsx
    LoginForm.tsx
    Header.tsx
    Dashboard.tsx
    Modal.tsx
```

**Use when:**
- Small applications (<30 components)
- Prototyping or proof-of-concept
- Solo developer
- Frequent component reorganization

**Avoid when:**
- More than 50 components
- Multiple developers
- Need for scalability

### Hybrid Organization

Combine feature-based + shared components.

```
src/
  features/         # Feature-specific
    auth/
    dashboard/
  components/       # Shared UI components
    ui/
      Button.tsx
      Input.tsx
    layout/
      Header.tsx
      Sidebar.tsx
```

**Use when:**
- Medium to large applications
- Balance between isolation and sharing
- Design system exists alongside features
- Most common real-world pattern

## Composition Patterns

### Children Props (React)

Pass components as children.

```typescript
interface CardProps {
  children: ReactNode;
}

function Card({ children }: CardProps) {
  return <div className="card">{children}</div>;
}

// Usage
<Card>
  <h2>Title</h2>
  <p>Content</p>
</Card>
```

**Pros:**
- Simple and intuitive
- Natural JSX syntax
- Good for wrapper components

**Cons:**
- No control over child rendering
- Hard to pass data to children

### Slots (Vue/Svelte)

Named slots for flexible composition.

**Vue:**

```vue
<!-- Card.vue -->
<template>
  <div class="card">
    <header><slot name="header" /></header>
    <main><slot /></main>
    <footer><slot name="footer" /></footer>
  </div>
</template>

<!-- Usage -->
<Card>
  <template #header><h2>Title</h2></template>
  <p>Content</p>
  <template #footer><button>Action</button></template>
</Card>
```

**Svelte:**

```svelte
<!-- Card.svelte -->
<div class="card">
  <header><slot name="header" /></header>
  <main><slot /></main>
  <footer><slot name="footer" /></footer>
</div>

<!-- Usage -->
<Card>
  <h2 slot="header">Title</h2>
  <p>Content</p>
  <button slot="footer">Action</button>
</Card>
```

**Pros:**
- Multiple insertion points
- Clear composition intent
- Scoped slots can pass data

**Cons:**
- More verbose than children
- Framework-specific syntax

### Render Props (React - Legacy)

Pass rendering function as prop.

```typescript
interface DataFetcherProps<T> {
  url: string;
  render: (data: T) => ReactNode;
}

function DataFetcher<T>({ url, render }: DataFetcherProps<T>) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(url).then(r => r.json()).then(setData);
  }, [url]);

  return data ? render(data) : <div>Loading...</div>;
}

// Usage
<DataFetcher
  url="/api/users"
  render={data => <ul>{data.map(u => <li>{u.name}</li>)}</ul>}
/>
```

**Pros:**
- Dynamic rendering logic
- Can pass data to render function

**Cons:**
- Verbose syntax
- Replaced by hooks in modern React
- Harder to type with TypeScript

### Compound Components (React)

Components that work together.

```typescript
const TabsContext = createContext<{ activeTab: string; setActiveTab: (tab: string) => void } | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab components must be used within <Tabs>');
  return context;
}

function Tabs({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState('');

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
}

function TabList({ children }: { children: ReactNode }) {
  return <div className="tab-list">{children}</div>;
}

function Tab({ id, children }: { id: string; children: ReactNode }) {
  const { activeTab, setActiveTab } = useTabsContext();
  return (
    <button
      onClick={() => setActiveTab(id)}
      className={activeTab === id ? 'active' : ''}
    >
      {children}
    </button>
  );
}

function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  const { activeTab } = useTabsContext();
  return activeTab === id ? <div>{children}</div> : null;
}

Tabs.List = TabList;
Tabs.Tab = Tab;
Tabs.Panel = TabPanel;

// Usage
<Tabs>
  <Tabs.List>
    <Tabs.Tab id="tab1">Tab 1</Tabs.Tab>
    <Tabs.Tab id="tab2">Tab 2</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panel id="tab1">Content 1</Tabs.Panel>
  <Tabs.Panel id="tab2">Content 2</Tabs.Panel>
</Tabs>
```

**Pros:**
- Clean, declarative API
- Shared state between related components
- Flexible composition

**Cons:**
- More complex to implement
- Requires context or prop drilling

### Hooks/Composables (React/Vue)

Extract reusable logic.

**React:**

```typescript
function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue);
  const toggle = useCallback(() => setValue(v => !v), []);
  return [value, toggle] as const;
}

// Usage
function Modal() {
  const [isOpen, toggleOpen] = useToggle();

  return (
    <>
      <button onClick={toggleOpen}>Open</button>
      {isOpen && <div>Modal content</div>}
    </>
  );
}
```

**Vue 3 Composable:**

```typescript
import { ref } from 'vue';

export function useToggle(initialValue = false) {
  const value = ref(initialValue);
  const toggle = () => { value.value = !value.value; };
  return { value, toggle };
}

// Usage
const { value: isOpen, toggle: toggleOpen } = useToggle();
```

**Pros:**
- Reusable logic without components
- Easy to test
- No wrapper components (no "wrapper hell")

**Cons:**
- Requires understanding of hooks/reactivity
- Can be overused

## State Management Patterns

### Local State

State lives in the component.

**When to use:**
- UI-only state (modals, dropdowns, form inputs)
- Not shared with siblings or parents
- Temporary state (form drafts)

**React:**
```typescript
const [isOpen, setIsOpen] = useState(false);
```

**Vue:**
```typescript
const isOpen = ref(false);
```

**Svelte:**
```typescript
let isOpen = false;
```

### Lifted State

State moves to parent component.

**When to use:**
- Multiple children need the same state
- Parent needs to control child state
- Form with validation across fields

**React:**
```typescript
function Parent() {
  const [value, setValue] = useState('');

  return (
    <>
      <Input value={value} onChange={setValue} />
      <Display value={value} />
    </>
  );
}
```

### Derived State

Compute state from existing state.

**React:**
```typescript
function FilteredList({ items, filter }) {
  // Don't store in state - derive it
  const filteredItems = items.filter(item => item.type === filter);

  return <ul>{filteredItems.map(...)}</ul>;
}
```

**Vue:**
```typescript
const filteredItems = computed(() => {
  return items.value.filter(item => item.type === filter.value);
});
```

### Global State

State shared across the entire app.

**When to use:**
- User authentication
- Theme/locale settings
- Shopping cart
- Notifications

**React - Context:**
```typescript
const UserContext = createContext<User | null>(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState<User | null>(null);
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export const useUser = () => useContext(UserContext);
```

**React - Zustand:**
```typescript
import { create } from 'zustand';

interface User {
  id: string;
  name: string;
}

interface StoreState {
  user: User | null;
  setUser: (user: User | null) => void;
}

const useStore = create<StoreState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));

const user = useStore(state => state.user);
```

**Vue - Pinia:**
```typescript
import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({ user: null }),
  actions: {
    setUser(user) {
      this.user = user;
    },
  },
});
```

**Svelte - Stores:**
```typescript
import { writable } from 'svelte/store';

export const user = writable(null);
```

### State Management Decision Tree

```
Does only one component need this state?
+-- YES -> Local state (useState, ref, let)
\-- NO -> Do siblings need to share it?
    +-- YES -> Lift state to parent
    \-- NO -> Is it used across the app?
        +-- YES -> Global state (Context, Zustand, Pinia, Stores)
        \-- NO -> Can it be derived from existing state?
            +-- YES -> Derive it (computed, useMemo)
            \-- NO -> Lift to nearest common ancestor
```

## Performance Patterns

### Memoization

**React.memo** - Prevent re-renders if props unchanged.

```typescript
const ExpensiveComponent = memo(function ExpensiveComponent({ data }) {
  return <div>{/* expensive rendering */}</div>;
});
```

**useMemo** - Cache expensive calculations.

```typescript
const sortedData = useMemo(() => {
  return data.sort((a, b) => a.name.localeCompare(b.name));
}, [data]);
```

**useCallback** - Stable function references.

```typescript
const handleClick = useCallback(() => {
  // Perform actual action
  onSave(formData);
}, [formData, onSave]);
```

**Vue computed** - Cached reactive values.

```typescript
const sortedData = computed(() => {
  return data.value.sort((a, b) => a.name.localeCompare(b.name));
});
```

**Svelte $:** - Auto-derived reactive statements.

```typescript
$: sortedData = data.sort((a, b) => a.name.localeCompare(b.name));
```

### Code Splitting

**React lazy loading:**

```typescript
const HeavyComponent = lazy(() => import('./HeavyComponent'));

<Suspense fallback={<Spinner />}>
  <HeavyComponent />
</Suspense>
```

**Vue async components:**

```typescript
const HeavyComponent = defineAsyncComponent(() =>
  import('./HeavyComponent.vue')
);
```

### Virtualization

Render only visible items in large lists.

**React - TanStack Virtual:**

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 50,
});
```

**Vue - vue-virtual-scroller:**

```vue
<RecycleScroller :items="items" :item-size="50">
  <template #default="{ item }">
    <div>{{ item.name }}</div>
  </template>
</RecycleScroller>
```

## Framework Comparison

| Feature | React | Vue 3 | Svelte |
|---------|-------|-------|--------|
| **Syntax** | JSX | Template/JSX | Template |
| **Reactivity** | Hooks | Ref/Reactive | Assignment |
| **State** | useState | ref/reactive | let |
| **Computed** | useMemo | computed | $: |
| **Effects** | useEffect | watchEffect | $: (side effects) |
| **Props** | Destructure | defineProps | export let |
| **Events** | onClick | @click | on:click |
| **Slots** | children | <slot> | <slot> |
| **Composition** | Hooks | Composables | Functions |
| **Memoization** | React.memo | - | - (auto-optimized) |
| **Compiler** | Runtime | Runtime | Compile-time |

## Anti-Patterns

### 1. Storing Derived State

**Bad:**
```typescript
interface Item {
  id: string;
  active: boolean;
}

const [items, setItems] = useState<Item[]>([]);
const [filteredItems, setFilteredItems] = useState<Item[]>([]);

useEffect(() => {
  setFilteredItems(items.filter(item => item.active));
}, [items]);
```

**Good:**
```typescript
const [items, setItems] = useState<Item[]>([]);
const filteredItems = items.filter(item => item.active);
```

### 2. Mutating State Directly

**Bad:**
```typescript
const [user, setUser] = useState({ name: 'Alice' });
user.name = 'Bob'; // Mutation!
```

**Good:**
```typescript
setUser({ ...user, name: 'Bob' });
```

### 3. Using Index as Key

**Bad:**
```typescript
{items.map((item, index) => <div key={index}>{item}</div>)}
```

**Good:**
```typescript
{items.map(item => <div key={item.id}>{item.name}</div>)}
```

### 4. Creating Functions in Render

**Bad:**
```typescript
// Note: This is intentionally bad - creates new function on every render
<button onClick={() => console.log('Click')}>Click</button>
```

**Good:**
```typescript
const handleClick = useCallback(() => {
  // Perform actual action
  onItemClick(item.id);
}, [item.id, onItemClick]);
<button onClick={handleClick}>Click</button>
```

### 5. Premature Optimization

**Bad:**
```typescript
const Component = memo(function Component({ name }) {
  return <div>{name}</div>; // Trivial component, memo adds overhead
});
```

**Good:**
- Profile first (React DevTools Profiler)
- Optimize components with expensive renders
- Measure impact of optimizations

### 6. Prop Drilling

**Bad:**
```typescript
<A user={user}>
  <B user={user}>
    <C user={user}>
      <D user={user} /> // D needs it, A/B/C just pass it down
    </C>
  </B>
</A>
```

**Good:**
```typescript
// Use Context or global state
interface User {
  id: string;
  name: string;
}

const UserContext = createContext<User | null>(null);

<UserContext.Provider value={user}>
  <A><B><C><D /></C></B></A>
</UserContext.Provider>

// In D:
const user = useContext(UserContext);
```

### 7. Missing Keys in Lists

**Bad:**
```typescript
{items.map(item => <div>{item.name}</div>)}
```

**Good:**
```typescript
{items.map(item => <div key={item.id}>{item.name}</div>)}
```

### 8. Ignoring Accessibility

**Bad:**
```typescript
<div onClick={handleClick}>Click me</div>
```

**Good:**
```typescript
<button onClick={handleClick} aria-label="Submit form">
  Click me
</button>
```

## Summary

Choose patterns based on:
- **Team size** - Larger teams need more structure
- **App complexity** - Complex apps need better organization
- **Framework** - Use framework-specific patterns (hooks, composables, etc.)
- **Performance needs** - Profile before optimizing
- **Maintainability** - Readable code > clever code

Start simple, refactor as complexity grows.
