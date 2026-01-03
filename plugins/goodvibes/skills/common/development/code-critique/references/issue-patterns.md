# Issue Patterns Catalog

Complete reference of code smells, anti-patterns, and common violations with detection criteria and brutal phrasing.

## Structural Patterns

### God Class

**Detection:**
- File >500 lines
- Class has >20 methods
- Class has >15 fields
- Class name contains "Manager", "Handler", "Processor", "Service" with no qualifier

**Measurement:**
```
- Line count: {N} (max: 300)
- Method count: {N} (max: 10)
- Field count: {N} (max: 7)
- Responsibility count: {N} (should be: 1)
```

**Brutal phrasing:**
```
"UserManager is a God Class. 1,247 lines, 43 methods, handles auth, email, billing,
analytics, and notifications. That's 5 responsibilities in one class. SRP says 1."
```

---

### Long Method

**Detection:**
- Function >50 lines
- Cyclomatic complexity >10
- Multiple levels of abstraction in one function
- More than 3 nested control structures

**Measurement:**
```
- Line count: {N} (max: 50)
- Cyclomatic complexity: {N} (max: 10)
- Nesting depth: {N} (max: 3)
- Abstraction levels: {N} (should be: 1)
```

**Brutal phrasing:**
```
"processOrder() is 134 lines with cyclomatic complexity 27. That's 2.7x the line limit
and 2.7x the complexity limit. Extract into: validateOrder(), calculatePrice(),
checkInventory(), sendNotification()."
```

---

### Long Parameter List

**Detection:**
- Function has >4 parameters
- Boolean parameters (flag arguments)
- Multiple parameters of same type in sequence

**Measurement:**
```
- Parameter count: {N} (max: 4)
- Boolean parameters: {N} (should be: 0)
- Same-type sequences: {list}
```

**Brutal phrasing:**
```
"createUser() takes 9 parameters. Max is 4. Three of them are booleans - classic flag
argument smell. Extract to UserConfig object or use builder pattern."
```

---

### Deep Nesting

**Detection:**
- Nesting depth >3 levels
- Arrow code (rightward drift)
- Multiple sequential if/else chains

**Measurement:**
```
- Max nesting depth: {N} (max: 3)
- Lines at depth 4+: {N}
- Arrow code score: {column position of deepest code}
```

**Brutal phrasing:**
```
"Lines 45-89 nest 6 levels deep. Max is 3. The deepest code starts at column 48.
Use early returns, extract methods, or invert conditions."
```

---

### Feature Envy

**Detection:**
- Method accesses another object's data more than its own
- Chains of getters: `obj.getA().getB().getC()`
- Method would make more sense in another class

**Measurement:**
```
- References to other class: {N}
- References to own class: {N}
- Getter chains: {N} (max chain length: {N})
```

**Brutal phrasing:**
```
"calculateDiscount() in OrderService accesses Customer 14 times and OrderService
fields twice. This method belongs in Customer, not here."
```

---

### Shotgun Surgery

**Detection:**
- Single conceptual change requires modifying multiple files
- Scattered related code
- No single source of truth

**Measurement:**
```
- Files to modify for change: {N}
- Classes to modify: {N}
- Scatter score: changes per concept
```

**Brutal phrasing:**
```
"Adding a new user field requires changes to: User.ts, UserDTO.ts, UserValidator.ts,
UserMapper.ts, UserController.ts, UserService.ts, and 3 test files. That's 9 files
for one field. This is Shotgun Surgery."
```

---

### Divergent Change

**Detection:**
- One class changed for multiple unrelated reasons
- Different developers modifying same file for different features
- Mixed responsibilities in single file

**Measurement:**
```
- Change reasons: {list}
- Recent commits touching file: {N}
- Distinct feature areas: {N}
```

**Brutal phrasing:**
```
"UserService modified 23 times in last month for: auth changes (7), email changes (5),
billing changes (6), analytics (5). Four unrelated reasons to change one file.
Split into AuthService, EmailService, BillingService, AnalyticsService."
```

---

## Logic Patterns

### Null Dereference Risk

**Detection:**
- Accessing properties without null check
- Optional chaining missing where needed
- Functions that can return null used without guard

**Measurement:**
```
- Null-returning functions called: {N}
- Unguarded accesses: {N}
- Lines at risk: {list}
```

**Brutal phrasing:**
```
"Line 67 accesses user.email. getUserById() returns null when not found (line 23).
No null check. This will throw TypeError in production when user doesn't exist."
```

---

### Off-By-One Error

**Detection:**
- Loop bounds using `<=` with length
- Array access at index equal to length
- Fence-post errors in range calculations

**Measurement:**
```
- Suspicious loop bounds: {N}
- Off-by-one patterns: {list of locations}
```

**Brutal phrasing:**
```
"Line 89: for(i = 0; i <= arr.length). Last iteration accesses arr[arr.length]
which is undefined. Should be i < arr.length."
```

---

### Race Condition

**Detection:**
- Async operation without await
- Shared state modified from multiple async paths
- Check-then-act without synchronization

**Measurement:**
```
- Unawaitd async calls: {N}
- Shared mutable state: {N} variables
- Check-then-act patterns: {N}
```

**Brutal phrasing:**
```
"Line 112: saveUser() is async but not awaited. Line 115 reads user state that
may not be persisted yet. Race condition: fast execution = stale read."
```

---

### Unchecked Type Coercion

**Detection:**
- `==` instead of `===` in JavaScript
- Implicit type conversions
- String concatenation with numbers

**Measurement:**
```
- Loose equality uses: {N}
- Implicit coercions: {N}
- Type-unsafe operations: {list}
```

**Brutal phrasing:**
```
"Line 45 uses '==' comparing string to number. '5' == 5 is true due to coercion.
Use '===' for type-safe comparison. Found 12 instances of loose equality."
```

---

### Silent Failure

**Detection:**
- Empty catch blocks
- Caught exceptions not logged or rethrown
- Error conditions returning null instead of throwing

**Measurement:**
```
- Empty catch blocks: {N}
- Swallowed exceptions: {N}
- Silent null returns: {N}
```

**Brutal phrasing:**
```
"Line 78-80: catch block is empty. Exception caught and discarded. Failures will
be invisible in production. At minimum: log the error. Preferably: rethrow or
return Result type."
```

---

## Naming Patterns

### Single-Letter Variables

**Detection:**
- Variables named with single character (except loop indices i, j, k)
- Abbreviations that aren't universally known

**Measurement:**
```
- Single-letter vars (non-loop): {N}
- Unclear abbreviations: {list}
```

**Brutal phrasing:**
```
"Line 23: 'd' - what is this? data? date? delta? difference?
Line 45: 'u' - user? undefined? utility?
Line 67: 'cb' - callback? but it's a boolean.
6 single-letter variables making code unreadable."
```

---

### Misleading Names

**Detection:**
- Name suggests different type (isValid returns string)
- Name suggests different behavior (save doesn't persist)
- Name contradicts actual behavior

**Measurement:**
```
- Type-misleading names: {list}
- Behavior-misleading names: {list}
```

**Brutal phrasing:**
```
"Line 34: isActive() returns 'active' | 'inactive' | 'pending'.
'is' prefix implies boolean. Returns string. This will cause bugs
when developers assume if(isActive()) works."
```

---

### Vague Verbs

**Detection:**
- `handle`, `process`, `manage`, `do` without qualifier
- Generic nouns: `data`, `info`, `item`, `thing`
- Numbered suffixes: `data2`, `temp1`

**Measurement:**
```
- Vague verbs: {list with locations}
- Generic nouns: {list with locations}
- Numbered names: {list with locations}
```

**Brutal phrasing:**
```
"7 functions named 'handle*' without specifying what they handle:
- handleData() line 23 - handle how? what data?
- handleStuff() line 45 - stuff?
- processItem() line 67 - process into what? item of what type?
Every one needs a specific verb: validate, transform, persist, format."
```

---

## Performance Patterns

### N+1 Query

**Detection:**
- Database call inside loop
- ORM lazy loading triggered in iteration
- API call per item instead of batch

**Measurement:**
```
- Queries inside loops: {N}
- Current query count: 1 + N where N = {typical count}
- Estimated time: {N} * {query time} = {total}
```

**Brutal phrasing:**
```
"Lines 45-67: getOrderItems() called in loop over orders. 100 orders = 101 queries.
Current: ~50ms * 101 = 5 seconds.
With batch query: ~100ms total.
This is 50x slower than necessary."
```

---

### Premature Optimization

**Detection:**
- Complex caching for data accessed once
- Micro-optimizations in non-hot paths
- Optimization without profiling evidence

**Measurement:**
```
- Complexity added: {description}
- Call frequency: {N} per {time period}
- Time saved: {estimate}
```

**Brutal phrasing:**
```
"Lines 34-89: 55 lines of custom LRU cache for config loaded once at startup.
This path executes 1 time per application lifecycle. You've added complexity
for zero measurable benefit. Delete and use simple object."
```

---

### Memory Leak

**Detection:**
- Event listeners not removed
- Subscriptions not unsubscribed
- Growing collections without bounds
- Closures capturing large objects

**Measurement:**
```
- Unremoved listeners: {N}
- Unsubscribed subscriptions: {N}
- Unbounded collections: {N}
```

**Brutal phrasing:**
```
"Line 45: addEventListener without corresponding removeEventListener.
Component mounts/unmounts create new listeners each time. After 100 route
changes: 100 zombie listeners. Memory grows until OOM or refresh."
```

---

### Inefficient Algorithm

**Detection:**
- O(n^2) when O(n) possible
- Linear search on sorted data
- Repeated work in loops

**Measurement:**
```
- Current complexity: O({X})
- Optimal complexity: O({Y})
- Speedup factor: {estimate for typical N}
```

**Brutal phrasing:**
```
"Lines 67-89: nested loop comparing all pairs. O(n^2) complexity.
With n=10,000 items: 100,000,000 comparisons.
Using a Set for lookup: O(n) = 10,000 operations.
This is 10,000x slower than necessary for typical data size."
```

---

## Security Patterns

### SQL Injection

**Detection:**
- String concatenation in SQL queries
- Template literals with user input
- No parameterized queries

**Measurement:**
```
- Injectable queries: {N}
- User input sources: {list}
```

**Brutal phrasing:**
```
"Line 34: SQL built with string concatenation including userId from request.
Input: userId = '1; DROP TABLE users;--'
Result: Database destroyed.
Use parameterized queries. This is Security 101."
```

---

### XSS Vulnerability

**Detection:**
- innerHTML with user content
- dangerouslySetInnerHTML without sanitization
- Script injection vectors

**Measurement:**
```
- Unsafe HTML assignments: {N}
- User input rendered: {N}
- Sanitization calls: {N} (should match unsafe assignments)
```

**Brutal phrasing:**
```
"Line 78: innerHTML = userComment. No sanitization.
Input: userComment = '<script>stealCookies()</script>'
Result: XSS attack, session hijacking.
Use textContent or sanitize with DOMPurify."
```

---

### Hardcoded Secrets

**Detection:**
- API keys in source code
- Passwords in configuration
- Tokens in committed files

**Measurement:**
```
- Hardcoded secrets: {N}
- Types: {API keys, passwords, tokens, etc.}
- Exposure: {committed to repo? publicly accessible?}
```

**Brutal phrasing:**
```
"Line 12: apiKey = 'sk_live_abc123def456'.
This is in version control. It's in your git history forever.
Anyone with repo access has production API access.
Rotate this key immediately. Use environment variables."
```

---

### Insecure Deserialization

**Detection:**
- JSON.parse on untrusted input without validation
- eval() usage
- Dynamic require/import with user input

**Measurement:**
```
- Unsafe deserialization: {N}
- eval usage: {N}
- Dynamic imports: {N}
```

**Brutal phrasing:**
```
"Line 56: JSON.parse(userInput) with no schema validation.
Prototype pollution attack: input = '{\"__proto__\":{\"admin\":true}}'
Result: All objects now have admin=true.
Validate with JSON schema or Zod before parsing."
```

---

## Style Patterns

### Inconsistent Formatting

**Detection:**
- Mixed quote styles
- Mixed indentation (tabs/spaces, 2/4)
- Inconsistent brace style

**Measurement:**
```
- Single quotes: {N} occurrences
- Double quotes: {N} occurrences
- 2-space indent: {N} lines
- 4-space indent: {N} lines
```

**Brutal phrasing:**
```
"File uses 67 single quotes and 23 double quotes. Lines 1-100 use 2-space indent,
lines 101-200 use 4-space. This looks like code from 3 different developers
pasted together. Pick one style. Configure Prettier. Run it."
```

---

### Dead Code

**Detection:**
- Unreachable code after return/throw
- Unused variables, functions, imports
- Commented-out code

**Measurement:**
```
- Unreachable lines: {N}
- Unused exports: {N}
- Commented code blocks: {N}
- Dead code percentage: {N}%
```

**Brutal phrasing:**
```
"Lines 78-95: unreachable. Return statement at line 77 exits function.
Lines 112-130: commented-out code. If you need it, it's in git. Delete it.
23 unused imports at top of file.
18% of this file is dead weight."
```

---

### Magic Numbers

**Detection:**
- Numeric literals without explanation
- String literals that could change
- Repeated literal values

**Measurement:**
```
- Magic numbers: {list with locations}
- Magic strings: {list with locations}
- Repeated literals: {value} appears {N} times
```

**Brutal phrasing:**
```
"Line 45: if (status === 3). What is 3? Active? Pending? Error?
Line 67: timeout = 86400000. Why this number? (It's milliseconds in a day)
Line 89: maxRetries = 3. Is this different from status 3?
Extract to named constants: STATUS_ACTIVE, ONE_DAY_MS, MAX_RETRY_ATTEMPTS."
```

---

## Quick Detection Commands

```bash
# Find god classes (>500 lines)
find src -name "*.ts" -exec wc -l {} \; | awk '$1 > 500 {print}'

# Find long functions (>50 lines) - needs parsing
npx escomplex src/ --format json | jq '.reports[].functions[] | select(.sloc.physical > 50)'

# Find complexity hotspots
npx escomplex src/ --format json | jq '.reports[].functions[] | select(.cyclomatic > 10)'

# Find potential null dereferences
grep -rn "\.\w*\." src/ --include="*.ts" | grep -v "?\." | head -20

# Find N+1 patterns (query in loop)
grep -B5 "for\|forEach\|map\|while" src/**/*.ts | grep -A5 "query\|findOne\|get"

# Find magic numbers
grep -rn "[^0-9][0-9]\{3,\}[^0-9]" src/ --include="*.ts" | grep -v "port\|year\|version"
```
