export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePassword(password: string): boolean {
  // TODO: Add password validation
  return password.length >= 8;
}

export class Validator {
  validate(input: string): boolean {
    return input.length > 0;
  }
}
