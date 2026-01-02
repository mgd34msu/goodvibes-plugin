# Rollup Plugins Reference

## Official Plugins (@rollup/plugin-*)

### @rollup/plugin-node-resolve

Resolve node_modules imports:

```bash
npm install --save-dev @rollup/plugin-node-resolve
```

```javascript
import resolve from '@rollup/plugin-node-resolve';

plugins: [
  resolve({
    // Resolve browser field in package.json
    browser: true,

    // Prefer Node.js builtins
    preferBuiltins: true,

    // File extensions to resolve
    extensions: ['.mjs', '.js', '.json', '.ts', '.tsx'],

    // Resolve only these modules
    only: ['some-module'],

    // Custom module directories
    moduleDirectories: ['node_modules'],

    // Main fields to check
    mainFields: ['module', 'main', 'browser'],

    // Export conditions
    exportConditions: ['import', 'default'],
  }),
]
```

### @rollup/plugin-commonjs

Convert CommonJS to ESM:

```bash
npm install --save-dev @rollup/plugin-commonjs
```

```javascript
import commonjs from '@rollup/plugin-commonjs';

plugins: [
  commonjs({
    // Include/exclude patterns
    include: /node_modules/,
    exclude: ['node_modules/lodash-es/**'],

    // Extensions to consider
    extensions: ['.js', '.cjs'],

    // Transform require() calls
    transformMixedEsModules: true,

    // Handle default exports
    requireReturnsDefault: 'auto', // 'auto', 'preferred', true, false

    // Dynamic require support
    dynamicRequireTargets: ['node_modules/package/**/*.js'],

    // Ignore conditional requires
    ignoreDynamicRequires: true,
  }),
]
```

### @rollup/plugin-typescript

TypeScript compilation:

```bash
npm install --save-dev @rollup/plugin-typescript typescript tslib
```

```javascript
import typescript from '@rollup/plugin-typescript';

plugins: [
  typescript({
    // tsconfig file
    tsconfig: './tsconfig.json',

    // Override tsconfig options
    compilerOptions: {
      declaration: true,
      declarationDir: 'dist/types',
    },

    // Include/exclude
    include: ['src/**/*.ts'],
    exclude: ['**/*.test.ts'],

    // Output declarations
    declaration: true,
    declarationDir: 'dist/types',

    // Root directory
    rootDir: 'src',
  }),
]
```

### @rollup/plugin-terser

Minification:

```bash
npm install --save-dev @rollup/plugin-terser
```

```javascript
import terser from '@rollup/plugin-terser';

plugins: [
  terser({
    // Terser options
    compress: {
      drop_console: true,
      drop_debugger: true,
      pure_funcs: ['console.log'],
    },
    mangle: {
      properties: false,
    },
    format: {
      comments: false,
    },
    // Include/exclude
    include: [/\.js$/],
    exclude: ['node_modules/**'],
  }),
]
```

### @rollup/plugin-json

Import JSON files:

```bash
npm install --save-dev @rollup/plugin-json
```

```javascript
import json from '@rollup/plugin-json';

plugins: [
  json({
    // Generate named exports
    namedExports: true,

    // Compact output
    compact: true,

    // Exclude patterns
    exclude: ['node_modules/**'],
  }),
]
```

### @rollup/plugin-replace

Replace strings at build time:

```bash
npm install --save-dev @rollup/plugin-replace
```

```javascript
import replace from '@rollup/plugin-replace';

plugins: [
  replace({
    // Prevent assignment warnings
    preventAssignment: true,

    // Replacements
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VERSION__: JSON.stringify(require('./package.json').version),

    // Object syntax
    values: {
      __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    },

    // Delimiter for word boundaries
    delimiters: ['', ''],
  }),
]
```

### @rollup/plugin-alias

Path aliases:

```bash
npm install --save-dev @rollup/plugin-alias
```

```javascript
import alias from '@rollup/plugin-alias';
import path from 'path';

plugins: [
  alias({
    entries: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: '@components', replacement: path.resolve(__dirname, 'src/components') },
      { find: 'lodash', replacement: 'lodash-es' },
      { find: /^@utils\/(.*)/, replacement: path.resolve(__dirname, 'src/utils/$1') },
    ],
  }),
]
```

### @rollup/plugin-babel

Babel transpilation:

```bash
npm install --save-dev @rollup/plugin-babel @babel/core @babel/preset-env
```

```javascript
import { babel } from '@rollup/plugin-babel';

plugins: [
  babel({
    babelHelpers: 'bundled', // 'bundled', 'runtime', 'inline', 'external'
    exclude: 'node_modules/**',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    presets: ['@babel/preset-env', '@babel/preset-react'],
    plugins: [],
  }),
]
```

### @rollup/plugin-image

Import images:

```bash
npm install --save-dev @rollup/plugin-image
```

```javascript
import image from '@rollup/plugin-image';

plugins: [
  image({
    // DOM option - import as Image element
    dom: false,

    // Exclude patterns
    exclude: ['**/*.svg'],
  }),
]
```

### @rollup/plugin-url

Import files as URLs:

```bash
npm install --save-dev @rollup/plugin-url
```

```javascript
import url from '@rollup/plugin-url';

plugins: [
  url({
    // Inline files smaller than limit
    limit: 10 * 1024, // 10kb

    // Include patterns
    include: ['**/*.svg', '**/*.png', '**/*.jpg'],

    // Output directory
    destDir: 'dist/assets',

    // Public path
    publicPath: '/assets/',
  }),
]
```

## Community Plugins

### rollup-plugin-peer-deps-external

Auto-externalize peer dependencies:

```bash
npm install --save-dev rollup-plugin-peer-deps-external
```

```javascript
import peerDepsExternal from 'rollup-plugin-peer-deps-external';

plugins: [
  peerDepsExternal({
    includeDependencies: false, // Also include dependencies
  }),
]
```

### rollup-plugin-dts

Bundle TypeScript declarations:

```bash
npm install --save-dev rollup-plugin-dts
```

```javascript
import { dts } from 'rollup-plugin-dts';

// Separate config for types
export default {
  input: 'dist/types/index.d.ts',
  output: { file: 'dist/index.d.ts', format: 'es' },
  plugins: [dts()],
};
```

### rollup-plugin-postcss

CSS with PostCSS:

```bash
npm install --save-dev rollup-plugin-postcss
```

```javascript
import postcss from 'rollup-plugin-postcss';

plugins: [
  postcss({
    // Extract to file
    extract: 'styles.css',

    // Or inject into head
    inject: true,

    // CSS Modules
    modules: true,

    // Minimize
    minimize: true,

    // PostCSS plugins
    plugins: [require('autoprefixer')],
  }),
]
```

### rollup-plugin-visualizer

Bundle analysis:

```bash
npm install --save-dev rollup-plugin-visualizer
```

```javascript
import { visualizer } from 'rollup-plugin-visualizer';

plugins: [
  visualizer({
    filename: 'stats.html',
    open: true,
    gzipSize: true,
  }),
]
```

### @svgr/rollup

SVG as React components:

```bash
npm install --save-dev @svgr/rollup
```

```javascript
import svgr from '@svgr/rollup';

plugins: [
  svgr({
    svgo: true,
    titleProp: true,
    ref: true,
  }),
]
```

### rollup-plugin-esbuild

Use esbuild for transform:

```bash
npm install --save-dev rollup-plugin-esbuild
```

```javascript
import esbuild from 'rollup-plugin-esbuild';

plugins: [
  esbuild({
    target: 'es2020',
    minify: true,
    jsx: 'automatic',
    tsconfig: 'tsconfig.json',
  }),
]
```

### rollup-plugin-copy

Copy files:

```bash
npm install --save-dev rollup-plugin-copy
```

```javascript
import copy from 'rollup-plugin-copy';

plugins: [
  copy({
    targets: [
      { src: 'public/*', dest: 'dist' },
      { src: 'assets/fonts/**/*', dest: 'dist/fonts' },
    ],
    hook: 'writeBundle',
  }),
]
```

### rollup-plugin-delete

Clean output directory:

```bash
npm install --save-dev rollup-plugin-delete
```

```javascript
import del from 'rollup-plugin-delete';

plugins: [
  del({
    targets: 'dist/*',
    runOnce: true,
  }),
]
```

## Plugin Order

Plugins run in order. Recommended order:

```javascript
plugins: [
  // 1. Clean
  del({ targets: 'dist/*' }),

  // 2. Resolve imports
  peerDepsExternal(),
  resolve(),
  commonjs(),

  // 3. Transform
  typescript(),
  // or babel(),
  // or esbuild(),

  // 4. Handle assets
  json(),
  postcss(),
  image(),

  // 5. Replace/define
  replace({ ... }),

  // 6. Optimize (production only)
  terser(),

  // 7. Analyze
  visualizer(),

  // 8. Copy files
  copy({ ... }),
]
```
