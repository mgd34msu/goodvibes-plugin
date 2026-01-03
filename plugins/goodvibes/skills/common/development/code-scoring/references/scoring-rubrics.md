# Scoring Rubrics by Category

Detailed scoring criteria for each of the 10 code quality categories.

---

## 1. Organization (Weight: 12%)

### Scoring Criteria

| Score | Description |
|-------|-------------|
| 0 deductions | Excellent module boundaries, clear separation of concerns, logical structure |
| 0.5 deductions | Minor structural issues, mostly well-organized |
| 1.0 deductions | Some mixing of concerns, unclear boundaries |
| 1.5 deductions | Poor organization, multiple responsibilities per module |
| 2.0+ deductions | No discernible structure, everything mixed together |

### Assessment Checklist

```markdown
## Organization Assessment

### File Structure
- [ ] Logical folder hierarchy
- [ ] Related files grouped together
- [ ] Separation of source, tests, config
- [ ] Clear entry points

### Module Boundaries
- [ ] Single responsibility per module
- [ ] Clear public API surface
- [ ] Internal details hidden
- [ ] Minimal cross-module dependencies

### Separation of Concerns
- [ ] UI separate from business logic
- [ ] Data access separate from processing
- [ ] Configuration separate from code
- [ ] Utilities separate from domain logic
```

### Common Issues & Deductions

| Issue | Points | Severity |
|-------|--------|----------|
| File exceeds 500 lines | 1.0 | Major |
| Mixed UI and business logic | 1.0 | Major |
| No clear folder structure | 1.5 | Major |
| Circular module dependencies | 1.0 | Major |
| Utility functions scattered everywhere | 0.5 | Minor |
| Config mixed with source code | 0.5 | Minor |
| Test files mixed with source | 0.5 | Minor |
| Multiple entry points unclear | 0.5 | Minor |

### Language-Specific Guidelines

**JavaScript/TypeScript:**
```
- index.ts as barrel files for public exports
- src/ for source, tests/ or __tests__/ for tests
- lib/ or utils/ for shared utilities
- types/ for TypeScript declarations
```

**Python:**
```
- __init__.py to define public API
- src/{package}/ structure
- tests/ mirroring src/ structure
- Separate requirements.txt or pyproject.toml
```

**Go:**
```
- cmd/ for entry points
- internal/ for private packages
- pkg/ for public packages
- Flat file structure within packages preferred
```

---

## 2. Naming (Weight: 10%)

### Scoring Criteria

| Score | Description |
|-------|-------------|
| 0 deductions | Descriptive, consistent, intention-revealing names throughout |
| 0.5 deductions | Minor inconsistencies, mostly clear names |
| 1.0 deductions | Some confusing or misleading names |
| 1.5 deductions | Many poor names, hard to understand code |
| 2.0+ deductions | Names actively misleading, requires mental translation |

### Assessment Checklist

```markdown
## Naming Assessment

### Variables
- [ ] Descriptive of content/purpose
- [ ] Appropriate length (not too short/long)
- [ ] Consistent case convention
- [ ] No misleading names

### Functions/Methods
- [ ] Verb-noun pattern for actions
- [ ] Describes what it does, not how
- [ ] Boolean functions use is/has/can prefixes
- [ ] Consistent naming patterns

### Classes/Types
- [ ] Noun or noun phrase
- [ ] Describes the abstraction
- [ ] Not implementation-focused
- [ ] Consistent suffixes (Service, Controller, Repository)

### Constants
- [ ] SCREAMING_SNAKE_CASE (where conventional)
- [ ] Describes the meaning, not value
- [ ] Grouped logically
```

### Common Issues & Deductions

| Issue | Points | Severity |
|-------|--------|----------|
| Single-letter variables (non-loop) | 0.5 | Minor |
| Misleading names (opposite of function) | 1.0 | Major |
| Inconsistent case convention | 1.0 | Major |
| Magic numbers without constants | 1.0 | Major |
| Hungarian notation overuse | 0.5 | Minor |
| Abbreviations without context | 0.5 | Minor |
| Generic names (data, info, temp) | 0.5 | Minor |
| Names don't match domain language | 0.5 | Minor |

### Naming Patterns

**Good Examples:**
```javascript
// Variables
const userCount = users.length;
const isAuthenticated = token !== null;
const maxRetryAttempts = 3;

// Functions
function calculateTotalPrice(items) {}
function validateUserInput(formData) {}
function hasPermission(user, action) {}

// Classes
class OrderRepository {}
class PaymentProcessor {}
class UserAuthenticationService {}
```

**Bad Examples:**
```javascript
// Variables
const n = users.length;           // Unclear
const flag = token !== null;       // Generic
const x = 3;                       // Magic number

// Functions
function process(d) {}             // Vague
function doStuff(input) {}         // Meaningless
function handleIt() {}             // No context

// Classes
class Manager {}                   // Too generic
class Data {}                      // Meaningless
class Helper {}                    // Unclear purpose
```

---

## 3. Error Handling (Weight: 12%)

### Scoring Criteria

| Score | Description |
|-------|-------------|
| 0 deductions | Comprehensive error handling, specific types, proper logging |
| 0.5 deductions | Minor gaps in error handling |
| 1.0 deductions | Some critical paths missing handling |
| 1.5 deductions | Poor error handling patterns, errors swallowed |
| 2.0+ deductions | No error handling, crashes likely |

### Assessment Checklist

```markdown
## Error Handling Assessment

### Coverage
- [ ] All external API calls handled
- [ ] All file/database operations handled
- [ ] User input validation errors handled
- [ ] Network failures handled

### Error Types
- [ ] Specific error types used (not generic Error)
- [ ] Custom errors for domain exceptions
- [ ] Error hierarchy appropriate
- [ ] Errors include context

### Logging
- [ ] Errors logged with stack traces
- [ ] Context included (user, request ID)
- [ ] Appropriate log levels
- [ ] Sensitive data excluded from logs

### Recovery
- [ ] Graceful degradation where possible
- [ ] Retry logic for transient failures
- [ ] Circuit breakers for external dependencies
- [ ] Clear user-facing error messages
```

### Common Issues & Deductions

| Issue | Points | Severity |
|-------|--------|----------|
| Empty catch blocks | 1.0 | Major |
| Swallowed errors (catch and continue) | 1.0 | Major |
| No error handling on external calls | 1.5 | Major |
| Generic catch without rethrow | 0.5 | Minor |
| Missing input validation | 1.5 | Major |
| Errors expose internal details to users | 1.0 | Major |
| No logging in catch blocks | 0.5 | Minor |
| Inconsistent error response format | 0.5 | Minor |

### Error Handling Patterns

**Good Pattern:**
```javascript
async function fetchUserData(userId) {
  try {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new UserNotFoundError(userId);
    }
    if (error.response?.status === 403) {
      throw new AccessDeniedError(userId);
    }
    logger.error('Failed to fetch user', { userId, error: error.message });
    throw new ServiceError('Unable to fetch user data', { cause: error });
  }
}
```

**Bad Pattern:**
```javascript
async function fetchUserData(userId) {
  try {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  } catch (error) {
    // Empty catch - error swallowed
  }
}
```

---

## 4. Testing (Weight: 12%)

### Scoring Criteria

| Score | Description |
|-------|-------------|
| 0 deductions | Comprehensive tests, good coverage, well-maintained |
| 0.5 deductions | Minor gaps in test coverage |
| 1.0 deductions | Missing tests for important functionality |
| 1.5 deductions | Tests exist but are low quality or incomplete |
| 2.0+ deductions | No tests or tests are non-functional |

### Assessment Checklist

```markdown
## Testing Assessment

### Coverage
- [ ] Core business logic tested
- [ ] Edge cases covered
- [ ] Error paths tested
- [ ] Integration points tested

### Quality
- [ ] Tests are readable and maintainable
- [ ] Test names describe behavior
- [ ] Arrange-Act-Assert pattern followed
- [ ] No test interdependencies

### Types
- [ ] Unit tests for isolated logic
- [ ] Integration tests for boundaries
- [ ] E2E tests for critical paths
- [ ] Appropriate test doubles used

### Maintenance
- [ ] Tests run in CI/CD
- [ ] No flaky tests
- [ ] Tests run quickly
- [ ] Test data is well-managed
```

### Common Issues & Deductions

| Issue | Points | Severity |
|-------|--------|----------|
| No tests at all | 2.0 | Critical |
| Only happy path tested | 1.0 | Major |
| Flaky tests | 1.0 | Major |
| Test code duplication | 0.5 | Minor |
| Tests coupled to implementation | 0.5 | Minor |
| No assertions in tests | 1.0 | Major |
| Tests require manual setup | 0.5 | Minor |
| Missing integration tests | 1.0 | Major |

### Coverage Targets

| Context | Minimum | Recommended |
|---------|---------|-------------|
| Critical business logic | 90% | 95%+ |
| New code | 80% | 90%+ |
| Legacy code | 60% | 80%+ |
| Utility functions | 85% | 95%+ |
| Integration points | 75% | 85%+ |

---

## 5. Performance (Weight: 10%)

### Scoring Criteria

| Score | Description |
|-------|-------------|
| 0 deductions | Efficient algorithms, proper optimization, no leaks |
| 0.5 deductions | Minor inefficiencies, mostly optimized |
| 1.0 deductions | Some performance issues in non-critical paths |
| 1.5 deductions | Performance issues in critical paths |
| 2.0+ deductions | Severe performance problems, unusable at scale |

### Assessment Checklist

```markdown
## Performance Assessment

### Algorithm Efficiency
- [ ] Appropriate data structures used
- [ ] Time complexity is acceptable
- [ ] Space complexity is acceptable
- [ ] No unnecessary iterations

### Database
- [ ] N+1 queries avoided
- [ ] Appropriate indexes used
- [ ] Queries are efficient
- [ ] Pagination implemented for lists

### Memory
- [ ] No memory leaks
- [ ] Resources properly disposed
- [ ] Caching used appropriately
- [ ] Large data streamed, not loaded

### Concurrency
- [ ] Async operations used where appropriate
- [ ] No blocking in hot paths
- [ ] Proper parallelization
- [ ] Race conditions handled
```

### Common Issues & Deductions

| Issue | Points | Severity |
|-------|--------|----------|
| N+1 query pattern | 1.5 | Major |
| Memory leaks | 1.5 | Major |
| Blocking operations in async context | 1.0 | Major |
| No pagination on list endpoints | 1.0 | Major |
| Inefficient algorithm (O(n^2) or worse when O(n) possible) | 1.0 | Major |
| Missing database indexes | 0.5 | Minor |
| Unnecessary data fetching | 0.5 | Minor |
| No caching for expensive operations | 0.5 | Minor |

---

## 6. Security (Weight: 12%)

### Scoring Criteria

| Score | Description |
|-------|-------------|
| 0 deductions | Secure by design, no vulnerabilities, proper practices |
| 0.5 deductions | Minor security improvements possible |
| 1.0 deductions | Some security gaps, no critical vulnerabilities |
| 1.5 deductions | Security issues present, needs immediate attention |
| 2.0+ deductions | Critical vulnerabilities, do not deploy |

### Assessment Checklist

```markdown
## Security Assessment

### Input Validation
- [ ] All user input validated
- [ ] Whitelist validation preferred
- [ ] Type checking enforced
- [ ] Size limits enforced

### Injection Prevention
- [ ] Parameterized queries used
- [ ] No string concatenation in queries
- [ ] Command injection prevented
- [ ] XSS prevented (output encoding)

### Authentication/Authorization
- [ ] Auth checks on all protected routes
- [ ] Session management secure
- [ ] Password hashing with bcrypt/argon2
- [ ] Token validation complete

### Secrets
- [ ] No hardcoded credentials
- [ ] Environment variables used
- [ ] Secrets not logged
- [ ] Proper secret rotation possible
```

### Common Issues & Deductions

| Issue | Points | Severity |
|-------|--------|----------|
| SQL/NoSQL injection | 2.0 | Critical |
| Command injection | 2.0 | Critical |
| Hardcoded secrets/credentials | 2.0 | Critical |
| XSS vulnerabilities | 1.5 | Major |
| Missing authentication check | 1.5 | Major |
| Insecure deserialization | 1.5 | Major |
| Missing input validation | 1.5 | Major |
| Sensitive data in logs | 1.0 | Major |
| Missing CSRF protection | 1.0 | Major |
| Weak password hashing | 1.0 | Major |

---

## 7. Documentation (Weight: 8%)

### Scoring Criteria

| Score | Description |
|-------|-------------|
| 0 deductions | Comprehensive docs, up-to-date, clear and helpful |
| 0.5 deductions | Minor documentation gaps |
| 1.0 deductions | Important functionality undocumented |
| 1.5 deductions | Documentation mostly missing or outdated |
| 2.0+ deductions | No documentation at all |

### Assessment Checklist

```markdown
## Documentation Assessment

### API Documentation
- [ ] All public functions documented
- [ ] Parameters and returns described
- [ ] Examples provided
- [ ] Error conditions documented

### Code Comments
- [ ] Complex logic explained
- [ ] "Why" explained, not "what"
- [ ] No outdated comments
- [ ] No commented-out code

### Project Documentation
- [ ] README with setup instructions
- [ ] Contributing guidelines
- [ ] Architecture overview
- [ ] Changelog maintained
```

### Common Issues & Deductions

| Issue | Points | Severity |
|-------|--------|----------|
| No README | 0.5 | Minor |
| No API documentation | 1.0 | Major |
| Outdated documentation | 1.0 | Major |
| Complex logic unexplained | 0.5 | Minor |
| Commented-out code | 0.5 | Minor |
| No setup instructions | 0.5 | Minor |

---

## 8. SOLID Principles (Weight: 10%)

### Scoring Criteria

| Score | Description |
|-------|-------------|
| 0 deductions | SOLID principles followed throughout |
| 0.5 deductions | Minor violations, mostly good design |
| 1.0 deductions | Some design issues, coupling problems |
| 1.5 deductions | Significant design violations |
| 2.0+ deductions | No regard for design principles |

### Principle-Specific Issues

**Single Responsibility (S):**
| Issue | Points |
|-------|--------|
| God class (500+ lines, multiple responsibilities) | 1.5 |
| Method doing too many things | 0.5 |
| Mixed abstraction levels in class | 0.5 |

**Open/Closed (O):**
| Issue | Points |
|-------|--------|
| Modification required to add features | 1.0 |
| Switch statements on type | 0.5 |
| No extension points | 0.5 |

**Liskov Substitution (L):**
| Issue | Points |
|-------|--------|
| Subclass changes parent behavior unexpectedly | 1.0 |
| Empty method overrides | 0.5 |
| Violated contracts | 1.0 |

**Interface Segregation (I):**
| Issue | Points |
|-------|--------|
| Fat interfaces | 0.5 |
| Unused method implementations | 0.5 |
| Clients depend on methods they don't use | 0.5 |

**Dependency Inversion (D):**
| Issue | Points |
|-------|--------|
| Concrete dependencies instead of abstractions | 0.5 |
| No dependency injection | 0.5 |
| Tight coupling to implementations | 1.0 |

---

## 9. Dependencies (Weight: 6%)

### Scoring Criteria

| Score | Description |
|-------|-------------|
| 0 deductions | Minimal, well-managed, secure dependencies |
| 0.5 deductions | Minor dependency issues |
| 1.0 deductions | Some problematic dependencies |
| 1.5 deductions | Dependency management issues |
| 2.0+ deductions | Critical vulnerabilities or severe issues |

### Common Issues & Deductions

| Issue | Points | Severity |
|-------|--------|----------|
| CVE vulnerability (critical) | 2.0 | Critical |
| CVE vulnerability (high) | 1.5 | Major |
| Circular dependencies | 1.0 | Major |
| Excessive dependencies | 0.5 | Minor |
| Unlocked versions | 0.5 | Minor |
| Abandoned dependencies | 0.5 | Minor |
| Duplicate dependencies | 0.5 | Minor |

---

## 10. Maintainability (Weight: 8%)

### Scoring Criteria

| Score | Description |
|-------|-------------|
| 0 deductions | Highly readable, low complexity, easy to change |
| 0.5 deductions | Minor maintainability issues |
| 1.0 deductions | Some areas hard to understand or modify |
| 1.5 deductions | Significant maintainability problems |
| 2.0+ deductions | Code is nearly unmaintainable |

### Common Issues & Deductions

| Issue | Points | Severity |
|-------|--------|----------|
| Cyclomatic complexity > 20 | 1.0 | Major |
| Duplicated code blocks | 1.0 | Major |
| Deep nesting (4+ levels) | 1.0 | Major |
| Inconsistent style/formatting | 0.5 | Minor |
| Long methods (50+ lines) | 0.5 | Minor |
| High cognitive complexity | 0.5 | Minor |
| No linting/formatting tools | 0.5 | Minor |
