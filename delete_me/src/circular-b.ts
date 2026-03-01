import { getA, processA } from './circular-a';

export function getB(): string {
  return 'B:' + getA();
}

export function processB(input: string): string {
  return processA(input.toLowerCase());
}
