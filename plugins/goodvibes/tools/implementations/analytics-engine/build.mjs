import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir, copyFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const binBanner = { js: '#!/usr/bin/env node' };

/** ESM bundle banner: provides require(), __filename, and __dirname for CJS deps like sql.js. */
const esmBundleBanner = { js: "import { createRequire as __createRequire } from 'module'; import { fileURLToPath as __fileURLToPath } from 'url'; import { dirname as __dirnameFn } from 'path'; const require = __createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __dirnameFn(__filename);" };

const sharedOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  minify: false,
  keepNames: true,
  external: ['sql.js', 'ink', 'react', 'react-devtools-core', 'yoga-wasm-web', 'zod', '@modelcontextprotocol/sdk'],
};

async function build() {
  try {
    await mkdir(join(__dirname, 'dist'), { recursive: true });

    // Build library entry point
    await esbuild.build({
      ...sharedOptions,
      entryPoints: [join(__dirname, 'src/index.ts')],
      outfile: join(__dirname, 'dist/index.js'),
    });
    console.log('Build completed: dist/index.js');

    // Build MCP server entry point (stdio transport)
    // CJS format (like other engines) — avoids ESM dynamic-require issues with sql.js.
    // Bundles ALL deps (no node_modules in plugin installs). Only TUI deps stay external.
    await esbuild.build({
      ...sharedOptions,
      format: 'cjs',
      external: ['ink', 'react', 'react-devtools-core', 'yoga-wasm-web'],
      entryPoints: [join(__dirname, 'src/server.ts')],
      outfile: join(__dirname, 'dist/server.cjs'),
    });
    console.log('Build completed: dist/server.cjs');

    // Build mini dashboard standalone (ESM, for dev with node_modules)
    await esbuild.build({
      ...sharedOptions,
      banner: binBanner,
      entryPoints: [join(__dirname, 'src/mini.ts')],
      outfile: join(__dirname, 'dist/mini.js'),
    });
    console.log('Build completed: dist/mini.js');

    // Build full TUI standalone (ESM, for dev with node_modules) — backward compat
    await esbuild.build({
      ...sharedOptions,
      banner: binBanner,
      entryPoints: [join(__dirname, 'src/full.ts')],
      outfile: join(__dirname, 'dist/full.js'),
    });
    console.log('Build completed: dist/full.js');

    // Build dashboard standalone (ESM, for dev with node_modules)
    await esbuild.build({
      ...sharedOptions,
      banner: binBanner,
      entryPoints: [join(__dirname, 'src/dashboard.ts')],
      outfile: join(__dirname, 'dist/dashboard.js'),
    });
    console.log('Build completed: dist/dashboard.js');

    // Build mini dashboard CJS (all deps bundled for plugin installs — no node_modules)
    await esbuild.build({
      ...sharedOptions,
      format: 'cjs',
      banner: {},
      external: [],
      entryPoints: [join(__dirname, 'src/mini.ts')],
      outfile: join(__dirname, 'dist/mini.cjs'),
    });
    console.log('Build completed: dist/mini.cjs');

    // Build full TUI bundled ESM (backward compat — all deps bundled for plugin installs)
    // ESM format required: ink + yoga-layout use top-level await (incompatible with CJS).
    // createRequire banner: sql.js internally uses require('node:fs') which fails in ESM
    // bundles — the shim makes require() available.
    await esbuild.build({
      ...sharedOptions,
      format: 'esm',
      banner: esmBundleBanner,
      external: [],
      entryPoints: [join(__dirname, 'src/full.ts')],
      outfile: join(__dirname, 'dist/full.mjs'),
    });
    console.log('Build completed: dist/full.mjs');

    // Build dashboard bundled ESM (canonical entry point — all deps bundled for plugin installs)
    // Same ESM/createRequire pattern as full.mjs.
    await esbuild.build({
      ...sharedOptions,
      format: 'esm',
      banner: esmBundleBanner,
      external: [],
      entryPoints: [join(__dirname, 'src/dashboard.ts')],
      outfile: join(__dirname, 'dist/dashboard.mjs'),
    });
    console.log('Build completed: dist/dashboard.mjs');

    // Copy sql.js WASM to dist so it can be loaded at runtime
    const sqlJsWasmSrc = join(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
    const sqlJsWasmDest = join(__dirname, 'dist/sql-wasm.wasm');
    try {
      await copyFile(sqlJsWasmSrc, sqlJsWasmDest);
      console.log('Copied: sql-wasm.wasm');
    } catch (err) {
      console.warn('Warning: Could not copy sql-wasm.wasm:', err instanceof Error ? err.message : String(err));
    }

    console.log('All builds completed successfully.');
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

build();
