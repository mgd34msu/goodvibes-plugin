# Valibot Methods Reference

## Schema Types

### Primitives

```typescript
v.string()       // string
v.number()       // number
v.bigint()       // bigint
v.boolean()      // boolean
v.date()         // Date
v.symbol()       // symbol
v.undefined_()   // undefined
v.null_()        // null
v.void_()        // void
v.never()        // never
v.unknown()      // unknown
v.any()          // any
```

### Literals

```typescript
v.literal('value')      // Exact value
v.picklist(['a', 'b'])  // One of values (enum-like)
v.enum_(MyEnum)         // TypeScript enum
```

### Objects

```typescript
v.object({ key: v.string() })        // Standard object
v.strictObject({ key: v.string() })  // No extra keys allowed
v.looseObject({ key: v.string() })   // Extra keys allowed
v.record(v.string(), v.number())     // Record<string, number>
```

### Arrays

```typescript
v.array(v.string())                     // string[]
v.tuple([v.string(), v.number()])       // [string, number]
v.set(v.string())                       // Set<string>
v.map(v.string(), v.number())           // Map<string, number>
```

### Unions

```typescript
v.union([v.string(), v.number()])       // string | number
v.variant('type', [...])                // Discriminated union
v.intersect([schema1, schema2])         // Intersection
```

### Special

```typescript
v.optional(v.string())                  // T | undefined
v.nullable(v.string())                  // T | null
v.nullish(v.string())                   // T | null | undefined
v.optional(v.string(), 'default')       // With default
v.lazy(() => schema)                    // Recursive schemas
v.instance(Date)                        // instanceof check
v.custom<T>(fn)                         // Custom type
```

## String Validations

```typescript
v.minLength(n, message?)     // Min length
v.maxLength(n, message?)     // Max length
v.length(n, message?)        // Exact length
v.email(message?)            // Email format
v.url(message?)              // URL format
v.uuid(message?)             // UUID format
v.regex(pattern, message?)   // Regex match
v.startsWith(str, message?)  // Starts with
v.endsWith(str, message?)    // Ends with
v.includes(str, message?)    // Contains
v.ip(message?)               // IP address
v.ipv4(message?)             // IPv4 address
v.ipv6(message?)             // IPv6 address
v.isoDate(message?)          // ISO date string
v.isoDateTime(message?)      // ISO datetime
v.isoTime(message?)          // ISO time
v.isoTimestamp(message?)     // ISO timestamp
v.isoWeek(message?)          // ISO week
v.ulid(message?)             // ULID format
v.cuid2(message?)            // CUID2 format
v.emoji(message?)            // Emoji
v.hash(algo, message?)       // Hash (md5, sha, etc.)
v.hexColor(message?)         // Hex color
v.imei(message?)             // IMEI
v.mac(message?)              // MAC address
v.mac48(message?)            // MAC-48
v.mac64(message?)            // MAC-64
v.octal(message?)            // Octal string
v.nanoid(message?)           // Nanoid
```

## Number Validations

```typescript
v.minValue(n, message?)      // >= n
v.maxValue(n, message?)      // <= n
v.value(n, message?)         // === n
v.integer(message?)          // Integer
v.finite(message?)           // Finite number
v.safeInteger(message?)      // Safe integer
v.multipleOf(n, message?)    // Multiple of n
```

## Date Validations

```typescript
v.minValue(date, message?)   // >= date
v.maxValue(date, message?)   // <= date
v.value(date, message?)      // === date
```

## Array Validations

```typescript
v.minLength(n, message?)     // Min items
v.maxLength(n, message?)     // Max items
v.length(n, message?)        // Exact items
v.includes(item, message?)   // Contains item
v.excludes(item, message?)   // Doesn't contain
```

## Object Validations

```typescript
v.partial(schema)            // Make all optional
v.required(schema)           // Make all required
v.pick(schema, ['a', 'b'])   // Pick keys
v.omit(schema, ['c'])        // Omit keys
v.merge([obj1, obj2])        // Merge objects
```

## Transforms

```typescript
// String transforms
v.trim()                     // Trim whitespace
v.toLowerCase()              // To lowercase
v.toUpperCase()              // To uppercase

// Custom transform
v.transform((value) => ...)  // Custom transform

// Coercion
v.coerce(v.number())         // Coerce to number
```

## General Actions

```typescript
v.check(fn, message?)        // Custom predicate
v.brand(name)                // Brand type
v.readonly()                 // Readonly
v.description(text)          // Add description
v.metadata(data)             // Add metadata
```

## Cross-Field Validation

```typescript
// Forward issues to specific field
v.forward(
  v.partialCheck(
    [['field1'], ['field2']],
    (input) => input.field1 === input.field2,
    'Fields must match'
  ),
  ['field2']
)

// Custom object validation
v.pipe(
  v.object({ password: v.string(), confirm: v.string() }),
  v.check(
    (input) => input.password === input.confirm,
    'Passwords must match'
  )
)
```

## Parsing Functions

```typescript
// Throws ValiError on failure
v.parse(schema, data)

// Returns { success, output, issues }
v.safeParse(schema, data)

// Async versions
await v.parseAsync(schema, data)
await v.safeParseAsync(schema, data)

// Type guard
v.is(schema, data)  // returns boolean
```

## Error Handling

```typescript
try {
  const data = v.parse(schema, input);
} catch (error) {
  if (error instanceof v.ValiError) {
    // Access issues
    error.issues.forEach(issue => {
      console.log(issue.path);      // Field path
      console.log(issue.message);   // Error message
      console.log(issue.input);     // Invalid input
      console.log(issue.expected);  // Expected type
      console.log(issue.received);  // Received type
    });

    // Flatten to object
    const flat = v.flatten(error.issues);
    // { nested: { 'user.email': ['Invalid email'] } }
  }
}
```

## Type Inference

```typescript
// Output type (after transforms)
type Output = v.InferOutput<typeof schema>

// Input type (before transforms)
type Input = v.InferInput<typeof schema>

// Issue type
type Issue = v.InferIssue<typeof schema>
```

## Pipe Examples

```typescript
// Email validation
const emailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.email('Invalid email'),
);

// Number from string
const numberSchema = v.pipe(
  v.string(),
  v.transform((s) => parseInt(s, 10)),
  v.number(),
  v.minValue(0),
);

// Date validation
const dateSchema = v.pipe(
  v.string(),
  v.isoDate('Invalid date format'),
  v.transform((s) => new Date(s)),
);

// Array with unique items
const uniqueArraySchema = v.pipe(
  v.array(v.string()),
  v.check(
    (arr) => new Set(arr).size === arr.length,
    'Items must be unique'
  ),
);
```

## Fallback

```typescript
// Use fallback value on error
v.fallback(v.string(), 'default')

// Fallback function
v.fallback(v.number(), () => Date.now())
```

## Async Validation

```typescript
const schema = v.pipe(
  v.string(),
  v.checkAsync(async (value) => {
    const exists = await checkIfExists(value);
    return !exists;
  }, 'Already exists'),
);

const result = await v.safeParseAsync(schema, 'username');
```

## Recursive Schemas

```typescript
type Category = {
  name: string;
  children: Category[];
};

const categorySchema: v.GenericSchema<Category> = v.object({
  name: v.string(),
  children: v.lazy(() => v.array(categorySchema)),
});
```
