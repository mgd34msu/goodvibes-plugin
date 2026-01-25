# Engineering Best Practices

## Code Quality Principles

Writing maintainable, production-ready code requires adherence to core quality principles:

- **Type Safety**: Leverage TypeScript's type system to catch errors at compile time rather than runtime
- **Error Handling**: Implement comprehensive error handling with proper error types and meaningful messages
- **Input Validation**: Validate all external inputs using schema validation libraries like Zod
- **Single Responsibility**: Each function or module should have one clear purpose
- **DRY (Don't Repeat Yourself)**: Extract common logic into reusable utilities
- **Consistent Patterns**: Follow existing codebase conventions and architectural patterns

## TypeScript Code Example

```typescript
import { z } from 'zod';

// Define schema for runtime validation
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(18).optional(),
});

// Infer TypeScript type from schema
type CreateUserInput = z.infer<typeof createUserSchema>;

interface User extends CreateUserInput {
  id: string;
  createdAt: Date;
}

/**
 * Creates a new user with validated input
 * @param input - User creation data
 * @returns Created user object
 * @throws {ValidationError} If input validation fails
 */
async function createUser(input: unknown): Promise<User> {
  // Validate input at runtime
  const validatedInput = createUserSchema.parse(input);

  // Type-safe database operation
  const user: User = {
    id: generateId(),
    ...validatedInput,
    createdAt: new Date(),
  };

  await db.users.create(user);

  return user;
}
```

## Testing Best Practices

Comprehensive testing ensures code reliability and facilitates refactoring:

- **Test Pyramid**: Write many unit tests, fewer integration tests, and minimal E2E tests
- **Arrange-Act-Assert**: Structure tests with clear setup, execution, and verification phases
- **Test Behavior, Not Implementation**: Focus on what the code does, not how it does it
- **Mock External Dependencies**: Isolate units under test from databases, APIs, and file systems
- **Descriptive Test Names**: Use names that clearly describe the scenario and expected outcome
- **Edge Cases**: Test boundary conditions, error paths, and unexpected inputs
- **Continuous Integration**: Run tests automatically on every commit to catch regressions early

Example test structure:

```typescript
describe('createUser', () => {
  it('should create user with valid input', async () => {
    // Arrange
    const input = { email: 'test@example.com', name: 'John Doe' };

    // Act
    const result = await createUser(input);

    // Assert
    expect(result).toMatchObject(input);
    expect(result.id).toBeDefined();
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('should throw validation error for invalid email', async () => {
    // Arrange
    const input = { email: 'invalid', name: 'John Doe' };

    // Act & Assert
    await expect(createUser(input)).rejects.toThrow();
  });
});
```
