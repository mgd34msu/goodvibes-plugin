# Bun API Reference

## Runtime APIs

### Bun.file()

```typescript
const file = Bun.file(path: string | URL | Blob);

// Methods
await file.text(): Promise<string>
await file.json(): Promise<any>
await file.arrayBuffer(): Promise<ArrayBuffer>
await file.bytes(): Promise<Uint8Array>
await file.stream(): ReadableStream
await file.exists(): Promise<boolean>

// Properties
file.size: number
file.type: string
file.name: string | undefined
file.lastModified: number
```

### Bun.write()

```typescript
await Bun.write(
  destination: string | URL | BunFile,
  input: string | Blob | ArrayBuffer | Response
): Promise<number>

// Returns bytes written
```

### Bun.serve()

```typescript
const server = Bun.serve({
  port?: number,
  hostname?: string,
  development?: boolean,
  reusePort?: boolean,
  tls?: {
    key: string | Buffer,
    cert: string | Buffer,
  },

  fetch(request: Request, server: Server): Response | Promise<Response>,

  error?(error: Error): Response | Promise<Response>,

  websocket?: {
    message(ws: ServerWebSocket, message: string | Buffer): void,
    open?(ws: ServerWebSocket): void,
    close?(ws: ServerWebSocket, code: number, reason: string): void,
    drain?(ws: ServerWebSocket): void,
    perMessageDeflate?: boolean,
    maxPayloadLength?: number,
    idleTimeout?: number,
    backpressureLimit?: number,
  },
});

// Server methods
server.stop(): void
server.reload(options): void
server.upgrade(request: Request, options?: { data?: any }): boolean
server.requestIP(request: Request): { address: string, port: number }

// Properties
server.port: number
server.hostname: string
server.pendingRequests: number
server.pendingWebSockets: number
```

### Bun.build()

```typescript
interface BuildConfig {
  entrypoints: string[];
  outdir?: string;
  outfile?: string;
  target?: 'browser' | 'bun' | 'node';
  format?: 'esm' | 'cjs' | 'iife';
  splitting?: boolean;
  minify?: boolean | {
    whitespace?: boolean;
    identifiers?: boolean;
    syntax?: boolean;
  };
  sourcemap?: 'none' | 'inline' | 'external' | 'linked';
  external?: string[];
  define?: Record<string, string>;
  loader?: Record<string, Loader>;
  naming?: {
    entry?: string;
    chunk?: string;
    asset?: string;
  };
  publicPath?: string;
  plugins?: BunPlugin[];
  root?: string;
  conditions?: string[];
}

const result = await Bun.build(config: BuildConfig);

// Result
interface BuildOutput {
  success: boolean;
  outputs: BuildArtifact[];
  logs: BuildMessage[];
}

interface BuildArtifact {
  path: string;
  kind: 'entry-point' | 'chunk' | 'asset' | 'sourcemap';
  hash: string | null;
  loader: Loader;
  size: number;
}
```

### Bun.spawn()

```typescript
const proc = Bun.spawn(['command', 'arg1', 'arg2'], {
  cwd?: string,
  env?: Record<string, string>,
  stdin?: 'inherit' | 'pipe' | 'ignore' | Blob | Response | number,
  stdout?: 'inherit' | 'pipe' | 'ignore',
  stderr?: 'inherit' | 'pipe' | 'ignore',
  onExit?(proc, exitCode, signalCode, error): void,
});

// Properties
proc.pid: number
proc.stdin: FileSink | undefined
proc.stdout: ReadableStream | undefined
proc.stderr: ReadableStream | undefined
proc.exitCode: number | null
proc.signalCode: string | null
proc.killed: boolean

// Methods
proc.kill(signal?: number): void
await proc.exited: Promise<number>
```

### Bun.password

```typescript
// Hash password
const hash = await Bun.password.hash(password: string, {
  algorithm?: 'bcrypt' | 'argon2id' | 'argon2d' | 'argon2i',
  cost?: number, // bcrypt: 4-31
  memoryCost?: number, // argon2
  timeCost?: number, // argon2
});

// Verify password
const isValid = await Bun.password.verify(
  password: string,
  hash: string
): Promise<boolean>
```

### Bun.Transpiler

```typescript
const transpiler = new Bun.Transpiler({
  loader?: 'jsx' | 'tsx' | 'ts' | 'js',
  target?: 'browser' | 'bun' | 'node',
  define?: Record<string, string>,
  jsxFactory?: string,
  jsxFragment?: string,
  tsconfig?: object,
});

// Sync transform
const code = transpiler.transformSync(source: string): string

// Get imports
const imports = transpiler.scanImports(source: string): Import[]
```

### Bun.hash

```typescript
// CRC32
Bun.hash.crc32(data: string | ArrayBuffer): number

// Adler32
Bun.hash.adler32(data: string | ArrayBuffer): number

// WYHASH
Bun.hash.wyhash(data: string | ArrayBuffer, seed?: bigint): bigint

// CityHash
Bun.hash.cityHash32(data: string | ArrayBuffer, seed?: number): number
Bun.hash.cityHash64(data: string | ArrayBuffer, seed?: bigint): bigint

// MurmurHash
Bun.hash.murmur32v3(data: string | ArrayBuffer, seed?: number): number
Bun.hash.murmur64v2(data: string | ArrayBuffer, seed?: bigint): bigint
```

### Crypto

```typescript
import { CryptoHasher } from 'bun';

// Hasher
const hasher = new CryptoHasher('sha256');
hasher.update('data');
const digest = hasher.digest('hex');

// One-shot
const hash = Bun.hash.sha256(data);
const hash = Bun.hash.sha512(data);
const hash = Bun.hash.md5(data);
```

## Shell ($)

```typescript
import { $ } from 'bun';

// Basic usage
await $`echo "Hello"`;

// Capture output
const result = await $`ls`.text();
const json = await $`cat data.json`.json();
const lines = await $`cat file.txt`.lines();
const buffer = await $`cat binary`.blob();

// Error handling
const { exitCode } = await $`false`.nothrow();

// Environment
$.env({ API_KEY: 'secret' });
await $`node script.js`;

// Quiet mode (no output)
await $`npm install`.quiet();

// Throw on non-zero exit
await $`npm test`.throws(true);

// Custom shell
$.shell = '/bin/zsh';
```

## SQLite

```typescript
import { Database } from 'bun:sqlite';

const db = new Database('mydb.sqlite', {
  create?: boolean,
  readonly?: boolean,
  readwrite?: boolean,
});

// Query
const query = db.query('SELECT * FROM users WHERE id = ?');
const user = query.get(1);
const users = query.all();

// Prepared statements
const insert = db.prepare('INSERT INTO users (name) VALUES (?)');
insert.run('John');

// Transaction
const tx = db.transaction(() => {
  insert.run('Alice');
  insert.run('Bob');
});
tx();

// WAL mode
db.exec('PRAGMA journal_mode = WAL');

// Close
db.close();
```

## FFI (Foreign Function Interface)

```typescript
import { dlopen, FFIType, ptr, suffix } from 'bun:ffi';

const lib = dlopen(`libexample.${suffix}`, {
  add: {
    args: [FFIType.i32, FFIType.i32],
    returns: FFIType.i32,
  },
  greet: {
    args: [FFIType.cstring],
    returns: FFIType.cstring,
  },
});

const result = lib.symbols.add(1, 2);
const greeting = lib.symbols.greet(ptr('World'));
```

## Test Runner

```typescript
import {
  describe,
  test,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  mock,
  spyOn,
  setSystemTime,
} from 'bun:test';

describe('suite', () => {
  beforeAll(() => { /* setup */ });
  afterAll(() => { /* cleanup */ });

  test('basic', () => {
    expect(1 + 1).toBe(2);
  });

  test.skip('skipped', () => {});
  test.todo('not implemented');
  test.only('focused', () => {});

  test('async', async () => {
    await expect(promise).resolves.toBe('value');
  });

  test('errors', () => {
    expect(() => { throw new Error(); }).toThrow();
  });
});

// Mocking
const fn = mock(() => 42);
expect(fn).toHaveBeenCalled();

// Time mocking
setSystemTime(new Date('2025-01-01'));
```

## Globals

```typescript
// Bun-specific
Bun.version: string
Bun.revision: string
Bun.main: string  // Entry point path
Bun.argv: string[]
Bun.env: Record<string, string>
Bun.cwd(): string
Bun.origin: string
Bun.gc(force?: boolean): void
Bun.nanoseconds(): bigint
Bun.sleep(ms: number): Promise<void>
Bun.sleepSync(ms: number): void
Bun.peek(promise: Promise<T>): T | Promise<T>
Bun.which(command: string): string | null
Bun.openInEditor(file: string, options?: { line?: number, column?: number }): void

// Import meta
import.meta.dir: string  // Directory of current file
import.meta.file: string  // Name of current file
import.meta.path: string  // Full path of current file
import.meta.url: string  // file:// URL
import.meta.main: boolean  // Is this the entry point?
import.meta.env: Record<string, string>
```
