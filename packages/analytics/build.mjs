/**
 * Build the goodvibes-analytics server bundle.
 *
 * esbuild pattern per §5.1 with a single external — sql.js (does not bundle
 * cleanly; it ships as a runtime dep in server/package.json). sql-wasm.wasm is
 * copied to server/wasm/ (sql.js loads its WASM at runtime; every server
 * imports core/telemetry). Output is committed under
 * plugins/goodvibes/server/analytics/.
 */

import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { copyFile, mkdir } from 'fs/promises';
import { createRequire } from 'module';

// Version is injected from the single source of truth (plugin.json) so the
// SERVER_VERSION constant can never drift from releases again (2.0.2 lesson).
const PLUGIN_VERSION = JSON.parse(
  readFileSync(new URL('../../plugins/goodvibes/.claude-plugin/plugin.json', import.meta.url), 'utf8'),
).version;


const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serverDir = join(__dirname, '../../plugins/goodvibes/server/analytics');
const wasmDir = join(serverDir, 'wasm');

async function tryCopy(resolveSpec, destName) {
  try {
    const src = require.resolve(resolveSpec);
    await mkdir(wasmDir, { recursive: true });
    await copyFile(src, join(wasmDir, destName));
    console.log(`Copied: ${destName}`);
  } catch {
    console.warn(`Skipped (not installed yet): ${destName}`);
  }
}

const SHARED = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  // Bundle module-key comments are rendered relative to esbuild's working
  // directory — pin it to the repo root so output is byte-identical no
  // matter where the build is invoked from.
  absWorkingDir: join(__dirname, '../..'),
  sourcemap: true,
  minify: false,
  keepNames: true,
  define: { __GV_VERSION__: JSON.stringify(PLUGIN_VERSION) },
  external: ['sql.js'],
};

async function build() {
  await mkdir(serverDir, { recursive: true });

  // MCP server bundle (answers initialize + serves the 7 tools over stdio).
  await esbuild.build({
    ...SHARED,
    entryPoints: [join(__dirname, 'src/index.ts')],
    outfile: join(serverDir, 'index.cjs'),
  });
  console.log('Build completed: plugins/goodvibes/server/analytics/index.cjs');

  await tryCopy('sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
