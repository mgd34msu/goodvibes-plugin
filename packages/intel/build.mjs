/**
 * Build the goodvibes-intel server bundle.
 *
 * Matches v1's proven esbuild pattern (bundle, platform:node, format:cjs,
 * keepNames, sourcemap), updated for v2: target node20, output committed under
 * plugins/goodvibes-intel/server/. Externals per §5.1: @ast-grep/napi and
 * @vscode/ripgrep (native) and sql.js (loads its WASM at runtime); `typescript`
 * IS bundled (pure JS, one copy, one version — the single compiler host lives in
 * intel). The WASM copy step targets server/wasm/ and copies BOTH the
 * tree-sitter grammars AND sql-wasm.wasm. Copies are best-effort: a source that
 * a later lane has not installed yet is skipped with a warning, so the skeleton
 * bundle builds today and the copy wiring is ready for lanes 1–4.
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { copyFile, mkdir } from 'fs/promises';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serverDir = join(__dirname, '../../plugins/goodvibes-intel/server');
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

async function build() {
  await mkdir(serverDir, { recursive: true });

  await esbuild.build({
    entryPoints: [join(__dirname, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: join(serverDir, 'index.cjs'),
    sourcemap: true,
    minify: false,
    keepNames: true,
    // Native + WASM-loading deps stay external (runtime deps in server/package.json).
    external: ['@ast-grep/napi', '@vscode/ripgrep', 'sql.js'],
  });
  console.log('Build completed: plugins/goodvibes-intel/server/index.cjs');

  // WASM assets → server/wasm/: tree-sitter grammars + core + sql-wasm.
  const languages = ['typescript', 'javascript', 'python', 'rust', 'go'];
  for (const lang of languages) {
    await tryCopy(`tree-sitter-wasms/out/tree-sitter-${lang}.wasm`, `tree-sitter-${lang}.wasm`);
  }
  await tryCopy('web-tree-sitter/tree-sitter.wasm', 'tree-sitter.wasm');
  await tryCopy('sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
