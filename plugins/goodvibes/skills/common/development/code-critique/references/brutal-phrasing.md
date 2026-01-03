# Brutal Phrasing Guide

Direct, specific, quantified language for code feedback. Professional but unflinching.

## The Formula

Every critique follows this structure:

```
"[This is / This has / This violates] {named problem}. {Evidence: location + count + measurement}. {Impact: what breaks}."
```

**Never:**
- Hedge: "maybe", "perhaps", "might", "could"
- Soften: "a little", "somewhat", "slightly"
- Vague: "seems", "appears to be", "looks like"
- Apologize: "I think", "in my opinion", "it seems to me"

---

## Anti-Pattern Phrases (Never Use)

| Soft Phrase | Why It's Bad |
|-------------|--------------|
| "Perhaps consider..." | You're not considering, you're telling |
| "It might be nice if..." | Nice is not a code quality metric |
| "Maybe we could..." | There is no 'we', and no 'maybe' |
| "Generally speaking..." | Speak specifically or don't speak |
| "Could potentially cause..." | Does it or doesn't it? |
| "In some cases this might..." | Which cases? Show them |
| "It would be good to..." | Good is not actionable |
| "You may want to..." | They don't want to, that's why they didn't |
| "Have you thought about..." | Condescending and evasive |
| "Not bad, but..." | 'Not bad' is meaningless praise |

---

## Power Phrases by Category

### Structural Issues

| Weak | Strong |
|------|--------|
| "This function is kind of long" | "This function is 134 lines. Maximum is 50. Extract into 4 functions" |
| "The class does a lot" | "This class has 6 responsibilities. SRP says 1. Split into 6 classes" |
| "Might want to reduce parameters" | "This function takes 9 parameters. Maximum is 4. Use a config object" |
| "Consider reducing nesting" | "This code nests 6 levels deep. Maximum is 3. Use early returns" |
| "Could be more modular" | "This 800-line file should be 8 files of ~100 lines each" |

---

### Naming Issues

| Weak | Strong |
|------|--------|
| "Could use a better name" | "'x' is meaningless. What is this? A coordinate? A count? A coefficient?" |
| "Name is a bit unclear" | "'handleData' says nothing. Handle how? Validate? Transform? Store?" |
| "Consider renaming this" | "'isValid' returns a string. 'is' prefix requires boolean. This will cause bugs" |
| "Maybe be more specific" | "'temp' appears 7 times. What's temporary about each one? Name the purpose" |
| "The naming could be improved" | "12 single-letter variables in this function. I shouldn't need a decoder ring" |

---

### Logic Issues

| Weak | Strong |
|------|--------|
| "This might cause issues" | "Line 45 will throw TypeError when user is null. getUserById returns null on miss" |
| "Could be a potential bug" | "Line 67: i <= arr.length. Last iteration accesses undefined. Off-by-one error" |
| "Watch out for edge cases" | "Empty array input crashes at line 34. No length check before accessing [0]" |
| "May not work in all cases" | "Fails for: empty string, null, undefined, whitespace-only. Handle all 4" |
| "Error handling could be improved" | "Lines 78-80: empty catch block. Errors silently disappear. Log or rethrow" |

---

### Performance Issues

| Weak | Strong |
|------|--------|
| "This might be slow" | "N+1 query in loop. 100 users = 101 queries = 5 seconds. Batch: 100ms" |
| "Could be more efficient" | "O(n^2) nested loops. n=10000 = 100M operations. O(n) solution exists" |
| "Consider caching this" | "Same API called 47 times in render cycle. Call once, store result" |
| "May cause memory issues" | "addEventListener without removeEventListener. Memory leak after 100 mounts" |
| "Performance could be better" | "Array copied 4 times in chain: filter().map().filter().sort(). Use single reduce()" |

---

### Security Issues

| Weak | Strong |
|------|--------|
| "Could be a security risk" | "SQL injection at line 34. Input '1; DROP TABLE users;--' destroys database" |
| "Maybe sanitize this" | "XSS vector at line 78. innerHTML = userInput allows script injection" |
| "Be careful with this" | "API key hardcoded line 12. In git forever. Attacker has production access" |
| "Might want to validate" | "JSON.parse on user input, no schema. Prototype pollution attack possible" |
| "Security could be improved" | "Password stored in plaintext. Use bcrypt with cost factor 12 minimum" |

---

### Style Issues

| Weak | Strong |
|------|--------|
| "Style is inconsistent" | "67 single quotes, 23 double quotes. Pick one. Configure Prettier" |
| "Formatting could be cleaner" | "Mixed 2-space and 4-space indentation. Lines 1-100 vs 101-200" |
| "Consider removing this" | "Lines 78-95 unreachable after return at 77. Dead code. Delete it" |
| "Could use constants" | "86400000 appears 4 times. What is it? Extract: ONE_DAY_MS = 86400000" |
| "Maybe add comments" | "This regex has 0 explanation: /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/. Document it" |

---

## Severity Communication

### Critical (9-10)
```
"CRITICAL: [Issue]. This WILL [break/crash/leak/expose] in production. Fix before merge."

Example:
"CRITICAL: SQL injection at line 34. Production database can be destroyed with
crafted input. Fix before merge. Block on this."
```

### High (7-8)
```
"HIGH: [Issue]. This breaks [scenario]. Must fix in this PR."

Example:
"HIGH: Null dereference at line 67. Crashes when user not found - happens
~5% of lookups. Must fix in this PR."
```

### Medium (4-6)
```
"MEDIUM: [Issue]. Causes [problem] in [scenario]. Should fix."

Example:
"MEDIUM: N+1 query at line 45. Page load 5 seconds with 100 items.
Users will abandon. Should fix."
```

### Low (1-3)
```
"LOW: [Issue]. [Minor impact]. Nice to fix."

Example:
"LOW: Magic number 86400000 at line 34. Unclear intent.
Extract to ONE_DAY_MS constant for clarity."
```

---

## Complete Examples

### Example 1: God Class

**Weak:**
> "This class seems to be doing a lot of things. Maybe consider breaking it up into smaller pieces if you get a chance."

**Strong:**
> "UserService is a God Class. 1,247 lines across 47 methods handling 5 distinct responsibilities: authentication (methods 1-12), email (13-23), billing (24-35), analytics (36-42), notifications (43-47). Single Responsibility Principle says one. Split into AuthService, EmailService, BillingService, AnalyticsService, NotificationService."

---

### Example 2: Security Vulnerability

**Weak:**
> "You might want to be careful with how you're building this query. It could potentially be exploited in some circumstances."

**Strong:**
> "Line 34 is a SQL injection vulnerability. Query built with: `'SELECT * FROM users WHERE id = ' + req.params.id`. Attack input: `'1; DROP TABLE users;--'` Result: Database destroyed. Fix: Use parameterized query `db.query('SELECT * FROM users WHERE id = $1', [req.params.id])`. This is a blocking issue."

---

### Example 3: Performance

**Weak:**
> "This might not scale well. Consider looking into ways to optimize the database access pattern."

**Strong:**
> "Lines 45-67 execute N+1 queries. Loop over 100 orders, each calling getOrderItems(). Result: 101 database round trips. Measured: 50ms per query * 101 = 5.05 seconds. Batch solution: `SELECT * FROM items WHERE order_id IN (...)` = ~100ms. Current implementation is 50x slower than necessary."

---

### Example 4: Logic Bug

**Weak:**
> "There might be some edge cases that could cause problems here."

**Strong:**
> "Line 67 crashes on empty input. `items[0].id` with empty array throws `TypeError: Cannot read property 'id' of undefined`. This path hit when user has no orders - approximately 30% of users. Add guard: `if (!items.length) return []`."

---

### Example 5: Naming

**Weak:**
> "Some of these variable names could perhaps be a bit more descriptive."

**Strong:**
> "8 variables fail basic naming standards:
> - Line 23: `d` - data? date? delta? day?
> - Line 34: `cb` - callback? checkbox? but it's a number
> - Line 45: `temp` - temporary what?
> - Line 56: `data2` - how is this different from data1?
> - Line 67: `handleIt()` - handle what, how?
> - Line 78: `doStuff()` - stuff?
> - Line 89: `process()` - process into what?
> - Line 100: `isValid` returns string, not boolean
>
> Each one forces future readers to trace through code to understand meaning. Rename all 8 with specific, intention-revealing names."

---

## The Professional Line

Brutal honesty is not:
- Personal attacks ("You clearly don't understand...")
- Mockery ("Did you even test this?")
- Exaggeration ("This is the worst code I've ever seen")
- Absolutism ("Never do X" when X has valid uses)

Brutal honesty IS:
- Specific ("Line 47 does X, which causes Y")
- Quantified ("This is 3x the limit")
- Impersonal ("This code has..." not "You wrote...")
- Actionable ("Replace X with Y")
- Evidence-based ("Measured at N ms")

**Test:** Would you say this in a code review that gets archived forever? Would you be comfortable if the CEO read it? If yes, it's professional. If no, revise.
