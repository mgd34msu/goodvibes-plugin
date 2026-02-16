# Review Scoring Examples

This document provides real examples of high-quality and low-quality reviews to illustrate proper application of the review-scoring rubric.

## Example 1: High-Quality Review (9.75/10)

This example demonstrates a thorough, well-scored review that would PASS.

```markdown
## Review Summary
- **Overall Score**: 9.75/10
- **Verdict**: PASS
- **Files Reviewed**: src/api/users.ts, src/lib/auth.ts, src/components/UserProfile.tsx

## Dimension Scores
| Dimension | Score | Notes |
|-----------|-------|-------|
| Correctness | 10/10 | Logic is sound, edge cases handled, null checks present |
| Completeness | 10/10 | Feature fully implemented, no TODOs or placeholders |
| Security | 10/10 | Input validated with zod, auth checked on all routes, no secrets exposed |
| Performance | 9/10 | Efficient queries with proper indexes, minor optimization opportunity with memoization |
| Conventions | 10/10 | Follows project naming, file structure, and import ordering perfectly |
| Testability | 9/10 | Good test coverage on happy path, missing edge case tests for error scenarios |
| Readability | 9/10 | Clear naming, appropriate abstraction, one complex function could use inline comment |
| Error Handling | 10/10 | All errors caught, logged with context, user-facing messages are clear |
| Type Safety | 10/10 | Full TypeScript coverage, no any types, generics used appropriately |
| Integration | 10/10 | Integrates seamlessly with existing auth flow and API patterns |

## Issues Found

### Critical (must fix)
None

### Major (should fix)
None

### Minor (nice to fix)
- [src/api/users.ts:67] The `getUserPermissions` function has nested conditionals that could be simplified. Fix: Extract permission logic into a separate `checkPermission` helper function.
- [src/components/UserProfile.tsx:34] The `userStats` calculation could be memoized to avoid recalculation on unrelated re-renders. Fix: Wrap with `useMemo` and add `user.id` to dependency array.
- [tests/api/users.test.ts:89] Test for user deletion doesn't verify that associated data is also removed. Fix: Add assertion checking that user's posts are deleted or reassigned.

## What Was Done Well
- **Security-first approach**: Every API endpoint has input validation with zod schemas and authentication checks. The use of TypeScript discriminated unions for permission levels is elegant.
- **Error handling**: Consistent error handling pattern across all endpoints with proper logging and user-facing error messages. The custom `ApiError` class is well-designed.
- **Type safety**: Excellent use of TypeScript generics in the repository pattern. The `UserWithPermissions` type prevents unsafe property access.
- **Testing mindset**: Tests are comprehensive for the happy path and include proper setup/teardown. The use of fixtures makes tests maintainable.
```

### Why This Is a 9.75/10 Review

[YES] **Specific findings**: Each dimension score has concrete justification
[YES] **Accurate scoring**: Minor issues don't inflate scores (Testability = 9, not 10)
[YES] **FILE:LINE references**: Every issue pinpoints exact location
[YES] **Actionable fixes**: Each fix suggestion is specific and implementable
[YES] **Balanced**: Highlights both issues and strengths
[YES] **Format compliance**: Follows required structure exactly
[YES] **Verdict matches score**: 9.75 -> PASS (correct threshold)

---

## Example 2: Poor-Quality Review (6.0/10)

This example demonstrates common mistakes in reviews.

```markdown
## Review Summary
- **Overall Score**: 8.50/10
- **Verdict**: CONDITIONAL PASS
- **Files Reviewed**: src/api/users.ts, src/components/UserProfile.tsx

## Dimension Scores
| Dimension | Score | Notes |
|-----------|-------|-------|
| Correctness | 9/10 | Looks good |
| Completeness | 8/10 | Seems complete |
| Security | 8/10 | No major issues |
| Performance | 9/10 | Fast enough |
| Conventions | 10/10 | Follows patterns |
| Testability | 7/10 | Tests could be better |
| Readability | 9/10 | Easy to read |
| Error Handling | 8/10 | Some error handling |
| Type Safety | 8/10 | Has types |
| Integration | 9/10 | Works with other code |

## Issues Found

### Critical (must fix)
None

### Major (should fix)
- The error handling could be improved
- Type safety needs work
- Missing some tests

### Minor (nice to fix)
- Code could be cleaner
- Performance could be optimized

## What Was Done Well
- Good implementation
- Clean code
- Works as expected
```

### Why This Is a Poor Review (6.0/10)

[NO] **Vague dimension notes**: "Looks good" and "Seems complete" provide zero actionable insight
[NO] **Missing FILE:LINE references**: Issues don't pinpoint specific locations
[NO] **No fix suggestions**: "Could be improved" doesn't tell developer what to do
[NO] **Score inflation**: Giving 8-9 scores when "issues need work" is inconsistent
[NO] **Generic positive feedback**: "Good implementation" doesn't highlight specific strengths
[NO] **Verdict is correct but scores are inflated**: The 8.50 score gets CONDITIONAL PASS (8.0-9.49 range is correct), but dimension scores like 9/10 and 10/10 don't match vague notes like "Looks good"
[NO] **Score math is correct**: Weighted average = (9×0.20 + 8×0.15 + 8×0.15 + 9×0.10 + 10×0.10 + 7×0.10 + 9×0.05 + 8×0.05 + 8×0.05 + 9×0.05) = 8.50/10

### How to Fix This Review

**Instead of**: "The error handling could be improved"
**Write**: 
```
[src/api/users.ts:42] Empty catch block silently swallows database errors. 
Fix: Log error with context and return 500 with generic message: 
  logger.error('Database error in getUser', { userId, error }); 
  throw new ApiError('Failed to fetch user', 500);
```

**Instead of**: "Type safety needs work"
**Write**:
```
[src/api/users.ts:67] Function returns `any` type, allowing unsafe property access.
Fix: Replace return type with `User | null` and handle null case in caller.

[src/api/users.ts:89] Using type assertion without runtime validation.
Fix: Add zod validation before assertion: 
  const validated = userSchema.parse(data); 
  return validated as UserWithPermissions;
```

**Instead of**: "Code could be cleaner"
**Write**:
```
[src/components/UserProfile.tsx:34] 80-line component with multiple responsibilities.
Fix: Extract permission checking into custom hook `useUserPermissions()` and 
profile rendering into separate `UserProfileDisplay` component.
```

---

## Common Scoring Mistakes

### Mistake 1: Score Inflation

[NO] **Wrong**:
```
Security: 9/10 — No major issues found
```
(But review found: hardcoded API key, missing auth on endpoint, SQL injection)

[YES] **Right**:
```
Security: 3/10 — Critical vulnerabilities present: hardcoded API key in 
src/config.ts:12, missing auth check on DELETE endpoint, SQL injection 
vulnerable query at src/db/users.ts:45
```

### Mistake 2: Inconsistent Severity

[NO] **Wrong**:
```
### Major (should fix)
- [src/api/auth.ts:23] Authentication can be bypassed by omitting header
```

[YES] **Right**:
```
### Critical (must fix)
- [src/api/auth.ts:23] Authentication bypass: middleware returns early if 
  Authorization header is undefined instead of rejecting request. 
  Fix: Change `if (!authHeader) return;` to `if (!authHeader) throw new 
  UnauthorizedError();`
```

### Mistake 3: Missing Specificity

[NO] **Wrong**:
```
Performance: 6/10 — Multiple N+1 query issues
```

[YES] **Right**:
```
Performance: 6/10 — Three N+1 query patterns found:
  1. src/api/posts.ts:34 - Fetches author for each post in loop
  2. src/api/comments.ts:67 - Fetches user for each comment individually  
  3. src/api/likes.ts:12 - No eager loading of relationships
```

### Mistake 4: Vague Fix Suggestions

[NO] **Wrong**:
```
- [src/components/Form.tsx:45] Accessibility issues. Fix: Add ARIA attributes.
```

[YES] **Right**:
```
- [src/components/Form.tsx:45] Submit button has no accessible label for 
  screen readers. Fix: Add `aria-label="Submit registration form"` to button 
  element or use visible text content instead of icon-only button.
```

### Mistake 5: Ignoring Positive Observations

[NO] **Wrong**:
```
## What Was Done Well
- Code works
```

[YES] **Right**:
```
## What Was Done Well
- **Defensive programming**: src/lib/parser.ts:23-45 has excellent input 
  validation with clear error messages for each failure mode
- **Accessibility first**: All form inputs have proper labels, error 
  announcements, and keyboard navigation (src/components/ContactForm.tsx)
- **Type safety**: Custom type guards in src/lib/validators.ts prevent unsafe 
  type assertions throughout the codebase
```

### Mistake 6: Verdict Threshold Errors

[NO] **Wrong**:
```
- **Overall Score**: 9.2/10
- **Verdict**: PASS
```
(PASS requires 9.5+, this should be CONDITIONAL PASS)

[NO] **Wrong**:
```
- **Overall Score**: 7.8/10
- **Verdict**: CONDITIONAL PASS
```
(CONDITIONAL PASS requires 8.0+, this should be FAIL)

[YES] **Right**:
```
- **Overall Score**: 9.2/10
- **Verdict**: CONDITIONAL PASS
```

---

## Quick Checklist for Reviewers

Before submitting a review, verify:

- [ ] Overall score is calculated correctly using weighted dimensions
- [ ] Verdict matches score thresholds (9.5+ PASS, 8.0-9.49 CONDITIONAL, <8.0 FAIL)
- [ ] All 10 dimensions scored with specific justification (not "looks good")
- [ ] Every issue has FILE:LINE reference
- [ ] Every issue has severity (Critical/Major/Minor) matching guidelines
- [ ] Every issue has actionable fix suggestion
- [ ] "What Was Done Well" section highlights specific strengths with file references
- [ ] No score inflation (use rubric literally: 6-7 = "acceptable with issues")
- [ ] Format matches required template exactly

---

## Templates for Common Issues

Use these as starting points:

### Security Vulnerability Template
```
[FILE:LINE] [Type of vulnerability] allows [attack scenario]. 
Fix: [Specific remediation with code example]
Reference: [OWASP link or security best practice]
```

### Performance Issue Template
```
[FILE:LINE] [Type of performance issue] causes [measurable impact]. 
Fix: [Optimization strategy with code example]
Benchmark: [Expected improvement]
```

### Type Safety Issue Template
```
[FILE:LINE] [Unsafe type usage] allows [runtime error scenario].
Fix: [Correct type with validation]
Example: [Code showing safe approach]
```

### Accessibility Issue Template
```
[FILE:LINE] [A11y violation] prevents [user group] from [action].
Fix: [WCAG-compliant solution]
WCAG Criterion: [2.x.x Level A/AA/AAA]
```

### Multi-Reference Issue Template
```
- [FILE1:LINE1] [Issue affecting multiple locations]
  Also: [FILE2:LINE2], [FILE3:LINE3]
  Fix: [Consistent fix across all locations]
  Example: Apply same pattern to all files
```
