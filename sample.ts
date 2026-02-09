
/**
 * Sample class for testing.
 */
export class SampleClass {
  private value: number;

  constructor(initial: number) {
    this.value = initial;
  }

  public getValue(): number {
    return this.value;
  }

  public setValue(val: number): void {
    this.value = val;
  }
}

/**
 * Sample interface.
 */
export interface SampleInterface {
  id: string;
  name: string;
  count?: number;
}

/**
 * Sample type alias.
 */
export type SampleType = SampleInterface | null;

/**
 * Sample function.
 */
export function sampleFunction(input: string): string {
  return input.toUpperCase();
}

/**
 * Sample constant.
 */
export const SAMPLE_CONSTANT = 42;

/**
 * Sample enum.
 */
export enum SampleEnum {
  First = 'first',
  Second = 'second',
  Third = 'third',
}

// Private function (not exported)
function privateHelper(): void {
  console.log('helper');
}
