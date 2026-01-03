# Circular Dependency Detection and Resolution

Patterns for identifying and resolving circular imports across languages.

## Detection Tools

### JavaScript / TypeScript

```bash
# madge - Most popular, fast
npx madge --circular --extensions ts,tsx,js,jsx src/
npx madge --circular --image circular.svg src/  # Visual output

# dpdm - Alternative with more detail
npx dpdm --circular --tree src/index.ts

# dependency-cruiser - Most comprehensive
npx dependency-cruiser --include-only "^src" --output-type dot src | dot -T svg > deps.svg
```

#### madge Configuration

```javascript
// .madgerc
{
  "fileExtensions": ["ts", "tsx", "js", "jsx"],
  "excludeRegExp": [
    ".*\\.test\\.ts$",
    ".*\\.spec\\.ts$",
    "__mocks__"
  ],
  "tsConfig": "./tsconfig.json",
  "detectiveOptions": {
    "ts": {
      "skipTypeImports": true  // Ignore type-only imports
    }
  }
}
```

### Python

```bash
# pycycle
pip install pycycle
pycycle --here

# pydeps (visual)
pip install pydeps
pydeps src --cluster --show-cycle

# Custom detection
python -c "
import sys
for name, module in sys.modules.items():
    if hasattr(module, '__file__') and module.__file__:
        print(name)
"
```

### Go

```bash
# Built-in cycle detection
go build ./...  # Will fail if import cycle exists

# List imports
go list -f '{{.ImportPath}}: {{.Imports}}' ./...

# Find potential cycles
go list -f '{{range .Imports}}{{.}} {{end}}' ./... | tr ' ' '\n' | sort | uniq -c | sort -rn
```

---

## Circular Dependency Patterns

### Pattern 1: Direct Cycle (A <-> B)

**Problem:**
```typescript
// user.ts
import { validateEmail } from './validation';
export interface User { email: string; }

// validation.ts
import { User } from './user';  // CYCLE!
export function validateEmail(user: User): boolean {
  return user.email.includes('@');
}
```

**Solution: Extract shared types**
```typescript
// types.ts
export interface User { email: string; }

// user.ts
import { User } from './types';
export function createUser(): User { ... }

// validation.ts
import { User } from './types';
export function validateEmail(user: User): boolean { ... }
```

---

### Pattern 2: Indirect Cycle (A -> B -> C -> A)

**Problem:**
```typescript
// auth.ts
import { getCurrentUser } from './user';
export function checkAuth() { return getCurrentUser() !== null; }

// user.ts
import { getPermissions } from './permissions';
export function getCurrentUser() { ... }

// permissions.ts
import { checkAuth } from './auth';  // CYCLE: auth -> user -> permissions -> auth
export function getPermissions() {
  if (!checkAuth()) return [];
  ...
}
```

**Solution: Dependency Injection**
```typescript
// permissions.ts - Remove import, accept parameter
export function getPermissions(isAuthenticated: boolean) {
  if (!isAuthenticated) return [];
  ...
}

// Caller provides the dependency
const permissions = getPermissions(checkAuth());
```

---

### Pattern 3: Type-Only Cycles (Usually Safe)

**Problem indicator but often not runtime issue:**
```typescript
// user.ts
import type { Order } from './order';  // Type-only import
export interface User {
  orders: Order[];
}

// order.ts
import type { User } from './user';  // Type-only import
export interface Order {
  user: User;
}
```

**Solution: Use `import type` (TypeScript 3.8+)**
```typescript
// These don't create runtime cycles
import type { User } from './user';
```

**tsconfig.json setting:**
```json
{
  "compilerOptions": {
    "verbatimModuleSyntax": true,  // Enforces explicit type imports
    "isolatedModules": true
  }
}
```

---

### Pattern 4: Event/Callback Cycles

**Problem:**
```typescript
// eventBus.ts
import { handleUserEvent } from './userHandler';
export function emit(event: string) {
  if (event === 'user') handleUserEvent();
}

// userHandler.ts
import { emit } from './eventBus';  // CYCLE!
export function handleUserEvent() {
  emit('user:processed');
}
```

**Solution: Inversion of Control**
```typescript
// eventBus.ts - No imports of handlers
type Handler = (data: any) => void;
const handlers: Map<string, Handler[]> = new Map();

export function on(event: string, handler: Handler) {
  if (!handlers.has(event)) handlers.set(event, []);
  handlers.get(event)!.push(handler);
}

export function emit(event: string, data?: any) {
  handlers.get(event)?.forEach(h => h(data));
}

// userHandler.ts
import { on, emit } from './eventBus';

on('user', (data) => {
  // Handle user event
  emit('user:processed', data);
});
```

---

### Pattern 5: Service/Repository Cycles

**Problem:**
```typescript
// userService.ts
import { OrderRepository } from './orderRepository';
export class UserService {
  constructor(private orderRepo: OrderRepository) {}
}

// orderRepository.ts
import { UserService } from './userService';  // CYCLE!
export class OrderRepository {
  constructor(private userService: UserService) {}
}
```

**Solution: Interface Segregation**
```typescript
// interfaces.ts
export interface IUserLookup {
  findById(id: string): User | null;
}

export interface IOrderLookup {
  findByUser(userId: string): Order[];
}

// userService.ts
import { IOrderLookup } from './interfaces';
export class UserService implements IUserLookup {
  constructor(private orderLookup: IOrderLookup) {}
}

// orderRepository.ts
import { IUserLookup } from './interfaces';
export class OrderRepository implements IOrderLookup {
  constructor(private userLookup: IUserLookup) {}
}

// Wiring happens in composition root
const userService = new UserService(orderRepo);
const orderRepo = new OrderRepository(userService);
```

---

### Pattern 6: Barrel Export Cycles

**Problem:**
```typescript
// components/index.ts
export * from './Button';
export * from './Modal';
export * from './Form';

// components/Modal.tsx
import { Button } from './index';  // Can create cycle through barrel

// components/Form.tsx
import { Modal } from './index';   // Can create cycle through barrel
```

**Solution: Direct imports in components**
```typescript
// components/Modal.tsx
import { Button } from './Button';  // Direct import, no cycle

// components/Form.tsx
import { Modal } from './Modal';    // Direct import, no cycle
```

---

## Resolution Strategies

### Strategy 1: Extract Shared Module

```
Before:                    After:
A <--> B                  A --> shared <-- B
```

Move shared code to a new module that both import.

### Strategy 2: Dependency Inversion

```
Before:                    After:
A --> B --> A             A --> IB <-- B
                          (A depends on interface, B implements it)
```

Use interfaces or abstract classes to break the compile-time dependency.

### Strategy 3: Lazy Loading

```typescript
// Break cycle with dynamic import
export async function getUser() {
  const { UserService } = await import('./userService');
  return new UserService();
}
```

### Strategy 4: Event-Based Communication

```typescript
// Instead of direct calls, use events
eventBus.emit('user:created', userData);

// Other module listens
eventBus.on('user:created', handleNewUser);
```

### Strategy 5: Composition Root

```typescript
// Wire dependencies at application start
// index.ts
import { UserService } from './userService';
import { OrderService } from './orderService';

const orderService = new OrderService();
const userService = new UserService(orderService);

export { userService, orderService };
```

---

## Language-Specific Notes

### TypeScript

```typescript
// Use import type for type-only imports (no runtime cycle)
import type { User } from './user';

// Enable in tsconfig.json
{
  "compilerOptions": {
    "importsNotUsedAsValues": "error",  // Force explicit type imports
    "verbatimModuleSyntax": true
  }
}
```

### Python

```python
# Use TYPE_CHECKING to avoid runtime cycles
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .user import User  # Only imported during type checking

def process(user: "User") -> None:  # Use string annotation
    ...
```

```python
# Or use lazy imports inside functions
def get_user():
    from .user import User  # Import at runtime, not module load
    return User()
```

### Go

Go prohibits import cycles at compile time. Solutions:

```go
// 1. Extract to third package
// package models - shared types
// package users - imports models
// package orders - imports models

// 2. Use interfaces
// package users
type OrderGetter interface {
    GetOrders(userID string) []Order
}

// package orders implements OrderGetter
```

---

## Prevention Strategies

### 1. Architectural Layers

```
UI Layer        (can only import from Business Layer)
    |
Business Layer  (can only import from Data Layer)
    |
Data Layer      (can only import from Shared)
    |
Shared/Utils    (no internal imports)
```

### 2. Feature-Based Modules

```
features/
  auth/
    index.ts      (public API)
    internal/     (private implementation)
  users/
    index.ts
    internal/
  orders/
    index.ts
    internal/

# Features only import each other's public APIs
# No cross-internal imports
```

### 3. Eslint Rules

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'import/no-cycle': ['error', { maxDepth: Infinity }],
    'import/no-internal-modules': ['error', {
      allow: ['**/index']
    }]
  }
};
```

### 4. dependency-cruiser Rules

```javascript
// .dependency-cruiser.js
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: {
        circular: true
      }
    }
  ]
};
```

---

## CI Integration

### GitHub Actions

```yaml
name: Circular Dependency Check

on: [pull_request]

jobs:
  check-circular:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Check for circular dependencies
        run: |
          npx madge --circular --extensions ts,tsx src/
          if [ $? -ne 0 ]; then
            echo "::error::Circular dependencies detected!"
            exit 1
          fi
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check changed TS files for cycles
changed=$(git diff --cached --name-only | grep -E '\.(ts|tsx)$')
if [ -n "$changed" ]; then
  npx madge --circular $changed
  if [ $? -ne 0 ]; then
    echo "Circular dependency introduced. Please fix before committing."
    exit 1
  fi
fi
```
