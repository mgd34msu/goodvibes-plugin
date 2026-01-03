# Evidence Gathering Guide

How to quantify and document code issues with concrete, irrefutable evidence.

## The Evidence Standard

Every critique must include:

| Element | Description | Example |
|---------|-------------|---------|
| **Location** | File, line number(s), function name | `src/UserService.ts:45` in `processOrder()` |
| **Count** | How many occurrences | "12 instances across 4 files" |
| **Measurement** | Quantifiable metric | "134 lines, complexity 27" |
| **Comparison** | To standard or best practice | "4x over recommended maximum" |
| **Impact** | What breaks or degrades | "Crashes with null user, ~5% of requests" |

---

## Measurement Techniques

### Line Counts

**What to measure:**
- File length
- Function/method length
- Class length
- Block length (conditionals, loops)

**Commands:**
```bash
# File line counts
wc -l src/**/*.ts | sort -n | tail -20

# Functions over 50 lines (using grep heuristic)
grep -n "function\|=>" src/**/*.ts | head -100

# Large files (>300 lines)
find src -name "*.ts" -exec wc -l {} \; | awk '$1 > 300'
```

**Report format:**
```
FILE LENGTH VIOLATIONS (>300 lines)

| File | Lines | Over By |
|------|-------|---------|
| UserService.ts | 487 | 62% |
| OrderProcessor.ts | 412 | 37% |
| DataHandler.ts | 356 | 19% |
```

---

### Cyclomatic Complexity

**What it measures:**
Number of independent paths through code. Each decision point (if, while, for, case, catch, &&, ||, ?) adds 1.

**Thresholds:**
- 1-10: Simple, low risk
- 11-20: Moderate, some risk
- 21-50: Complex, high risk
- 50+: Untestable, very high risk

**Commands:**
```bash
# JavaScript/TypeScript
npx escomplex src/ --format json | jq '.reports[].functions[] | select(.cyclomatic > 10) | {name, cyclomatic}'

# Python
radon cc src/ -a -s --total-average

# Multi-language
lizard src/ -l python -l javascript --CCN 10
```

**Report format:**
```
COMPLEXITY VIOLATIONS (>10)

| Function | File:Line | Complexity | Risk |
|----------|-----------|------------|------|
| processOrder | UserService.ts:45 | 27 | High |
| validateInput | FormHandler.ts:123 | 18 | Moderate |
| calculatePrice | PricingEngine.ts:67 | 15 | Moderate |
```

---

### Coupling Metrics

**Afferent Coupling (Ca):** Who depends on me?
- High Ca = Stable module (changes break many things)
- Low Ca = Can change freely

**Efferent Coupling (Ce):** Who do I depend on?
- High Ce = Fragile module (breaks when others change)
- Low Ce = Independent

**Instability:** I = Ce / (Ca + Ce)
- 0 = Maximally stable (many dependents, few dependencies)
- 1 = Maximally unstable (few dependents, many dependencies)

**Commands:**
```bash
# JavaScript/TypeScript dependency analysis
npx madge --circular src/
npx madge --orphans src/
npx dependency-cruiser --output-type json src/ > deps.json

# Count imports per file
grep -c "^import" src/**/*.ts | sort -t: -k2 -n -r | head -20
```

**Report format:**
```
COUPLING ANALYSIS

High Afferent Coupling (Breaking changes affect many):
| Module | Dependents | Risk |
|--------|------------|------|
| utils/format.ts | 47 | Critical |
| services/auth.ts | 23 | High |

High Efferent Coupling (Fragile - many dependencies):
| Module | Dependencies | Risk |
|--------|--------------|------|
| pages/Dashboard.tsx | 34 | High |
| components/OrderForm.tsx | 21 | Medium |

Circular Dependencies:
- auth.ts -> user.ts -> permissions.ts -> auth.ts
- db.ts -> models.ts -> db.ts
```

---

### Cohesion Metrics

**LCOM (Lack of Cohesion of Methods):**
- LCOM = 0: Perfect cohesion (all methods use all fields)
- LCOM = 1: Acceptable
- LCOM > 1: Split candidate (disconnected method groups)

**Responsibility Count:**
Count distinct "reasons to change" in a class.

**Manual technique:**
1. List all public methods
2. Group by shared purpose
3. Count groups = responsibility count

**Report format:**
```
COHESION ANALYSIS: UserService

Methods: 23
Fields: 12

Responsibility Groups:
1. Authentication (8 methods, 3 fields)
   - login(), logout(), validateToken(), refreshToken()...
2. Email (5 methods, 2 fields)
   - sendWelcome(), sendReset(), sendVerification()...
3. Billing (6 methods, 4 fields)
   - charge(), refund(), updatePayment()...
4. Analytics (4 methods, 3 fields)
   - trackLogin(), trackPurchase()...

LCOM Score: 4 (should be 1)
Recommendation: Split into 4 services
```

---

### Test Coverage

**Commands:**
```bash
# JavaScript/TypeScript
npx jest --coverage --coverageReporters=text-summary
npx c8 report --reporter=text-summary

# Python
pytest --cov=src --cov-report=term-missing

# Go
go test -coverprofile=coverage.out ./...
go tool cover -func=coverage.out
```

**Report format:**
```
COVERAGE ANALYSIS

Overall: 67% (target: 80%)

Uncovered Files (0%):
- src/utils/legacy.ts
- src/services/migrate.ts

Low Coverage (<50%):
| File | Coverage | Uncovered Lines |
|------|----------|-----------------|
| OrderService.ts | 34% | 45-89, 112-167 |
| PaymentHandler.ts | 42% | 23-45, 78-90 |

Critical Paths Missing Tests:
- processPayment() - 0% coverage
- validateAuth() - 12% coverage
```

---

### Dependency Health

**Commands:**
```bash
# JavaScript/TypeScript
npm audit --json
npm outdated --json

# Python
pip-audit --format=json
pip list --outdated --format=json

# Go
go list -m -u all
```

**Report format:**
```
DEPENDENCY HEALTH

Security Vulnerabilities:
| Package | Severity | CVE | Fix Version |
|---------|----------|-----|-------------|
| lodash | Critical | CVE-2021-23337 | 4.17.21 |
| axios | High | CVE-2021-3749 | 0.21.2 |

Outdated (Major):
| Package | Current | Latest | Behind |
|---------|---------|--------|--------|
| react | 16.14.0 | 18.2.0 | 2 major |
| webpack | 4.46.0 | 5.88.0 | 1 major |

Outdated (Minor/Patch):
- 23 packages with available updates
```

---

### Duplication Detection

**Commands:**
```bash
# JavaScript/TypeScript
npx jscpd src/ --min-lines 5 --min-tokens 50

# Multi-language
npx jscpd src/ --format "typescript,javascript,css"
```

**Report format:**
```
DUPLICATION ANALYSIS

Total Duplication: 8.3% (target: <5%)

Clone Groups:
| Clone ID | Lines | Files | Similarity |
|----------|-------|-------|------------|
| Clone #1 | 45 | UserService.ts, AdminService.ts | 92% |
| Clone #2 | 23 | OrderForm.tsx, ProductForm.tsx | 88% |
| Clone #3 | 18 | validate.ts, sanitize.ts | 95% |

Clone #1 Details:
- UserService.ts:45-89
- AdminService.ts:67-111
- Extract to: UserBaseService or shared utility
```

---

## Evidence Templates

### Bug Evidence

```markdown
### BUG: {Description}

**Location:** `{file}:{line}` in `{function}()`

**Evidence:**
```{language}
// Actual code showing bug
```

**Trigger:** {How to reproduce}
- Input: {specific input}
- State: {required state}
- Sequence: {steps}

**Frequency:** {How often this path executes}
- {N}% of requests
- {N} times per day
- Only when {condition}

**Impact:**
- {What breaks}
- {Data affected}
- {User experience}

**Fix:**
```{language}
// Corrected code
```
```

---

### Performance Evidence

```markdown
### PERFORMANCE: {Description}

**Location:** `{file}:{lines}` in `{function}()`

**Current Behavior:**
- Complexity: O({X})
- Measured time: {N}ms for {N} items
- Resource usage: {memory/CPU/network}

**With Typical Data (N={typical size}):**
- Current: {calculation} = {time}
- Optimal: {calculation} = {time}
- Overhead: {X}x slower

**Evidence:**
```{language}
// Actual code causing issue
```

**Profiling Results:**
```
{profiler output}
```

**Fix:**
```{language}
// Optimized code
```

**Expected Improvement:** {X}x faster / {N}% reduction
```

---

### Security Evidence

```markdown
### SECURITY: {Vulnerability Type}

**Location:** `{file}:{line}` in `{function}()`

**Vulnerable Code:**
```{language}
// Actual vulnerable code
```

**Attack Vector:**
- Input: `{malicious input}`
- Entry point: {where attacker provides input}
- Exploit: {what attacker can do}

**Proof of Concept:**
```bash
# Command or request demonstrating exploit
curl -X POST {url} -d '{payload}'
```

**Impact:**
- {Data at risk}
- {System access gained}
- {Compliance violation}

**CVSS Score:** {if applicable}

**Fix:**
```{language}
// Secure implementation
```

**Verification:** {How to confirm fix works}
```

---

### Structural Evidence

```markdown
### STRUCTURAL: {Issue Type}

**Location:** `{file}` ({N} lines)

**Metrics:**
| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Lines | {N} | 300 | FAIL |
| Methods | {N} | 10 | FAIL |
| Cyclomatic | {N} | 10 | WARN |
| Coupling | {N} | 5 | PASS |

**Responsibility Analysis:**
1. {Responsibility 1} - methods: {list}
2. {Responsibility 2} - methods: {list}
3. {Responsibility 3} - methods: {list}

**Dependency Graph:**
```
{ASCII dependency diagram}
```

**Recommendation:**
Split into:
1. `{NewClass1}` - {responsibility}
2. `{NewClass2}` - {responsibility}

**Effort Estimate:** {hours/days}
```

---

## Quick Evidence Commands

```bash
# All-in-one project scan
echo "=== Line Counts ===" && wc -l src/**/*.ts | sort -n | tail -10
echo "=== Complexity ===" && npx escomplex src/ --format json | jq '.reports[].functions[] | select(.cyclomatic > 10)'
echo "=== Circular Deps ===" && npx madge --circular src/
echo "=== Coverage ===" && npx jest --coverage --coverageReporters=text-summary
echo "=== Security ===" && npm audit
echo "=== Outdated ===" && npm outdated
echo "=== Duplication ===" && npx jscpd src/ --min-lines 5
```

Save as `code-health-check.sh` for quick project assessment.
