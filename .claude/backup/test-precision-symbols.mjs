import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load the built precision-engine
const { handlePrecisionSymbols } = require('./plugins/goodvibes/tools/implementations/precision-engine/dist/index.cjs');

async function test() {
  console.log('Testing precision_symbols with exported_only filter...\n');

  const result = await handlePrecisionSymbols({
    mode: 'document',
    files: ['test-export-detection.ts'],
    exported_only: true,
    output: {
      mode: 'names_only'
    }
  });

  const parsed = JSON.parse(result.content[0].text);
  console.log('Result:', JSON.stringify(parsed, null, 2));

  const symbols = parsed.data.symbols;
  console.log('\nExported symbols found:', symbols.length);
  symbols.forEach(s => console.log(`  - ${s.name} (${s.kind})`));

  console.log('\nExpected 5 symbols:');
  console.log('  - directExport (function)');
  console.log('  - namedExport (function)');
  console.log('  - defaultExport (function)');
  console.log('  - DirectClass (class)');
  console.log('  - ReExportClass (class)');
}

test().catch(console.error);
