/**
 * Test fixture with no function exports
 * Used to test the 'none' branch in available exports message
 */

// Only non-function exports
export const stringValue = 'hello';
export const numberValue = 42;
export const objectValue = { key: 'value' };
export const arrayValue = [1, 2, 3];

// Default export is also not a function
export default {
  config: true,
  name: 'no-functions-module',
};
