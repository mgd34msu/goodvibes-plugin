import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
      external: ['@modelcontextprotocol/sdk', 'fuse.js', 'js-yaml'],
      minify: false,
      keepNames: true,
    });
    console.log('Build completed: dist/index.cjs');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
