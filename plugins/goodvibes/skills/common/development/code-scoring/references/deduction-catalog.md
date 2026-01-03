# Deduction Catalog

Comprehensive catalog of common code issues and their point deductions.

---

## How to Use This Catalog

1. Identify the issue in the code
2. Find the matching entry in the appropriate category
3. Note the base points
4. Apply severity multiplier if context warrants
5. Apply category weight
6. Sum all deductions and subtract from 10

---

## Organization Issues

### File Structure

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| File exceeds 1000 lines | 1.5 | Major | File is too large to understand |
| File exceeds 500 lines | 1.0 | Major | File should be split |
| File exceeds 300 lines | 0.5 | Minor | Consider splitting |
| No clear entry point | 0.5 | Minor | Hard to find where execution starts |
| Mixed file types in folder | 0.5 | Minor | Config, source, tests mixed |
| Deep folder nesting (6+) | 0.5 | Minor | Hard to navigate |

### Module Boundaries

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Circular dependencies | 1.0 | Major | Modules depend on each other |
| Feature spread across modules | 1.0 | Major | Single feature in many places |
| No clear public API | 0.5 | Minor | Everything is exported |
| God module (does everything) | 1.5 | Major | No separation of concerns |
| Utility module too large | 0.5 | Minor | "Utils" has 50+ functions |

### Separation of Concerns

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Business logic in UI | 1.0 | Major | Calculations in components |
| Data access in controllers | 1.0 | Major | SQL in route handlers |
| Config hardcoded | 0.5 | Minor | Magic values in source |
| Logging mixed with logic | 0.5 | Minor | Console.log throughout |

---

## Naming Issues

### Variables

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Single-letter names (non-loop) | 0.5 | Minor | `const x = ...` |
| Misleading name | 1.0 | Major | Name suggests opposite |
| Generic name | 0.5 | Minor | `data`, `info`, `temp`, `result` |
| Name doesn't match type | 0.5 | Minor | `isEnabled` is a number |
| Inconsistent pluralization | 0.25 | Nitpick | `user` vs `users` inconsistent |
| Abbreviations without context | 0.5 | Minor | `cstmr` instead of `customer` |

### Functions

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Name doesn't describe action | 1.0 | Major | `process()`, `handleIt()` |
| Missing verb | 0.5 | Minor | `user()` instead of `getUser()` |
| Too generic | 0.5 | Minor | `doWork()`, `execute()` |
| Boolean without is/has/can | 0.25 | Nitpick | `enabled()` vs `isEnabled()` |
| Inconsistent naming pattern | 0.5 | Minor | Mix of `getX`, `fetchX`, `retrieveX` |

### Classes/Types

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Name doesn't describe purpose | 1.0 | Major | `Manager`, `Helper`, `Handler` |
| Implementation in name | 0.5 | Minor | `UserArrayList` |
| Inconsistent suffixes | 0.5 | Minor | Mix of `Service`, `Svc`, `Srvc` |
| Type name doesn't match file | 0.25 | Nitpick | `User` in `customer.ts` |

### Constants

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Magic numbers | 1.0 | Major | `if (status === 3)` |
| Magic strings | 1.0 | Major | `if (type === 'admin')` |
| No constant for repeated value | 0.5 | Minor | Same value in multiple places |
| Value in constant name | 0.25 | Nitpick | `THREE = 3` |

---

## Error Handling Issues

### Missing Handling

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| No try/catch on async call | 1.5 | Major | Unhandled promise rejection |
| No validation on user input | 1.5 | Major | Accepts any input |
| Missing null/undefined check | 0.5 | Minor | May crash on null |
| No error handling on file I/O | 1.0 | Major | File operations unprotected |
| No timeout on external calls | 0.5 | Minor | Can hang indefinitely |

### Poor Patterns

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Empty catch block | 1.0 | Major | Errors silently ignored |
| Catch and rethrow only | 0.25 | Nitpick | `catch(e) { throw e; }` |
| Generic Error thrown | 0.5 | Minor | `throw new Error(...)` |
| Error swallowed with log | 0.5 | Minor | Log then continue |
| Catch-all without rethrow | 0.5 | Minor | `catch(e) { logError(e); }` |

### Error Information

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| No error message | 0.5 | Minor | `throw new Error()` |
| No error context | 0.5 | Minor | Missing relevant data |
| Stack trace lost | 1.0 | Major | `throw new Error(e.message)` |
| Internal details exposed | 1.0 | Major | Stack trace shown to users |

---

## Testing Issues

### Coverage

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| No tests at all | 2.0 | Critical | Zero test coverage |
| No tests for core logic | 1.5 | Major | Critical paths untested |
| Only happy path tested | 1.0 | Major | No error case tests |
| Missing edge case tests | 0.5 | Minor | Boundary conditions missed |
| No integration tests | 1.0 | Major | Components tested in isolation only |

### Quality

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Test has no assertions | 1.0 | Major | Test does nothing |
| Flaky test | 1.0 | Major | Fails intermittently |
| Test name doesn't describe behavior | 0.5 | Minor | `test1`, `testFunction` |
| Duplicated test code | 0.5 | Minor | Copy-paste tests |
| Tests depend on each other | 0.5 | Minor | Must run in order |
| Tests depend on external state | 0.5 | Minor | Requires DB/network |

### Mocking

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Tests mock too much | 0.5 | Minor | Don't test real behavior |
| No mocks for external services | 0.5 | Minor | Tests hit real APIs |
| Mocks not reset between tests | 0.5 | Minor | State leaks |

---

## Performance Issues

### Database

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| N+1 query pattern | 1.5 | Major | Query in loop |
| Missing indexes | 0.5 | Minor | Slow queries |
| Full table scan | 1.0 | Major | No WHERE clause |
| No pagination | 1.0 | Major | Returns unlimited results |
| Fetching unused columns | 0.5 | Minor | `SELECT *` when few needed |

### Memory

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Memory leak | 1.5 | Major | Growing memory usage |
| Large data in memory | 0.5 | Minor | Loading huge files |
| No cleanup of resources | 1.0 | Major | Connections not closed |
| Event listeners not removed | 0.5 | Minor | Listeners accumulate |

### Algorithm

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| O(n^2) when O(n) possible | 1.0 | Major | Inefficient algorithm |
| Unnecessary iterations | 0.5 | Minor | Could short-circuit |
| Repeated calculations | 0.5 | Minor | Should cache result |
| String concatenation in loop | 0.5 | Minor | Use StringBuilder/join |

### Async

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Blocking in async context | 1.0 | Major | Sync call in async function |
| Sequential when parallel possible | 0.5 | Minor | Awaits in series |
| Missing debounce/throttle | 0.5 | Minor | Excessive API calls |
| No request cancellation | 0.5 | Minor | Stale requests complete |

---

## Security Issues

### Injection

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| SQL injection | 2.0 | Critical | String interpolation in query |
| Command injection | 2.0 | Critical | User input in shell command |
| LDAP injection | 2.0 | Critical | User input in LDAP query |
| XPath injection | 2.0 | Critical | User input in XPath |
| NoSQL injection | 1.5 | Major | Object injection in MongoDB |

### Cross-Site Issues

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| XSS (stored) | 2.0 | Critical | User content rendered unsanitized |
| XSS (reflected) | 1.5 | Major | URL param rendered |
| Missing CSRF protection | 1.0 | Major | No token on mutations |
| Clickjacking possible | 0.5 | Minor | No X-Frame-Options |

### Authentication/Authorization

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Missing auth check | 1.5 | Major | Endpoint unprotected |
| Auth bypass possible | 2.0 | Critical | Can skip auth |
| IDOR vulnerability | 1.5 | Major | Can access others' data |
| Weak session management | 1.0 | Major | Predictable tokens |
| No rate limiting | 0.5 | Minor | Brute force possible |

### Secrets

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Hardcoded credentials | 2.0 | Critical | Password in source |
| API keys in code | 2.0 | Critical | Tokens in source |
| Secrets in logs | 1.0 | Major | Passwords logged |
| Secrets in error messages | 1.0 | Major | Exposed to users |
| Weak encryption | 1.0 | Major | MD5, SHA1 for passwords |

### Data Protection

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| PII unencrypted | 1.5 | Major | Personal data in plain text |
| Sensitive data in URL | 1.0 | Major | Tokens in query string |
| Missing data validation | 1.5 | Major | Accepts any format |
| No input sanitization | 1.5 | Major | Special chars not handled |

---

## Documentation Issues

### API Documentation

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| No public API docs | 1.0 | Major | Functions undocumented |
| Missing parameter descriptions | 0.5 | Minor | Params not explained |
| Missing return type docs | 0.5 | Minor | Return value unclear |
| Missing error documentation | 0.5 | Minor | Throws not documented |
| Outdated examples | 0.5 | Minor | Examples don't work |

### Code Comments

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Complex logic unexplained | 0.5 | Minor | Hard to understand why |
| Outdated comments | 0.5 | Minor | Code changed, comment didn't |
| Commented-out code | 0.5 | Minor | Dead code remains |
| TODO without ticket | 0.25 | Nitpick | No tracking |
| Comments explain "what" not "why" | 0.25 | Nitpick | Obvious comments |

### Project Documentation

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| No README | 0.5 | Minor | No project overview |
| No setup instructions | 0.5 | Minor | Can't run locally |
| No architecture docs | 0.5 | Minor | Structure unclear |
| No changelog | 0.25 | Nitpick | Changes not tracked |
| No contribution guide | 0.25 | Nitpick | How to contribute unclear |

---

## SOLID Principle Issues

### Single Responsibility

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| God class | 1.5 | Major | Class does everything |
| Method does multiple things | 0.5 | Minor | Should split |
| Mixed abstraction levels | 0.5 | Minor | High/low level mixed |
| Class has multiple reasons to change | 1.0 | Major | Too many responsibilities |

### Open/Closed

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Modification required for extension | 1.0 | Major | Can't add without changing |
| Switch on type | 0.5 | Minor | Should use polymorphism |
| Hardcoded behaviors | 0.5 | Minor | No extension points |

### Liskov Substitution

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Subclass changes behavior | 1.0 | Major | Breaks substitutability |
| Empty method overrides | 0.5 | Minor | Violates contract |
| Throws unexpected exceptions | 0.5 | Minor | Parent doesn't throw |
| Strengthened preconditions | 0.5 | Minor | More restrictive than parent |

### Interface Segregation

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Fat interface | 0.5 | Minor | Too many methods |
| Unused method implementations | 0.5 | Minor | Empty stubs |
| Clients forced to depend on unused | 0.5 | Minor | Unnecessary coupling |

### Dependency Inversion

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Concrete dependencies | 0.5 | Minor | No interface/abstraction |
| No dependency injection | 0.5 | Minor | Creates own dependencies |
| Tight coupling | 1.0 | Major | Hard to test/replace |
| High-level depends on low-level | 0.5 | Minor | Wrong direction |

---

## Dependency Issues

### Security

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Critical CVE in dependency | 2.0 | Critical | Exploitable vulnerability |
| High CVE in dependency | 1.5 | Major | Serious vulnerability |
| Medium CVE in dependency | 0.5 | Minor | Moderate vulnerability |
| Low CVE in dependency | 0.25 | Nitpick | Minor vulnerability |

### Management

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Circular dependencies | 1.0 | Major | A -> B -> A |
| Excessive dependencies | 0.5 | Minor | Too many deps for scope |
| Duplicate dependencies | 0.5 | Minor | Same lib twice |
| Unlocked versions | 0.5 | Minor | No lock file |
| Abandoned dependency | 0.5 | Minor | No maintenance |
| Unnecessary dependency | 0.25 | Nitpick | Could remove |

---

## Maintainability Issues

### Complexity

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Cyclomatic complexity > 25 | 1.0 | Major | Too many paths |
| Cyclomatic complexity > 15 | 0.5 | Minor | Getting complex |
| Cognitive complexity > 20 | 1.0 | Major | Hard to understand |
| Deep nesting (5+ levels) | 1.0 | Major | Deeply nested code |
| Deep nesting (4 levels) | 0.5 | Minor | Moderately nested |

### Duplication

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Large duplicated blocks | 1.0 | Major | 20+ lines copied |
| Moderate duplication | 0.5 | Minor | 10-20 lines copied |
| Small duplication | 0.25 | Nitpick | 5-10 lines copied |
| Duplicated logic | 0.5 | Minor | Same algorithm twice |

### Style

| Issue | Base Points | Severity | Description |
|-------|-------------|----------|-------------|
| Inconsistent formatting | 0.5 | Minor | Mixed styles |
| No linting configured | 0.5 | Minor | No code style enforcement |
| Long methods (50+ lines) | 0.5 | Minor | Should split |
| Long methods (100+ lines) | 1.0 | Major | Definitely split |
| Dead code | 0.5 | Minor | Unreachable code |
| Unused variables | 0.25 | Nitpick | Declared but unused |

---

## Quick Reference Cheat Sheet

### Top 10 Critical Issues (2.0 points each)

1. SQL injection
2. Command injection
3. Hardcoded credentials
4. Stored XSS
5. Critical CVE in dependency
6. No tests at all
7. Auth bypass vulnerability
8. API keys in code
9. RCE vulnerability
10. Unencrypted sensitive data storage

### Top 10 Major Issues (1.0-1.5 points each)

1. N+1 query pattern (1.5)
2. No error handling on external calls (1.5)
3. God class (1.5)
4. Empty catch blocks (1.0)
5. Circular dependencies (1.0)
6. Missing input validation (1.5)
7. Missing auth check (1.5)
8. Only happy path tested (1.0)
9. Memory leaks (1.5)
10. Stack trace lost in error handling (1.0)

### Top 10 Minor Issues (0.5 points each)

1. Inconsistent naming convention
2. Magic numbers/strings
3. Missing null checks
4. Generic error types
5. Deep nesting
6. No pagination
7. Missing API documentation
8. Test name unclear
9. Missing indexes
10. Inconsistent formatting
