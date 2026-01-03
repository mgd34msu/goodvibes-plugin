# Issue Categorization Guide

Systematic taxonomy for classifying code issues by type, severity, and priority.

## Category Taxonomy

### Primary Categories

| Category | Scope | Weight | Description |
|----------|-------|--------|-------------|
| **Security** | Safety | x3 | Vulnerabilities, data exposure, auth flaws |
| **Logic** | Correctness | x3 | Bugs, edge cases, incorrect behavior |
| **Performance** | Efficiency | x2 | Slowness, resource waste, scalability blockers |
| **Structural** | Architecture | x2 | Organization, complexity, coupling, cohesion |
| **Naming** | Clarity | x1 | Identifier quality, consistency |
| **Style** | Polish | x1 | Formatting, conventions, aesthetics |

---

## Security Category

### Subcategories

| Subcategory | Examples | Severity Range |
|-------------|----------|----------------|
| **Injection** | SQL, XSS, Command, LDAP | 8-10 |
| **Authentication** | Weak password handling, session issues | 7-10 |
| **Authorization** | Missing access checks, privilege escalation | 7-10 |
| **Data Exposure** | Hardcoded secrets, logging PII, error leaks | 6-10 |
| **Cryptography** | Weak algorithms, improper key management | 6-9 |
| **Input Validation** | Missing validation, type confusion | 5-8 |

### Severity Criteria

**Critical (9-10):** Exploitable with standard tools, leads to data breach or system compromise
```
- SQL injection with direct user input
- Hardcoded production credentials
- Authentication bypass
```

**High (7-8):** Exploitable with crafted input, significant impact
```
- XSS vulnerabilities
- Insecure deserialization
- Missing authorization checks
```

**Medium (5-6):** Requires specific conditions, limited impact
```
- Information disclosure in errors
- Weak but not broken crypto
- Missing rate limiting
```

**Low (3-4):** Minimal exploitability, defense in depth
```
- Missing security headers
- Overly permissive CORS
- Debug mode in non-prod
```

---

## Logic Category

### Subcategories

| Subcategory | Examples | Severity Range |
|-------------|----------|----------------|
| **Crash Bugs** | Null dereference, divide by zero, stack overflow | 8-10 |
| **Data Corruption** | Race conditions, lost updates, inconsistent state | 7-10 |
| **Incorrect Behavior** | Wrong calculation, bad algorithm | 6-9 |
| **Edge Cases** | Empty input, boundary values, overflow | 5-8 |
| **Error Handling** | Silent failures, wrong exception type | 4-7 |
| **Type Issues** | Coercion bugs, wrong type returned | 4-7 |

### Severity Criteria

**Critical (9-10):** Data loss, security implications, always fails
```
- Race condition causing double-charge
- Crash on common input
- Data corruption under normal use
```

**High (7-8):** Frequent failures, significant user impact
```
- Crash on edge case (~5% of inputs)
- Calculation error affecting pricing
- State inconsistency after error
```

**Medium (5-6):** Occasional failures, workaround exists
```
- Crash on rare edge case (<1% of inputs)
- Minor calculation rounding errors
- Ugly but functional error recovery
```

**Low (3-4):** Cosmetic or theoretical issues
```
- Type coercion that works by accident
- Unreachable error handling code
- Suboptimal but correct algorithm
```

---

## Performance Category

### Subcategories

| Subcategory | Examples | Severity Range |
|-------------|----------|----------------|
| **Algorithmic** | O(n^2) when O(n) possible, N+1 queries | 6-9 |
| **Resource Leaks** | Memory leaks, file handle leaks, connection leaks | 6-9 |
| **Blocking** | Sync operations in async context, UI freezes | 5-8 |
| **Waste** | Redundant computation, unnecessary copies | 4-7 |
| **Scalability** | Linear assumptions, unbounded growth | 5-8 |
| **Caching** | Missing cache, cache thrashing, stale data | 4-7 |

### Severity Criteria

**Critical (8-9):** System unusable, resource exhaustion
```
- Memory leak crashing server in hours
- N+1 query making page load 30+ seconds
- Unbounded queue growing to OOM
```

**High (6-7):** Noticeably slow, impacts user experience
```
- Page load >3 seconds due to inefficiency
- API timeout under moderate load
- Mobile battery drain from busy loops
```

**Medium (4-5):** Measurable but tolerable
```
- 500ms delay that could be 50ms
- Moderate memory overhead
- Unnecessary network calls
```

**Low (2-3):** Theoretical or minor
```
- Micro-optimization opportunity
- Single unnecessary allocation
- Premature optimization removed
```

---

## Structural Category

### Subcategories

| Subcategory | Examples | Severity Range |
|-------------|----------|----------------|
| **Coupling** | Circular dependencies, god classes, tight binding | 5-8 |
| **Cohesion** | Mixed responsibilities, scattered logic | 5-8 |
| **Complexity** | High cyclomatic complexity, deep nesting | 4-7 |
| **Abstraction** | Wrong level, leaky abstractions | 4-7 |
| **Duplication** | Copy-paste code, repeated logic | 4-6 |
| **Organization** | Poor file structure, inconsistent patterns | 3-5 |

### Severity Criteria

**High (7-8):** Blocks development, causes cascading issues
```
- Circular dependency preventing testing
- God class requiring understanding of entire system
- Coupling that forces shotgun surgery
```

**Medium (5-6):** Slows development, increases bug risk
```
- High complexity in frequently modified code
- Moderate duplication (3-4 copies)
- Inconsistent patterns causing confusion
```

**Low (3-4):** Suboptimal but functional
```
- Slightly too many responsibilities
- Minor duplication (2 copies)
- Acceptable complexity for scope
```

---

## Naming Category

### Subcategories

| Subcategory | Examples | Severity Range |
|-------------|----------|----------------|
| **Misleading** | Wrong type implied, contradicts behavior | 6-8 |
| **Opaque** | Single letters, abbreviations, 'temp' | 4-6 |
| **Vague** | 'handle', 'process', 'data', 'stuff' | 3-5 |
| **Inconsistent** | Mixed conventions, synonyms for same concept | 3-5 |
| **Verbose** | Unnecessary words, Hungarian notation | 2-3 |

### Severity Criteria

**High (7-8):** Actively causes bugs
```
- isActive() returns string (causes boolean bugs)
- save() doesn't persist (causes data loss assumptions)
- count variable holds an ID
```

**Medium (4-6):** Requires investigation to understand
```
- Single letter variables in business logic
- Multiple names for same concept
- Acronyms without documentation
```

**Low (2-3):** Suboptimal but clear enough
```
- getUserData vs fetchUser (both clear)
- Slightly verbose: userItemListArray
- Minor inconsistency in test files
```

---

## Style Category

### Subcategories

| Subcategory | Examples | Severity Range |
|-------------|----------|----------------|
| **Dead Code** | Unreachable code, unused imports, commented code | 3-5 |
| **Formatting** | Inconsistent indentation, mixed quotes | 2-4 |
| **Documentation** | Missing for complex logic, outdated comments | 2-4 |
| **Conventions** | Framework patterns not followed | 2-4 |
| **Magic Values** | Unexplained literals | 2-4 |
| **Aesthetic** | Line length, blank lines, brace style | 1-2 |

### Severity Criteria

**Medium (4-5):** Maintenance burden, cognitive load
```
- Large blocks of commented code
- Missing docs on complex public API
- 20+ magic numbers in one file
```

**Low (2-3):** Minor friction
```
- Inconsistent quote style
- Missing JSDoc on internal function
- Few magic numbers
```

**Trivial (1):** Pure preference
```
- Brace on same line vs next line
- Trailing comma or not
- Blank lines between methods
```

---

## Priority Matrix

### Impact vs Effort

```
                      Impact on Quality
                 Low          |          High
            +----------------+------------------+
    High    |    DEFER       |     PLAN         |
   Effort   |  (Backlog)     |   (Sprint goal)  |
            +----------------+------------------+
    Low     |    MAYBE       |     DO NOW       |
   Effort   |  (Optional)    |   (Immediate)    |
            +----------------+------------------+
```

### Risk vs Frequency

```
                      Occurrence Frequency
                 Rare           |          Common
            +------------------+------------------+
    High    |   MONITOR        |     CRITICAL     |
    Risk    | (Track, plan)    |   (Stop & fix)   |
            +------------------+------------------+
    Low     |   ACCEPT         |     BATCH        |
    Risk    | (Known issue)    |   (Next cleanup) |
            +------------------+------------------+
```

---

## Weighted Scoring

### Formula

```
Issue Score = Raw Severity (1-10) * Category Weight

Total Weighted Score = Sum of all Issue Scores

Quality Score = 100 - (Total Weighted Score / Lines of Code * 10)
```

### Example Calculation

```
File: UserService.ts (400 lines)

Issues:
1. SQL Injection (Security)      - Severity: 10 * Weight: 3 = 30
2. Null dereference (Logic)      - Severity: 8 * Weight: 3 = 24
3. N+1 query (Performance)       - Severity: 7 * Weight: 2 = 14
4. God class (Structural)        - Severity: 7 * Weight: 2 = 14
5. Vague name x5 (Naming)        - Severity: 4 * Weight: 1 = 4 each = 20
6. Magic numbers x3 (Style)      - Severity: 3 * Weight: 1 = 3 each = 9

Total Weighted Score: 30 + 24 + 14 + 14 + 20 + 9 = 111

Quality Score: 100 - (111 / 400 * 10) = 100 - 2.78 = 97.2

Interpretation: Despite many issues, relatively good for file size.
Critical security issue must be fixed before merge.
```

---

## Triage Guidelines

### Block Merge (Must Fix)
- Any Security severity 8+
- Any Logic severity 9+
- Quality score <50

### Require in PR (Should Fix)
- Any Security severity 5+
- Any Logic severity 7+
- Performance issues affecting user experience
- Quality score <70

### Track for Later (Nice to Fix)
- Structural improvements
- Naming polish
- Style consistency
- Quality score 70-85

### Accept (Known Tradeoff)
- Documented tech debt
- Temporary workarounds with tickets
- Style preferences in established codebase
- Quality score >85 with no severity 7+
