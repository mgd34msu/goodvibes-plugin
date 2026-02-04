const precision = require('./dist/index.cjs');
const fs = require('fs');

async function test() {
  console.log('Available exports:', Object.keys(precision));
  const { TreeSitterCore } = precision.core;
  
  const core = new TreeSitterCore();
  await core.init();
  
  const content = fs.readFileSync('/home/buzzkill/Projects/goodvibes-plugin/new_pe_tests/test.py', 'utf-8');
  console.log('Parsing Python file...');
  
  try {
    const tree = await core.parse(content, '/home/buzzkill/Projects/goodvibes-plugin/new_pe_tests/test.py');
    console.log('Parse successful!');
    
    const symbols = core.getSymbols(tree, '/home/buzzkill/Projects/goodvibes-plugin/new_pe_tests/test.py');
    console.log('\nExtracted symbols:');
    console.log(JSON.stringify(symbols, null, 2));
    
    const outline = core.getOutline(tree, '/home/buzzkill/Projects/goodvibes-plugin/new_pe_tests/test.py');
    console.log('\nExtracted outline:');
    console.log(JSON.stringify(outline, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

test();
