import { getB, processB } from './circular-b';

export function getA(): string {
  return 'A:' + getB();
}

export function processA(input: string): string {
  return processB(input.toUpperCase());
}
