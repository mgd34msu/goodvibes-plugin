/**
 * Test fixture that throws a string at top level during module evaluation
 * Used to test the String(importError) branch in error handling
 */

// This throws a string, not an Error, when the module is imported
throw 'Module evaluation threw a string, not an Error';
