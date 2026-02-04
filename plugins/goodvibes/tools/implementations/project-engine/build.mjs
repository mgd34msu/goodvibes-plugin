import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cp, mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function build() {
  try {
    await esbuild.build({
      entryPoints: [join(__dirname, 'src/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: join(__dirname, 'dist/index.cjs'),
      sourcemap: true,
      external: ['better-sqlite3'],
      minify: false,
      keepNames: true,
    });
    
    // Copy better-sqlite3 native module to dist/node_modules
    const nodeModulesDir = join(__dirname, 'dist/node_modules');
    await mkdir(nodeModulesDir, { recursive: true });
    
    const src = join(__dirname, 'node_modules/better-sqlite3');
    const dest = join(nodeModulesDir, 'better-sqlite3');
    try {
      await cp(src, dest, { recursive: true });
      console.log('Copied: better-sqlite3 native module');
    } catch (e) {
      console.warn('Warning: Could not copy better-sqlite3:', e.message);
    }
    
    console.log('Build completed: dist/index.cjs');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
