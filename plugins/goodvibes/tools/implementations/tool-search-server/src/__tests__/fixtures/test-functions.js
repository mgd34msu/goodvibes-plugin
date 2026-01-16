/**
 * Test fixture functions for profile-function handler tests
 *
 * This module exports various function types to test:
 * - Sync functions
 * - Async functions
 * - Default exports (function and object)
 * - Throwing functions
 * - Functions with return values
 * - Functions returning large or non-serializable data
 */

// Simple sync function
export function syncAdd(a, b) {
  return a + b;
}

// Sync function that takes time
export function syncCompute(iterations = 1000) {
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    result += Math.sqrt(i);
  }
  return result;
}

// Async function
export async function asyncDelay(ms = 10) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return { delayed: true, ms };
}

// Async function returning a Promise
export function promiseFunction(value) {
  return Promise.resolve({ value, timestamp: Date.now() });
}

// Function that throws
export function throwingFunction() {
  throw new Error('Intentional test error');
}

// Function that throws async
export async function asyncThrowingFunction() {
  await new Promise((resolve) => setTimeout(resolve, 1));
  throw new Error('Async intentional test error');
}

// Function that sometimes throws (intermittent)
let callCount = 0;
export function intermittentFunction() {
  callCount++;
  if (callCount % 3 === 0) {
    throw new Error('Intermittent failure');
  }
  return { callCount };
}

// Reset call count (useful between tests)
export function resetCallCount() {
  callCount = 0;
}

// Function returning undefined
export function voidFunction() {
  // Does nothing, returns undefined
}

// Function returning null
export function nullFunction() {
  return null;
}

// Function returning large data
export function largeResultFunction() {
  return { data: 'x'.repeat(20000) };
}

// Function returning non-serializable data (circular reference)
export function circularFunction() {
  const obj = { name: 'test' };
  obj.self = obj;
  return obj;
}

// Function with multiple arguments
export function multiArgFunction(a, b, c, d) {
  return { sum: a + b + c + d, args: [a, b, c, d] };
}

// Function accepting array
export function arrayFunction(arr) {
  return arr.reduce((sum, val) => sum + val, 0);
}

// Function accepting object
export function objectFunction(obj) {
  return Object.keys(obj).length;
}

// Very fast function
export function fastFunction() {
  return 42;
}

// Slow async function (for timeout testing)
export async function slowAsyncFunction(delayMs = 200) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return 'completed';
}

// Default export as object with methods
const defaultMethods = {
  myMethod(x) {
    return x * 2;
  },
  anotherMethod(x, y) {
    return x + y;
  },
};

export default defaultMethods;
