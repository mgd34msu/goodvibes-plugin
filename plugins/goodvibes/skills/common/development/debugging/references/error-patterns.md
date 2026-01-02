# Error Patterns Reference

Comprehensive reference of common errors by language and framework.

## JavaScript / Node.js

### TypeError

```javascript
// Cannot read properties of undefined (reading 'x')
// Cause: Accessing property on undefined
const user = undefined;
console.log(user.name);  // Error!

// Fixes:
// 1. Optional chaining
console.log(user?.name);

// 2. Nullish coalescing
console.log(user?.name ?? 'Unknown');

// 3. Guard clause
if (!user) return;
console.log(user.name);
```

```javascript
// Cannot read properties of null (reading 'x')
// Cause: Explicitly null value
const data = JSON.parse('null');
console.log(data.field);  // Error!

// Fix: Same as undefined handling
```

```javascript
// x is not a function
// Cause: Calling non-function value

// Common scenarios:
// 1. Wrong import
import { something } from './module';  // something is not exported
something();  // Error!

// 2. Typo in method name
arr.mapp(x => x);  // Error! (should be map)

// 3. Callback not passed
function process(cb) {
  cb();  // Error if cb is undefined!
}
process();
```

```javascript
// x is not defined
// Cause: Using undeclared variable

// Common scenarios:
// 1. Missing import
import React from 'react';
// Missing: import { useState } from 'react';
const [x, setX] = useState(0);  // Error!

// 2. Typo
const usrName = 'Alice';
console.log(userName);  // Error! (typo)

// 3. Scope issue
if (true) {
  const inner = 'value';
}
console.log(inner);  // Error! (out of scope)
```

### ReferenceError

```javascript
// x is not defined
// Cause: Accessing variable before declaration

console.log(myVar);  // Error!
const myVar = 'value';

// Fix: Ensure declaration before use
const myVar = 'value';
console.log(myVar);
```

### SyntaxError

```javascript
// Unexpected token
// Cause: Invalid JavaScript syntax

// Common scenarios:
// 1. Missing comma in object
const obj = {
  a: 1
  b: 2  // Error! Missing comma
};

// 2. Invalid JSON
JSON.parse("{ key: 'value' }");  // Error! Keys must be quoted

// 3. Using reserved word
const class = 'foo';  // Error!
```

### RangeError

```javascript
// Maximum call stack size exceeded
// Cause: Infinite recursion

function countdown(n) {
  console.log(n);
  countdown(n - 1);  // No base case!
}

// Fix: Add base case
function countdown(n) {
  if (n <= 0) return;
  console.log(n);
  countdown(n - 1);
}
```

### Node.js Specific

```javascript
// Error: listen EADDRINUSE: address already in use :::3000
// Cause: Port already bound

// Find process using port:
// lsof -i :3000
// kill -9 <PID>

// Or use different port:
const PORT = process.env.PORT || 3001;
```

```javascript
// Error: ENOENT: no such file or directory
// Cause: File doesn't exist

// Fix: Check file existence or handle error
import { existsSync } from 'fs';

if (existsSync(filePath)) {
  // read file
} else {
  // handle missing file
}
```

```javascript
// Error: EACCES: permission denied
// Cause: No permission to access file/port

// Common fixes:
// 1. Fix file permissions: chmod 644 file
// 2. Don't use ports < 1024 without sudo
// 3. Check file ownership: chown user:group file
```

---

## Python

### AttributeError

```python
# 'NoneType' object has no attribute 'x'
# Cause: Calling method on None

user = get_user(999)  # Returns None
print(user.name)  # Error!

# Fix: Check for None
if user:
    print(user.name)

# Or use getattr with default
name = getattr(user, 'name', 'Unknown')
```

### KeyError

```python
# KeyError: 'key'
# Cause: Dictionary key doesn't exist

data = {'a': 1}
value = data['b']  # Error!

# Fixes:
# 1. Use .get() with default
value = data.get('b', default_value)

# 2. Check first
if 'b' in data:
    value = data['b']

# 3. Use defaultdict
from collections import defaultdict
data = defaultdict(int)
```

### IndexError

```python
# IndexError: list index out of range
# Cause: Accessing invalid index

items = [1, 2, 3]
print(items[5])  # Error!

# Fixes:
# 1. Check length
if len(items) > 5:
    print(items[5])

# 2. Use try/except
try:
    print(items[5])
except IndexError:
    print("Index not found")

# 3. Use slice (returns empty, no error)
print(items[5:6])  # []
```

### ImportError / ModuleNotFoundError

```python
# ModuleNotFoundError: No module named 'x'
# Cause: Module not installed or wrong name

# Fixes:
# 1. Install missing module
# pip install module_name

# 2. Check virtual environment is active
# source venv/bin/activate

# 3. Check PYTHONPATH
# export PYTHONPATH=/path/to/modules
```

### ValueError

```python
# ValueError: invalid literal for int() with base 10: 'abc'
# Cause: Cannot convert string to int

value = int("abc")  # Error!

# Fix: Validate before converting
def safe_int(s, default=0):
    try:
        return int(s)
    except ValueError:
        return default
```

### TypeError

```python
# TypeError: unsupported operand type(s) for +: 'int' and 'str'
# Cause: Invalid type operation

result = 5 + "10"  # Error!

# Fix: Ensure consistent types
result = 5 + int("10")
# or
result = str(5) + "10"
```

---

## Go

### Nil Pointer Dereference

```go
// panic: runtime error: invalid memory address or nil pointer dereference
// Cause: Using nil pointer

var user *User
fmt.Println(user.Name)  // panic!

// Fixes:
// 1. Check for nil
if user != nil {
    fmt.Println(user.Name)
}

// 2. Return early
func process(user *User) error {
    if user == nil {
        return errors.New("user is nil")
    }
    // proceed
}
```

### Index Out of Range

```go
// panic: runtime error: index out of range [5] with length 3
// Cause: Invalid slice/array index

items := []int{1, 2, 3}
fmt.Println(items[5])  // panic!

// Fix: Check bounds
if len(items) > 5 {
    fmt.Println(items[5])
}
```

### Concurrent Map Access

```go
// fatal error: concurrent map read and map write
// Cause: Unsynchronized map access

// Fix: Use sync.RWMutex or sync.Map
var mu sync.RWMutex
var data = make(map[string]int)

func get(key string) int {
    mu.RLock()
    defer mu.RUnlock()
    return data[key]
}

func set(key string, value int) {
    mu.Lock()
    defer mu.Unlock()
    data[key] = value
}
```

---

## React

### Invalid Hook Call

```javascript
// Error: Invalid hook call. Hooks can only be called inside the body of a function component.

// Common causes:
// 1. Hook in regular function (not component)
function helper() {
    const [x, setX] = useState(0);  // Error!
}

// 2. Hook in conditional
function Component() {
    if (condition) {
        const [x, setX] = useState(0);  // Error!
    }
}

// 3. Hook in loop
function Component() {
    for (const item of items) {
        const [x, setX] = useState(0);  // Error!
    }
}

// Fix: Hooks must be called at top level of component
function Component() {
    const [x, setX] = useState(0);  // Correct!
    // use x in conditionals/loops
}
```

### Cannot Update During Render

```javascript
// Error: Cannot update a component while rendering a different component

// Cause: Setting state during render
function Parent() {
    const [count, setCount] = useState(0);
    return <Child setCount={setCount} />;
}

function Child({ setCount }) {
    setCount(1);  // Error! Setting during render
    return <div>Child</div>;
}

// Fix: Use useEffect
function Child({ setCount }) {
    useEffect(() => {
        setCount(1);
    }, []);
    return <div>Child</div>;
}
```

### Missing Key Prop

```javascript
// Warning: Each child in a list should have a unique "key" prop.

// Cause: List items without keys
{items.map(item => <Item item={item} />)}  // Warning!

// Fix: Add unique key
{items.map(item => <Item key={item.id} item={item} />)}

// Avoid using index as key (causes issues with reordering)
{items.map((item, index) => <Item key={index} item={item} />)}  // Not recommended
```

---

## Database

### PostgreSQL

```sql
-- ERROR: relation "table_name" does not exist
-- Cause: Table doesn't exist or wrong schema

-- Fixes:
-- 1. Check table exists
\dt table_name

-- 2. Check schema
SET search_path TO schema_name;
-- or
SELECT * FROM schema_name.table_name;

-- 3. Run migrations
```

```sql
-- ERROR: duplicate key value violates unique constraint
-- Cause: Inserting duplicate value in unique column

-- Fixes:
-- 1. Use ON CONFLICT
INSERT INTO users (email) VALUES ('test@example.com')
ON CONFLICT (email) DO NOTHING;

-- 2. Use ON CONFLICT DO UPDATE (upsert)
INSERT INTO users (email, name) VALUES ('test@example.com', 'New Name')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;
```

### MySQL

```sql
-- ERROR 1045 (28000): Access denied for user
-- Cause: Wrong credentials or insufficient privileges

-- Fix: Grant permissions
GRANT ALL PRIVILEGES ON database.* TO 'user'@'localhost';
FLUSH PRIVILEGES;
```

```sql
-- ERROR 1062: Duplicate entry 'x' for key 'PRIMARY'
-- Cause: Duplicate primary key

-- Fixes:
-- 1. Use INSERT IGNORE
INSERT IGNORE INTO table (id, data) VALUES (1, 'value');

-- 2. Use ON DUPLICATE KEY UPDATE
INSERT INTO table (id, data) VALUES (1, 'value')
ON DUPLICATE KEY UPDATE data = VALUES(data);
```

### MongoDB

```javascript
// MongoError: E11000 duplicate key error collection
// Cause: Duplicate value in unique index

// Fixes:
// 1. Use upsert
db.collection.updateOne(
  { email: "test@example.com" },
  { $set: { name: "Test" } },
  { upsert: true }
);

// 2. Handle error
try {
  await collection.insertOne(doc);
} catch (error) {
  if (error.code === 11000) {
    // Handle duplicate
  }
}
```

---

## Network

### Connection Errors

| Error | Meaning | Common Fix |
|-------|---------|------------|
| `ECONNREFUSED` | Connection refused | Check if service is running |
| `ECONNRESET` | Connection reset by peer | Retry with backoff |
| `ETIMEDOUT` | Connection timed out | Increase timeout, check network |
| `ENOTFOUND` | DNS lookup failed | Check hostname |
| `EHOSTUNREACH` | Host unreachable | Check network connectivity |

### HTTP Errors

| Status | Meaning | Common Fix |
|--------|---------|------------|
| `400 Bad Request` | Invalid request | Validate request data |
| `401 Unauthorized` | Auth required | Add/fix authentication |
| `403 Forbidden` | Access denied | Check permissions |
| `404 Not Found` | Resource missing | Verify URL |
| `405 Method Not Allowed` | Wrong HTTP method | Use correct method |
| `408 Request Timeout` | Request took too long | Optimize or increase timeout |
| `429 Too Many Requests` | Rate limited | Add backoff/retry |
| `500 Internal Server Error` | Server bug | Check server logs |
| `502 Bad Gateway` | Upstream error | Check upstream service |
| `503 Service Unavailable` | Server overloaded | Retry with backoff |
| `504 Gateway Timeout` | Upstream timeout | Increase timeout |

---

## Docker

```bash
# Error: Cannot connect to the Docker daemon
# Cause: Docker not running or permission issue

# Fixes:
sudo systemctl start docker
sudo usermod -aG docker $USER  # Then log out/in
```

```bash
# Error: port is already allocated
# Cause: Port conflict

# Fixes:
docker ps  # Find container using port
docker stop <container>
# Or use different port:
docker run -p 3001:3000 image
```

```bash
# Error: no space left on device
# Cause: Docker using too much disk

# Fixes:
docker system prune -a  # Remove unused images/containers
docker volume prune     # Remove unused volumes
```
