import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir, copyFile } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const binBanner = { js: '#!/usr/bin/env node' };

const sharedOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  sourcemap: true,
  minify: false,
  keepNames: true,
  external: ['sql.js', 'ink', 'react', 'react-devtools-core', 'yoga-wasm-web'],
};

async function build() {
  try {
    await mkdir(join(__dirname, 'dist'), { recursive: true });

    // Build main daemon + MCP server
    await esbuild.build({
      ...sharedOptions,
      entryPoints: [join(__dirname, 'src/index.ts')],
      outfile: join(__dirname, 'dist/index.js'),
    });
    console.log('Build completed: dist/index.js');

    // Build mini dashboard standalone
    await esbuild.build({
      ...sharedOptions,
      banner: binBanner,
      entryPoints: [join(__dirname, 'src/tui/mini/renderer.ts')],
      outfile: join(__dirname, 'dist/mini.js'),
    });
    console.log('Build completed: dist/mini.js');

    // Build full TUI standalone
    await esbuild.build({
      ...sharedOptions,
      banner: binBanner,
      entryPoints: [join(__dirname, 'src/tui/full/app.tsx')],
      outfile: join(__dirname, 'dist/full.js'),
    });
    console.log('Build completed: dist/full.js');

    // Copy sql.js WASM to dist so it can be loaded at runtime
    const sqlJsWasmSrc = join(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
    const sqlJsWasmDest = join(__dirname, 'dist/sql-wasm.wasm');
    try {
      await copyFile(sqlJsWasmSrc, sqlJsWasmDest);
      console.log('Copied: sql-wasm.wasm');
    } catch (e) {
      console.warn('Warning: Could not copy sql-wasm.wasm:', e.message);
    }

    console.log('All builds completed successfully.');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
