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
// Tree-sitter grammar .wasm assets are committed source under packages/intel/wasm/
// (lane 1: copied from v1 precision-engine's built dist — see lane report for the
// pinned web-tree-sitter version note) rather than resolved from the
// `tree-sitter-wasms` npm package, which is not a workspace dependency (the
// grammars are prebuilt binaries, not build output of that package here).
const localWasmDir = join(__dirname, 'wasm');

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

async function tryCopyLocal(srcName, destName = srcName) {
  try {
    await mkdir(wasmDir, { recursive: true });
    await copyFile(join(localWasmDir, srcName), join(wasmDir, destName));
    console.log(`Copied: ${destName}`);
  } catch {
    console.warn(`Skipped (not found under packages/intel/wasm/): ${destName}`);
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
    // 'web-tree-sitter' is external for a permanent reason (lane 1, verified
    // empirically): it is an Emscripten/WASM loader that resolves its own
    // runtime .wasm via `import.meta.url` internally; esbuild's CJS output
    // format zeroes `import.meta`, which broke that internal resolution when
    // bundled ("filename ... Received undefined"). Kept unbundled so it runs
    // as its own ESM/CJS module with working self-resolution — added to
    // plugins/goodvibes-intel/server/package.json's runtime deps accordingly.
    // 'fast-glob' bundles per spec §5.1 now that it is installed.
    external: ['@ast-grep/napi', '@vscode/ripgrep', 'sql.js', 'web-tree-sitter'],
  });
  console.log('Build completed: plugins/goodvibes-intel/server/index.cjs');

  // WASM assets → server/wasm/: tree-sitter grammars + core + sql-wasm.
  // Grammars are committed source under packages/intel/wasm/ (lane 1: copied
  // from v1 precision-engine's dist — see lane report for the pinned
  // web-tree-sitter version note; NOT resolved from the `tree-sitter-wasms`
  // npm package, which is not a workspace dependency here).
  const languages = ['typescript', 'javascript', 'python', 'rust', 'go'];
  for (const lang of languages) {
    await tryCopyLocal(`tree-sitter-${lang}.wasm`);
  }
  await tryCopyLocal('tree-sitter.wasm');
  // web-tree-sitter's own runtime wasm (distinct from the grammar files above),
  // under its real filename — Parser.init() resolves it relative to the
  // executing bundle by default when no locateFile option is given.
  await tryCopy('web-tree-sitter/web-tree-sitter.wasm', 'web-tree-sitter.wasm');
  await tryCopy('sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
