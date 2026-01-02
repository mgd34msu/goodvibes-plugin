# tsup Configuration Options Reference

## All Options

```typescript
import { defineConfig, Options } from 'tsup';

export default defineConfig({
  // Entry points
  entry: ['src/index.ts'],

  // Output directory
  outDir: 'dist',

  // Output formats
  format: ['esm', 'cjs', 'iife'],

  // Target environment
  target: 'es2020',

  // Platform
  platform: 'browser', // 'browser' | 'node' | 'neutral'

  // TypeScript declarations
  dts: true,

  // Source maps
  sourcemap: true, // boolean | 'inline'

  // Minification
  minify: true, // boolean | 'terser'

  // Clean output directory
  clean: true,

  // Split code
  splitting: true,

  // Bundle dependencies
  bundle: true,

  // External packages
  external: ['react'],

  // Force bundle packages
  noExternal: ['lodash'],

  // Skip node_modules
  skipNodeModulesBundle: true,

  // Global name for IIFE
  globalName: 'MyLib',

  // Define globals
  define: {
    'process.env.NODE_ENV': '"production"',
  },

  // Environment variables
  env: {
    API_URL: 'https://api.example.com',
  },

  // Inject files
  inject: ['./shims.js'],

  // Entry point naming
  entryNames: '[name]',

  // Chunk naming
  chunkNames: '[name]-[hash]',

  // Banner
  banner: {
    js: '/* My Library */',
    css: '/* Styles */',
  },

  // Footer
  footer: {
    js: '/* End */',
  },

  // Loaders
  loader: {
    '.png': 'file',
    '.svg': 'dataurl',
  },

  // esbuild plugins
  esbuildPlugins: [],

  // esbuild options override
  esbuildOptions(options, context) {
    options.jsx = 'automatic';
  },

  // Watch mode
  watch: false, // boolean | string | string[]

  // Ignore watch patterns
  ignoreWatch: ['**/*.test.ts'],

  // Success callback
  onSuccess: 'node dist/index.js', // string | () => Promise<void>

  // Shims for ESM/CJS interop
  shims: true,

  // CJS interop
  cjsInterop: true,

  // Generate metafile
  metafile: true,

  // Treeshaking
  treeshake: true, // boolean | TreeshakingOptions

  // Keep names (for debugging)
  keepNames: true,

  // Pure functions (for tree shaking)
  pure: ['console.log'],

  // Replace globals
  replaceNodeEnv: true,

  // Terser options (when minify: 'terser')
  terserOptions: {},

  // Output extension
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.mjs',
    };
  },

  // Experimental features
  experimentalDts: true,

  // Silent mode
  silent: false,

  // Config file
  config: 'tsup.config.ts',

  // tsconfig path
  tsconfig: 'tsconfig.json',

  // Public path for assets
  publicPath: '/',

  // Alias
  alias: {
    '@': './src',
  },

  // Name for build (logging)
  name: 'MyLibrary',
});
```

## Entry Options

### Array Entry

```typescript
entry: ['src/index.ts', 'src/cli.ts']
// Output: dist/index.js, dist/cli.js
```

### Named Entry

```typescript
entry: {
  main: 'src/index.ts',
  worker: 'src/worker.ts',
}
// Output: dist/main.js, dist/worker.js
```

### Glob Entry

```typescript
entry: ['src/**/*.ts']
// Bundles all TypeScript files
```

## Format Options

### ESM (ES Modules)

```typescript
format: ['esm']
// Output: .mjs files (or .js with type: module)
```

### CJS (CommonJS)

```typescript
format: ['cjs']
// Output: .cjs files
```

### IIFE (Immediately Invoked Function Expression)

```typescript
format: ['iife'],
globalName: 'MyLibrary',
// Output: .global.js files
// Access via window.MyLibrary
```

### All Formats

```typescript
format: ['esm', 'cjs', 'iife']
```

## DTS Options

### Basic

```typescript
dts: true
// Generates .d.ts files
```

### With Options

```typescript
dts: {
  // Entry for declarations
  entry: 'src/index.ts',

  // Resolve external types
  resolve: true,

  // Custom compiler options
  compilerOptions: {
    strict: true,
    skipLibCheck: true,
  },

  // Only generate declarations
  only: false,
}
```

### Only Declarations

```typescript
dts: { only: true }
// Only generates .d.ts, no JS output
```

## Target Options

### Browser Targets

```typescript
target: 'es2020'
target: ['es2020', 'chrome90', 'firefox88', 'safari14']
```

### Node.js Targets

```typescript
target: 'node18'
target: 'node20'
```

### Combination

```typescript
target: ['es2020', 'node18']
```

## External Options

### String Patterns

```typescript
external: ['react', 'react-dom', 'lodash']
```

### Regex Patterns

```typescript
external: [/^@radix-ui/, /^lodash/]
```

### Function

```typescript
external: (id) => id.startsWith('node:')
```

### noExternal (Force Bundle)

```typescript
noExternal: ['lodash-es']
// Bundle lodash-es even if in node_modules
```

## Watch Options

### Basic

```typescript
watch: true
```

### Specific Paths

```typescript
watch: ['src/**/*.ts', 'lib/**/*.ts']
```

### Ignore Patterns

```typescript
ignoreWatch: [
  '**/*.test.ts',
  '**/__tests__/**',
  'node_modules/**',
]
```

### Success Callback

```typescript
// Command string
onSuccess: 'node dist/index.js'

// Async function
onSuccess: async () => {
  console.log('Build complete!');
  await runTests();
}
```

## Minification Options

### Basic

```typescript
minify: true // Uses esbuild minifier
```

### Terser

```typescript
minify: 'terser',
terserOptions: {
  compress: {
    drop_console: true,
    drop_debugger: true,
  },
  mangle: true,
  format: {
    comments: false,
  },
}
```

## Output Extension

### Custom Extensions

```typescript
outExtension({ format }) {
  if (format === 'esm') {
    return { js: '.mjs', dts: '.d.mts' };
  }
  if (format === 'cjs') {
    return { js: '.cjs', dts: '.d.cts' };
  }
  return { js: '.js' };
}
```

## esbuild Integration

### Plugins

```typescript
import { sassPlugin } from 'esbuild-sass-plugin';

esbuildPlugins: [
  sassPlugin(),
]
```

### Options Override

```typescript
esbuildOptions(options, context) {
  options.jsx = 'automatic';
  options.jsxImportSource = 'react';
  options.drop = ['console', 'debugger'];
  options.legalComments = 'none';
}
```

## CLI Arguments

| Flag | Config Equivalent |
|------|-------------------|
| `--entry` | `entry` |
| `--format` | `format` |
| `--dts` | `dts: true` |
| `--minify` | `minify: true` |
| `--sourcemap` | `sourcemap: true` |
| `--target` | `target` |
| `--watch` | `watch: true` |
| `--clean` | `clean: true` |
| `--out-dir` | `outDir` |
| `--external` | `external` |
| `--global-name` | `globalName` |
| `--onSuccess` | `onSuccess` |
| `--no-splitting` | `splitting: false` |
| `--shims` | `shims: true` |
| `--silent` | `silent: true` |

## TypeScript Config

Recommended tsconfig.json for tsup:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "strict": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```
