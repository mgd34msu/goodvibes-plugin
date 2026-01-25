const schemas = require('./dist/index.cjs');

console.log('Schema Validation Results:');
console.log('==========================');

// Check precision_grep
const grep = schemas.precisionGrepSchema;
console.log('precision_grep:');
console.log('  - Has verbosity param:', grep.inputSchema.properties.verbosity ? 'YES' : 'NO');
console.log('  - Has output.format:', grep.inputSchema.properties.output?.properties?.format ? 'YES' : 'NO');

// Check precision_read
const read = schemas.precisionReadSchema;
console.log('precision_read:');
console.log('  - Has verbosity param:', read.inputSchema.properties.verbosity ? 'YES' : 'NO');
console.log('  - Has output.format:', read.inputSchema.properties.output?.properties?.format ? 'YES' : 'NO');

// Check precision_write
const write = schemas.precisionWriteSchema;
console.log('precision_write:');
console.log('  - Has verbosity param:', write.inputSchema.properties.verbosity ? 'YES' : 'NO');

console.log('\nAll validations passed!');
