# Property-Based Testing Patterns

Comprehensive guide to property-based testing with fast-check and Hypothesis.

## Core Concepts

### What is Property-Based Testing?

Instead of writing specific test cases:
```javascript
// Example-based testing
test('reverses [1, 2, 3]', () => {
  expect(reverse([1, 2, 3])).toEqual([3, 2, 1]);
});
```

Define properties that should always hold:
```javascript
// Property-based testing
test('reverse is self-inverse', () => {
  fc.assert(fc.property(fc.array(fc.integer()), (arr) => {
    expect(reverse(reverse(arr))).toEqual(arr);
  }));
});
```

### Common Property Types

| Property | Description | Example |
|----------|-------------|---------|
| **Idempotent** | Applying twice = applying once | `sort(sort(x)) == sort(x)` |
| **Inverse** | Operation can be undone | `decode(encode(x)) == x` |
| **Invariant** | Property preserved | `length(sort(x)) == length(x)` |
| **Commutative** | Order doesn't matter | `a + b == b + a` |
| **Associative** | Grouping doesn't matter | `(a + b) + c == a + (b + c)` |

---

## JavaScript/TypeScript with fast-check

### Installation

```bash
npm install --save-dev fast-check
```

### Basic Arbitraries

```javascript
import fc from 'fast-check';

// Primitives
fc.integer()                      // Any integer
fc.integer({ min: 0, max: 100 }) // Constrained
fc.nat()                         // Natural numbers (>= 0)
fc.float()                       // Floating point
fc.boolean()                     // true/false
fc.string()                      // Any string
fc.string({ minLength: 1 })      // Non-empty string

// Collections
fc.array(fc.integer())           // Array of integers
fc.array(fc.string(), { minLength: 1, maxLength: 10 })
fc.set(fc.integer())             // Set (unique values)
fc.dictionary(fc.string(), fc.integer())  // Object

// Special types
fc.date()                        // Date objects
fc.uuid()                        // UUIDs
fc.emailAddress()                // Valid emails
fc.ipV4()                        // IPv4 addresses
fc.json()                        // Valid JSON values
```

### Custom Arbitraries

```javascript
// User arbitrary
const userArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  email: fc.emailAddress(),
  age: fc.integer({ min: 18, max: 120 }),
  role: fc.constantFrom('admin', 'user', 'guest'),
});

// Nested structures
const orderArb = fc.record({
  id: fc.uuid(),
  user: userArb,
  items: fc.array(fc.record({
    productId: fc.uuid(),
    quantity: fc.integer({ min: 1, max: 100 }),
    price: fc.float({ min: 0.01, max: 10000 }),
  }), { minLength: 1 }),
  createdAt: fc.date(),
});

// Using tuple for multiple values
fc.assert(
  fc.property(
    fc.tuple(fc.integer(), fc.integer()),
    ([a, b]) => {
      expect(add(a, b)).toBe(a + b);
    }
  )
);
```

### Property Patterns

#### Encode/Decode (Round-trip)

```javascript
describe('JSON serialization', () => {
  it('should round-trip correctly', () => {
    fc.assert(
      fc.property(userArb, (user) => {
        const serialized = JSON.stringify(user);
        const deserialized = JSON.parse(serialized);
        expect(deserialized).toEqual(user);
      })
    );
  });
});
```

#### Sort Properties

```javascript
describe('sort function', () => {
  it('preserves length', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        expect(sort(arr).length).toBe(arr.length);
      })
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        expect(sort(sort(arr))).toEqual(sort(arr));
      })
    );
  });

  it('produces ordered output', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const sorted = sort(arr);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]).toBeGreaterThanOrEqual(sorted[i - 1]);
        }
        return true;
      })
    );
  });

  it('contains same elements', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const sorted = sort(arr);
        expect(sorted.sort()).toEqual([...arr].sort());
      })
    );
  });
});
```

#### Filter Properties

```javascript
describe('filter function', () => {
  it('produces subset', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer()),
        fc.func(fc.boolean()),
        (arr, predicate) => {
          const filtered = arr.filter(predicate);
          expect(filtered.length).toBeLessThanOrEqual(arr.length);
        }
      )
    );
  });

  it('all elements satisfy predicate', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        const predicate = (x) => x > 0;
        const filtered = arr.filter(predicate);
        expect(filtered.every(predicate)).toBe(true);
      })
    );
  });
});
```

#### Map Properties

```javascript
describe('map function', () => {
  it('preserves length', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer()),
        fc.func(fc.integer()),
        (arr, fn) => {
          expect(arr.map(fn).length).toBe(arr.length);
        }
      )
    );
  });

  it('composes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer()),
        fc.func(fc.integer()),
        fc.func(fc.integer()),
        (arr, f, g) => {
          const composed = arr.map(x => g(f(x)));
          const sequential = arr.map(f).map(g);
          expect(composed).toEqual(sequential);
        }
      )
    );
  });
});
```

### Configuration Options

```javascript
fc.assert(
  fc.property(fc.integer(), (n) => {
    return n + 0 === n;
  }),
  {
    numRuns: 1000,           // Number of test cases
    seed: 12345,             // For reproducibility
    verbose: true,           // Show all generated values
    endOnFailure: true,      // Stop on first failure
    skipAllAfterTimeLimit: 5000, // Timeout in ms
  }
);
```

---

## Python with Hypothesis

### Installation

```bash
pip install hypothesis
```

### Basic Strategies

```python
from hypothesis import given, strategies as st

# Primitives
st.integers()                     # Any integer
st.integers(min_value=0, max_value=100)
st.floats()                       # Floating point
st.floats(allow_nan=False)        # No NaN
st.booleans()                     # True/False
st.text()                         # Unicode strings
st.text(min_size=1, max_size=50)  # Constrained
st.binary()                       # Bytes

# Collections
st.lists(st.integers())           # List of ints
st.lists(st.text(), min_size=1)   # Non-empty
st.sets(st.integers())            # Set
st.dictionaries(st.text(), st.integers())

# Special types
st.datetimes()                    # Datetime objects
st.uuids()                        # UUIDs
st.emails()                       # Email addresses
st.from_regex(r'\d{3}-\d{4}')    # Regex pattern
```

### Custom Strategies

```python
from dataclasses import dataclass
from hypothesis import strategies as st

@dataclass
class User:
    id: str
    name: str
    email: str
    age: int

user_strategy = st.builds(
    User,
    id=st.uuids().map(str),
    name=st.text(min_size=1, max_size=50),
    email=st.emails(),
    age=st.integers(min_value=18, max_value=120),
)

# Using composite for complex logic
@st.composite
def order_strategy(draw):
    user = draw(user_strategy)
    items = draw(st.lists(
        st.builds(
            OrderItem,
            product_id=st.uuids().map(str),
            quantity=st.integers(1, 100),
            price=st.decimals(min_value=0.01, max_value=10000),
        ),
        min_size=1
    ))
    return Order(user=user, items=items)
```

### Property Patterns

```python
from hypothesis import given, assume, example, settings
import hypothesis.strategies as st

class TestSort:
    @given(st.lists(st.integers()))
    def test_preserves_length(self, xs):
        assert len(sort(xs)) == len(xs)

    @given(st.lists(st.integers()))
    def test_idempotent(self, xs):
        assert sort(sort(xs)) == sort(xs)

    @given(st.lists(st.integers()))
    def test_ordered(self, xs):
        result = sort(xs)
        for i in range(1, len(result)):
            assert result[i] >= result[i-1]

    @given(st.lists(st.integers()))
    @example([])  # Always test empty list
    @example([1])  # Always test single element
    def test_contains_same_elements(self, xs):
        result = sort(xs)
        assert sorted(result) == sorted(xs)


class TestSerialization:
    @given(user_strategy)
    def test_round_trip(self, user):
        serialized = user.to_json()
        deserialized = User.from_json(serialized)
        assert user == deserialized


class TestDivision:
    @given(st.floats(), st.floats())
    def test_division_inverse(self, a, b):
        # Skip invalid cases
        assume(b != 0)
        assume(not (math.isinf(a) or math.isnan(a)))
        assume(not (math.isinf(b) or math.isnan(b)))

        result = a / b
        assert abs(result * b - a) < 1e-10
```

### Settings and Configuration

```python
from hypothesis import given, settings, Verbosity, Phase

@given(st.lists(st.integers()))
@settings(
    max_examples=500,           # Number of test cases
    deadline=1000,              # Max time per example (ms)
    verbosity=Verbosity.verbose,
    suppress_health_check=[],
    phases=[Phase.generate, Phase.shrink],
)
def test_with_settings(xs):
    assert len(xs) >= 0

# Profile-based settings
@settings(settings.get_profile("ci"))  # Use CI profile
def test_with_profile(xs):
    pass

# Register profiles
settings.register_profile("ci", max_examples=1000)
settings.register_profile("dev", max_examples=10)
settings.load_profile("dev")
```

---

## Common Property Patterns

### 1. Oracle Testing

Compare implementation against reference:

```javascript
fc.assert(
  fc.property(fc.array(fc.integer()), (arr) => {
    const mySort = customSort(arr);
    const reference = [...arr].sort((a, b) => a - b);
    expect(mySort).toEqual(reference);
  })
);
```

### 2. Metamorphic Testing

Input transformations that predict output:

```javascript
// If we double all inputs, output doubles
fc.assert(
  fc.property(fc.array(fc.integer()), (arr) => {
    const sum1 = sum(arr);
    const sum2 = sum(arr.map(x => x * 2));
    expect(sum2).toBe(sum1 * 2);
  })
);
```

### 3. Symmetric Properties

```javascript
// Encryption/decryption
fc.assert(
  fc.property(fc.string(), fc.string({ minLength: 16 }), (plaintext, key) => {
    const encrypted = encrypt(plaintext, key);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  })
);
```

### 4. Algebraic Laws

```javascript
// Monoid laws for string concatenation
describe('string concatenation monoid', () => {
  it('has identity', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(s + '').toBe(s);
        expect('' + s).toBe(s);
      })
    );
  });

  it('is associative', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (a, b, c) => {
        expect((a + b) + c).toBe(a + (b + c));
      })
    );
  });
});
```

---

## Shrinking and Debugging

When a test fails, both fast-check and Hypothesis automatically shrink the failing case to the minimal example.

### fast-check shrinking

```javascript
// If this fails, fast-check shrinks to minimal case
fc.assert(
  fc.property(fc.array(fc.integer()), (arr) => {
    return arr.length < 100; // Will shrink to array of length 100
  })
);

// Output:
// Property failed after 23 tests
// Counterexample: [0, 0, ..., 0] (length 100)
// Shrunk 5 times
```

### Reproducing failures

```javascript
// fast-check
fc.assert(
  fc.property(fc.integer(), (n) => n > 0),
  { seed: 1234567890, path: "5:2:3" } // Reproduce exact failure
);

// Hypothesis
# Run with: pytest --hypothesis-seed=1234567890
```

---

## Best Practices

1. **Start with simple properties** - Length preservation, element containment
2. **Use `assume()` wisely** - Filter invalid inputs, but not too aggressively
3. **Include explicit examples** - Edge cases you know about
4. **Test algebraic laws** - Identity, associativity, commutativity
5. **Compare against oracle** - Reference implementation or library
6. **Monitor shrinking** - Good shrinking helps debugging
7. **Set appropriate limits** - Balance coverage vs speed
