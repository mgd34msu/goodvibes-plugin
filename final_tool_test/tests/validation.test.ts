import { validateEmail, validatePassword } from '../src/utils/validation';

describe('validateEmail', () => {
  it('validates correct email', () => {
    expect(validateEmail('test@example.com')).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(validateEmail('invalid')).toBe(false);
  });
});
