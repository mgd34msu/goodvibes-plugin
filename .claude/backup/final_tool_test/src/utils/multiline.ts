export const config = {
  name: 'MyApp',
  settings: {
    debug: true,
    verbose: false
  }
};

export function processData(
  input: string,
  options: {
    validate: boolean;
    transform: boolean;
  }
): string {
  return input;
}
