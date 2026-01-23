const { handleDiscover } = require('./dist/index.cjs');

async function test() {
  console.log('Testing discover with base_path...');
  
  const result = await handleDiscover({
    queries: [{
      id: 'find_md',
      type: 'glob',
      patterns: ['*.md']
    }],
    base_path: 'new_tool_test',
    output_mode: 'files_only'
  });
  
  console.log('Result:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
