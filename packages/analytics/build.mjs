/**
 * Build the goodvibes-analytics server bundle.
 *
 * esbuild pattern per §5.1 with analytics' proven external list — ink, react,
 * react-devtools-core, yoga-wasm-web, sql.js (none bundle cleanly; they ship as
 * runtime deps in server/package.json). sql-wasm.wasm is copied to server/wasm/
 * (sql.js loads its WASM at runtime; every server imports core/telemetry).
 * Output is committed under plugins/goodvibes-analytics/server/.
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { copyFile, mkdir } from 'fs/promises';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serverDir = join(__dirname, '../../plugins/goodvibes-analytics/server');
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
  sourcemap: true,
  minify: false,
  keepNames: true,
  external: ['ink', 'react', 'react-devtools-core', 'yoga-wasm-web', 'sql.js'],
};

async function build() {
  await mkdir(serverDir, { recursive: true });

  // MCP server bundle (answers initialize + serves the 7 tools over stdio).
  await esbuild.build({
    ...SHARED,
    entryPoints: [join(__dirname, 'src/index.ts')],
    outfile: join(serverDir, 'index.cjs'),
  });
  console.log('Build completed: plugins/goodvibes-analytics/server/index.cjs');

  // Mini-dashboard pane bundle, spawned by the `dashboard` tool via tmux.
  // (The full interactive ink TUI is deferred in the alpha — no @types/react.)
  await esbuild.build({
    ...SHARED,
    entryPoints: [join(__dirname, 'src/engine/mini.ts')],
    outfile: join(serverDir, 'mini.cjs'),
  });
  console.log('Build completed: plugins/goodvibes-analytics/server/mini.cjs');

  await tryCopy('sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
