# Performance Anti-Patterns

Common performance issues and their solutions by language and context.

## Database Performance

### N+1 Query Problem

The most common performance issue in applications with ORMs.

**Detection pattern:**
- Loop iterating over records
- Query inside the loop body
- Number of queries = N records + 1 initial query

#### Node.js (Sequelize)
```javascript
// N+1 PROBLEM
const users = await User.findAll();
for (const user of users) {
  user.orders = await Order.findAll({ where: { userId: user.id } });
}

// FIX: Eager loading
const users = await User.findAll({
  include: [{ model: Order }]
});

// FIX: Batch loading
const users = await User.findAll();
const userIds = users.map(u => u.id);
const orders = await Order.findAll({ where: { userId: userIds } });
const ordersByUser = groupBy(orders, 'userId');
users.forEach(u => u.orders = ordersByUser[u.id] || []);
```

#### Node.js (Prisma)
```javascript
// N+1 PROBLEM
const users = await prisma.user.findMany();
for (const user of users) {
  user.posts = await prisma.post.findMany({ where: { authorId: user.id } });
}

// FIX: Include
const users = await prisma.user.findMany({
  include: { posts: true }
});
```

#### Python (Django)
```python
# N+1 PROBLEM
users = User.objects.all()
for user in users:
    orders = user.orders.all()  # Query per user!

# FIX: select_related (ForeignKey, OneToOne)
orders = Order.objects.select_related('user').all()

# FIX: prefetch_related (ManyToMany, reverse FK)
users = User.objects.prefetch_related('orders').all()
```

#### Python (SQLAlchemy)
```python
# N+1 PROBLEM
users = session.query(User).all()
for user in users:
    print(user.orders)  # Lazy load per user

# FIX: joinedload
from sqlalchemy.orm import joinedload
users = session.query(User).options(joinedload(User.orders)).all()

# FIX: subqueryload (better for large datasets)
from sqlalchemy.orm import subqueryload
users = session.query(User).options(subqueryload(User.orders)).all()
```

#### Ruby (Rails)
```ruby
# N+1 PROBLEM
@users = User.all
@users.each { |user| user.orders.each { |o| puts o.total } }

# FIX: includes
@users = User.includes(:orders).all

# FIX: eager_load (forces JOIN)
@users = User.eager_load(:orders).all

# FIX: preload (separate queries)
@users = User.preload(:orders).all
```

### Missing Indexes

**Symptoms:**
- Full table scans in EXPLAIN output
- Slow queries on large tables
- High CPU on database server

**Common missing indexes:**
```sql
-- Foreign keys (not auto-indexed in PostgreSQL)
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Frequently filtered columns
CREATE INDEX idx_users_email ON users(email);

-- Composite for common query patterns
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

-- Partial index for specific conditions
CREATE INDEX idx_active_users ON users(email) WHERE active = true;
```

---

## Memory Issues

### JavaScript Memory Leaks

#### Event Listener Accumulation
```javascript
// LEAK: Listeners never removed
class Component {
  constructor() {
    window.addEventListener('resize', this.handleResize);
  }
  // Missing: removeEventListener in destructor
}

// FIX
class Component {
  constructor() {
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }
  destroy() {
    window.removeEventListener('resize', this.handleResize);
  }
}
```

#### Closure References
```javascript
// LEAK: largeData held in closure
function createProcessor() {
  const largeData = new Array(1000000).fill('x');
  return function process(item) {
    return largeData.includes(item);  // Closure keeps largeData alive
  };
}

// FIX: Don't capture unnecessary data
function createProcessor() {
  const lookupSet = new Set(['x']);  // Only what's needed
  return function process(item) {
    return lookupSet.has(item);
  };
}
```

#### Growing Collections
```javascript
// LEAK: Cache grows unbounded
const cache = {};
function getData(key) {
  if (!cache[key]) {
    cache[key] = fetchData(key);
  }
  return cache[key];
}

// FIX: Use LRU cache with size limit
const LRU = require('lru-cache');
const cache = new LRU({ max: 500 });
function getData(key) {
  if (!cache.has(key)) {
    cache.set(key, fetchData(key));
  }
  return cache.get(key);
}
```

#### Timer Leaks
```javascript
// LEAK: Interval never cleared
class Poller {
  start() {
    this.interval = setInterval(() => this.poll(), 1000);
  }
  // Missing: clearInterval
}

// FIX
class Poller {
  start() {
    this.interval = setInterval(() => this.poll(), 1000);
  }
  stop() {
    clearInterval(this.interval);
  }
}
```

### Python Memory Issues

```python
# LEAK: Global list grows
results = []
def process(item):
    results.append(expensive_computation(item))

# FIX: Generator or bounded collection
def process_all(items):
    for item in items:
        yield expensive_computation(item)

# LEAK: Circular references (less common in Python 3)
class Node:
    def __init__(self):
        self.parent = None
        self.children = []

    def add_child(self, child):
        child.parent = self  # Circular reference
        self.children.append(child)

# FIX: Use weakref for back-references
import weakref
class Node:
    def __init__(self):
        self._parent = None
        self.children = []

    @property
    def parent(self):
        return self._parent() if self._parent else None

    def add_child(self, child):
        child._parent = weakref.ref(self)
        self.children.append(child)
```

---

## Blocking Operations

### Async/Await Anti-Patterns

#### Sequential Instead of Parallel
```javascript
// SLOW: 3 seconds total (sequential)
const user = await getUser(id);      // 1s
const orders = await getOrders(id);  // 1s
const reviews = await getReviews(id); // 1s

// FAST: 1 second total (parallel)
const [user, orders, reviews] = await Promise.all([
  getUser(id),
  getOrders(id),
  getReviews(id)
]);
```

#### Sync Operations in Async Context
```javascript
// BLOCKS EVENT LOOP
app.get('/file', async (req, res) => {
  const data = fs.readFileSync('large-file.json');  // Blocks!
  res.json(JSON.parse(data));
});

// NON-BLOCKING
app.get('/file', async (req, res) => {
  const data = await fs.promises.readFile('large-file.json');
  res.json(JSON.parse(data));
});
```

#### CPU-Intensive in Main Thread
```javascript
// BLOCKS EVENT LOOP
app.get('/hash', async (req, res) => {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
  res.json({ hash });
});

// NON-BLOCKING
app.get('/hash', async (req, res) => {
  const hash = await new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
  res.json({ hash });
});

// BEST: Worker thread for CPU-intensive
const { Worker } = require('worker_threads');
```

### Python Async Issues

```python
# BLOCKS EVENT LOOP
async def handler():
    data = requests.get(url)  # Sync HTTP blocks!
    return data.json()

# NON-BLOCKING
import aiohttp
async def handler():
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.json()

# BLOCKING FILE I/O
async def read_file():
    with open('large.txt') as f:
        return f.read()  # Blocks!

# NON-BLOCKING
import aiofiles
async def read_file():
    async with aiofiles.open('large.txt') as f:
        return await f.read()
```

---

## Algorithm Complexity

### Inefficient Data Structures

```javascript
// O(n) lookup - BAD for frequent checks
const users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
function findUser(id) {
  return users.find(u => u.id === id);  // O(n)
}

// O(1) lookup - GOOD
const usersById = new Map(users.map(u => [u.id, u]));
function findUser(id) {
  return usersById.get(id);  // O(1)
}

// O(n) includes check - BAD
const ids = [1, 2, 3, 4, 5];
if (ids.includes(targetId)) { ... }  // O(n)

// O(1) has check - GOOD
const idSet = new Set([1, 2, 3, 4, 5]);
if (idSet.has(targetId)) { ... }  // O(1)
```

### Repeated Expensive Computations

```javascript
// INEFFICIENT: Recalculates every render
function Component({ items }) {
  const sorted = items.sort((a, b) => a.score - b.score);  // Mutates!
  const filtered = sorted.filter(item => item.active);
  return <List items={filtered} />;
}

// EFFICIENT: Memoize
function Component({ items }) {
  const processed = useMemo(() => {
    return [...items]
      .sort((a, b) => a.score - b.score)
      .filter(item => item.active);
  }, [items]);
  return <List items={processed} />;
}
```

---

## Network Performance

### Waterfall Requests
```javascript
// WATERFALL: Each waits for previous
const user = await fetch(`/api/user/${id}`).then(r => r.json());
const prefs = await fetch(`/api/prefs/${user.prefsId}`).then(r => r.json());
const theme = await fetch(`/api/theme/${prefs.themeId}`).then(r => r.json());

// BETTER: Batch endpoint or GraphQL
const data = await fetch('/api/user-with-prefs', {
  method: 'POST',
  body: JSON.stringify({ userId: id })
}).then(r => r.json());
```

### Missing Response Caching
```javascript
// NO CACHING: Fetches every time
async function getConfig() {
  return fetch('/api/config').then(r => r.json());
}

// WITH CACHING
let configCache = null;
let cacheTime = 0;
const CACHE_TTL = 60000;  // 1 minute

async function getConfig() {
  if (configCache && Date.now() - cacheTime < CACHE_TTL) {
    return configCache;
  }
  configCache = await fetch('/api/config').then(r => r.json());
  cacheTime = Date.now();
  return configCache;
}
```

### Large Payloads
```javascript
// BAD: Returns all fields
app.get('/api/users', async (req, res) => {
  const users = await User.findAll();  // All columns
  res.json(users);
});

// GOOD: Select only needed fields
app.get('/api/users', async (req, res) => {
  const users = await User.findAll({
    attributes: ['id', 'name', 'avatar']
  });
  res.json(users);
});

// GOOD: Pagination
app.get('/api/users', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const users = await User.findAll({
    attributes: ['id', 'name', 'avatar'],
    limit: Math.min(limit, 100),
    offset: (page - 1) * limit
  });
  res.json(users);
});
```
