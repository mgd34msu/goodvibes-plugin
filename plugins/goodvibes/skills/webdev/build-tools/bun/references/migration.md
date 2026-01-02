# Migrating from Node.js to Bun

## Compatibility Overview

Bun aims to be a drop-in replacement for Node.js. Most Node.js code works unchanged.

### Fully Supported

- CommonJS and ESM modules
- package.json
- node_modules resolution
- Most Node.js APIs
- npm packages
- TypeScript/JSX (built-in)

### Partially Supported

- `child_process` (basic support)
- `cluster` (limited)
- Native addons (limited)
- `vm` module (partial)

## Migration Steps

### Step 1: Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
# or
npm install -g bun
```

### Step 2: Convert Lock File

```bash
# Generate bun.lockb from existing
bun install

# Or keep both for compatibility
bun install # Creates bun.lockb
# Keep package-lock.json or yarn.lock
```

### Step 3: Update Scripts

```json
{
  "scripts": {
    "dev": "bun run src/index.ts",
    "build": "bun build src/index.ts --outdir=dist",
    "test": "bun test",
    "start": "bun run dist/index.js"
  }
}
```

### Step 4: Replace Node-Specific Code

#### Process Arguments

```typescript
// Node.js
const args = process.argv.slice(2);

// Bun (same, or use Bun.argv)
const args = Bun.argv.slice(2);
```

#### File Reading

```typescript
// Node.js
import { readFileSync } from 'fs';
const content = readFileSync('file.txt', 'utf8');

// Bun
const content = await Bun.file('file.txt').text();
```

#### File Writing

```typescript
// Node.js
import { writeFileSync } from 'fs';
writeFileSync('file.txt', content);

// Bun
await Bun.write('file.txt', content);
```

#### HTTP Server

```typescript
// Node.js (Express)
import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('Hello'));
app.listen(3000);

// Bun (native)
Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response('Hello');
  },
});

// Bun with Express (works too)
import express from 'express';
const app = express();
app.get('/', (req, res) => res.send('Hello'));
app.listen(3000);
```

#### Environment Variables

```typescript
// Node.js (with dotenv)
import 'dotenv/config';
const apiKey = process.env.API_KEY;

// Bun (built-in .env support)
const apiKey = Bun.env.API_KEY;
// or
const apiKey = process.env.API_KEY;
```

#### Running Shell Commands

```typescript
// Node.js
import { execSync } from 'child_process';
const result = execSync('ls -la').toString();

// Bun
import { $ } from 'bun';
const result = await $`ls -la`.text();
```

#### Password Hashing

```typescript
// Node.js (with bcrypt)
import bcrypt from 'bcrypt';
const hash = await bcrypt.hash(password, 10);
const valid = await bcrypt.compare(password, hash);

// Bun (built-in)
const hash = await Bun.password.hash(password);
const valid = await Bun.password.verify(password, hash);
```

## Testing Migration

### Jest to Bun

```typescript
// Jest
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('./module');
const mockFn = jest.fn();

// Bun
import { describe, it, expect, mock } from 'bun:test';

// Mocking is similar
const mockFn = mock();
```

### Vitest to Bun

```typescript
// Vitest
import { describe, it, expect, vi } from 'vitest';

// Bun (almost identical)
import { describe, it, expect, mock, spyOn } from 'bun:test';
```

## Package Manager Migration

### From npm

```bash
# Remove node_modules and lock file
rm -rf node_modules package-lock.json

# Install with Bun
bun install
```

### From Yarn

```bash
rm -rf node_modules yarn.lock
bun install
```

### From pnpm

```bash
rm -rf node_modules pnpm-lock.yaml
bun install
```

## Common Issues

### Native Modules

Some native modules may not work:

```bash
# Check compatibility
bun add better-sqlite3  # Works (Bun has built-in SQLite)
bun add bcrypt          # Works (Bun has built-in password hashing)
bun add sharp           # May have issues
```

Alternatives:
- Use Bun's built-in APIs when available
- Use pure JavaScript alternatives
- Wait for Bun support

### ESM vs CJS

```typescript
// If CJS import fails
// From:
const pkg = require('./package.json');

// To:
import pkg from './package.json' with { type: 'json' };
// or
const pkg = await Bun.file('./package.json').json();
```

### __dirname / __filename

```typescript
// Node.js ESM
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Bun (built-in)
const __filename = import.meta.file;
const __dirname = import.meta.dir;

// Or use full path
const fullPath = import.meta.path;
```

### Require in ESM

```typescript
// Node.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Bun (can use require directly in ESM)
const pkg = require('./package.json');
```

## TypeScript Configuration

```json
{
  "compilerOptions": {
    "types": ["bun-types"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "target": "ESNext",
    "lib": ["ESNext"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

```bash
bun add -D bun-types
```

## CI/CD Migration

### GitHub Actions

```yaml
# Before (Node.js)
- uses: actions/setup-node@v4
  with:
    node-version: 20
- run: npm ci
- run: npm test

# After (Bun)
- uses: oven-sh/setup-bun@v1
  with:
    bun-version: latest
- run: bun install --frozen-lockfile
- run: bun test
```

## Gradual Migration

Keep both runtimes during migration:

```json
{
  "scripts": {
    "dev": "bun run src/index.ts",
    "dev:node": "tsx src/index.ts",
    "test": "bun test",
    "test:node": "vitest"
  }
}
```

## Performance Comparison

| Operation | Node.js | Bun |
|-----------|---------|-----|
| Startup | ~40ms | ~2ms |
| Install | ~10s | ~2s |
| TypeScript | Requires build | Native |
| Hot reload | With nodemon | Built-in |
| Bundling | Requires webpack/esbuild | Built-in |

## When to Keep Node.js

- Heavy use of unsupported native modules
- Production stability requirements
- Complex cluster/worker setups
- Specific Node.js version requirements
