import { TreeSitterCore } from './src/core/tree-sitter.ts';
import { readFileSync } from 'fs';

async function test() {
  console.log('Testing Python symbol extraction...');
  
  const core = new TreeSitterCore();
  await core.init();
  
  const content = readFileSync('/home/buzzkill/Projects/goodvibes-plugin/new_pe_tests/test.py', 'utf-8');
  
  try {
    const tree = await core.parse(content, '/home/buzzkill/Projects/goodvibes-plugin/new_pe_tests/test.py');
    console.log('✓ Parse successful!');
    
    const symbols = core.getSymbols(tree, '/home/buzzkill/Projects/goodvibes-plugin/new_pe_tests/test.py');
    console.log('✓ Symbol extraction successful!');
    console.log('\nExtracted symbols:');
    symbols.forEach(s => {
      console.log(`  - ${s.kind}: ${s.name} at line ${s.start.line}`);
    });
    
    const outline = core.getOutline(tree, '/home/buzzkill/Projects/goodvibes-plugin/new_pe_tests/test.py');
    console.log('\n✓ Outline extraction successful!');
    console.log('\nOutline:');
    outline.forEach(node => {
      console.log(`  - ${node.kind}: ${node.name}`);
      if (node.children) {
        node.children.forEach(child => {
          console.log(`    - ${child.kind}: ${child.name}`);
        });
      }
    });
    
    console.log('\n✓ All tests passed!');
  } catch (error) {
    console.error('✗ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
