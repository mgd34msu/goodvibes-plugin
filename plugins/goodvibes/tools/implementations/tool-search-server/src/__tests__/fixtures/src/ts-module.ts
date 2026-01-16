/**
 * TypeScript module fixture for testing dist folder fallback import
 *
 * This file is intentionally a TypeScript file that cannot be directly imported.
 * The corresponding compiled .js version in ../dist/ should be used instead.
 */

// TypeScript-specific syntax that would fail without tsx/ts-node
interface TestResult {
  computed: number;
  timestamp: number;
}

export function distFallbackFunction(x: number): TestResult {
  return {
    computed: x * 4,
    timestamp: Date.now(),
  };
}
