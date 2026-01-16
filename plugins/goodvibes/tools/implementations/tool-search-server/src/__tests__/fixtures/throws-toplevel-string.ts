/**
 * Test fixture TypeScript file that throws a string at top level
 * Used to test the String(directError) branch in importModule
 */

// This throws a string, not an Error, when the module is imported
throw 'TypeScript module threw a string, not an Error';
