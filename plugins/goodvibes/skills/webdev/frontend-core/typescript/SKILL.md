---
name: typescript
description: Adds static typing to JavaScript with TypeScript including type annotations, interfaces, generics, and advanced type utilities. Use when setting up TypeScript projects, defining types, creating generic utilities, or debugging type errors.
---

# TypeScript

Strongly typed programming language that builds on JavaScript, providing type safety and improved developer experience.

## Quick Start

**Initialize in existing project:**
```bash
npm install -D typescript
npx tsc --init
```

**Create React project with TypeScript:**
```bash
npm create vite@latest my-app -- --template react-ts
```

**Key tsconfig.json options:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

## Basic Types

### Primitives

```typescript
// String
let name: string = 'Alice';

// Number
let age: number = 30;
let price: number = 19.99;

// Boolean
let isActive: boolean = true;

// Null and Undefined
let nothing: null = null;
let notDefined: undefined = undefined;

// Symbol
let id: symbol = Symbol('id');

// BigInt
let bigNumber: bigint = 100n;
```

### Arrays

```typescript
// Array of strings
let names: string[] = ['Alice', 'Bob'];

// Alternative syntax
let numbers: Array<number> = [1, 2, 3];

// Tuple (fixed length, specific types)
let tuple: [string, number] = ['Alice', 30];

// Readonly array
let readonlyArr: readonly number[] = [1, 2, 3];
```

### Objects

```typescript
// Inline object type
let user: { name: string; age: number } = {
  name: 'Alice',
  age: 30,
};

// Optional properties
let config: { host: string; port?: number } = {
  host: 'localhost',
};

// Index signature
let dictionary: { [key: string]: number } = {
  one: 1,
  two: 2,
};
```

## Type Aliases and Interfaces

### Type Aliases

```typescript
// Object type
type User = {
  id: string;
  name: string;
  email: string;
};

// Union type
type Status = 'pending' | 'active' | 'completed';

// Intersection type
type Admin = User & {
  role: 'admin';
  permissions: string[];
};

// Function type
type Callback = (error: Error | null, result: string) => void;
```

### Interfaces

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

// Extending interfaces
interface Admin extends User {
  role: 'admin';
  permissions: string[];
}

// Declaration merging (interfaces only)
interface User {
  age?: number; // Adds to existing User interface
}

// Implementing interfaces
class UserService implements User {
  id = '1';
  name = 'Alice';
  email = 'alice@example.com';
}
```

### When to Use Which

| Feature | Type | Interface |
|---------|------|-----------|
| Object shapes | Both | Both |
| Union/Intersection | Yes | No (use extends) |
| Primitives | Yes | No |
| Declaration merging | No | Yes |
| Class implements | Both | Both |

**Rule of thumb:** Use `interface` for public APIs (mergeable), `type` for complex types.

## Union and Intersection Types

### Union Types

```typescript
type Result = string | number;
type Status = 'pending' | 'success' | 'error';

function format(value: string | number): string {
  if (typeof value === 'string') {
    return value.toUpperCase();
  }
  return value.toFixed(2);
}
```

### Intersection Types

```typescript
type HasId = { id: string };
type HasTimestamp = { createdAt: Date; updatedAt: Date };

type Entity = HasId & HasTimestamp;

const entity: Entity = {
  id: '1',
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

### Discriminated Unions

```typescript
type Success = {
  status: 'success';
  data: string;
};

type Error = {
  status: 'error';
  error: string;
};

type Result = Success | Error;

function handleResult(result: Result) {
  switch (result.status) {
    case 'success':
      console.log(result.data); // TypeScript knows data exists
      break;
    case 'error':
      console.log(result.error); // TypeScript knows error exists
      break;
  }
}
```

## Functions

### Basic Functions

```typescript
// Parameter and return types
function greet(name: string): string {
  return `Hello, ${name}!`;
}

// Arrow function
const add = (a: number, b: number): number => a + b;

// Optional parameters
function greet(name: string, greeting?: string): string {
  return `${greeting ?? 'Hello'}, ${name}!`;
}

// Default parameters
function greet(name: string, greeting = 'Hello'): string {
  return `${greeting}, ${name}!`;
}

// Rest parameters
function sum(...numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}
```

### Function Overloads

```typescript
function parse(value: string): number;
function parse(value: number): string;
function parse(value: string | number): string | number {
  if (typeof value === 'string') {
    return parseInt(value, 10);
  }
  return value.toString();
}

const num = parse('123'); // number
const str = parse(123);    // string
```

### Async Functions

```typescript
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

// With error handling
async function fetchUser(id: string): Promise<User | null> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
```

## Generics

### Generic Functions

```typescript
// Basic generic
function identity<T>(value: T): T {
  return value;
}

const num = identity(42);      // number
const str = identity('hello'); // string

// Multiple type parameters
function pair<T, U>(first: T, second: U): [T, U] {
  return [first, second];
}

// Constrained generic
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: 'Alice', age: 30 };
const name = getProperty(user, 'name'); // string
```

### Generic Interfaces

```typescript
interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
}

interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

const usersResponse: PaginatedResponse<User> = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
};
```

### Generic Classes

```typescript
class Stack<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  peek(): T | undefined {
    return this.items[this.items.length - 1];
  }
}

const numberStack = new Stack<number>();
numberStack.push(1);
numberStack.push(2);
```

## Utility Types

### Built-in Utilities

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

// Partial - all properties optional
type PartialUser = Partial<User>;

// Required - all properties required
type RequiredUser = Required<User>;

// Pick - select specific properties
type UserPreview = Pick<User, 'id' | 'name'>;

// Omit - exclude specific properties
type UserWithoutId = Omit<User, 'id'>;

// Readonly - all properties readonly
type ReadonlyUser = Readonly<User>;

// Record - object with specific key/value types
type UserRoles = Record<string, User>;

// Extract - extract union members
type AdminRole = Extract<User['role'], 'admin'>; // 'admin'

// Exclude - exclude union members
type NonAdminRole = Exclude<User['role'], 'admin'>; // 'user'

// NonNullable - remove null and undefined
type NonNullString = NonNullable<string | null>; // string

// ReturnType - get function return type
type FetchReturn = ReturnType<typeof fetch>; // Promise<Response>

// Parameters - get function parameter types
type FetchParams = Parameters<typeof fetch>; // [input: RequestInfo, init?: RequestInit]
```

### Custom Utility Types

```typescript
// Make specific properties optional
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type UserWithOptionalEmail = PartialBy<User, 'email'>;

// Make specific properties required
type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

// Deep partial
type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

// Deep readonly
type DeepReadonly<T> = T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;
```

## Type Guards

### typeof Guards

```typescript
function format(value: string | number): string {
  if (typeof value === 'string') {
    return value.toUpperCase(); // value is string
  }
  return value.toFixed(2); // value is number
}
```

### instanceof Guards

```typescript
function handleError(error: Error | string) {
  if (error instanceof Error) {
    console.log(error.message);
  } else {
    console.log(error);
  }
}
```

### in Guards

```typescript
interface Dog {
  bark(): void;
}

interface Cat {
  meow(): void;
}

function speak(animal: Dog | Cat) {
  if ('bark' in animal) {
    animal.bark();
  } else {
    animal.meow();
  }
}
```

### Custom Type Guards

```typescript
interface User {
  type: 'user';
  name: string;
}

interface Admin {
  type: 'admin';
  name: string;
  permissions: string[];
}

function isAdmin(person: User | Admin): person is Admin {
  return person.type === 'admin';
}

function greet(person: User | Admin) {
  if (isAdmin(person)) {
    console.log(`Admin ${person.name} with permissions: ${person.permissions}`);
  } else {
    console.log(`User ${person.name}`);
  }
}
```

## Mapped Types

```typescript
// Make all properties nullable
type Nullable<T> = {
  [P in keyof T]: T[P] | null;
};

// Add prefix to property names
type Prefixed<T, Prefix extends string> = {
  [P in keyof T as `${Prefix}${string & P}`]: T[P];
};

// Filter properties by type
type StringProperties<T> = {
  [P in keyof T as T[P] extends string ? P : never]: T[P];
};
```

## Conditional Types

```typescript
// Basic conditional
type IsString<T> = T extends string ? true : false;

type A = IsString<string>;  // true
type B = IsString<number>;  // false

// Infer keyword
type GetReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

type FnReturn = GetReturnType<() => string>; // string

// Distributive conditional types
type ToArray<T> = T extends any ? T[] : never;

type StrOrNumArray = ToArray<string | number>; // string[] | number[]

// Flatten array type
type Flatten<T> = T extends Array<infer U> ? U : T;

type Str = Flatten<string[]>;  // string
type Num = Flatten<number>;    // number
```

## React Types

```typescript
import { ReactNode, FC, ComponentProps, PropsWithChildren } from 'react';

// Props with children
interface CardProps {
  title: string;
  children: ReactNode;
}

// Using PropsWithChildren
type ButtonProps = PropsWithChildren<{
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}>;

// Get props from component
type InputProps = ComponentProps<'input'>;
type DivProps = ComponentProps<'div'>;

// Extend HTML element props
interface ButtonProps extends ComponentProps<'button'> {
  variant?: 'primary' | 'secondary';
}

// Event types
const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {};
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {};
const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {};
```

## Best Practices

1. **Enable strict mode** - Catch more errors at compile time
2. **Prefer interfaces for objects** - Better error messages, extensible
3. **Use type for unions** - Type aliases handle unions better
4. **Avoid `any`** - Use `unknown` for truly unknown types
5. **Leverage inference** - Don't over-annotate obvious types
6. **Use const assertions** - `as const` for literal types

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `any` everywhere | Use `unknown` or proper types |
| Not enabling strict mode | Set `"strict": true` |
| Ignoring type errors | Fix them or use proper assertions |
| Over-typing | Let TypeScript infer when obvious |
| Not using generics | Add type parameters for reusability |

## Reference Files

- [references/utility-types.md](references/utility-types.md) - Complete utility types guide
- [references/react-types.md](references/react-types.md) - React + TypeScript patterns
- [references/tsconfig.md](references/tsconfig.md) - Configuration deep dive
