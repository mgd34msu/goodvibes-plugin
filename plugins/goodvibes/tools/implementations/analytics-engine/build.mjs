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
  external: ['sql.js', 'ink', 'react', 'react-devtools-core', 'yoga-wasm-web', 'chokidar', 'zod', '@modelcontextprotocol/sdk'],
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
    // No shebang banner — invoked via `node` in .mcp.json, not directly
    await esbuild.build({
      ...sharedOptions,
      entryPoints: [join(__dirname, 'src/server.ts')],
      outfile: join(__dirname, 'dist/server.js'),
    });
    console.log('Build completed: dist/server.js');

    // Build mini dashboard standalone
    await esbuild.build({
      ...sharedOptions,
      banner: binBanner,
      entryPoints: [join(__dirname, 'src/mini.ts')],
      outfile: join(__dirname, 'dist/mini.js'),
    });
    console.log('Build completed: dist/mini.js');

    // Build full TUI standalone
    await esbuild.build({
      ...sharedOptions,
      banner: binBanner,
      entryPoints: [join(__dirname, 'src/full.ts')],
      outfile: join(__dirname, 'dist/full.js'),
    });
    console.log('Build completed: dist/full.js');

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
