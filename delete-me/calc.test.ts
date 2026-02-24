import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

const TSX = '/home/buzzkill/Projects/goodvibes-plugin/plugins/goodvibes/node_modules/.bin/tsx';
const CALC = path.resolve('/home/buzzkill/Projects/goodvibes-plugin/delete-me/calc.ts');

function run(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`${TSX} ${CALC} ${args.join(' ')}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------
describe('add', () => {
  it('adds two positive integers', () => {
    const { stdout, exitCode } = run(['add', '3', '4']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('7');
  });

  it('adds two negative numbers', () => {
    const { stdout, exitCode } = run(['add', '-5', '-3']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('-8');
  });

  it('adds positive and negative (mixed)', () => {
    const { stdout, exitCode } = run(['add', '10', '-4']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('6');
  });

  it('adds decimal numbers', () => {
    const { stdout, exitCode } = run(['add', '1.5', '2.5']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('4');
  });
});

// ---------------------------------------------------------------------------
// subtract
// ---------------------------------------------------------------------------
describe('subtract', () => {
  it('subtracts basic positive integers', () => {
    const { stdout, exitCode } = run(['subtract', '10', '3']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('7');
  });

  it('produces a negative result', () => {
    const { stdout, exitCode } = run(['subtract', '2', '9']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('-7');
  });
});

// ---------------------------------------------------------------------------
// multiply
// ---------------------------------------------------------------------------
describe('multiply', () => {
  it('multiplies two positive integers', () => {
    const { stdout, exitCode } = run(['multiply', '6', '7']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('42');
  });

  it('multiplies by zero', () => {
    const { stdout, exitCode } = run(['multiply', '999', '0']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('0');
  });

  it('multiplies decimal numbers', () => {
    const { stdout, exitCode } = run(['multiply', '2.5', '4']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('10');
  });
});

// ---------------------------------------------------------------------------
// divide
// ---------------------------------------------------------------------------
describe('divide', () => {
  it('divides two integers evenly', () => {
    const { stdout, exitCode } = run(['divide', '12', '4']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('3');
  });

  it('produces a decimal result', () => {
    const { stdout, exitCode } = run(['divide', '1', '4']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('0.25');
  });

  it('exits with code 1 on divide by zero', () => {
    const { stderr, exitCode } = run(['divide', '5', '0']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Error: division by zero');
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------
describe('error cases', () => {
  it('exits with code 1 and prints usage when no args are provided', () => {
    const { stderr, exitCode } = run([]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage:');
  });

  it('exits with code 1 and prints usage when only operation is provided', () => {
    const { stderr, exitCode } = run(['add']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage:');
  });

  it('exits with code 1 and prints usage when one operand is missing', () => {
    const { stderr, exitCode } = run(['add', '5']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Usage:');
  });

  it('exits with code 1 and prints error on unknown operation', () => {
    const { stderr, exitCode } = run(['modulo', '10', '3']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Error: unknown operation 'modulo'");
  });

  it('exits with code 1 when first operand is non-numeric', () => {
    const { stderr, exitCode } = run(['add', 'abc', '3']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Error: non-numeric input ('abc')");
  });

  it('exits with code 1 when second operand is non-numeric', () => {
    const { stderr, exitCode } = run(['add', '3', 'xyz']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Error: non-numeric input ('xyz')");
  });
});
