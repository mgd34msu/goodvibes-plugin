# JavaScript to TypeScript Migration Guide

Step-by-step guide for migrating JavaScript codebases to TypeScript.

## Phase 1: Setup

### Install TypeScript

```bash
# Install TypeScript
npm install --save-dev typescript

# Install type definitions for Node.js
npm install --save-dev @types/node

# Initialize tsconfig.json
npx tsc --init
```

### Initial tsconfig.json (Permissive)

Start with a permissive configuration:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",

    // Permissive settings for migration
    "strict": false,
    "allowJs": true,
    "checkJs": false,
    "noImplicitAny": false,
    "strictNullChecks": false,
    "skipLibCheck": true,

    // Module interop
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,

    // Output
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Update package.json

```json
{
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "start": "node dist/index.js",
    "dev": "ts-node src/index.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Phase 2: Rename Files

### Strategy 1: Gradual (Recommended)

Rename files one at a time, starting with leaf modules:

```bash
# Start with utilities that don't import other project files
mv src/utils/helpers.js src/utils/helpers.ts
mv src/utils/validators.js src/utils/validators.ts

# Then move up the dependency tree
mv src/services/userService.js src/services/userService.ts

# Finally, entry points
mv src/index.js src/index.ts
```

### Strategy 2: Bulk Rename

For smaller projects:

```bash
# Rename all at once (may cause many errors initially)
find src -name "*.js" -exec bash -c 'mv "$0" "${0%.js}.ts"' {} \;
```

---

## Phase 3: Add Type Annotations

### Step 1: Fix Import Errors

```typescript
// BEFORE (CommonJS)
const express = require('express');
const { Router } = require('express');
const utils = require('./utils');

// AFTER (ES Modules)
import express, { Router, Request, Response } from 'express';
import * as utils from './utils';
import type { User } from './types';  // Type-only import
```

### Step 2: Add Parameter Types

```typescript
// BEFORE
function greet(name) {
  return `Hello, ${name}`;
}

// AFTER
function greet(name: string): string {
  return `Hello, ${name}`;
}
```

### Step 3: Add Interface Definitions

```typescript
// Create types/index.ts
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface CreateUserInput {
  name: string;
  email: string;
}

export interface UserService {
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
}
```

### Step 4: Type External Dependencies

```bash
# Install type definitions
npm install --save-dev @types/express @types/lodash @types/node

# For packages without types, create declarations
# src/types/custom.d.ts
declare module 'untyped-package' {
  export function someFunction(arg: string): void;
}
```

---

## Phase 4: Handle Common Patterns

### Callback to Promise

```typescript
// BEFORE: Callback-style
function readFile(path: string, callback: (err: Error | null, data: string) => void) {
  fs.readFile(path, 'utf8', callback);
}

// AFTER: Promise-style with types
async function readFile(path: string): Promise<string> {
  return fs.promises.readFile(path, 'utf8');
}
```

### Object Parameters

```typescript
// BEFORE
function createUser(name, email, role, active) {
  return { name, email, role, active };
}

// AFTER: Named parameters with interface
interface CreateUserOptions {
  name: string;
  email: string;
  role?: 'admin' | 'user';
  active?: boolean;
}

function createUser(options: CreateUserOptions): User {
  const { name, email, role = 'user', active = true } = options;
  return { name, email, role, active };
}
```

### Dynamic Objects

```typescript
// BEFORE: Any object
function processConfig(config) {
  return config.database.host;
}

// AFTER: Typed configuration
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
}

interface AppConfig {
  database: DatabaseConfig;
  server: {
    port: number;
  };
}

function processConfig(config: AppConfig): string {
  return config.database.host;
}
```

### Array Methods

```typescript
// BEFORE
const numbers = [1, 2, 3];
const doubled = numbers.map(n => n * 2);

// AFTER: Type inference works, but explicit is clearer
const numbers: number[] = [1, 2, 3];
const doubled: number[] = numbers.map((n: number): number => n * 2);

// Complex array types
interface Product {
  id: string;
  name: string;
  price: number;
}

const products: Product[] = [];
const names: string[] = products.map(p => p.name);
const expensive: Product[] = products.filter(p => p.price > 100);
```

### Class Properties

```typescript
// BEFORE
class UserService {
  constructor(database) {
    this.database = database;
    this.cache = new Map();
  }
}

// AFTER
class UserService {
  private cache: Map<string, User>;

  constructor(private database: Database) {
    this.cache = new Map();
  }

  async findById(id: string): Promise<User | null> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }
    return this.database.query('...');
  }
}
```

---

## Phase 5: Enable Strict Mode

### Gradual Strictness

Enable strict options one at a time:

```json
{
  "compilerOptions": {
    // Step 1: Enable these first
    "noImplicitAny": true,

    // Step 2: After fixing noImplicitAny
    "strictNullChecks": true,

    // Step 3: After fixing null checks
    "strictFunctionTypes": true,
    "strictBindCallApply": true,

    // Step 4: Full strict mode
    "strict": true
  }
}
```

### Fixing noImplicitAny

```typescript
// ERROR: Parameter 'x' implicitly has an 'any' type
function process(x) {
  return x.toString();
}

// FIX: Add type annotation
function process(x: unknown): string {
  if (typeof x === 'string' || typeof x === 'number') {
    return x.toString();
  }
  throw new Error('Invalid input');
}

// Or if you know the type
function process(x: number): string {
  return x.toString();
}
```

### Fixing strictNullChecks

```typescript
// ERROR: Object is possibly 'undefined'
function getUser(id: string): User | undefined {
  return users.find(u => u.id === id);
}

const user = getUser('123');
console.log(user.name); // Error!

// FIX 1: Optional chaining
console.log(user?.name);

// FIX 2: Null check
if (user) {
  console.log(user.name);
}

// FIX 3: Non-null assertion (use sparingly)
console.log(user!.name);

// FIX 4: Throw if not found
function getUserOrThrow(id: string): User {
  const user = users.find(u => u.id === id);
  if (!user) {
    throw new Error(`User not found: ${id}`);
  }
  return user;
}
```

---

## Phase 6: Advanced Types

### Generic Functions

```typescript
// Generic function
function first<T>(array: T[]): T | undefined {
  return array[0];
}

const num = first([1, 2, 3]);      // number | undefined
const str = first(['a', 'b']);    // string | undefined

// Generic with constraints
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: 'John', age: 30 };
const name = getProperty(user, 'name');  // string
const age = getProperty(user, 'age');    // number
```

### Utility Types

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  password: string;
}

// Partial - all properties optional
type UpdateUser = Partial<User>;

// Pick - select specific properties
type PublicUser = Pick<User, 'id' | 'name' | 'email'>;

// Omit - exclude specific properties
type UserWithoutPassword = Omit<User, 'password'>;

// Required - all properties required
type RequiredUser = Required<Partial<User>>;

// Readonly - all properties readonly
type ImmutableUser = Readonly<User>;

// Record - dictionary type
type UserRoles = Record<string, 'admin' | 'user'>;
```

### Union and Intersection Types

```typescript
// Union: one of multiple types
type Status = 'pending' | 'active' | 'completed';
type ID = string | number;

// Intersection: combine types
interface HasName {
  name: string;
}

interface HasEmail {
  email: string;
}

type Contact = HasName & HasEmail;
// { name: string; email: string; }

// Discriminated unions
interface SuccessResponse {
  status: 'success';
  data: User;
}

interface ErrorResponse {
  status: 'error';
  message: string;
}

type Response = SuccessResponse | ErrorResponse;

function handleResponse(response: Response) {
  if (response.status === 'success') {
    console.log(response.data); // TypeScript knows it's SuccessResponse
  } else {
    console.log(response.message); // TypeScript knows it's ErrorResponse
  }
}
```

---

## Common Migration Issues

### Issue 1: Cannot find module

```typescript
// Error: Cannot find module './utils'

// Solution 1: Add file extension
import { helper } from './utils.js';

// Solution 2: Configure moduleResolution
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "NodeNext"
  }
}
```

### Issue 2: Property does not exist on type

```typescript
// Error: Property 'name' does not exist on type '{}'
const obj = {};
obj.name = 'John'; // Error

// Solution 1: Define type upfront
const obj: { name?: string } = {};
obj.name = 'John';

// Solution 2: Use interface
interface NamedObject {
  name: string;
}
const obj: NamedObject = { name: 'John' };

// Solution 3: Type assertion (less safe)
const obj = {} as { name: string };
obj.name = 'John';
```

### Issue 3: Type assertion needed for DOM

```typescript
// Error: Object is possibly 'null'
const element = document.getElementById('app');
element.innerHTML = 'Hello'; // Error

// Solution 1: Null check
const element = document.getElementById('app');
if (element) {
  element.innerHTML = 'Hello';
}

// Solution 2: Type assertion
const element = document.getElementById('app') as HTMLElement;
element.innerHTML = 'Hello';

// Solution 3: Non-null assertion
const element = document.getElementById('app')!;
element.innerHTML = 'Hello';
```

### Issue 4: this type in callbacks

```typescript
// Error: 'this' implicitly has type 'any'
class Counter {
  count = 0;

  increment() {
    setTimeout(function() {
      this.count++; // Error: 'this' is undefined
    }, 100);
  }
}

// Solution 1: Arrow function
class Counter {
  count = 0;

  increment() {
    setTimeout(() => {
      this.count++;
    }, 100);
  }
}

// Solution 2: Bind this
class Counter {
  count = 0;

  increment() {
    setTimeout(function(this: Counter) {
      this.count++;
    }.bind(this), 100);
  }
}
```

---

## Final tsconfig.json (Strict)

After migration, use strict configuration:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",

    // Strict mode
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,

    // Additional checks
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,

    // Module interop
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,

    // Output
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Migration Checklist

- [ ] Install TypeScript and configure tsconfig.json
- [ ] Rename .js files to .ts (start with leaf modules)
- [ ] Convert require/module.exports to import/export
- [ ] Add type annotations to function parameters
- [ ] Add type annotations to return values
- [ ] Create interfaces for object shapes
- [ ] Install @types packages for dependencies
- [ ] Create custom type declarations for untyped packages
- [ ] Enable noImplicitAny and fix errors
- [ ] Enable strictNullChecks and fix errors
- [ ] Enable full strict mode
- [ ] Update build scripts
- [ ] Update CI/CD pipeline
- [ ] Document any remaining `any` types with comments
