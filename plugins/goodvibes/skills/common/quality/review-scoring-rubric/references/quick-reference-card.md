# Quick Reference Card

One-page scoring summary for rapid code reviews.

## Formula

```
Final Score = 10 - SUM(Category Deduction * Weight)
Category Deduction = SUM(Issue Points * Severity Multiplier)
```

## Severity Multipliers

| Severity | Mult | Examples |
|----------|------|----------|
| Critical | 2.0x | Security holes, data loss |
| Major | 1.5x | Bugs, bad patterns |
| Minor | 1.0x | Code smells, style |
| Nitpick | 0.5x | Preferences |

## Category Weights

| Cat | W | Top Issues (Base Points) |
|-----|---|--------------------------|
| **ORG** | 12% | God file (1.5), No structure (1.0) |
| **NAM** | 10% | Misleading (1.0), Single-letter (0.75) |
| **ERR** | 12% | Empty catch (1.5), No handling (2.0) |
| **TST** | 12% | 0% coverage (3.0), No critical tests (2.0) |
| **PRF** | 10% | N+1 (1.5), Memory leak (1.5) |
| **SEC** | 12% | SQLi (2.0), RCE (2.0), Secrets (2.0) |
| **DOC** | 8% | No README (1.0), No API docs (0.75) |
| **SLD** | 10% | God class (2.0), SRP violation (1.0) |
| **DEP** | 6% | Critical CVE (2.0), Circular (1.0) |
| **MNT** | 8% | Complexity>30 (1.5), Deep nesting (1.0) |

## Quick Detection Commands

```bash
# Files >300 lines
find src -name "*.ts" -exec wc -l {} \; | awk '$1>300'

# Empty catch
grep -rn "catch.*{\s*}" src/

# Test coverage
npm test -- --coverage

# N+1 patterns
grep -rn "for.*await" src/

# Secrets
grep -rn "password.*=.*['\"]" src/

# SQLi
grep -rn "\`SELECT.*\${" src/

# Security audit
npm audit --json | jq '.metadata.vulnerabilities'

# Complexity
npx escomplex src/ --format json | jq '.aggregate.cyclomatic'

# Circular deps
npx madge --circular src/

# Duplicates
npx jscpd src/ --min-lines 10
```

## Score Meanings

| Score | Verdict | Deploy? |
|-------|---------|---------|
| 9-10 | Excellent | Yes |
| 7-8 | Good | Yes |
| 5-6 | Acceptable | Maybe |
| 3-4 | Poor | No |
| 1-2 | Critical | Never |

## Evidence Template

```
Issue: {What}
Location: {file}:{line}
Measurement: {count/percentage}
Threshold: {standard}
Severity: {Critical|Major|Minor|Nitpick}
Deduction: {base} * {mult} = {total} from {Category}
```

## Report Sections

1. Header (score, one-liner)
2. Executive Summary (3-5 sentences)
3. Score Breakdown (10 categories table)
4. Score Calculation (show math)
5. Critical Issues [P0]
6. Major Issues [P1]
7. Minor Issues [P2]
8. Nitpicks [P3]
9. What's Good
10. Roadmap (phases with point projections)
11. Final Verdict

## Banned Phrases

| DON'T SAY | SAY |
|-----------|-----|
| "some" | "47" |
| "many" | "23" |
| "various" | "X, Y, Z" |
| "consider" | "do" |
| "might" | "must" |
