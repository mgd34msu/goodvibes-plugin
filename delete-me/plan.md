# Test Plan: Mini CLI Calculator

Build a tiny TypeScript CLI calculator in `delete-me/` to exercise the runtime engine.

## Agent 1: Engineer — Build the calculator
- Create `delete-me/calc.ts` — a simple CLI calculator
- Supports: add, subtract, multiply, divide
- Reads args from process.argv: `npx tsx calc.ts add 2 3` → `5`
- Handles division by zero, invalid input, unknown operations
- Clean error messages to stderr, results to stdout

## Agent 2: Tester — Write tests
- Create `delete-me/calc.test.ts` using vitest
- Test all 4 operations with positive, negative, decimal inputs
- Test error cases: divide by zero, missing args, unknown op, non-numeric input
- All tests must pass

## Execution
1. Engineer builds calc.ts
2. Tester writes and runs tests
3. Observe runtime engine behavior (WRFC chains, directives, events)
