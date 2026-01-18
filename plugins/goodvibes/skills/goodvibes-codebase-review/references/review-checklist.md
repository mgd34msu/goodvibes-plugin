# Codebase Review Checklist

Comprehensive checklist for codebase analysis. Each item must result in either:
- A finding with `file:line` reference and quantified measurement, OR
- Explicit "No issues found" with evidence

---

## 1. Code Quality (15%)

### Anti-Patterns
- [ ] God classes/files (>500 lines)
- [ ] God functions (>50 lines)
- [ ] Deep nesting (>4 levels)
- [ ] Magic numbers without constants
- [ ] Hardcoded strings
- [ ] Commented-out code blocks
- [ ] TODO/FIXME/HACK comments without tickets
- [ ] Copy-paste duplication (>10 lines)
- [ ] Inconsistent naming patterns
- [ ] Mixed paradigms (OOP + functional without clear boundaries)

**MCP Tools**: `find_dead_code`, `scan_patterns`, `identify_tech_debt`

### Dead Code
- [ ] Unused exports
- [ ] Unreachable code paths
- [ ] Unused imports
- [ ] Unused variables
- [ ] Unused function parameters
- [ ] Deprecated code without removal timeline

**MCP Tools**: `find_dead_code`, `find_references`

### Complexity
- [ ] Cyclomatic complexity >10
- [ ] Cognitive complexity >15
- [ ] Too many parameters (>5)
- [ ] Boolean parameter flags
- [ ] Multiple return statements in complex functions
- [ ] Nested ternaries

**MCP Tools**: `identify_tech_debt`, `scan_patterns`

---

## 2. Architecture (15%)

### Coupling
- [ ] Circular dependencies
- [ ] Tight coupling between modules
- [ ] Direct database access from UI components
- [ ] Business logic in controllers/routes
- [ ] Cross-feature imports
- [ ] Shared mutable state

**MCP Tools**: `find_circular_deps`, `get_call_hierarchy`

### Cohesion
- [ ] Low cohesion modules (unrelated functions grouped)
- [ ] Feature envy (methods accessing other class data)
- [ ] Shotgun surgery patterns (changes require multiple file edits)
- [ ] Divergent change (single file changed for multiple reasons)

**MCP Tools**: `get_api_surface`, `scan_patterns`

### Module Boundaries
- [ ] Clear public/private API separation
- [ ] Barrel files (index.ts) expose only public API
- [ ] No deep imports into module internals
- [ ] Consistent layer structure (UI → Service → Repository → Database)

**MCP Tools**: `get_api_surface`, `get_document_symbols`

### Dependency Direction
- [ ] Dependencies flow inward (clean architecture)
- [ ] No framework dependencies in domain layer
- [ ] Abstractions owned by consumers
- [ ] Interface segregation

**MCP Tools**: `find_circular_deps`, `analyze_dependencies`

---

## 3. Security (20%)

### Secrets & Credentials
- [ ] Hardcoded API keys
- [ ] Hardcoded passwords
- [ ] Hardcoded tokens/secrets
- [ ] Private keys in repository
- [ ] .env files committed
- [ ] Credentials in comments
- [ ] Secrets in error messages/logs

**MCP Tools**: `scan_for_secrets`

### Injection Vectors
- [ ] SQL injection (unparameterized queries)
- [ ] NoSQL injection
- [ ] Command injection
- [ ] XSS vulnerabilities
- [ ] Template injection
- [ ] Path traversal
- [ ] LDAP injection
- [ ] XML external entity (XXE)

**MCP Tools**: `scan_patterns`, grep patterns

### Authentication/Authorization
- [ ] Missing auth on endpoints
- [ ] Broken access control
- [ ] Insecure session management
- [ ] Weak password requirements
- [ ] Missing rate limiting
- [ ] Missing CSRF protection
- [ ] JWT issues (none algorithm, weak secret, no expiry)

**MCP Tools**: `get_api_routes`, manual review

### Input Validation
- [ ] Missing input validation
- [ ] Inconsistent validation
- [ ] Client-side only validation
- [ ] Missing sanitization
- [ ] Missing encoding

**MCP Tools**: `scan_patterns`

### Data Protection
- [ ] PII in logs
- [ ] Sensitive data unencrypted
- [ ] Missing data masking
- [ ] Insecure data transmission
- [ ] Insufficient access logging

**MCP Tools**: `check_permissions`

---

## 4. Performance (10%)

### Database
- [ ] N+1 queries
- [ ] Missing indexes
- [ ] Full table scans
- [ ] Inefficient queries
- [ ] Missing pagination
- [ ] Over-fetching data
- [ ] Missing query caching
- [ ] Connection pool issues

**MCP Tools**: `get_prisma_operations`, `get_schema`

### Memory
- [ ] Memory leaks
- [ ] Large object retention
- [ ] Unbounded caches
- [ ] Missing cleanup in useEffect
- [ ] Event listener leaks
- [ ] Closure memory issues

**MCP Tools**: `detect_memory_leaks`, manual review

### Algorithms
- [ ] O(n²) or worse in hot paths
- [ ] Unnecessary sorting
- [ ] Redundant iterations
- [ ] Missing early returns
- [ ] Inefficient data structures

**MCP Tools**: `profile_function`

### Network
- [ ] Missing request caching
- [ ] Waterfall requests
- [ ] Over-fetching in API calls
- [ ] Missing connection pooling
- [ ] Large payloads without compression

**MCP Tools**: `analyze_bundle`

### Bundle Size
- [ ] Large dependencies for small features
- [ ] Missing tree shaking
- [ ] Missing code splitting
- [ ] Duplicate dependencies
- [ ] Unminified code

**MCP Tools**: `analyze_bundle`, `analyze_dependencies`

---

## 5. Documentation (5%)

### Code Documentation
- [ ] Missing JSDoc on public APIs
- [ ] Stale/incorrect comments
- [ ] Missing README
- [ ] Missing CHANGELOG
- [ ] Missing CONTRIBUTING guide
- [ ] Missing architecture diagrams

**MCP Tools**: `explain_codebase`, `get_document_symbols`

### API Documentation
- [ ] Missing endpoint documentation
- [ ] Missing request/response schemas
- [ ] Missing error documentation
- [ ] Outdated OpenAPI spec
- [ ] Missing example payloads

**MCP Tools**: `generate_openapi`, `get_api_routes`

### Inline Comments
- [ ] Over-commented obvious code
- [ ] Under-commented complex logic
- [ ] Outdated comments
- [ ] TODO without context

**MCP Tools**: grep patterns

---

## 6. Testing (15%)

### Coverage
- [ ] Overall coverage <80%
- [ ] Critical path coverage <95%
- [ ] Branch coverage gaps
- [ ] Untested public APIs
- [ ] Untested error paths
- [ ] Untested edge cases

**MCP Tools**: `get_test_coverage`, `suggest_test_cases`

### Test Quality
- [ ] Flaky tests
- [ ] Slow tests (>5s)
- [ ] Tests with external dependencies
- [ ] Missing assertions
- [ ] Overly coupled tests
- [ ] Missing negative tests
- [ ] Missing boundary tests

**MCP Tools**: `find_tests_for_file`

### Test Organization
- [ ] Missing test files for source files
- [ ] Inconsistent test naming
- [ ] Missing describe/it structure
- [ ] Missing test utilities/helpers

**MCP Tools**: `find_tests_for_file`

### Test Types
- [ ] Missing unit tests
- [ ] Missing integration tests
- [ ] Missing E2E tests
- [ ] Missing snapshot tests for UI
- [ ] Missing contract tests

**MCP Tools**: `suggest_test_cases`

---

## 7. Configuration (5%)

### Environment Variables
- [ ] Missing .env.example
- [ ] Hardcoded configuration
- [ ] Missing validation on env vars
- [ ] Default values in production
- [ ] Missing env var documentation
- [ ] Environment-specific code (if NODE_ENV === 'production')

**MCP Tools**: `get_env_config`, `validate_env_complete`

### Configuration Drift
- [ ] Inconsistent configs across environments
- [ ] Missing required config in some environments
- [ ] Outdated config files
- [ ] Duplicate configuration

**MCP Tools**: `read_config`

### Feature Flags
- [ ] Stale feature flags
- [ ] Missing flag cleanup
- [ ] Hardcoded feature enablement

**MCP Tools**: grep patterns

---

## 8. Dependencies (5%)

### Version Health
- [ ] Outdated major versions
- [ ] Outdated security patches
- [ ] Deprecated packages
- [ ] Unmaintained packages (no updates in 2+ years)

**MCP Tools**: `analyze_dependencies`

### Security
- [ ] Known vulnerabilities (CVEs)
- [ ] Packages with security advisories
- [ ] Packages from untrusted sources

**MCP Tools**: `analyze_dependencies`

### Bloat
- [ ] Unused dependencies
- [ ] Duplicate dependencies
- [ ] Dependencies with large footprint for small usage
- [ ] Missing peer dependencies
- [ ] Conflicting versions

**MCP Tools**: `analyze_dependencies`, `analyze_bundle`

---

## 9. Error Handling (5%)

### Exception Handling
- [ ] Empty catch blocks
- [ ] Catching and ignoring errors
- [ ] Generic error catching (catch (e))
- [ ] Missing error boundaries (React)
- [ ] Errors not propagated properly

**MCP Tools**: `get_diagnostics`, `parse_error_stack`

### Error Reporting
- [ ] Missing error logging
- [ ] Sensitive data in error logs
- [ ] Missing error context
- [ ] Missing stack traces in logs
- [ ] Missing correlation IDs

**MCP Tools**: `log_analyzer`

### User-Facing Errors
- [ ] Exposing internal errors to users
- [ ] Inconsistent error formats
- [ ] Missing error codes
- [ ] Non-actionable error messages

**MCP Tools**: manual review

### Recovery
- [ ] Missing retry logic
- [ ] Missing fallbacks
- [ ] Missing circuit breakers
- [ ] Missing graceful degradation

**MCP Tools**: manual review

---

## 10. Style & Consistency (5%)

### Naming
- [ ] Inconsistent naming conventions
- [ ] Unclear variable names
- [ ] Abbreviations without context
- [ ] Naming that doesn't match behavior

**MCP Tools**: `scan_patterns`, `get_conventions`

### Formatting
- [ ] Inconsistent indentation
- [ ] Inconsistent quotes
- [ ] Inconsistent semicolons
- [ ] Missing Prettier/ESLint config
- [ ] Ignored linting rules

**MCP Tools**: `scan_patterns`

### File Organization
- [ ] Inconsistent file structure
- [ ] Co-located vs separated concerns
- [ ] Index file patterns
- [ ] Import organization

**MCP Tools**: `scan_patterns`, `get_conventions`

### TypeScript Specific
- [ ] `any` usage
- [ ] Missing strict mode
- [ ] Type assertions (as)
- [ ] Missing return types
- [ ] Missing function parameter types
- [ ] Non-null assertions (!)
- [ ] Missing generics where appropriate

**MCP Tools**: `check_types`, `get_diagnostics`

---

## Scoring Guidelines

### Severity Weights

| Severity | Points Deducted | Multiplier |
|----------|-----------------|------------|
| Critical | 2.0 - 4.0 | 2.0x |
| High | 1.0 - 2.0 | 1.5x |
| Medium | 0.5 - 1.0 | 1.0x |
| Low | 0.1 - 0.5 | 0.5x |

### Grade Scale

| Score | Grade | Description |
|-------|-------|-------------|
| 9.0 - 10.0 | A | Production ready, excellent quality |
| 8.0 - 8.9 | B | Good quality, minor issues |
| 7.0 - 7.9 | C | Acceptable, needs improvement |
| 6.0 - 6.9 | D | Below standard, significant issues |
| < 6.0 | F | Unacceptable, critical issues |
