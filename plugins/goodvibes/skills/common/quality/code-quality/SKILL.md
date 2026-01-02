---
name: code-quality
description: Audits code for security vulnerabilities, performance issues, accessibility, complexity metrics, and infrastructure security. Use when reviewing code quality, performing security audits, checking OWASP compliance, analyzing complexity, auditing IaC, or finding dead code.
---

# Code Quality

Comprehensive code auditing for security, performance, accessibility, complexity, and maintainability.

## Quick Start

**Security audit:**
```
Perform a security audit on this codebase, checking for OWASP Top 10 vulnerabilities.
```

**Complexity analysis:**
```
Analyze cyclomatic and cognitive complexity across the codebase.
```

**Performance review:**
```
Analyze this code for performance issues like N+1 queries, memory leaks, and blocking calls.
```

## Capabilities

### 1. Security Audit

#### OWASP Top 10 Checklist

| # | Vulnerability | What to Look For |
|---|---------------|------------------|
| A01 | Broken Access Control | Missing auth checks, IDOR, privilege escalation |
| A02 | Cryptographic Failures | Weak algorithms, hardcoded secrets, plain text storage |
| A03 | Injection | SQL, NoSQL, OS command, LDAP injection points |
| A04 | Insecure Design | Missing rate limits, business logic flaws |
| A05 | Security Misconfiguration | Debug enabled, default credentials, verbose errors |
| A06 | Vulnerable Components | Outdated dependencies with CVEs |
| A07 | Auth Failures | Weak passwords, missing MFA, session issues |
| A08 | Data Integrity Failures | Insecure deserialization, unsigned updates |
| A09 | Logging Failures | Missing audit logs, log injection, PII in logs |
| A10 | SSRF | Unvalidated URLs, internal network access |

See [references/security-patterns.md](references/security-patterns.md) for language-specific vulnerability patterns.

#### Secrets Detection

**Patterns to scan for:**
```regex
# API Keys
(?i)(api[_-]?key|apikey)['":\s]*[=:]\s*['"]?[a-zA-Z0-9_-]{20,}

# AWS
AKIA[0-9A-Z]{16}
(?i)aws[_-]?secret[_-]?access[_-]?key

# Private Keys
-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----

# Connection Strings
(?i)(mongodb|postgres|mysql|redis):\/\/[^\s'"]+
```

#### Injection Analysis

```javascript
// VULNERABLE - SQL Injection
const query = `SELECT * FROM users WHERE id = ${userId}`;

// SAFE - Parameterized
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [userId]);
```

---

### 2. Complexity Analysis

#### Cyclomatic Complexity

Measures independent paths through code:

| Score | Risk Level | Action |
|-------|------------|--------|
| 1-10 | Low | Acceptable |
| 11-20 | Moderate | Consider refactoring |
| 21-50 | High | Refactor recommended |
| 50+ | Very High | Refactor required |

```bash
# JavaScript/TypeScript
npx escomplex src/ --format json

# Python
radon cc src/ -a -j

# Multi-language
lizard src/ --CCN 15
```

#### Cognitive Complexity

Measures mental effort to understand code:

**Increment for:**
- Nested structures (+nesting level)
- Breaks in linear flow
- Complex conditions

See [references/complexity-thresholds.md](references/complexity-thresholds.md) for language-specific thresholds.

#### Code Complexity Report

```markdown
## Complexity Analysis: {module}

### Summary
| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Avg Cyclomatic | 12.3 | 15 | OK |
| Max Cyclomatic | 45 | 25 | FAIL |
| Avg Cognitive | 8.2 | 15 | OK |

### High-Risk Functions
| Function | File | Cyclomatic | Cognitive |
|----------|------|------------|-----------|
| processOrder | orders.ts:45 | 45 | 52 |
| validateForm | forms.ts:23 | 28 | 31 |
```

---

### 3. Performance Review

#### N+1 Query Detection

```javascript
// N+1 PROBLEM
const users = await User.findAll();
for (const user of users) {
  const orders = await Order.findAll({ where: { userId: user.id } });
}

// SOLUTION: Eager loading
const users = await User.findAll({
  include: [{ model: Order }]
});
```

| ORM | N+1 Pattern | Fix |
|-----|-------------|-----|
| Sequelize | Loop with findAll | `include: []` |
| Prisma | Loop with findMany | `include: {}` |
| Django | Loop with filter | `select_related()` |

#### Memory Leak Patterns

```javascript
// LEAK: Growing array never cleared
const cache = [];
app.get('/data', (req, res) => {
  cache.push(processData(req));  // Never removed!
});

// LEAK: Event listeners not removed
element.addEventListener('click', handler);
// Missing: removeEventListener
```

#### Bundle Size Analysis

```bash
# Analyze bundle size
npx webpack-bundle-analyzer stats.json

# Check import costs
npx import-cost src/

# Find large dependencies
npx bundle-phobia-cli lodash
```

---

### 4. Type Coverage Analysis (TypeScript)

```bash
# type-coverage tool
npx type-coverage --detail

# Output:
# 85.23% (1234/1448)
# Uncovered locations:
# src/utils.ts:23:5 - any
# src/api.ts:45:12 - unknown
```

**Coverage targets:**
| Project Type | Target | Minimum |
|--------------|--------|---------|
| New project | 95%+ | 90% |
| Legacy migration | 80%+ | 70% |
| Strict mode | 100% | 95% |

**Common issues:**
- Explicit `any` usage
- Missing return types
- Implicit `any` in callbacks
- Untyped third-party libraries

---

### 5. API Contract Validation

#### OpenAPI Compliance

```bash
# Validate OpenAPI spec
npx @redocly/cli lint openapi.yaml

# Generate types from spec
npx openapi-typescript openapi.yaml -o types.ts

# Test API against spec
npx dredd openapi.yaml http://localhost:3000
```

**Contract validation checklist:**
- [ ] All endpoints documented
- [ ] Request/response schemas defined
- [ ] Error responses specified
- [ ] Authentication documented
- [ ] Examples provided

#### Breaking Change Detection

```bash
# Compare OpenAPI versions
npx oasdiff breaking old-api.yaml new-api.yaml

# Breaking changes detected:
# - Removed endpoint: DELETE /users/{id}
# - Required parameter added: GET /orders
# - Response property removed: User.email
```

---

### 6. Database Schema Audit

**Index usage analysis:**
```sql
-- PostgreSQL: Find missing indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0;

-- Find slow queries
SELECT query, calls, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC LIMIT 10;
```

**Normalization issues:**
| Issue | Symptom | Fix |
|-------|---------|-----|
| 1NF violation | Multi-value columns | Split to separate table |
| 2NF violation | Partial key dependency | Create junction table |
| 3NF violation | Transitive dependency | Move to related table |

**Schema audit checklist:**
- [ ] Primary keys defined
- [ ] Foreign keys with constraints
- [ ] Indexes on frequently queried columns
- [ ] No duplicate data patterns
- [ ] Proper data types used

---

### 7. Infrastructure Audit (IaC Security)

Audit Infrastructure as Code for security issues.

#### Terraform Security

```bash
# tfsec - security scanner
tfsec .

# checkov - policy-as-code
checkov -d .

# terrascan
terrascan scan -i terraform
```

**Common Terraform issues:**
| Issue | Example | Fix |
|-------|---------|-----|
| Public S3 buckets | `acl = "public-read"` | `acl = "private"` |
| Open security groups | `cidr_blocks = ["0.0.0.0/0"]` | Restrict to needed IPs |
| Unencrypted resources | Missing encryption config | Enable encryption |
| Hardcoded secrets | `password = "secret"` | Use variables/secrets manager |

#### CloudFormation Security

```bash
# cfn-lint
cfn-lint template.yaml

# cfn_nag
cfn_nag_scan --input-path template.yaml
```

See [references/iac-security.md](references/iac-security.md) for comprehensive IaC patterns.

---

### 8. Accessibility Audit (WCAG)

#### WCAG 2.1 Level AA Checklist

**Perceivable:**
- [ ] Images have alt text
- [ ] Videos have captions
- [ ] Sufficient color contrast (4.5:1)

**Operable:**
- [ ] Keyboard accessible
- [ ] No keyboard traps
- [ ] Focus indicators visible

**Understandable:**
- [ ] Language declared
- [ ] Form labels associated
- [ ] Error messages descriptive

```bash
# axe-core
npx @axe-core/cli https://localhost:3000

# pa11y
npx pa11y https://localhost:3000

# Lighthouse
npx lighthouse https://localhost:3000 --only-categories=accessibility
```

---

### 9. Dead Code Detection

```bash
# JavaScript/TypeScript
npx ts-prune
npx unimported

# Python
vulture src/

# Unused dependencies
npx depcheck
```

#### Detection Workflow

1. Run static analysis tools
2. Check test coverage for uncovered code
3. Review code not modified in 6+ months
4. Check feature flags for deprecated features

---

### 10. Breaking Change Detection

**Detect API breaking changes:**
```bash
# TypeScript API changes
npx api-extractor run --local

# OpenAPI changes
npx oasdiff breaking old.yaml new.yaml

# Package exports
npx publint
```

**Breaking change types:**
| Type | Severity | Example |
|------|----------|---------|
| Removed export | High | Deleted public function |
| Changed signature | High | Added required parameter |
| Type narrowing | Medium | String to enum |
| Behavior change | Medium | Different return value |

---

## Audit Report Format

```markdown
# Code Quality Audit Report

**Project:** {name}
**Date:** {date}

## Executive Summary
- Critical Issues: {count}
- High Severity: {count}
- Medium Severity: {count}

## Security Findings

### CRITICAL: SQL Injection in UserController
**File:** src/controllers/user.js:45
**Impact:** Full database compromise
**Fix:** Use parameterized queries

## Complexity Findings
...

## Performance Findings
...
```

## Hook Integration

### PreToolUse Hook - Code Quality Gates

Before commits, validate code quality:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "command": "check-quality-gates.sh",
      "condition": "contains(input, 'git commit')"
    }]
  }
}
```

**Gate script example:**
```bash
#!/bin/bash
# check-quality-gates.sh

# Check complexity
complexity=$(npx escomplex src/ --format json | jq '.aggregate.cyclomatic')
if [ "$complexity" -gt 25 ]; then
  echo "BLOCK: Cyclomatic complexity too high: $complexity"
  exit 1
fi

# Check for secrets
if grep -rE "(api[_-]?key|password)\s*=\s*['\"][^'\"]+['\"]" src/; then
  echo "BLOCK: Potential secrets detected"
  exit 1
fi

# Check TypeScript errors
if ! npx tsc --noEmit; then
  echo "BLOCK: TypeScript errors found"
  exit 1
fi

echo "Quality gates passed"
exit 0
```

**Hook response pattern:**
```typescript
interface QualityGateResponse {
  passed: boolean;
  blockers: Array<{
    type: 'security' | 'complexity' | 'type-error';
    message: string;
    file?: string;
    line?: number;
  }>;
  warnings: string[];
}
```

### PostToolUse Hook - Auto-Audit

After code changes, trigger relevant audits:
- Security scan after file edits
- Complexity check after function changes
- Type coverage after TypeScript changes

## CI/CD Integration

### GitHub Actions

```yaml
name: Code Quality
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Security Scan
        run: |
          npm audit --audit-level=high
          npx eslint src/ --ext .ts,.js

      - name: Complexity Check
        run: |
          npx escomplex src/ --format json > complexity.json
          node -e "
            const c = require('./complexity.json');
            if (c.aggregate.cyclomatic > 20) {
              console.error('Complexity too high');
              process.exit(1);
            }
          "

      - name: Type Coverage
        run: |
          npx type-coverage --at-least 85

      - name: IaC Security
        if: hashFiles('terraform/**') != ''
        run: |
          tfsec terraform/
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Run linting
npm run lint || exit 1

# Check for secrets
git diff --cached --name-only | xargs grep -l -E "(password|api_key|secret)" && {
  echo "Warning: Possible secrets in staged files"
  exit 1
}

# Type check
npm run type-check || exit 1
```

## Reference Files

- [references/security-patterns.md](references/security-patterns.md) - Language-specific vulnerability patterns
- [references/performance-patterns.md](references/performance-patterns.md) - Performance anti-patterns by language
- [references/wcag-checklist.md](references/wcag-checklist.md) - Complete WCAG 2.1 checklist
- [references/complexity-thresholds.md](references/complexity-thresholds.md) - Complexity thresholds by language
- [references/iac-security.md](references/iac-security.md) - Infrastructure as Code security patterns

## Scripts

- [scripts/security_scan.py](scripts/security_scan.py) - Automated security pattern scanning
