// File without classes - only functions and interfaces

export function processData(data: string): string {
  return data.trim().toLowerCase();
}

export interface DataProcessor {
  process(input: string): string;
}

const helperValue = 42;
