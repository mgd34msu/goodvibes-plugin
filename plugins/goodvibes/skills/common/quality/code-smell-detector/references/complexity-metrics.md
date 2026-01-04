# Complexity Metrics Reference

Quantified thresholds for code complexity analysis.

## Cyclomatic Complexity

Measures the number of independent paths through code.

### Calculation

```
M = E - N + 2P

Where:
E = Number of edges in control flow graph
N = Number of nodes in control flow graph
P = Number of connected components (usually 1)
```

### Thresholds by Language

| Language | Low | Medium | High | Critical |
|----------|-----|--------|------|----------|
| TypeScript/JavaScript | 1-10 | 11-15 | 16-25 | 26+ |
| Python | 1-10 | 11-15 | 16-25 | 26+ |
| Go | 1-10 | 11-15 | 16-20 | 21+ |
| Java | 1-10 | 11-20 | 21-30 | 31+ |
| C/C++ | 1-10 | 11-20 | 21-50 | 51+ |

### Detection Commands

```bash
# JavaScript/TypeScript
npx escomplex src/ --format json | jq '.reports[].functions[] | {name: .name, cyclomatic: .cyclomatic}'

# Python
radon cc src/ -a -s --json | jq '.[]'

# Multi-language
lizard src/ --CCN 15

# Go
gocyclo -over 10 .

# Java
pmd -d src -R rulesets/java/design.xml -f json
```

### Deduction Scale

| Complexity | Deduction per Function |
|------------|----------------------|
| 11-15 | 0.1 points |
| 16-20 | 0.25 points |
| 21-30 | 0.5 points |
| 31+ | 1.0 points |

---

## Cognitive Complexity

Measures mental effort required to understand code.

### Increments

**+1 for each:**
- `if`, `else if`, `else`
- `switch`, `case`
- `for`, `while`, `do-while`
- `catch`
- `break`, `continue` (with label)
- Sequences of logical operators (&&, ||)

**+1 per nesting level for:**
- Nested control structures
- Nested functions/lambdas

### Thresholds

| Level | Score | Action |
|-------|-------|--------|
| Simple | 0-5 | Good |
| Moderate | 6-10 | Acceptable |
| Complex | 11-15 | Consider refactoring |
| Very Complex | 16-20 | Refactor |
| Unmaintainable | 21+ | Must refactor |

### Detection Commands

```bash
# SonarQube cognitive complexity
# Use ESLint plugin
npm install eslint-plugin-sonarjs
# Rule: sonarjs/cognitive-complexity

# Manual estimation
# Count nesting + control structures
```

---

## Nesting Depth

### Thresholds

| Depth | Risk | Action |
|-------|------|--------|
| 1-2 | Low | Acceptable |
| 3 | Medium | Watch |
| 4 | High | Refactor |
| 5+ | Critical | Must refactor |

### Detection Commands

```bash
# Find deeply nested code (4+ levels)
# Look for multiple { at same indentation
grep -rn "^\s\{16,\}" src/  # 4+ tabs/16+ spaces

# ESLint max-depth rule
# "max-depth": ["error", 3]
```

### Deduction Scale

| Max Depth | Deduction |
|-----------|-----------|
| 4 | 0.25 points |
| 5 | 0.5 points |
| 6+ | 1.0 points |

---

## Lines of Code Metrics

### Function Length

| Lines | Rating | Deduction |
|-------|--------|-----------|
| 1-20 | Excellent | 0 |
| 21-40 | Good | 0 |
| 41-60 | Acceptable | 0.1 |
| 61-100 | Warning | 0.25 |
| 101-200 | Poor | 0.5 |
| 201+ | Unacceptable | 1.0 |

### File Length

| Lines | Rating | Deduction |
|-------|--------|-----------|
| 1-100 | Excellent | 0 |
| 101-200 | Good | 0 |
| 201-300 | Acceptable | 0 |
| 301-500 | Warning | 0.25 |
| 501-1000 | Poor | 0.5 |
| 1001+ | Unacceptable | 1.0 |

### Class/Module Length

| Lines | Rating | Deduction |
|-------|--------|-----------|
| 1-100 | Excellent | 0 |
| 101-200 | Good | 0 |
| 201-300 | Acceptable | 0.1 |
| 301-500 | Warning | 0.5 |
| 501+ | Poor | 1.0 |

---

## Coupling Metrics

### Afferent Coupling (Ca)

Number of classes that depend on this class.

| Ca | Interpretation |
|----|----------------|
| 0-5 | Low impact if changed |
| 6-10 | Moderate impact |
| 11-20 | High impact |
| 21+ | Critical - changes are risky |

### Efferent Coupling (Ce)

Number of classes this class depends on.

| Ce | Interpretation |
|----|----------------|
| 0-5 | Low dependency |
| 6-10 | Moderate dependency |
| 11-15 | High dependency |
| 16+ | Too many dependencies |

### Instability

```
I = Ce / (Ca + Ce)

I = 0: Maximally stable (many dependents, few dependencies)
I = 1: Maximally unstable (few dependents, many dependencies)
```

---

## Detection Tool Summary

| Language | Tool | Metrics |
|----------|------|---------|
| JS/TS | escomplex | Cyclomatic, Halstead, LOC |
| JS/TS | plato | Maintainability index |
| Python | radon | Cyclomatic, Halstead, MI |
| Python | xenon | Complexity monitoring |
| Go | gocyclo | Cyclomatic |
| Java | PMD | All metrics |
| Multi | lizard | Cyclomatic, LOC |
| Multi | SonarQube | Comprehensive |

---

## Maintainability Index

Combined metric (0-100 scale).

### Calculation

```
MI = 171 - 5.2 * ln(V) - 0.23 * G - 16.2 * ln(LOC) + 50 * sin(sqrt(2.4 * CM))

Where:
V = Halstead Volume
G = Cyclomatic Complexity
LOC = Lines of Code
CM = Percent of comment lines
```

### Thresholds

| MI Score | Rating | Deduction |
|----------|--------|-----------|
| 85-100 | Excellent | 0 |
| 65-84 | Good | 0 |
| 50-64 | Moderate | 0.25 |
| 35-49 | Poor | 0.5 |
| 0-34 | Unmaintainable | 1.0 |
