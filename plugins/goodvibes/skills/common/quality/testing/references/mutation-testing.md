# Mutation Testing Setup Guide

Verify test effectiveness by introducing bugs and checking if tests catch them.

## Concept

Mutation testing follows these steps:
1. **Generate mutants**: Create modified versions of code
2. **Run tests**: Execute test suite against each mutant
3. **Analyze results**:
   - **Killed**: Tests failed (good - they detected the bug)
   - **Survived**: Tests passed (bad - they missed the bug)
   - **Timeout**: Tests took too long
   - **No coverage**: Code not covered by tests

### Mutation Score

```
Mutation Score = (Killed Mutants / Total Mutants) * 100
```

| Score | Interpretation |
|-------|----------------|
| 90%+ | Excellent test suite |
| 80-90% | Good coverage |
| 70-80% | Needs improvement |
| <70% | Significant gaps |

---

## JavaScript/TypeScript with Stryker

### Installation

```bash
npm install --save-dev @stryker-mutator/core

# For specific test runners:
npm install --save-dev @stryker-mutator/jest-runner
npm install --save-dev @stryker-mutator/mocha-runner
npm install --save-dev @stryker-mutator/vitest-runner
```

### Configuration

```javascript
// stryker.conf.js
module.exports = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'jest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/test/**/*',
  ],
  mutator: {
    excludedMutations: [
      'StringLiteral', // Don't mutate strings
    ],
  },
  thresholds: {
    high: 80,
    low: 60,
    break: 50, // Fail if below 50%
  },
  concurrency: 4,
  timeoutMS: 10000,
};
```

### Running

```bash
# Full run
npx stryker run

# Specific files
npx stryker run --mutate "src/utils/**/*.ts"

# Incremental (only changed files)
npx stryker run --incremental
```

### Mutation Operators

| Operator | Original | Mutant |
|----------|----------|--------|
| **ArithmeticOperator** | `a + b` | `a - b`, `a * b` |
| **ConditionalExpression** | `a > b` | `a >= b`, `a < b`, `true`, `false` |
| **EqualityOperator** | `a === b` | `a !== b` |
| **LogicalOperator** | `a && b` | `a \|\| b` |
| **BlockStatement** | `{ code }` | `{}` (remove block) |
| **BooleanLiteral** | `true` | `false` |
| **ArrayDeclaration** | `[1, 2]` | `[]` |
| **StringLiteral** | `"foo"` | `""` |
| **UnaryOperator** | `-a` | `a` |
| **UpdateOperator** | `a++` | `a--` |

### Example Output

```
All tests
  ✓ UserService
    ✓ createUser
      ✓ should create user with valid data
      ✓ should throw on invalid email

Mutation score: 78.26%
Killed: 18
Survived: 5
No Coverage: 0
Timeout: 0

Survived mutants:
1. src/services/user.ts:23:5
   Mutant: ConditionalExpression
   Original: if (user.age >= 18)
   Mutant:   if (user.age > 18)
   Tests that should kill: test_adult_user
```

### Improving Score

For survived mutants:

1. **Add missing test case**:
```javascript
// Mutant: age >= 18 → age > 18
// Add test for exact boundary
it('should allow exactly 18 year old', () => {
  expect(isAdult({ age: 18 })).toBe(true);
});
```

2. **Strengthen assertions**:
```javascript
// Weak assertion - may not catch mutation
expect(result).toBeDefined();

// Strong assertion - catches changes
expect(result).toEqual({ id: 1, name: 'test' });
```

---

## Python with mutmut

### Installation

```bash
pip install mutmut
```

### Configuration

```ini
# setup.cfg or pyproject.toml

[mutmut]
paths_to_mutate=src/
tests_dir=tests/
runner=pytest
dict_synonyms=Struct,NamedTuple

[tool.mutmut]
paths_to_mutate = "src/"
tests_dir = "tests/"
runner = "pytest -x --tb=no"
```

### Running

```bash
# Full run
mutmut run

# Specific paths
mutmut run --paths-to-mutate=src/utils/

# With specific tests
mutmut run --tests-dir=tests/unit/

# Resume interrupted run
mutmut run --use-coverage
```

### Viewing Results

```bash
# Show summary
mutmut results

# Show specific mutant
mutmut show 1

# Show survived mutants
mutmut show survived

# Show all as diff
mutmut show all --diff

# Export to HTML
mutmut html
```

### Mutation Operators

| Operator | Original | Mutant |
|----------|----------|--------|
| **Arithmetic** | `a + b` | `a - b` |
| **Comparison** | `a > b` | `a >= b`, `a < b` |
| **Boolean** | `True` | `False` |
| **String** | `"foo"` | `"XXfooXX"` |
| **Number** | `1` | `2` |
| **Keyword** | `break` | `continue` |
| **Statement** | `return x` | `return None` |

### Example Session

```bash
$ mutmut run
- Mutation testing starting -
Running tests without mutations... Done
Generating mutants... Done

⠴ 42/100  🎉 35  ⏰ 0  🤔 7  🙁 0

$ mutmut results
To apply a mutant on disk:
    mutmut apply <id>

To show a mutant:
    mutmut show <id>

Survived: 7
  - src/calculator.py (line 15, 23, 45)
  - src/validator.py (line 8)

$ mutmut show 15
--- src/calculator.py
+++ src/calculator.py
@@ -15,5 +15,5 @@
 def discount(price, percent):
-    return price * (1 - percent / 100)
+    return price * (1 + percent / 100)
```

---

## Java with PITest

### Maven Configuration

```xml
<plugin>
  <groupId>org.pitest</groupId>
  <artifactId>pitest-maven</artifactId>
  <version>1.15.0</version>
  <dependencies>
    <dependency>
      <groupId>org.pitest</groupId>
      <artifactId>pitest-junit5-plugin</artifactId>
      <version>1.2.0</version>
    </dependency>
  </dependencies>
  <configuration>
    <targetClasses>
      <param>com.example.*</param>
    </targetClasses>
    <targetTests>
      <param>com.example.*Test</param>
    </targetTests>
    <mutationThreshold>80</mutationThreshold>
  </configuration>
</plugin>
```

### Running

```bash
mvn org.pitest:pitest-maven:mutationCoverage
```

---

## Go with go-mutesting

### Installation

```bash
go install github.com/zimmski/go-mutesting/cmd/go-mutesting@latest
```

### Running

```bash
# Basic run
go-mutesting ./...

# With specific mutators
go-mutesting --mutator=statement/remove ./...

# Output to file
go-mutesting --output=mutants.txt ./...
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Mutation Testing
on:
  push:
    branches: [main]
  pull_request:

jobs:
  mutation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run mutation tests
        run: npx stryker run

      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: stryker-report
          path: reports/mutation/

      - name: Check threshold
        run: |
          score=$(cat reports/mutation/mutation.json | jq '.mutationScore')
          if (( $(echo "$score < 70" | bc -l) )); then
            echo "Mutation score $score is below threshold"
            exit 1
          fi
```

### GitLab CI

```yaml
mutation_testing:
  stage: test
  script:
    - npm ci
    - npx stryker run
  artifacts:
    paths:
      - reports/mutation/
    reports:
      junit: reports/mutation/mutation.xml
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

---

## Best Practices

### 1. Start Small

```bash
# Don't mutate everything at once
npx stryker run --mutate "src/core/**/*.ts"
```

### 2. Use Incremental Mode

```bash
# Only test changes
npx stryker run --incremental
mutmut run --use-coverage
```

### 3. Exclude Non-Critical Code

```javascript
// stryker.conf.js
mutate: [
  'src/**/*.ts',
  '!src/**/*.spec.ts',
  '!src/config/**/*',     // Config rarely needs mutation testing
  '!src/migrations/**/*', // Database migrations
  '!src/types/**/*',      // Type definitions
]
```

### 4. Set Realistic Thresholds

```javascript
thresholds: {
  high: 80,  // Green badge
  low: 60,   // Yellow badge
  break: 50, // Fail build
}
```

### 5. Focus on Business Logic

Prioritize mutation testing for:
- Core business rules
- Validation logic
- Financial calculations
- Security-critical code

### 6. Review Survived Mutants

Not all surviving mutants need tests:

```javascript
// Equivalent mutant - behavior unchanged
// Original: i = 0; i < arr.length; i++
// Mutant:   i = 0; i != arr.length; i++
// This is equivalent for normal arrays

// Don't test mutants in:
// - Logging statements
// - Debug code
// - Cosmetic changes
```

### 7. Combine with Coverage

```bash
# Only mutate covered code
npx stryker run --coverageAnalysis perTest
mutmut run --use-coverage
```

---

## Troubleshooting

### Slow Runs

```javascript
// Limit concurrent mutants
concurrency: 2,

// Set timeout
timeoutMS: 5000,
timeoutFactor: 1.5,

// Use incremental mode
incremental: true,
```

### Memory Issues

```bash
# Increase Node memory
NODE_OPTIONS="--max-old-space-size=4096" npx stryker run

# Reduce parallelism
npx stryker run --concurrency 1
```

### Flaky Results

```javascript
// Disable problematic mutators
mutator: {
  excludedMutations: [
    'OptionalChaining',
    'StringLiteral',
  ],
}
```
