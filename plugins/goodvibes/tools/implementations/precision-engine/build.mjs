import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { copyFile, mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function build() {
  try {
    // Build the bundle
    await esbuild.build({
      entryPoints: [join(__dirname, 'src/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: join(__dirname, 'dist/index.cjs'),
      sourcemap: true,
      external: ['@ast-grep/napi', '@vscode/ripgrep'],
      minify: false,
      keepNames: true,
    });
    
    // Copy WASM files to dist
    const wasmDir = join(__dirname, 'dist/wasm');
    await mkdir(wasmDir, { recursive: true });
    
    const languages = ['typescript', 'javascript', 'python', 'rust', 'go'];
    for (const lang of languages) {
      const src = join(__dirname, `node_modules/tree-sitter-wasms/out/tree-sitter-${lang}.wasm`);
      const dest = join(wasmDir, `tree-sitter-${lang}.wasm`);
      try {
        await copyFile(src, dest);
        console.log(`Copied: tree-sitter-${lang}.wasm`);
      } catch (e) {
        console.warn(`Warning: Could not copy tree-sitter-${lang}.wasm`);
      }
    }
    
    // Copy core tree-sitter.wasm from web-tree-sitter
    const coreSrc = join(__dirname, 'node_modules/web-tree-sitter/tree-sitter.wasm');
    const coreDest = join(__dirname, 'dist/tree-sitter.wasm');
    try {
      await copyFile(coreSrc, coreDest);
      console.log('Copied: tree-sitter.wasm (core)');
    } catch (e) {
      console.warn('Warning: Could not copy tree-sitter.wasm (core):', e.message);
    }
    
    // Copy sql.js WASM to dist so it can be loaded at runtime
    const sqlJsWasmSrc = join(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
    const sqlJsWasmDest = join(__dirname, 'dist/sql-wasm.wasm');
    try {
      await copyFile(sqlJsWasmSrc, sqlJsWasmDest);
      console.log('Copied: sql-wasm.wasm');
    } catch (e) {
      console.warn('Warning: Could not copy sql-wasm.wasm:', e.message);
    }

    console.log('Build completed: dist/index.cjs');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
