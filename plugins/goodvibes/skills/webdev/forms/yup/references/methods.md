# Yup Methods Reference

## Schema Methods (All Types)

```typescript
// Validation
schema.validate(value, options): Promise<T>
schema.validateSync(value, options): T
schema.isValid(value): Promise<boolean>
schema.isValidSync(value): boolean

// Type checking
schema.isType(value): boolean

// Transformation
schema.cast(value, options): T
schema.transform(fn): Schema

// Metadata
schema.describe(): SchemaDescription
schema.meta(data): Schema

// Cloning
schema.clone(): Schema
schema.concat(schema): Schema

// Common validators
schema.required(message?): Schema
schema.notRequired(): Schema
schema.nullable(): Schema
schema.nonNullable(): Schema
schema.defined(): Schema
schema.optional(): Schema
schema.default(value): Schema
schema.typeError(message): Schema
schema.oneOf(values, message?): Schema
schema.notOneOf(values, message?): Schema
schema.test(name, message, fn): Schema
schema.when(keys, options): Schema
schema.label(label): Schema
schema.strip(): Schema
schema.strict(isStrict?): Schema
```

## String Methods

```typescript
yup.string()
  // Length
  .min(limit, message?)
  .max(limit, message?)
  .length(limit, message?)

  // Format
  .email(message?)
  .url(message?)
  .uuid(message?)
  .matches(regex, message?)
  .matches(regex, { message?, excludeEmptyString? })

  // Transform
  .trim()
  .lowercase()
  .uppercase()

  // Validation
  .required(message?)
  .ensure() // Transform undefined/null to ''
```

### String Examples

```typescript
// Email validation
yup.string()
  .email('Invalid email')
  .required('Email required')

// Password validation
yup.string()
  .min(8, 'At least 8 characters')
  .max(128, 'Too long')
  .matches(/[A-Z]/, 'Need uppercase')
  .matches(/[a-z]/, 'Need lowercase')
  .matches(/[0-9]/, 'Need number')
  .matches(/[^A-Za-z0-9]/, 'Need special character')

// URL validation
yup.string()
  .url('Invalid URL')
  .matches(/^https:\/\//, 'Must be HTTPS')

// Phone (custom regex)
yup.string()
  .matches(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number')

// Slug
yup.string()
  .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug')
  .lowercase()
```

## Number Methods

```typescript
yup.number()
  // Range
  .min(limit, message?)
  .max(limit, message?)
  .lessThan(limit, message?)
  .moreThan(limit, message?)

  // Type
  .positive(message?)
  .negative(message?)
  .integer(message?)

  // Transform
  .truncate()
  .round(type?) // 'ceil', 'floor', 'round', 'trunc'
```

### Number Examples

```typescript
// Age
yup.number()
  .positive('Must be positive')
  .integer('Must be whole number')
  .min(0, 'Invalid age')
  .max(150, 'Invalid age')

// Price
yup.number()
  .positive()
  .round('floor')
  .max(999999.99)

// Percentage
yup.number()
  .min(0, 'Min 0%')
  .max(100, 'Max 100%')

// Integer ID
yup.number()
  .positive()
  .integer()
  .required()
```

## Boolean Methods

```typescript
yup.boolean()
  .isTrue(message?)
  .isFalse(message?)
  .default(value)
```

### Boolean Examples

```typescript
// Terms acceptance
yup.boolean()
  .isTrue('You must accept terms')
  .required()

// Optional flag
yup.boolean()
  .default(false)
```

## Date Methods

```typescript
yup.date()
  .min(limit, message?)
  .max(limit, message?)
  .default(value | fn)
```

### Date Examples

```typescript
// Birth date (past)
yup.date()
  .max(new Date(), 'Cannot be in the future')
  .required()

// Event date (future)
yup.date()
  .min(new Date(), 'Must be in the future')

// Date range
const startDate = yup.date().required();
const endDate = yup.date()
  .min(yup.ref('startDate'), 'End must be after start')
  .required();

// Default to now
yup.date()
  .default(() => new Date())
```

## Array Methods

```typescript
yup.array()
  .of(schema)
  .min(limit, message?)
  .max(limit, message?)
  .length(limit, message?)
  .ensure() // [] for undefined/null
  .compact(fn?) // Remove falsy values
```

### Array Examples

```typescript
// Tags
yup.array()
  .of(yup.string().required())
  .min(1, 'At least one tag')
  .max(10, 'Max 10 tags')

// Unique items
yup.array()
  .of(yup.string())
  .test('unique', 'Must be unique', (value) => {
    return new Set(value).size === value?.length;
  })

// At least one selected
yup.array()
  .of(yup.string())
  .min(1, 'Select at least one')
```

## Object Methods

```typescript
yup.object()
  .shape(fields)
  .pick(keys)
  .omit(keys)
  .partial() // Make all fields optional
  .deepPartial()
  .noUnknown(message?)
  .camelCase()
  .constantCase()
```

### Object Examples

```typescript
// User profile
const userSchema = yup.object({
  name: yup.string().required(),
  email: yup.string().email().required(),
  profile: yup.object({
    bio: yup.string().max(500),
    website: yup.string().url(),
  }),
});

// Strict object (no extra keys)
yup.object({
  id: yup.number().required(),
  name: yup.string().required(),
}).noUnknown('Unknown field: ${unknown}');

// Partial updates
const updateSchema = userSchema.partial();
```

## Conditional Schema (when)

```typescript
// Basic
field.when('otherField', {
  is: value,
  then: (schema) => schema.required(),
  otherwise: (schema) => schema.notRequired(),
})

// Function condition
field.when('type', {
  is: (val) => val === 'business',
  then: (schema) => schema.required(),
})

// Multiple fields
field.when(['field1', 'field2'], {
  is: (val1, val2) => val1 && val2,
  then: (schema) => schema.required(),
})

// Sibling reference
field.when('$context.isAdmin', {
  is: true,
  then: (schema) => schema.required(),
})
```

## Custom Tests

```typescript
// Simple test
schema.test('name', 'message', (value) => boolean | Promise<boolean>)

// With context
schema.test('name', 'message', function(value) {
  // this.path - field path
  // this.parent - parent object
  // this.options.context - validation context
  // this.createError({ path?, message? })
  return true;
})

// Async test
schema.test('unique', 'Already exists', async (value) => {
  const exists = await checkIfExists(value);
  return !exists;
})
```

## Validation Options

```typescript
schema.validate(value, {
  // Stop on first error
  abortEarly: true,

  // Remove unknown keys
  stripUnknown: false,

  // Allow type coercion
  strict: false,

  // Recursively strip unknown
  recursive: true,

  // Context for conditions
  context: { user: currentUser },
})
```

## Error Handling

```typescript
try {
  await schema.validate(data, { abortEarly: false });
} catch (err) {
  if (err instanceof yup.ValidationError) {
    // All error messages
    err.errors; // string[]

    // Detailed errors
    err.inner.forEach(e => {
      console.log(e.path);    // Field path
      console.log(e.message); // Error message
      console.log(e.type);    // Validation type
      console.log(e.value);   // Invalid value
    });

    // Build error object
    const errors = err.inner.reduce((acc, e) => {
      acc[e.path] = e.message;
      return acc;
    }, {});
  }
}
```

## Schema Composition

```typescript
// Extend schema
const baseSchema = yup.object({
  id: yup.number().required(),
  createdAt: yup.date().default(() => new Date()),
});

const userSchema = baseSchema.shape({
  name: yup.string().required(),
  email: yup.string().email().required(),
});

// Merge schemas
const merged = schema1.concat(schema2);

// Pick fields
const partial = userSchema.pick(['name', 'email']);

// Omit fields
const withoutId = userSchema.omit(['id']);
```
