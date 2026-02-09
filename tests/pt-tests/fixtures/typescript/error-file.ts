// This file has intentional type errors for validation testing

export function brokenAdd(a: number, b: string): number {
  return a + b; // Type error: string + number
}

export const badAssignment: number = "not a number"; // Type error

export interface MissingProps {
  required: string;
}

// Missing required property
export const incomplete: MissingProps = {}; // Type error

export function unusedParam(x: number, y: number): number {
  return x; // y is unused
}
