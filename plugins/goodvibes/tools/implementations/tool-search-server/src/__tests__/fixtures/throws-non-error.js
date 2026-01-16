/**
 * Test fixture that throws non-Error values
 * Used to test the String(error) branches in error handling
 */

// Function that throws a string
export function throwsString() {
  throw 'This is a string error, not an Error object';
}

// Function that throws a number
export function throwsNumber() {
  throw 42;
}

// Function that throws null
export function throwsNull() {
  throw null;
}

// Function that throws undefined
export function throwsUndefined() {
  throw undefined;
}

// Function that throws an object (not Error)
export function throwsObject() {
  throw { message: 'custom error object', code: 500 };
}

// Async function that rejects with a string
export async function asyncThrowsString() {
  await new Promise((resolve) => setTimeout(resolve, 1));
  throw 'Async string rejection';
}

// Async function that rejects with a number
export async function asyncThrowsNumber() {
  await new Promise((resolve) => setTimeout(resolve, 1));
  throw 123;
}
