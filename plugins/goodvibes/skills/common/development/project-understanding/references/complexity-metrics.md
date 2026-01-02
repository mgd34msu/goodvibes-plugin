# Complexity Metrics Reference

Detailed complexity calculation patterns and thresholds by language.

## Cyclomatic Complexity

### Calculation Method

Cyclomatic complexity = E - N + 2P
- E = edges in control flow graph
- N = nodes in control flow graph
- P = number of connected components (usually 1)

**Simplified counting:**
Add 1 for each:
- `if`, `else if`, `elif`
- `for`, `while`, `do-while`
- `case` (in switch statements)
- `catch`, `except`
- `&&`, `||` (short-circuit operators)
- `?:` (ternary operator)

### Language-Specific Tools

#### JavaScript/TypeScript

```bash
# escomplex (detailed metrics)
npm install -g escomplex
escomplex src/ --format json

# Output includes:
# - cyclomatic complexity
# - Halstead metrics
# - maintainability index

# plato (visual reports)
npm install -g plato
plato -r -d report src/
```

#### Python

```bash
# radon (complexity metrics)
pip install radon

# Cyclomatic complexity
radon cc src/ -a -s  # -a: average, -s: show score

# Maintainability index
radon mi src/ -s

# Halstead metrics
radon hal src/

# Output grades:
# A (1-5): low complexity
# B (6-10): moderate
# C (11-20): high
# D (21-30): very high
# F (31+): untestable
```

#### Go

```bash
# gocyclo
go install github.com/fzipp/gocyclo/cmd/gocyclo@latest
gocyclo -over 10 ./...

# gocognit (cognitive complexity)
go install github.com/uudashr/gocognit/cmd/gocognit@latest
gocognit -over 10 ./...
```

#### Java

```bash
# PMD
pmd -d src -R category/java/design.xml -f text

# Checkstyle with CyclomaticComplexity check
<module name="CyclomaticComplexity">
  <property name="max" value="10"/>
</module>
```

#### Multi-Language

```bash
# Lizard - supports 20+ languages
pip install lizard
lizard src/ --CCN 15  # threshold of 15

# Output columns:
# NLOC: lines of code
# CCN: cyclomatic complexity
# token: token count
# PARAM: parameter count
# length: function length
```

## Cognitive Complexity

### Calculation Rules

**Base increments (+1):**
- Loops: `for`, `while`, `do-while`
- Conditionals: `if`, `else if`, ternary
- Exception handling: `catch`
- Switch-like patterns
- Logical operators: `&&`, `||`
- Goto statements

**Nesting increments (+nesting level):**
- Each level of nesting adds to the increment
- A deeply nested `if` costs more than a shallow one

**No increment:**
- `else` (already counted with `if`)
- `finally` blocks
- Sequential statements

### Example Calculation

```javascript
function processOrder(order) {                    // +0
  if (order.items.length === 0) {                // +1 (if)
    return { error: 'Empty order' };
  }

  for (const item of order.items) {              // +1 (for)
    if (item.quantity <= 0) {                    // +2 (if, nested +1)
      return { error: 'Invalid quantity' };
    }

    if (item.price < 0 || !item.sku) {           // +2 (if, nested +1) +1 (||)
      return { error: 'Invalid item' };
    }
  }

  return processPayment(order);
}
// Total cognitive complexity: 7
```

### Tools

```bash
# SonarQube (most comprehensive)
# Includes cognitive complexity in analysis

# eslint-plugin-sonarjs
npm install eslint-plugin-sonarjs
# Rule: sonarjs/cognitive-complexity
```

## Coupling Metrics

### Afferent Coupling (Ca)
Number of classes that depend on this class.
High Ca = many dependents, changes are risky.

### Efferent Coupling (Ce)
Number of classes this class depends on.
High Ce = many dependencies, fragile.

### Instability (I)
I = Ce / (Ca + Ce)
- 0 = maximally stable (many dependents, few dependencies)
- 1 = maximally unstable (few dependents, many dependencies)

### Abstractness (A)
A = abstract classes / total classes
- 0 = concrete package
- 1 = fully abstract

### Distance from Main Sequence
D = |A + I - 1|
- Closer to 0 is better
- Far from 0 = either too abstract or too concrete

## Maintainability Index

### Formula (Microsoft variant)

```
MI = 171 - 5.2 * ln(V) - 0.23 * G - 16.2 * ln(LOC)
```

Where:
- V = Halstead Volume
- G = Cyclomatic Complexity
- LOC = Lines of Code

### Score Interpretation

| Score | Rating | Action |
|-------|--------|--------|
| 85-100 | High maintainability | Good |
| 65-84 | Moderate maintainability | Monitor |
| 0-64 | Low maintainability | Refactor |

## Thresholds by Context

### Libraries/Utilities
More strict thresholds:
- Cyclomatic: max 10
- Cognitive: max 15
- Method length: max 20 lines

### Application Code
Standard thresholds:
- Cyclomatic: max 15
- Cognitive: max 20
- Method length: max 50 lines

### Legacy Code
Relaxed for gradual improvement:
- Cyclomatic: max 25
- Cognitive: max 30
- Method length: max 100 lines

## Reporting Templates

### Module Complexity Report

```markdown
## Complexity Report: {module}

### Summary
- Files analyzed: {count}
- Average cyclomatic complexity: {avg}
- Average cognitive complexity: {avg}
- High-risk functions: {count}

### High Complexity Functions (>15)

| Function | File | Cyclomatic | Cognitive | Action |
|----------|------|------------|-----------|--------|
| processOrder | orders.ts:45 | 23 | 28 | Refactor |
| validateInput | validate.ts:12 | 18 | 21 | Review |

### Recommendations
1. Extract validation logic from processOrder
2. Use early returns to reduce nesting in validateInput
```
