# Writing Action Items

Guide to creating specific, measurable, actionable improvement items.

## Action Item Structure

```
[PRIORITY] [CATEGORY] [ESTIMATED SCORE IMPACT]
Issue: Specific problem description
Location: File(s) and line(s)
Fix: Concrete steps to resolve
Verification: How to confirm fixed
```

---

## SMART Criteria

Every action item must be:

| Criterion | Question | Example |
|-----------|----------|---------|
| **Specific** | What exactly is the problem? | "SQL injection in user search" not "security issue" |
| **Measurable** | How do we know it's fixed? | "SQL scanner shows 0 vulnerabilities" |
| **Actionable** | What are the exact steps? | "Replace concatenation with parameterized query" |
| **Relevant** | Does it improve the score? | "+0.5 points to security dimension" |
| **Time-bound** | When should it be done? | "P1 = this sprint" |

### Good vs Bad Action Items

```
BAD: Fix security issues
- Not specific (which issues?)
- Not measurable (how to verify?)
- Not actionable (what to do?)

GOOD:
[P0] [SECURITY] [+0.5 points]
Issue: SQL injection in user search - query built with string concatenation
Location: src/api/users.ts:45-52
Fix:
  1. Replace template literal with parameterized query
  2. Add input sanitization for searchTerm
  3. Add Zod schema for query parameters
Verification: npm run security-scan shows 0 SQL injection findings
```

---

## Issue Description Patterns

### Security Issues

```
Issue: [Vulnerability type] in [feature] - [specific vector]

Examples:
- SQL injection in user search - unsanitized query parameter
- XSS in comment display - unescaped user HTML content
- CSRF in form submission - missing token validation
- Hardcoded credentials in config - AWS keys in source
```

### Maintainability Issues

```
Issue: [Problem type] in [component] - [specific symptom]

Examples:
- High cyclomatic complexity in OrderService.process() - 25 branches
- Duplicated code in validation logic - 3 copies across auth, users, orders
- God class in DataManager - 1500 lines, 47 methods
- Circular dependency between UserService and AuthService
```

### Organization Issues

```
Issue: [Structure problem] - [specific manifestation]

Examples:
- No directory structure - 47 files in src/ root
- Inconsistent naming - mix of camelCase and snake_case files
- Missing barrel exports - deep import paths throughout
- No separation of concerns - UI and API logic mixed in components
```

### Testing Issues

```
Issue: [Coverage gap] in [area] - [specific missing coverage]

Examples:
- No unit tests for payment processing - 0% coverage on PaymentService
- Missing edge case tests - null/undefined not tested in validators
- No integration tests - API endpoints untested end-to-end
- Flaky tests in auth suite - random failures on CI
```

---

## Location Specification

Be precise about where the issue exists.

### Single File

```
Location: src/api/users.ts:45-52
```

### Multiple Lines (Same File)

```
Location: src/services/order.ts:23-45, 89-102, 156-178
```

### Multiple Files

```
Location:
  - src/api/users.ts:45-52
  - src/api/products.ts:67-74
  - src/api/orders.ts:34-41
```

### Pattern-Based

```
Location: src/api/**/*.ts (all route handlers)
Location: src/**/*.test.ts (all test files)
Location: src/components/*/index.tsx (all component entry points)
```

### Entire Directory

```
Location: src/legacy/ (entire directory)
```

### Configuration Files

```
Location: tsconfig.json (compilerOptions.strict)
Location: package.json (scripts.test)
```

---

## Fix Step Patterns

Write concrete, executable steps.

### Transformation Pattern

```
Fix:
  1. Replace [old pattern] with [new pattern]
  2. Update [related files] to match
  3. Run [verification command]
  4. Update [documentation]
```

### Extraction Pattern

```
Fix:
  1. Create new [file/module] at [path]
  2. Move [specific code] from [source] to [target]
  3. Update imports in [affected files]
  4. Add exports to [barrel file]
```

### Configuration Pattern

```
Fix:
  1. Add [config option] to [config file]
  2. Set [option] = [value]
  3. Run [command] to validate
  4. Update [CI/documentation] if needed
```

### Migration Pattern

```
Fix:
  1. Add [new approach] alongside [old approach]
  2. Gradually migrate [usages] to new approach
  3. Add deprecation warnings to old approach
  4. Remove old approach when migration complete
```

---

## Fix Step Examples

### Security Fix

```
Fix:
  1. Replace template literal with db.query() parameterized call
     BEFORE: db.query(`SELECT * FROM users WHERE name = '${name}'`)
     AFTER:  db.query('SELECT * FROM users WHERE name = $1', [name])
  2. Add Zod schema for input validation
     const searchSchema = z.object({ name: z.string().max(100) })
  3. Apply schema in route handler before query
  4. Add test case for SQL injection attempt
```

### Refactoring Fix

```
Fix:
  1. Extract validation logic to src/utils/validators.ts
  2. Create validateEmail(), validatePhone(), validateAddress()
  3. Replace inline validation in:
     - src/api/users.ts:34-45
     - src/api/orders.ts:67-78
     - src/api/auth.ts:23-34
  4. Add unit tests for each validator function
  5. Update imports in affected files
```

### Organization Fix

```
Fix:
  1. Create directory structure:
     - src/features/auth/
     - src/features/users/
     - src/features/orders/
     - src/shared/
  2. Move files by domain:
     - auth*.ts -> features/auth/
     - user*.ts -> features/users/
     - order*.ts -> features/orders/
  3. Update all import paths
  4. Add index.ts barrel exports to each feature
  5. Update path aliases in tsconfig.json
```

---

## Verification Methods

Specify how to confirm the fix worked.

### Command-Based

```
Verification: npm run lint && npm run typecheck && npm test
Verification: npx eslint src/ --max-warnings 0
Verification: docker run security-scanner . --severity high
```

### Metric-Based

```
Verification: Test coverage >= 80% (currently 45%)
Verification: Cyclomatic complexity <= 10 (currently 25)
Verification: Bundle size <= 500KB (currently 1.2MB)
```

### Manual Check

```
Verification: Manual review confirms no hardcoded secrets
Verification: Lighthouse accessibility score >= 90
Verification: Load test shows <200ms p95 response time
```

### Query-Based

```
Verification: grep -r "password.*=" src/ returns 0 results
Verification: git diff shows no files in src/ root except index.ts
Verification: SELECT COUNT(*) FROM migrations shows expected count
```

### CI/CD Based

```
Verification: All CI checks pass on PR
Verification: Security scan gate passes in pipeline
Verification: E2E tests pass in staging environment
```

---

## Common Anti-Patterns

### Vague Issues

```
BAD:  Issue: Code is messy
GOOD: Issue: OrderService.process() has 25 branches and 150 lines

BAD:  Issue: Needs tests
GOOD: Issue: PaymentService has 0% test coverage, 12 public methods untested
```

### Vague Locations

```
BAD:  Location: somewhere in the API
GOOD: Location: src/api/users.ts:45-52, src/api/auth.ts:23-30

BAD:  Location: the user stuff
GOOD: Location: src/features/users/**/*.ts (all 12 files)
```

### Vague Fixes

```
BAD:  Fix: Make it better
GOOD: Fix:
        1. Extract validation to dedicated function
        2. Add early returns to reduce nesting
        3. Split into smaller functions of <20 lines each

BAD:  Fix: Add tests
GOOD: Fix:
        1. Add unit tests for each public method
        2. Add integration tests for API endpoints
        3. Add edge case tests for null/undefined inputs
        4. Target 80% coverage
```

### Unverifiable Verification

```
BAD:  Verification: Code looks better
GOOD: Verification: npm run lint passes with 0 warnings

BAD:  Verification: More secure now
GOOD: Verification: OWASP ZAP scan shows 0 high/critical findings
```

---

## Action Item Templates by Category

### Security Template

```
[PRIORITY] [SECURITY] [+X.X points]
Issue: [Vulnerability type] in [component] - [attack vector]
Location: [file:lines]
Fix:
  1. [Immediate mitigation]
  2. [Proper fix implementation]
  3. [Add validation/sanitization]
  4. [Add test for vulnerability]
Verification: [Security scan command] shows 0 [vulnerability type] findings
```

### Testing Template

```
[PRIORITY] [TESTING] [+X.X points]
Issue: [Coverage gap] in [component] - [what's untested]
Location: [file or pattern]
Fix:
  1. Create test file at [path]
  2. Add unit tests for [functions/methods]
  3. Add integration tests for [workflows]
  4. Add edge case tests for [edge cases]
Verification: npm test --coverage shows [target]% for [component]
```

### Organization Template

```
[PRIORITY] [ORGANIZATION] [+X.X points]
Issue: [Structure problem] - [specific manifestation]
Location: [directories/files affected]
Fix:
  1. Create [new structure]
  2. Move [files] from [old] to [new]
  3. Update [import paths]
  4. Add [barrel exports]
Verification: [ls or find command] shows expected structure
```

### Maintainability Template

```
[PRIORITY] [MAINTAINABILITY] [+X.X points]
Issue: [Code smell] in [component] - [metric value]
Location: [file:lines]
Fix:
  1. [Refactoring step 1]
  2. [Refactoring step 2]
  3. [Update tests]
  4. [Update docs if needed]
Verification: [Complexity tool] shows [metric] <= [threshold]
```

---

## Checklist for Action Items

```markdown
## Issue Description
- [ ] Specific problem identified
- [ ] Current state quantified (metric/count)
- [ ] Impact on quality score noted

## Location
- [ ] Exact file paths provided
- [ ] Line numbers included where applicable
- [ ] Pattern specified for multiple files

## Fix Steps
- [ ] Each step is a concrete action
- [ ] Steps are in logical order
- [ ] Dependencies between steps are clear
- [ ] No vague terms ("improve", "fix", "better")

## Verification
- [ ] Method is automated if possible
- [ ] Success criteria is binary (pass/fail)
- [ ] Can be run by anyone on the team
- [ ] Matches the definition of "fixed"
```
