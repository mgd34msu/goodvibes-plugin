# Architecture Metrics Reference

Comprehensive guide to measuring and evaluating architectural quality through quantitative metrics.

## Coupling Metrics

### Afferent Coupling (Ca)

**Definition:** Number of classes/modules that depend on this class/module.

**Interpretation:**
- High Ca = Many dependents = Changes are risky
- Low Ca = Few dependents = Changes are safe

**Calculation:**
```javascript
// For module M, count imports of M from other modules
function calculateCa(module, allModules) {
  return allModules.filter(m =>
    m !== module && m.imports.includes(module)
  ).length;
}
```

**Thresholds:**
| Score | Level | Guidance |
|-------|-------|----------|
| 0-5 | Low | Normal, can change freely |
| 6-15 | Medium | Changes need consideration |
| 16-30 | High | Careful change management required |
| 31+ | Very High | Consider interface stabilization |

---

### Efferent Coupling (Ce)

**Definition:** Number of classes/modules this class/module depends on.

**Interpretation:**
- High Ce = Many dependencies = Fragile, affected by many changes
- Low Ce = Few dependencies = Stable, isolated

**Calculation:**
```javascript
function calculateCe(module) {
  return module.imports.length;
}
```

**Thresholds:**
| Score | Level | Guidance |
|-------|-------|----------|
| 0-5 | Low | Well-isolated |
| 6-10 | Medium | Normal complexity |
| 11-20 | High | Consider reducing dependencies |
| 21+ | Very High | Refactoring needed |

---

### Instability (I)

**Definition:** Ratio of efferent coupling to total coupling.

**Formula:** `I = Ce / (Ca + Ce)`

**Interpretation:**
- I = 0: Maximally stable (many depend on it, it depends on few)
- I = 1: Maximally unstable (few depend on it, it depends on many)

**Ideal Distribution:**
```
              I=0                    I=1
Stable        |<---- Core ---->|<-- Leaves -->|
Abstractions  +-----------------+-----------------+

Core modules should be stable (I -> 0)
Leaf modules can be unstable (I -> 1)
```

**Thresholds:**
| I Value | Type | Characteristics |
|---------|------|-----------------|
| 0.0-0.3 | Stable | Core libraries, interfaces |
| 0.3-0.7 | Mixed | Services, business logic |
| 0.7-1.0 | Unstable | Controllers, UI, scripts |

---

### Abstractness (A)

**Definition:** Ratio of abstract types to total types.

**Formula:** `A = Abstract Classes / Total Classes`

**Interpretation:**
- A = 0: Completely concrete
- A = 1: Completely abstract

---

### Distance from Main Sequence (D)

**Definition:** Measures the balance between stability and abstractness.

**Formula:** `D = |A + I - 1|`

**Interpretation:**
- D = 0: Ideal balance
- D -> 1: Problem zone

**Zones:**
```
    A (Abstractness)
    1 +-------+-------+
      | Zone  |       |
      | of    |  OK   |
      | Pain  |       |
  0.5 +-------+-------+
      |       | Zone  |
      |  OK   | of    |
      |       | Useless|
    0 +-------+-------+
      0      0.5      1
             I (Instability)

Zone of Pain: Stable AND concrete = hard to extend
Zone of Uselessness: Unstable AND abstract = pointless abstraction
```

---

### Coupling Between Objects (CBO)

**Definition:** Count of classes to which a class is coupled.

**Calculation:**
```javascript
function calculateCBO(classA, allClasses) {
  let coupled = new Set();

  // Direct usage
  classA.methods.forEach(method => {
    method.calls.forEach(call => coupled.add(call.targetClass));
    method.parameters.forEach(param => coupled.add(param.type));
  });

  // Field types
  classA.fields.forEach(field => coupled.add(field.type));

  // Inheritance
  if (classA.extends) coupled.add(classA.extends);
  classA.implements.forEach(i => coupled.add(i));

  return coupled.size;
}
```

**Thresholds:**
| CBO | Level | Guidance |
|-----|-------|----------|
| 0-4 | Low | Well-encapsulated |
| 5-9 | Medium | Acceptable |
| 10-14 | High | Review dependencies |
| 15+ | Very High | Needs refactoring |

---

## Cohesion Metrics

### LCOM (Lack of Cohesion of Methods)

Several variants exist:

#### LCOM1 (Chidamber & Kemerer)

**Formula:** `LCOM1 = P - Q` where:
- P = pairs of methods with no shared attributes
- Q = pairs of methods with shared attributes

**Interpretation:**
- High LCOM1 = Low cohesion
- LCOM1 = 0 = Perfect cohesion

#### LCOM4 (Henderson-Sellers)

**Definition:** Number of connected components in method-field graph.

**Calculation:**
```javascript
function calculateLCOM4(classObj) {
  // Build graph: methods as nodes, edges if they share a field
  const graph = new Map();

  classObj.methods.forEach(method => {
    graph.set(method.name, new Set());
  });

  classObj.methods.forEach((m1, i) => {
    classObj.methods.slice(i + 1).forEach(m2 => {
      const sharedFields = m1.accessedFields.filter(f =>
        m2.accessedFields.includes(f)
      );
      if (sharedFields.length > 0) {
        graph.get(m1.name).add(m2.name);
        graph.get(m2.name).add(m1.name);
      }
    });
  });

  // Count connected components
  return countConnectedComponents(graph);
}
```

**Thresholds:**
| LCOM4 | Level | Interpretation |
|-------|-------|----------------|
| 1 | Ideal | Single responsibility |
| 2 | Acceptable | Minor cohesion issue |
| 3-4 | High | Consider splitting |
| 5+ | Very High | Split into multiple classes |

---

### TCC (Tight Class Cohesion)

**Definition:** Ratio of directly connected method pairs to total possible pairs.

**Formula:** `TCC = NDC / NP`
- NDC = Number of directly connected pairs
- NP = N * (N-1) / 2 (total possible pairs for N methods)

**Interpretation:**
- TCC = 1.0: Perfect cohesion
- TCC = 0.0: No cohesion

**Thresholds:**
| TCC | Level | Guidance |
|-----|-------|----------|
| 0.5-1.0 | High | Good cohesion |
| 0.3-0.5 | Medium | Acceptable |
| 0.0-0.3 | Low | Consider refactoring |

---

## Complexity Metrics

### Cyclomatic Complexity (CC)

**Definition:** Number of linearly independent paths through code.

**Formula:** `CC = E - N + 2P`
- E = edges in control flow graph
- N = nodes in control flow graph
- P = connected components (usually 1)

**Simplified Counting:**
Add 1 for each:
- `if`, `else if`, `elif`
- `for`, `while`, `do-while`
- `case` (in switch)
- `catch`, `except`
- `&&`, `||`
- `?:` (ternary)

**Example:**
```javascript
function example(a, b) {      // +1 (base)
  if (a > 0) {                // +1
    if (b > 0) {              // +1
      return a + b;
    } else {
      return a - b;
    }
  }

  for (let i = 0; i < a; i++) { // +1
    if (i % 2 === 0) {          // +1
      console.log(i);
    }
  }

  return a && b ? a : b;        // +2 (&& and ?:)
}
// Total CC = 7
```

**Thresholds:**
| CC | Risk | Action |
|----|------|--------|
| 1-10 | Low | No action |
| 11-20 | Medium | Review, consider simplifying |
| 21-50 | High | Refactor recommended |
| 50+ | Very High | Must refactor |

---

### Cognitive Complexity

**Definition:** Measures how difficult code is to understand (human perspective).

**Rules:**
1. **Increment for breaks in linear flow:**
   - Loops: `for`, `while`, `do-while` (+1)
   - Conditionals: `if`, `else if`, `switch` (+1)
   - Exception handling: `catch` (+1)
   - Logical operators (sequences): `&&`, `||` (+1)
   - Jumps: `break`, `continue` with label (+1)

2. **Nesting penalty:**
   - Add nesting depth to each increment
   - Deeper nesting = higher cognitive load

3. **No increment for:**
   - `else` (already counted with `if`)
   - `finally` blocks
   - Consecutive operations

**Example:**
```javascript
function processOrder(order) {                    // +0
  if (order.items.length === 0) {                // +1 (if)
    return { error: 'Empty' };
  }

  for (const item of order.items) {              // +1 (for)
    if (item.quantity <= 0) {                    // +2 (if, nesting=1)
      return { error: 'Invalid qty' };
    }

    if (item.price < 0 || !item.sku) {           // +2 (if, nesting=1)
      return { error: 'Invalid item' };          // +1 (||)
    }
  }

  return processPayment(order);
}
// Total Cognitive Complexity = 7
```

**Thresholds:**
| Score | Level | Guidance |
|-------|-------|----------|
| 0-10 | Low | Easy to understand |
| 11-20 | Medium | Consider simplifying |
| 21-30 | High | Difficult to maintain |
| 30+ | Very High | Must refactor |

---

## Size Metrics

### Lines of Code (LOC)

**Variants:**
- **Physical LOC:** Total lines including blanks and comments
- **Logical LOC:** Executable statements only
- **Comment LOC:** Comment lines only

**Thresholds (per file):**
| LOC | Level | Guidance |
|-----|-------|----------|
| 0-200 | Small | Ideal |
| 201-500 | Medium | Acceptable |
| 501-1000 | Large | Consider splitting |
| 1000+ | Very Large | Needs refactoring |

---

### Depth of Inheritance Tree (DIT)

**Definition:** Length of longest path from class to root of hierarchy.

**Thresholds:**
| DIT | Level | Guidance |
|-----|-------|----------|
| 0-2 | Shallow | Normal |
| 3-4 | Medium | Acceptable |
| 5+ | Deep | Consider composition |

---

### Number of Children (NOC)

**Definition:** Number of immediate subclasses.

**Thresholds:**
| NOC | Level | Interpretation |
|-----|-------|----------------|
| 0-5 | Low | Normal |
| 6-10 | Medium | Widely used abstraction |
| 11+ | High | May be too general |

---

## Maintainability Metrics

### Maintainability Index (MI)

**Formula (Microsoft variant):**
```
MI = 171 - 5.2 * ln(HV) - 0.23 * CC - 16.2 * ln(LOC)
```
Where:
- HV = Halstead Volume
- CC = Cyclomatic Complexity
- LOC = Lines of Code

**Thresholds:**
| MI | Rating | Action |
|----|--------|--------|
| 85-100 | High | Good |
| 65-84 | Medium | Monitor |
| 0-64 | Low | Refactor |

---

### Technical Debt Ratio

**Definition:** Ratio of remediation effort to development effort.

**Formula:** `TDR = Remediation Time / Development Time`

**Thresholds:**
| TDR | Level | Interpretation |
|-----|-------|----------------|
| <5% | A | Excellent |
| 5-10% | B | Good |
| 10-20% | C | Concerning |
| 20-50% | D | Critical |
| >50% | E | Severe |

---

## Tool Commands for Metric Collection

### JavaScript/TypeScript

```bash
# Complexity metrics
npx escomplex src/ --format json > metrics.json

# Dependency metrics
npx dependency-cruiser --output-type metrics src/

# Maintainability
npx plato -r -d report src/

# Coverage as metric
npm test -- --coverage --coverageReporters=json
```

### Python

```bash
# Cyclomatic complexity
radon cc src/ -a -j > complexity.json

# Maintainability index
radon mi src/ -j > maintainability.json

# Halstead metrics
radon hal src/ -j > halstead.json

# Raw metrics (LOC, etc)
radon raw src/ -j > raw.json
```

### Multi-Language

```bash
# Lizard - supports 20+ languages
lizard src/ -l python -l javascript --CCN 15 --csv > metrics.csv

# SonarQube (comprehensive)
sonar-scanner -Dsonar.projectKey=myproject -Dsonar.sources=src/
```

### Go

```bash
# Cyclomatic
gocyclo -over 10 ./...

# Cognitive
gocognit -over 15 ./...

# Test coverage
go test -coverprofile=coverage.out ./...
go tool cover -func=coverage.out
```

---

## Metric Dashboard Template

```markdown
## Architecture Metrics Dashboard

### Module Coupling Summary

| Module | Ca | Ce | I | A | D | Health |
|--------|-----|-----|------|------|------|--------|
| core/domain | 25 | 3 | 0.11 | 0.8 | 0.09 | Good |
| api/routes | 5 | 18 | 0.78 | 0.1 | 0.12 | Good |
| services/order | 12 | 15 | 0.56 | 0.2 | 0.24 | OK |

### Complexity Hotspots

| File | CC | Cognitive | LOC | Status |
|------|-----|-----------|-----|--------|
| OrderProcessor.ts | 45 | 52 | 850 | CRITICAL |
| Validator.ts | 28 | 35 | 420 | HIGH |
| Parser.ts | 15 | 18 | 280 | MEDIUM |

### Cohesion Analysis

| Class | LCOM4 | TCC | Status |
|-------|-------|------|--------|
| OrderService | 3 | 0.4 | WARN - Consider split |
| UserRepository | 1 | 0.8 | OK |
| ConfigManager | 5 | 0.2 | CRITICAL |

### Trends (vs Last Month)

| Metric | Current | Previous | Trend |
|--------|---------|----------|-------|
| Avg CC | 12.3 | 11.8 | UP |
| Test Coverage | 78% | 75% | UP |
| Tech Debt Ratio | 12% | 14% | DOWN |
```

---

## Metric Collection Workflow

```
1. BASELINE
   - Run all metric tools
   - Document current state
   - Identify worst offenders

2. THRESHOLDS
   - Set target thresholds
   - Configure tools for violations
   - Add to CI/CD

3. MONITOR
   - Regular metric collection
   - Trend analysis
   - Alert on regression

4. IMPROVE
   - Address violations
   - Track improvement
   - Celebrate wins
```
