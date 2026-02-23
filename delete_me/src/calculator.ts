export class CalculatorError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_INPUT' | 'DIVISION_BY_ZERO' | 'PARSE_ERROR'
  ) {
    super(message);
    this.name = 'CalculatorError';
  }
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new CalculatorError(
      `${name} must be a finite number, got ${value}`,
      'INVALID_INPUT'
    );
  }
}

export class Calculator {
  add(a: number, b: number): number {
    assertFinite(a, 'a');
    assertFinite(b, 'b');
    return a + b;
  }

  subtract(a: number, b: number): number {
    assertFinite(a, 'a');
    assertFinite(b, 'b');
    return a - b;
  }

  multiply(a: number, b: number): number {
    assertFinite(a, 'a');
    assertFinite(b, 'b');
    return a * b;
  }

  divide(a: number, b: number): number {
    assertFinite(a, 'a');
    assertFinite(b, 'b');
    if (b === 0) {
      throw new CalculatorError('Division by zero is not allowed', 'DIVISION_BY_ZERO');
    }
    return a / b;
  }

  calculate(expression: string): number {
    const trimmed = expression.trim();
    // Match: <number> <operator> <number>
    const match = trimmed.match(
      /^(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/
    );

    if (!match) {
      throw new CalculatorError(
        `Cannot parse expression: "${expression}". Expected format: "2 + 3"`,
        'PARSE_ERROR'
      );
    }

    const a = parseFloat(match[1] as string);
    const op = match[2] as string;
    const b = parseFloat(match[3] as string);

    switch (op) {
      case '+': return this.add(a, b);
      case '-': return this.subtract(a, b);
      case '*': return this.multiply(a, b);
      case '/': return this.divide(a, b);
      default:
        throw new CalculatorError(`Unknown operator: ${op}`, 'PARSE_ERROR');
    }
  }
}
