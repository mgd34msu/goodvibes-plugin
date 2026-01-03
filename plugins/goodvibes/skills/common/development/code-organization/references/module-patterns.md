# Module Boundary Patterns

Patterns for identifying, creating, and maintaining proper module boundaries.

## What is a Module?

A module is a self-contained unit of code with:
- **Clear responsibility** - one reason to change
- **Defined interface** - explicit public API
- **Hidden internals** - implementation details encapsulated
- **Minimal dependencies** - few, well-defined imports

---

## Identifying Module Boundaries

### Domain-Driven Boundaries

Map modules to business domains:

```
E-commerce Domain Analysis:

Domain Concepts:
- Users, Authentication, Profiles
- Products, Categories, Inventory
- Orders, Payments, Shipping
- Reviews, Ratings

Module Boundaries:
features/
  users/           # User management domain
  catalog/         # Product catalog domain
  orders/          # Order processing domain
  reviews/         # Review system domain
```

### Cohesion Analysis

Group code that changes together:

```typescript
// HIGH COHESION: These belong together
// All relate to user authentication
auth/
  LoginForm.tsx       // Login UI
  useAuth.ts          // Auth state hook
  authService.ts      // Auth API calls
  authTypes.ts        // Auth types
  validateCredentials.ts  // Validation

// LOW COHESION: Should be split
// Mixed concerns - user data + notifications + settings
UserManager.ts
  - getUserProfile()      -> users/
  - sendNotification()    -> notifications/
  - updateSettings()      -> settings/
```

### Dependency Analysis

Analyze imports to find boundaries:

```typescript
// Files that import each other heavily = same module
// Files with no shared imports = different modules

// Strong coupling (same module):
UserProfile.tsx
  import { useUser } from './useUser'
  import { UserAvatar } from './UserAvatar'
  import { formatUserName } from './userUtils'

// Weak coupling (different modules):
OrderSummary.tsx
  import { useCart } from '@features/cart'     // Different module
  import { formatCurrency } from '@utils/format'  // Utility
```

---

## Module Structure Patterns

### Feature Module Pattern

Complete, self-contained feature:

```
features/
  shopping-cart/
    components/              # UI components
      CartItem.tsx
      CartSummary.tsx
      CartDrawer.tsx
    hooks/                   # State and logic
      useCart.ts
      useCartItem.ts
      useCartTotal.ts
    api/                     # Data fetching
      cartApi.ts
      cartQueries.ts         # React Query hooks
    store/                   # Local state (if needed)
      cartSlice.ts
    utils/                   # Feature-specific utilities
      calculateTotal.ts
      validateQuantity.ts
    types.ts                 # Feature types
    constants.ts             # Feature constants
    index.ts                 # PUBLIC API
```

**index.ts - Public API:**
```typescript
// Only export what other modules need
export { CartDrawer } from './components/CartDrawer';
export { useCart, useCartTotal } from './hooks';
export type { CartItem, CartState } from './types';

// Internal components stay hidden:
// CartItem, CartSummary - not exported
```

---

### Layer Module Pattern

Separate by technical concern:

```
src/
  presentation/              # UI Layer
    components/
    pages/
    hooks/

  application/               # Application Layer
    services/
    useCases/
    dto/

  domain/                    # Domain Layer
    entities/
    repositories/
    valueObjects/

  infrastructure/            # Infrastructure Layer
    api/
    database/
    external/
```

**Layer dependencies (strict):**
```
presentation -> application -> domain <- infrastructure
                    |                        |
                    +------------------------+
```

---

### Plugin Module Pattern

Extensible module architecture:

```typescript
// core/pluginManager.ts
interface Plugin {
  name: string;
  init(): void;
  destroy(): void;
}

class PluginManager {
  private plugins: Map<string, Plugin> = new Map();

  register(plugin: Plugin): void {
    this.plugins.set(plugin.name, plugin);
    plugin.init();
  }

  unregister(name: string): void {
    this.plugins.get(name)?.destroy();
    this.plugins.delete(name);
  }
}

// plugins/analytics/index.ts
export const analyticsPlugin: Plugin = {
  name: 'analytics',
  init() { /* setup analytics */ },
  destroy() { /* cleanup */ }
};

// Usage
pluginManager.register(analyticsPlugin);
```

---

## Boundary Enforcement

### Barrel File Access Control

Control module access through index.ts:

```typescript
// features/users/index.ts
// PUBLIC: Can be used by other modules
export { UserProfile } from './components/UserProfile';
export { useUser } from './hooks/useUser';
export type { User } from './types';

// PRIVATE: Not exported, internal only
// - UserAvatar (used only within UserProfile)
// - useUserValidation (internal hook)
// - formatUserData (internal util)
```

### ESLint Boundary Rules

Enforce boundaries with eslint-plugin-boundaries:

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['boundaries'],
  settings: {
    'boundaries/elements': [
      { type: 'feature', pattern: 'features/*' },
      { type: 'shared', pattern: 'shared/*' },
      { type: 'core', pattern: 'core/*' }
    ]
  },
  rules: {
    'boundaries/element-types': [2, {
      default: 'disallow',
      rules: [
        // Features can import from shared and core
        { from: 'feature', allow: ['shared', 'core'] },
        // Shared can import from core only
        { from: 'shared', allow: ['core'] },
        // Core cannot import from features or shared
        { from: 'core', allow: [] }
      ]
    }]
  }
};
```

### TypeScript Path Restrictions

Enforce module boundaries with path restrictions:

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      // Allow importing public API only
      "@features/*": ["src/features/*/index.ts"],
      // Block deep imports
      // "@features/users/hooks/*" - NOT allowed
    }
  }
}
```

---

## Handling Cross-Module Dependencies

### Shared Module Pattern

Extract truly shared code:

```
src/
  shared/
    components/             # Generic UI components
      Button/
      Modal/
      Form/
    hooks/                  # Generic hooks
      useFetch.ts
      useDebounce.ts
    utils/                  # Pure utilities
      format.ts
      validation.ts
    types/                  # Shared types
      common.ts
      api.ts

  features/
    users/                  # Uses shared components
    orders/                 # Uses shared components
```

### Event-Based Communication

Decouple modules with events:

```typescript
// shared/eventBus.ts
type EventHandler<T = unknown> = (data: T) => void;

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as EventHandler);
    return () => this.handlers.get(event)?.delete(handler as EventHandler);
  }

  emit<T>(event: string, data: T): void {
    this.handlers.get(event)?.forEach(handler => handler(data));
  }
}

export const eventBus = new EventBus();

// features/orders/orderService.ts
import { eventBus } from '@shared/eventBus';

function completeOrder(order: Order) {
  // ... complete order logic
  eventBus.emit('order:completed', order);
}

// features/notifications/notificationService.ts
import { eventBus } from '@shared/eventBus';

eventBus.on<Order>('order:completed', (order) => {
  sendNotification(`Order ${order.id} completed!`);
});
```

### Interface Segregation

Define contracts between modules:

```typescript
// shared/contracts/userContract.ts
export interface IUserService {
  getUser(id: string): Promise<User>;
  getCurrentUser(): User | null;
}

// features/users/userService.ts
import { IUserService } from '@shared/contracts/userContract';

export class UserService implements IUserService {
  getUser(id: string): Promise<User> { /* impl */ }
  getCurrentUser(): User | null { /* impl */ }
}

// features/orders/orderService.ts
import { IUserService } from '@shared/contracts/userContract';

class OrderService {
  constructor(private userService: IUserService) {}

  createOrder(items: Item[]) {
    const user = this.userService.getCurrentUser();
    // ...
  }
}
```

---

## Circular Dependency Resolution

### Problem: Direct Circular Import

```typescript
// BAD: A imports B, B imports A
// users/userService.ts
import { OrderService } from '@features/orders/orderService';

// orders/orderService.ts
import { UserService } from '@features/users/userService';
```

### Solution 1: Extract Common Module

```typescript
// GOOD: Extract shared dependency
// shared/types/order.ts
export interface OrderUser {
  id: string;
  name: string;
}

// users/userService.ts
import { OrderUser } from '@shared/types/order';

// orders/orderService.ts
import { OrderUser } from '@shared/types/order';
```

### Solution 2: Dependency Inversion

```typescript
// GOOD: Depend on abstraction
// shared/contracts/userProvider.ts
export interface IUserProvider {
  getUser(id: string): Promise<User>;
}

// orders/orderService.ts
export class OrderService {
  constructor(private userProvider: IUserProvider) {}
  // No direct import of UserService
}

// app/setup.ts - Wire up at composition root
const userService = new UserService();
const orderService = new OrderService(userService);
```

### Solution 3: Event-Based

```typescript
// GOOD: Async communication
// users/userService.ts
eventBus.on('order:created', async (order) => {
  await this.updateLastOrderDate(order.userId);
});

// orders/orderService.ts
await createOrder(data);
eventBus.emit('order:created', order);
// No import of UserService
```

---

## Module Refactoring Patterns

### Extract Module

When a module is too large:

```typescript
// BEFORE: God module
features/
  commerce/
    - 50+ files
    - handles products, cart, checkout, orders

// AFTER: Split by subdomain
features/
  catalog/           # Product browsing
    components/
    hooks/
    api/
  cart/              # Shopping cart
    components/
    hooks/
    store/
  checkout/          # Checkout flow
    components/
    steps/
    validation/
  orders/            # Order management
    components/
    api/
```

### Merge Modules

When modules are too granular:

```typescript
// BEFORE: Over-modularized
features/
  user-profile/      # 3 files
  user-settings/     # 2 files
  user-avatar/       # 2 files

// AFTER: Consolidated
features/
  users/
    components/
      UserProfile/
      UserSettings/
      UserAvatar/
    hooks/
    api/
```

### Strangler Pattern

Gradual module extraction:

```typescript
// Step 1: Identify boundary
legacy/
  bigModule.ts       # Mixed auth and user logic

// Step 2: Create new module, forward calls
features/
  auth/
    authService.ts   # New implementation

legacy/
  bigModule.ts       # Delegates to new auth

// Step 3: Migrate callers
// Update imports one by one

// Step 4: Remove legacy
// Delete old code when fully migrated
```

---

## Module Checklist

```markdown
## Module Definition
- [ ] Single, clear responsibility
- [ ] Meaningful name reflecting purpose
- [ ] Documented public API (index.ts exports)

## Boundaries
- [ ] All public API through index.ts
- [ ] No internal implementation exposed
- [ ] Clear dependency direction

## Dependencies
- [ ] No circular dependencies
- [ ] Depends on abstractions for cross-cutting
- [ ] Uses events for async communication

## Cohesion
- [ ] All parts relate to same domain
- [ ] Changes are localized
- [ ] Tests cover module in isolation

## Size
- [ ] Not too large (god module)
- [ ] Not too granular (over-modularized)
- [ ] 5-15 files per module as guideline
```
