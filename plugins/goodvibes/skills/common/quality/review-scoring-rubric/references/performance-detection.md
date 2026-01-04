# Performance Issue Detection

Patterns and commands for detecting performance problems during code review.

## N+1 Query Detection

### Pattern Recognition

**Symptom:** Loop iterating over records with database query inside.

```javascript
// N+1 PATTERN
for (const user of users) {
  const orders = await Order.findAll({ where: { userId: user.id } });
}

// Also watch for:
users.forEach(async (user) => {
  await fetchRelatedData(user.id);  // N+1!
});

// And map with await:
const results = await Promise.all(users.map(async (user) => {
  return await getOrders(user.id);  // Still N+1 (but parallel)
}));
```

### Detection Commands

```bash
# for...of with await inside
grep -rn "for.*of.*\n.*await" src/

# forEach with async callback
grep -rn "\.forEach.*async" src/

# map with individual queries
grep -rn "\.map.*async.*=>.*find\|\.map.*async.*=>.*get" src/
```

### ORM-Specific Patterns

| ORM | N+1 Pattern | Fix |
|-----|-------------|-----|
| Sequelize | `findAll` then loop `findAll` | `include: []` |
| Prisma | `findMany` then loop `findMany` | `include: {}` |
| TypeORM | `find` then loop | `relations: []` |
| Django | `all()` then access FK | `select_related()` |
| SQLAlchemy | `query` then access lazy | `joinedload()` |

---

## Memory Leak Patterns

### Event Listener Leaks

```javascript
// LEAK: Listener never removed
class Component {
  mount() {
    window.addEventListener('resize', this.onResize);
  }
  // Missing unmount/destroy with removeEventListener
}

// LEAK: Anonymous function can't be removed
element.addEventListener('click', () => this.handle());
```

### Detection

```bash
# addEventListener without removeEventListener
grep -rln "addEventListener" src/ | xargs grep -L "removeEventListener"

# setInterval without clearInterval
grep -rln "setInterval" src/ | xargs grep -L "clearInterval"

# Growing arrays/objects
grep -rn "\.push\(" src/ | grep -v "test\|spec"
```

### Timer Leaks

```javascript
// LEAK: Interval never cleared
setInterval(() => checkStatus(), 1000);

// FIX: Store and clear
const interval = setInterval(() => checkStatus(), 1000);
onCleanup(() => clearInterval(interval));
```

### Cache Leaks

```javascript
// LEAK: Unbounded cache
const cache = {};
function get(key) {
  if (!cache[key]) cache[key] = fetch(key);
  return cache[key];  // Grows forever!
}

// FIX: LRU cache with max size
const cache = new LRU({ max: 1000 });
```

---

## Blocking Operation Detection

### Sync Operations in Async Context

```javascript
// BLOCKS EVENT LOOP
app.get('/data', async (req, res) => {
  const data = fs.readFileSync(path);  // Blocks!
  const hash = crypto.pbkdf2Sync(...);  // Blocks!
  res.json(data);
});
```

### Detection Commands

```bash
# Sync file operations
grep -rn "readFileSync\|writeFileSync\|appendFileSync" src/

# Sync crypto
grep -rn "pbkdf2Sync\|scryptSync\|randomBytesSync" src/

# Sync child process
grep -rn "execSync\|spawnSync" src/
```

### Sequential vs Parallel

```javascript
// SLOW: Sequential (3 seconds)
const a = await fetchA();  // 1s
const b = await fetchB();  // 1s
const c = await fetchC();  // 1s

// FAST: Parallel (1 second)
const [a, b, c] = await Promise.all([
  fetchA(),
  fetchB(),
  fetchC()
]);
```

### Detection

```bash
# Multiple sequential awaits (potential parallelization)
grep -rn "await.*\nawait.*\nawait" src/
```

---

## Inefficient Algorithm Patterns

### O(n) Where O(1) Possible

```javascript
// O(n) - BAD
const users = [...];
function findUser(id) {
  return users.find(u => u.id === id);  // O(n) every time
}

// O(1) - GOOD
const usersById = new Map(users.map(u => [u.id, u]));
function findUser(id) {
  return usersById.get(id);  // O(1)
}
```

### Detection

```bash
# Array.find/findIndex/indexOf in hot paths
grep -rn "\.find\(.*id\|\.findIndex\|\.indexOf" src/

# Array.includes for lookups
grep -rn "\.includes\(" src/ | grep -v "test"
```

### O(n^2) Patterns

```javascript
// O(n^2) - BAD
for (const a of listA) {
  for (const b of listB) {
    if (a.id === b.id) { ... }
  }
}

// O(n) - GOOD
const bById = new Map(listB.map(b => [b.id, b]));
for (const a of listA) {
  const b = bById.get(a.id);
  if (b) { ... }
}
```

---

## React Performance Issues

### Unnecessary Re-renders

```jsx
// BAD: New object every render
<Child style={{ color: 'red' }} />

// BAD: New function every render
<Child onClick={() => handleClick(id)} />

// GOOD: Memoize
const style = useMemo(() => ({ color: 'red' }), []);
const handleClick = useCallback(() => onClick(id), [id, onClick]);
```

### Detection

```bash
# Inline objects in JSX
grep -rn "={{" src/**/*.tsx

# Inline arrow functions in JSX
grep -rn "={() =>" src/**/*.tsx
```

### Missing Memoization

```jsx
// BAD: Expensive calculation every render
function Component({ items }) {
  const sorted = items.sort((a, b) => a - b);
  const filtered = sorted.filter(x => x > 0);
  // ...
}

// GOOD: useMemo
function Component({ items }) {
  const processed = useMemo(() => {
    return [...items].sort((a, b) => a - b).filter(x => x > 0);
  }, [items]);
  // ...
}
```

---

## Database Performance

### Missing Indexes

```sql
-- Check for missing indexes on foreign keys
SELECT
  tc.table_name,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = tc.table_name
    AND indexdef LIKE '%' || kcu.column_name || '%'
  );
```

### Missing Pagination

```javascript
// BAD: Returns all records
app.get('/users', async (req, res) => {
  const users = await User.findAll();  // Could be millions!
  res.json(users);
});

// GOOD: Paginated
app.get('/users', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const users = await User.findAll({
    limit: Math.min(limit, 100),
    offset: (page - 1) * limit
  });
  res.json(users);
});
```

### Detection

```bash
# findAll without limit
grep -rn "findAll\(\)" src/
grep -rn "\.all\(\)" src/

# Check for pagination params
grep -rn "limit\|offset\|page\|skip" src/
```

---

## Network Performance

### Large Payloads

```javascript
// BAD: Returns all fields
const user = await User.findOne({ where: { id } });

// GOOD: Select only needed
const user = await User.findOne({
  where: { id },
  attributes: ['id', 'name', 'email']  // Only what's needed
});
```

### Missing Compression

```javascript
// Check for gzip/brotli
app.use(compression());  // Should be present

// Or in nginx/CDN config
```

### No Caching

```javascript
// BAD: Fetch every time
async function getConfig() {
  return fetch('/api/config');
}

// GOOD: Cache with TTL
const cache = new Map();
async function getConfig() {
  if (cache.has('config') && Date.now() - cache.get('config').time < 60000) {
    return cache.get('config').data;
  }
  const data = await fetch('/api/config');
  cache.set('config', { data, time: Date.now() });
  return data;
}
```

---

## Quick Reference

| Issue | Detection Command | Deduction |
|-------|-------------------|-----------|
| N+1 Query | `grep -rn "for.*await.*find"` | 1.5 (Critical) |
| Memory Leak | `grep -rln "addEventListener" \| xargs grep -L "remove"` | 1.5 (Critical) |
| Sync in Async | `grep -rn "readFileSync"` | 1.0 (Major) |
| Sequential Await | `grep -rn "await.*await.*await"` | 0.5 (Minor) |
| No Pagination | `grep -rn "findAll\(\)"` | 0.75 (Major) |
| O(n) Lookup | `grep -rn "\.find\(.*id"` | 0.5 (Minor) |
| Missing Cache | Manual review | 0.5 (Minor) |
