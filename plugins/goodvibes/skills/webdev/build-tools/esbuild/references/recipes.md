# esbuild Recipes

## React Application

```javascript
import * as esbuild from 'esbuild';

const isDev = process.env.NODE_ENV === 'development';

const ctx = await esbuild.context({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  outdir: 'dist',

  // React
  jsx: 'automatic',
  jsxImportSource: 'react',

  // Target
  target: ['es2020'],
  platform: 'browser',
  format: 'esm',

  // Output
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',

  // Development
  sourcemap: true,
  minify: !isDev,

  // Environment
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
  },

  // Assets
  loader: {
    '.png': 'file',
    '.jpg': 'file',
    '.svg': 'file',
    '.woff2': 'file',
  },
  assetNames: 'assets/[name]-[hash]',
});

if (isDev) {
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 3000 });
  console.log(`Server: http://localhost:${port}`);
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
```

## Library Build

```javascript
import * as esbuild from 'esbuild';

// Build both ESM and CJS
const shared = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  sourcemap: true,
  minify: true,
  target: ['es2020'],
  external: ['react', 'react-dom'], // Peer dependencies
};

// ESM build
await esbuild.build({
  ...shared,
  format: 'esm',
  outfile: 'dist/index.mjs',
});

// CJS build
await esbuild.build({
  ...shared,
  format: 'cjs',
  outfile: 'dist/index.cjs',
});

console.log('Library built!');
```

## Node.js Server

```javascript
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  outfile: 'dist/server.js',

  platform: 'node',
  target: 'node20',
  format: 'esm',

  // Keep node_modules external
  packages: 'external',

  // Source maps for debugging
  sourcemap: true,

  // Banner for ESM compatibility
  banner: {
    js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
    `.trim(),
  },
});
```

## CLI Tool

```javascript
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  outfile: 'dist/cli.js',

  platform: 'node',
  target: 'node18',
  format: 'esm',

  packages: 'external',
  minify: true,

  // Make executable
  banner: {
    js: '#!/usr/bin/env node',
  },
});

// Make executable on Unix
import { chmod } from 'fs/promises';
await chmod('dist/cli.js', 0o755);
```

## Web Worker

```javascript
// Main bundle
await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  define: {
    WORKER_URL: JSON.stringify('/worker.js'),
  },
});

// Worker bundle (separate)
await esbuild.build({
  entryPoints: ['src/worker.ts'],
  bundle: true,
  outfile: 'dist/worker.js',
  format: 'iife',
  platform: 'browser',
});
```

## Multiple Entry Points with HTML

```javascript
import * as esbuild from 'esbuild';
import { htmlPlugin } from '@craftamap/esbuild-plugin-html';

await esbuild.build({
  entryPoints: {
    index: 'src/pages/index.tsx',
    about: 'src/pages/about.tsx',
    dashboard: 'src/pages/dashboard.tsx',
  },
  bundle: true,
  outdir: 'dist',
  metafile: true,
  splitting: true,
  format: 'esm',

  plugins: [
    htmlPlugin({
      files: [
        {
          entryPoints: ['src/pages/index.tsx'],
          filename: 'index.html',
          htmlTemplate: 'public/template.html',
        },
        {
          entryPoints: ['src/pages/about.tsx'],
          filename: 'about.html',
          htmlTemplate: 'public/template.html',
        },
        {
          entryPoints: ['src/pages/dashboard.tsx'],
          filename: 'dashboard.html',
          htmlTemplate: 'public/template.html',
        },
      ],
    }),
  ],
});
```

## CSS with PostCSS

```javascript
import * as esbuild from 'esbuild';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

const postcssPlugin = {
  name: 'postcss',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = await fs.promises.readFile(args.path, 'utf8');

      const result = await postcss([
        tailwindcss(),
        autoprefixer(),
      ]).process(css, { from: args.path });

      return {
        contents: result.css,
        loader: 'css',
      };
    });
  },
};

await esbuild.build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  outdir: 'dist',
  plugins: [postcssPlugin],
});
```

## Development Server with Live Reload

```javascript
import * as esbuild from 'esbuild';
import http from 'http';
import { WebSocketServer } from 'ws';

const clients = new Set();

// WebSocket server for live reload
const wss = new WebSocketServer({ port: 8001 });
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
});

const liveReloadPlugin = {
  name: 'live-reload',
  setup(build) {
    build.onEnd(() => {
      clients.forEach((ws) => ws.send('reload'));
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  outdir: 'dist',
  sourcemap: true,

  plugins: [liveReloadPlugin],

  // Inject live reload script
  banner: {
    js: `
      if (typeof WebSocket !== 'undefined') {
        new WebSocket('ws://localhost:8001').onmessage = () => location.reload();
      }
    `,
  },
});

await ctx.watch();
await ctx.serve({ servedir: 'dist', port: 3000 });

console.log('Dev server: http://localhost:3000');
```

## Conditional Builds

```javascript
import * as esbuild from 'esbuild';

const mode = process.env.BUILD_MODE || 'development';

const configs = {
  development: {
    minify: false,
    sourcemap: true,
    define: { DEBUG: 'true' },
  },
  production: {
    minify: true,
    sourcemap: 'linked',
    define: { DEBUG: 'false' },
    drop: ['console', 'debugger'],
  },
  analyze: {
    minify: true,
    metafile: true,
    sourcemap: false,
  },
};

const result = await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/bundle.js',
  ...configs[mode],
});

if (mode === 'analyze' && result.metafile) {
  console.log(await esbuild.analyzeMetafile(result.metafile));
}
```

## Monorepo Build

```javascript
import * as esbuild from 'esbuild';
import { glob } from 'glob';

// Find all package entry points
const packages = await glob('packages/*/src/index.ts');

await Promise.all(
  packages.map(async (entry) => {
    const pkg = entry.split('/')[1];

    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      outdir: `packages/${pkg}/dist`,
      format: 'esm',
      external: [
        // Externalize sibling packages
        '@myorg/*',
        // Externalize dependencies
        ...Object.keys(require(`./packages/${pkg}/package.json`).dependencies || {}),
      ],
    });

    console.log(`Built: ${pkg}`);
  })
);
```

## TypeScript Paths

```javascript
import * as esbuild from 'esbuild';
import { TsconfigPathsPlugin } from 'tsconfig-paths-webpack-plugin';

// Or manually resolve paths
const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
const paths = tsconfig.compilerOptions?.paths || {};

const alias = {};
for (const [key, [value]] of Object.entries(paths)) {
  const aliasKey = key.replace('/*', '');
  const aliasValue = path.resolve(value.replace('/*', ''));
  alias[aliasKey] = aliasValue;
}

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/bundle.js',
  plugins: [
    {
      name: 'alias',
      setup(build) {
        for (const [from, to] of Object.entries(alias)) {
          build.onResolve({ filter: new RegExp(`^${from}`) }, (args) => ({
            path: args.path.replace(from, to),
          }));
        }
      },
    },
  ],
});
```
