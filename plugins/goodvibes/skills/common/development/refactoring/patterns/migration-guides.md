# Migration Guides

Detailed patterns for common codebase migrations.

## React Class to Hooks

### State Migration

```javascript
// CLASS
class Counter extends React.Component {
  state = { count: 0 };

  increment = () => {
    this.setState(prev => ({ count: prev.count + 1 }));
  };

  render() {
    return <button onClick={this.increment}>{this.state.count}</button>;
  }
}

// HOOKS
function Counter() {
  const [count, setCount] = useState(0);

  const increment = () => setCount(prev => prev + 1);

  return <button onClick={increment}>{count}</button>;
}
```

### Multiple State Values

```javascript
// CLASS
state = {
  name: '',
  email: '',
  age: 0,
};

// HOOKS - Option 1: Separate useState calls (preferred for unrelated values)
const [name, setName] = useState('');
const [email, setEmail] = useState('');
const [age, setAge] = useState(0);

// HOOKS - Option 2: Single useState with object (for related values)
const [form, setForm] = useState({ name: '', email: '', age: 0 });
const updateForm = (updates) => setForm(prev => ({ ...prev, ...updates }));
```

### Lifecycle Methods

```javascript
// CLASS: componentDidMount
componentDidMount() {
  this.fetchData();
}

// HOOKS: useEffect with empty deps
useEffect(() => {
  fetchData();
}, []);

// CLASS: componentDidUpdate
componentDidUpdate(prevProps) {
  if (prevProps.userId !== this.props.userId) {
    this.fetchUser();
  }
}

// HOOKS: useEffect with deps
useEffect(() => {
  fetchUser();
}, [userId]);

// CLASS: componentWillUnmount
componentWillUnmount() {
  this.subscription.unsubscribe();
}

// HOOKS: useEffect cleanup
useEffect(() => {
  const subscription = subscribe();
  return () => subscription.unsubscribe();
}, []);
```

### Class Methods

```javascript
// CLASS: Method with this binding
class Component extends React.Component {
  handleClick = (event) => {
    this.setState({ clicked: true });
    this.props.onClick(event);
  };

  expensiveCalculation() {
    return this.state.items.reduce((sum, item) => sum + item.value, 0);
  }
}

// HOOKS: Regular functions and useCallback
function Component({ onClick, items }) {
  const [clicked, setClicked] = useState(false);

  const handleClick = useCallback((event) => {
    setClicked(true);
    onClick(event);
  }, [onClick]);

  const total = useMemo(() =>
    items.reduce((sum, item) => sum + item.value, 0),
    [items]
  );
}
```

### Refs

```javascript
// CLASS
class TextInput extends React.Component {
  inputRef = React.createRef();

  focusInput = () => {
    this.inputRef.current.focus();
  };

  render() {
    return <input ref={this.inputRef} />;
  }
}

// HOOKS
function TextInput() {
  const inputRef = useRef(null);

  const focusInput = () => inputRef.current?.focus();

  return <input ref={inputRef} />;
}
```

---

## Callbacks to Async/Await

### Basic Conversion

```javascript
// CALLBACK
function getData(callback) {
  fetchData((err, data) => {
    if (err) return callback(err);
    processData(data, (err, result) => {
      if (err) return callback(err);
      callback(null, result);
    });
  });
}

// PROMISE (intermediate step)
function getData() {
  return new Promise((resolve, reject) => {
    fetchData((err, data) => {
      if (err) return reject(err);
      processData(data, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  });
}

// ASYNC/AWAIT
async function getData() {
  const data = await fetchDataAsync();
  const result = await processDataAsync(data);
  return result;
}
```

### Promisifying Callbacks

```javascript
// Built-in util.promisify (Node.js)
const { promisify } = require('util');
const readFile = promisify(fs.readFile);

// Manual promisify
function promisify(fn) {
  return (...args) => new Promise((resolve, reject) => {
    fn(...args, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// For methods (preserve this)
function promisifyMethod(obj, methodName) {
  const original = obj[methodName].bind(obj);
  return promisify(original);
}
```

### Error Handling

```javascript
// CALLBACK
function process(callback) {
  step1((err, result1) => {
    if (err) return callback(err);
    step2(result1, (err, result2) => {
      if (err) return callback(err);
      step3(result2, (err, result3) => {
        if (err) return callback(err);
        callback(null, result3);
      });
    });
  });
}

// ASYNC/AWAIT
async function process() {
  try {
    const result1 = await step1();
    const result2 = await step2(result1);
    const result3 = await step3(result2);
    return result3;
  } catch (error) {
    // Handle or rethrow
    throw new ProcessError('Processing failed', { cause: error });
  }
}
```

### Parallel Execution

```javascript
// CALLBACK (complex)
function fetchAll(callback) {
  let completed = 0;
  let results = [];
  let hasError = false;

  const checkComplete = () => {
    if (completed === 3 && !hasError) {
      callback(null, results);
    }
  };

  fetchA((err, result) => {
    if (err && !hasError) { hasError = true; callback(err); return; }
    results[0] = result;
    completed++;
    checkComplete();
  });
  // ... repeat for B, C
}

// ASYNC/AWAIT
async function fetchAll() {
  const [a, b, c] = await Promise.all([
    fetchA(),
    fetchB(),
    fetchC()
  ]);
  return { a, b, c };
}

// With error handling per item
async function fetchAllWithFallback() {
  const results = await Promise.allSettled([
    fetchA(),
    fetchB(),
    fetchC()
  ]);

  return results.map((result, i) =>
    result.status === 'fulfilled'
      ? result.value
      : { error: result.reason, source: ['A', 'B', 'C'][i] }
  );
}
```

---

## CommonJS to ES Modules

### Import Conversions

```javascript
// COMMONJS
const express = require('express');
const { Router } = require('express');
const path = require('path');
const myModule = require('./my-module');
const config = require('./config.json');

// ES MODULES
import express, { Router } from 'express';
import path from 'path';
import myModule from './my-module.js';  // Note: .js extension required
import config from './config.json' assert { type: 'json' };

// Dynamic imports
// CommonJS
const plugin = require(`./plugins/${name}`);

// ES Modules
const plugin = await import(`./plugins/${name}.js`);
```

### Export Conversions

```javascript
// COMMONJS
module.exports = myFunction;
module.exports.helper = helperFunction;
exports.util = utilFunction;

// ES MODULES
export default myFunction;
export { helperFunction as helper };
export { utilFunction as util };

// Or named exports only
export function myFunction() {}
export function helperFunction() {}
export function utilFunction() {}
```

### __dirname and __filename

```javascript
// COMMONJS
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, 'config.json');

// ES MODULES
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = join(__dirname, 'config.json');
```

### Package.json Changes

```json
{
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

---

## JavaScript to TypeScript

### Basic Type Annotations

```javascript
// JAVASCRIPT
function greet(name) {
  return `Hello, ${name}!`;
}

const user = {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com'
};

// TYPESCRIPT
function greet(name: string): string {
  return `Hello, ${name}!`;
}

interface User {
  id: number;
  name: string;
  email: string;
}

const user: User = {
  id: 1,
  name: 'Alice',
  email: 'alice@example.com'
};
```

### Progressive Migration

```typescript
// Step 1: Rename .js to .ts, use 'any' liberally
function processData(data: any): any {
  return data.map((item: any) => item.value);
}

// Step 2: Add basic types
function processData(data: Array<{ value: number }>): number[] {
  return data.map(item => item.value);
}

// Step 3: Create proper interfaces
interface DataItem {
  id: string;
  value: number;
  metadata?: Record<string, unknown>;
}

function processData(data: DataItem[]): number[] {
  return data.map(item => item.value);
}
```

### tsconfig.json for Migration

```json
{
  "compilerOptions": {
    "allowJs": true,           // Allow .js files
    "checkJs": false,          // Don't check .js files
    "strict": false,           // Start lenient
    "noImplicitAny": false,    // Allow implicit any initially
    "strictNullChecks": false  // Enable later
  },
  "include": ["src/**/*"]
}
```

### Gradual Strictness

```json
// Phase 1: Basic TypeScript
{
  "compilerOptions": {
    "strict": false
  }
}

// Phase 2: Enable null checks
{
  "compilerOptions": {
    "strict": false,
    "strictNullChecks": true
  }
}

// Phase 3: No implicit any
{
  "compilerOptions": {
    "strict": false,
    "strictNullChecks": true,
    "noImplicitAny": true
  }
}

// Phase 4: Full strict mode
{
  "compilerOptions": {
    "strict": true
  }
}
```

---

## REST to GraphQL

### Query Migration

```javascript
// REST: Multiple endpoints
const user = await fetch('/api/users/1').then(r => r.json());
const orders = await fetch('/api/users/1/orders').then(r => r.json());
const reviews = await fetch('/api/users/1/reviews').then(r => r.json());

// GRAPHQL: Single query
const { data } = await client.query({
  query: gql`
    query GetUserWithDetails($id: ID!) {
      user(id: $id) {
        id
        name
        email
        orders {
          id
          total
          status
        }
        reviews {
          id
          rating
          comment
        }
      }
    }
  `,
  variables: { id: '1' }
});
```

### Mutation Migration

```javascript
// REST
await fetch('/api/users', {
  method: 'POST',
  body: JSON.stringify({ name, email })
});

// GRAPHQL
await client.mutate({
  mutation: gql`
    mutation CreateUser($input: CreateUserInput!) {
      createUser(input: $input) {
        id
        name
        email
      }
    }
  `,
  variables: {
    input: { name, email }
  }
});
```
