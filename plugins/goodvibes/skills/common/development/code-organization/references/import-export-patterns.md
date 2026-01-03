# Import/Export Patterns

Comprehensive patterns for organizing imports, exports, and module boundaries.

## Barrel Exports (index.ts)

### Basic Barrel Pattern

Simplify imports by re-exporting through index files:

```typescript
// components/Button/Button.tsx
export function Button({ children, onClick }: ButtonProps) {
  return <button onClick={onClick}>{children}</button>;
}

export interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

// components/Button/index.ts
export { Button } from './Button';
export type { ButtonProps } from './Button';

// Usage in other files
import { Button } from '@/components/Button';
// Instead of:
import { Button } from '@/components/Button/Button';
```

### Multi-File Barrel

Aggregate multiple files:

```typescript
// components/index.ts
export { Button } from './Button';
export { Input } from './Input';
export { Modal } from './Modal';
export { Card } from './Card';

// Types from all components
export type { ButtonProps } from './Button';
export type { InputProps } from './Input';
export type { ModalProps } from './Modal';
export type { CardProps } from './Card';

// Usage
import { Button, Input, Modal, Card } from '@/components';
```

### Selective Barrel (Recommended)

Only export public API:

```typescript
// features/auth/index.ts
// PUBLIC: Available to other features
export { LoginForm } from './components/LoginForm';
export { useAuth, useSession } from './hooks';
export type { User, AuthState, Credentials } from './types';

// PRIVATE: Not exported
// - PasswordInput (internal to LoginForm)
// - useAuthValidation (internal hook)
// - authHelpers.ts (internal utilities)
```

---

## Export Patterns

### Named Exports (Preferred)

```typescript
// utils/format.ts
export function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatPhone(phone: string): string {
  return phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
}

// Usage
import { formatDate, formatCurrency } from '@/utils/format';
```

### Default Exports (Use Sparingly)

```typescript
// Only for main component in file
// components/UserProfile/UserProfile.tsx
export default function UserProfile({ user }: UserProfileProps) {
  return <div>{user.name}</div>;
}

// Re-export as named in index.ts
export { default as UserProfile } from './UserProfile';
```

### Mixed Exports

```typescript
// api/userApi.ts
// Default for main class/function
export default class UserApi {
  getUser(id: string) { ... }
}

// Named for types and utilities
export interface User { ... }
export interface UserResponse { ... }
export function parseUserResponse(data: unknown): User { ... }

// Usage
import UserApi, { User, parseUserResponse } from '@/api/userApi';
```

### Const Exports

```typescript
// constants/routes.ts
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  SETTINGS: '/settings',
} as const;

// Export individual constants
export const API_BASE = '/api/v1';
export const MAX_RETRIES = 3;
export const DEFAULT_TIMEOUT = 5000;
```

---

## Re-Export Patterns

### Simple Re-export

```typescript
// Re-export single item
export { formatDate } from './formatDate';

// Re-export multiple items
export { formatDate, formatCurrency, formatPhone } from './format';

// Re-export with rename
export { formatDate as dateFormatter } from './formatDate';
```

### Namespace Re-export

```typescript
// Re-export all (use carefully)
export * from './types';
export * from './constants';

// Re-export as namespace
export * as DateUtils from './dateUtils';
export * as StringUtils from './stringUtils';

// Usage
import { DateUtils, StringUtils } from '@/utils';
DateUtils.format(new Date());
StringUtils.capitalize('hello');
```

### Type-Only Re-exports

```typescript
// Separate type exports (important for bundlers)
export type { User, UserRole } from './types';
export type { ButtonProps } from './Button';

// Re-export type with value
export { UserRole } from './types';          // If enum
export type { User } from './types';         // If interface/type
```

---

## Import Patterns

### Import Organization

Order imports consistently:

```typescript
// 1. External packages (node_modules)
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

// 2. Internal packages (monorepo)
import { Button } from '@company/ui';
import { validateEmail } from '@company/utils';

// 3. Absolute imports (project)
import { useAuth } from '@/features/auth';
import { userApi } from '@/services/api';
import { formatDate } from '@/utils/format';

// 4. Relative imports (same feature)
import { UserCard } from './components/UserCard';
import { useUserData } from './hooks/useUserData';
import type { User } from './types';

// 5. Styles and assets
import styles from './UserProfile.module.css';
import logo from './assets/logo.svg';
```

### Type-Only Imports

```typescript
// Import type only (doesn't add to bundle)
import type { User, UserRole } from './types';
import type { ButtonProps } from '@/components/Button';

// Mixed import
import { UserRole, type User, type UserProfile } from './types';

// Inline type import
function processUser(user: import('./types').User) { ... }
```

### Dynamic Imports

```typescript
// Lazy loading components
const UserProfile = React.lazy(() => import('./UserProfile'));

// Conditional imports
async function loadFeature(name: string) {
  const module = await import(`./features/${name}`);
  return module.default;
}

// Dynamic import with named export
const { formatDate } = await import('./utils/format');
```

---

## Path Alias Configuration

### TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      // Root alias
      "@/*": ["src/*"],

      // Feature aliases
      "@features/*": ["src/features/*"],
      "@components/*": ["src/components/*"],
      "@hooks/*": ["src/hooks/*"],
      "@utils/*": ["src/utils/*"],
      "@services/*": ["src/services/*"],
      "@types/*": ["src/types/*"],

      // Specific modules
      "@config": ["src/config/index.ts"],
      "@constants": ["src/constants/index.ts"]
    }
  }
}
```

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@features': path.resolve(__dirname, './src/features'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
    },
  },
});
```

### Next.js Configuration

```json
// tsconfig.json (Next.js auto-configures)
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
  },
};
```

---

## Feature Module API Design

### Complete Feature Module

```typescript
// features/auth/index.ts

// Components - Public UI elements
export { LoginForm } from './components/LoginForm';
export { RegisterForm } from './components/RegisterForm';
export { AuthGuard } from './components/AuthGuard';

// Hooks - Public state/logic
export { useAuth } from './hooks/useAuth';
export { useSession } from './hooks/useSession';
export { usePermissions } from './hooks/usePermissions';

// Types - Public interfaces
export type {
  User,
  UserRole,
  Credentials,
  AuthState,
  Session,
} from './types';

// Constants - Public configuration
export { AUTH_ROUTES, PERMISSIONS } from './constants';

// Services - Public API (if needed externally)
export { authService } from './services/authService';

// DO NOT EXPORT:
// - Internal components (PasswordInput, FormField)
// - Internal hooks (useAuthValidation, useTokenRefresh)
// - Internal utilities (hashPassword, validateToken)
// - Internal types (InternalAuthState, TokenPayload)
```

### Consumer Usage

```typescript
// features/dashboard/Dashboard.tsx
import {
  useAuth,
  usePermissions,
  AuthGuard,
  type User,
  PERMISSIONS,
} from '@features/auth';

// Clean, explicit imports from public API
function Dashboard() {
  const { user } = useAuth();
  const { can } = usePermissions();

  if (!can(PERMISSIONS.VIEW_DASHBOARD)) {
    return <AccessDenied />;
  }

  return <DashboardContent user={user} />;
}
```

---

## Circular Import Prevention

### Problem Detection

```typescript
// BAD: Circular dependency
// features/orders/orderService.ts
import { userService } from '@features/users/userService';

// features/users/userService.ts
import { orderService } from '@features/orders/orderService';
```

### Solution 1: Dependency Injection

```typescript
// services/types.ts (shared interface)
export interface IUserService {
  getUser(id: string): Promise<User>;
}

// features/orders/orderService.ts
export class OrderService {
  constructor(private userService: IUserService) {}

  async createOrder(userId: string, items: Item[]) {
    const user = await this.userService.getUser(userId);
    // ...
  }
}

// app/container.ts (composition root)
const userService = new UserService();
const orderService = new OrderService(userService);
```

### Solution 2: Extract Shared Module

```typescript
// BEFORE: Circular
users/ <-> orders/

// AFTER: Extract shared
shared/
  types/
    user.ts        # Shared User type
    order.ts       # Shared Order type

users/
  userService.ts   # Imports from shared

orders/
  orderService.ts  # Imports from shared
```

### Solution 3: Event-Based Communication

```typescript
// shared/events/eventBus.ts
export const eventBus = new EventEmitter();

// features/orders/orderService.ts
export function completeOrder(order: Order) {
  // ... complete order
  eventBus.emit('order:completed', order);
}

// features/users/userService.ts
eventBus.on('order:completed', (order: Order) => {
  updateUserOrderHistory(order.userId, order);
});
```

---

## Anti-Patterns

### Avoid: Deep Imports

```typescript
// BAD: Deep import into module internals
import { validatePassword } from '@features/auth/utils/validation/passwordValidator';

// GOOD: Import from public API
import { validateCredentials } from '@features/auth';
```

### Avoid: Import Everything

```typescript
// BAD: Import all (hard to tree-shake)
import * as Utils from '@/utils';

// GOOD: Import specific functions
import { formatDate, formatCurrency } from '@/utils';
```

### Avoid: Relative Path Hell

```typescript
// BAD: Deep relative imports
import { Button } from '../../../components/ui/Button';
import { useAuth } from '../../../../features/auth/hooks';

// GOOD: Absolute imports with aliases
import { Button } from '@components/ui/Button';
import { useAuth } from '@features/auth';
```

### Avoid: Mixed Import Styles

```typescript
// BAD: Inconsistent
import Button from '@components/Button';           // default
import { Input } from '@components/Input';         // named
import * as Modal from '@components/Modal';        // namespace

// GOOD: Consistent named exports
import { Button } from '@components/Button';
import { Input } from '@components/Input';
import { Modal } from '@components/Modal';
```

---

## ESLint Import Rules

### Recommended Configuration

```javascript
// .eslintrc.js
module.exports = {
  plugins: ['import'],
  rules: {
    // Ensure imports resolve
    'import/no-unresolved': 'error',

    // Prevent circular dependencies
    'import/no-cycle': 'error',

    // Ensure consistent export style
    'import/prefer-default-export': 'off', // or 'error' if you prefer defaults
    'import/no-default-export': 'error',   // if you prefer named only

    // Order imports
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
          'type',
        ],
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      },
    ],

    // No duplicate imports
    'import/no-duplicates': 'error',

    // Consistent type imports
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports' },
    ],
  },
};
```

---

## Import/Export Checklist

```markdown
## Barrel Exports
- [ ] Each feature has index.ts with public API
- [ ] Only necessary items exported
- [ ] Types exported with `export type`
- [ ] Internal implementation hidden

## Import Organization
- [ ] Imports ordered consistently
- [ ] External before internal
- [ ] Absolute imports used
- [ ] Type imports separated

## Path Aliases
- [ ] tsconfig.json paths configured
- [ ] Bundler aliases match
- [ ] Test runner configured
- [ ] No deep relative imports

## Circular Dependencies
- [ ] No circular imports
- [ ] Shared types extracted
- [ ] Event-based for cross-feature
```
