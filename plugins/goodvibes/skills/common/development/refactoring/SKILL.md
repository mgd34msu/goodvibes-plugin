---
name: refactoring
description: Identifies code smells, applies design patterns, guides migrations, and performs security/performance/accessibility refactoring. Use when improving code quality, modernizing codebases, applying design patterns, migrating to TypeScript, or extracting microservices.
---

# Refactoring

Systematic code improvement through smell detection, design patterns, and migration patterns.

## Quick Start

**Identify code smells:**
```
Analyze this file for code smells and suggest refactoring improvements
```

**Apply design pattern:**
```
Refactor this code to use the Strategy pattern for the discount calculations
```

**Migrate to TypeScript:**
```
Help me migrate this JavaScript module to TypeScript
```

## Capabilities

### 1. Code Smell Identification

Detect common code smells with specific fixes.

#### Smell Catalog

| Smell | Symptoms | Fix |
|-------|----------|-----|
| **Long Method** | >20 lines, multiple abstractions | Extract Method |
| **Large Class** | >300 lines, multiple responsibilities | Extract Class |
| **Feature Envy** | Method uses other class's data extensively | Move Method |
| **Data Clump** | Same data appears together repeatedly | Extract Class |
| **Primitive Obsession** | Overuse of primitives instead of objects | Replace with Object |
| **Duplicated Code** | Same logic in multiple places | Extract Method/Class |
| **Long Parameter List** | >3-4 parameters | Introduce Parameter Object |
| **Switch Statements** | Complex switch on type | Replace with Polymorphism |

See [references/code-smells.md](references/code-smells.md) for complete catalog.

---

### 2. Design Pattern Application

Apply Gang of Four and modern patterns.

#### Strategy Pattern

Replace conditional logic with interchangeable algorithms:

```javascript
// BEFORE: Switch statement
function calculateDiscount(type, price) {
  switch (type) {
    case 'percentage':
      return price * 0.1;
    case 'fixed':
      return 10;
    case 'bogo':
      return price * 0.5;
    default:
      return 0;
  }
}

// AFTER: Strategy pattern
const discountStrategies = {
  percentage: (price) => price * 0.1,
  fixed: () => 10,
  bogo: (price) => price * 0.5,
};

function calculateDiscount(type, price) {
  const strategy = discountStrategies[type] || (() => 0);
  return strategy(price);
}
```

#### Observer Pattern

Decouple event producers from consumers:

```javascript
// BEFORE: Tightly coupled
class Order {
  complete() {
    this.status = 'completed';
    emailService.send(this.user, 'Order complete');
    analyticsService.track('order_complete', this);
    inventoryService.update(this.items);
  }
}

// AFTER: Observer pattern
class Order extends EventEmitter {
  complete() {
    this.status = 'completed';
    this.emit('completed', this);
  }
}

// Subscribers register independently
order.on('completed', (order) => emailService.send(order.user, 'Order complete'));
order.on('completed', (order) => analyticsService.track('order_complete', order));
order.on('completed', (order) => inventoryService.update(order.items));
```

#### Factory Pattern

Centralize object creation:

```javascript
// BEFORE: Scattered creation logic
function processPayment(method, amount) {
  let processor;
  if (method === 'stripe') {
    processor = new StripeProcessor(config.stripeKey);
  } else if (method === 'paypal') {
    processor = new PayPalProcessor(config.paypalId);
  }
  return processor.charge(amount);
}

// AFTER: Factory pattern
class PaymentProcessorFactory {
  static create(method) {
    const processors = {
      stripe: () => new StripeProcessor(config.stripeKey),
      paypal: () => new PayPalProcessor(config.paypalId),
      square: () => new SquareProcessor(config.squareToken),
    };

    const factory = processors[method];
    if (!factory) throw new Error(`Unknown payment method: ${method}`);
    return factory();
  }
}

function processPayment(method, amount) {
  const processor = PaymentProcessorFactory.create(method);
  return processor.charge(amount);
}
```

See [references/design-patterns.md](references/design-patterns.md) for all patterns.

---

### 3. Migration Patterns

#### Class Components to Hooks (React)

```javascript
// BEFORE: Class component
class UserProfile extends React.Component {
  state = { user: null, loading: true };

  componentDidMount() {
    this.fetchUser();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.userId !== this.props.userId) {
      this.fetchUser();
    }
  }

  async fetchUser() {
    this.setState({ loading: true });
    const user = await api.getUser(this.props.userId);
    this.setState({ user, loading: false });
  }

  render() {
    const { user, loading } = this.state;
    if (loading) return <Spinner />;
    return <Profile user={user} />;
  }
}

// AFTER: Hooks with custom hook extraction
function useUser(userId) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getUser(userId)
      .then(setUser)
      .finally(() => setLoading(false));
  }, [userId]);

  return { user, loading };
}

function UserProfile({ userId }) {
  const { user, loading } = useUser(userId);
  if (loading) return <Spinner />;
  return <Profile user={user} />;
}
```

#### Callbacks to Async/Await

```javascript
// BEFORE: Callback hell
function processFile(filename, callback) {
  fs.readFile(filename, 'utf8', (err, content) => {
    if (err) return callback(err);
    parseData(content, (err, data) => {
      if (err) return callback(err);
      transformData(data, (err, transformed) => {
        if (err) return callback(err);
        saveData(transformed, callback);
      });
    });
  });
}

// AFTER: Async/await
async function processFile(filename) {
  const content = await fs.promises.readFile(filename, 'utf8');
  const data = await parseDataAsync(content);
  const transformed = await transformDataAsync(data);
  return await saveDataAsync(transformed);
}
```

#### CommonJS to ES Modules

```javascript
// BEFORE: CommonJS
const express = require('express');
const { Router } = require('express');
const utils = require('./utils');

module.exports = { router, handler };

// AFTER: ES Modules
import express, { Router } from 'express';
import * as utils from './utils.js';

export { router, handler };
```

---

### 4. JavaScript to TypeScript Migration

#### Step-by-Step Process

```
1. Install TypeScript and configure
2. Rename files .js -> .ts
3. Add type annotations progressively
4. Fix type errors
5. Enable stricter options gradually
```

#### tsconfig.json for Migration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": false,
    "allowJs": true,
    "checkJs": false,
    "noImplicitAny": false,
    "strictNullChecks": false,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

#### Progressive Type Addition

```typescript
// Phase 1: Basic types
function greet(name) { // Keep as any initially
  return `Hello, ${name}`;
}

// Phase 2: Add parameter types
function greet(name: string) {
  return `Hello, ${name}`;
}

// Phase 3: Add return types
function greet(name: string): string {
  return `Hello, ${name}`;
}

// Phase 4: Handle edge cases
function greet(name: string | null): string {
  return `Hello, ${name ?? 'Guest'}`;
}
```

See [references/typescript-migration.md](references/typescript-migration.md) for complete guide.

---

### 5. Performance Refactoring

#### Memoization

```javascript
// BEFORE: Recalculates every render
function ExpensiveComponent({ data }) {
  const processed = expensiveCalculation(data);
  return <div>{processed}</div>;
}

// AFTER: Memoized
function ExpensiveComponent({ data }) {
  const processed = useMemo(
    () => expensiveCalculation(data),
    [data]
  );
  return <div>{processed}</div>;
}
```

#### Lazy Loading

```javascript
// BEFORE: Eager loading
import HeavyComponent from './HeavyComponent';

function App() {
  return <HeavyComponent />;
}

// AFTER: Lazy loading
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <HeavyComponent />
    </Suspense>
  );
}
```

#### Database Query Optimization

```javascript
// BEFORE: N+1 query
const users = await User.findAll();
for (const user of users) {
  user.orders = await Order.findAll({ where: { userId: user.id } });
}

// AFTER: Eager loading
const users = await User.findAll({
  include: [{ model: Order }]
});
```

---

### 6. Security Hardening

#### Input Validation

```javascript
// BEFORE: No validation
app.post('/user', (req, res) => {
  db.query(`INSERT INTO users (name) VALUES ('${req.body.name}')`);
});

// AFTER: Validated and parameterized
import { z } from 'zod';

const userSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

app.post('/user', (req, res) => {
  const { name, email } = userSchema.parse(req.body);
  db.query('INSERT INTO users (name, email) VALUES (?, ?)', [name, email]);
});
```

#### Output Encoding

```javascript
// BEFORE: XSS vulnerable
element.innerHTML = userContent;

// AFTER: Encoded
element.textContent = userContent;
// Or use DOMPurify for HTML
element.innerHTML = DOMPurify.sanitize(userContent);
```

---

### 7. Accessibility Improvements

#### Semantic HTML

```html
<!-- BEFORE: Non-semantic -->
<div class="button" onclick="submit()">Submit</div>

<!-- AFTER: Semantic -->
<button type="submit">Submit</button>
```

#### ARIA Attributes

```html
<!-- BEFORE: No accessibility -->
<div class="modal">
  <div class="content">Modal content</div>
</div>

<!-- AFTER: Accessible -->
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Modal Title</h2>
  <div class="content">Modal content</div>
</div>
```

#### Focus Management

```javascript
// BEFORE: No focus management
function openModal() {
  modal.classList.add('open');
}

// AFTER: Manages focus
function openModal() {
  previouslyFocused = document.activeElement;
  modal.classList.add('open');
  modal.querySelector('[autofocus]')?.focus();
}

function closeModal() {
  modal.classList.remove('open');
  previouslyFocused?.focus();
}
```

---

### 8. Internationalization (i18n) Preparation

#### String Externalization

```javascript
// BEFORE: Hardcoded strings
function Welcome({ name }) {
  return <h1>Welcome, {name}!</h1>;
}

// AFTER: Externalized
function Welcome({ name }) {
  const { t } = useTranslation();
  return <h1>{t('welcome', { name })}</h1>;
}

// translations/en.json
{
  "welcome": "Welcome, {{name}}!"
}

// translations/es.json
{
  "welcome": "Bienvenido, {{name}}!"
}
```

#### Date/Number Formatting

```javascript
// BEFORE: Locale-unaware
const formatted = `$${price.toFixed(2)}`;
const date = new Date().toLocaleDateString();

// AFTER: Locale-aware
const formatted = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: 'USD'
}).format(price);

const date = new Intl.DateTimeFormat(locale, {
  dateStyle: 'long'
}).format(new Date());
```

---

### 9. Monolith to Microservices Extraction

#### Identify Bounded Contexts

```
1. Map domain concepts and relationships
2. Identify natural boundaries (user, order, payment)
3. Check for shared data access patterns
4. Look for independent scaling needs
```

#### Strangler Fig Pattern

```
1. Create new microservice
2. Route new functionality to microservice
3. Gradually migrate existing functionality
4. Eventually remove old code from monolith
```

#### API Gateway Setup

```javascript
// Gateway routing
const routes = {
  '/users/*': 'http://user-service:3001',
  '/orders/*': 'http://order-service:3002',
  '/payments/*': 'http://payment-service:3003',
};

app.all('*', (req, res) => {
  const service = findService(req.path);
  proxy.web(req, res, { target: service });
});
```

---

### 10. Micro-Frontend Extraction

#### Module Federation Setup

```javascript
// webpack.config.js (shell app)
module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: 'shell',
      remotes: {
        userApp: 'userApp@http://localhost:3001/remoteEntry.js',
        orderApp: 'orderApp@http://localhost:3002/remoteEntry.js',
      },
    }),
  ],
};

// webpack.config.js (user micro-frontend)
module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: 'userApp',
      filename: 'remoteEntry.js',
      exposes: {
        './UserProfile': './src/components/UserProfile',
      },
    }),
  ],
};
```

---

## Refactoring Workflow

### Safe Refactoring Process

```
1. IDENTIFY
   - Run static analysis
   - Review code metrics
   - Collect team feedback

2. TEST
   - Ensure tests exist for affected code
   - Add tests if coverage is low
   - Run full test suite

3. REFACTOR
   - Make small, incremental changes
   - Commit frequently
   - Keep tests passing

4. VERIFY
   - Run tests after each change
   - Review for regressions
   - Check performance if relevant

5. DOCUMENT
   - Update comments/docs if needed
   - Note breaking changes
   - Update changelog
```

### Refactoring Checklist

```markdown
## Pre-flight
- [ ] Tests exist and pass
- [ ] Code coverage >= 80% for affected area
- [ ] Feature branch created

## During Refactoring
- [ ] Making atomic commits
- [ ] Tests passing after each change
- [ ] No functionality changes

## Post-flight
- [ ] All tests pass
- [ ] Manual smoke test completed
- [ ] Code review requested
```

---

## Hook Integration

### PreToolUse Hook - Refactoring Safety Checks

Before applying refactorings, verify safety:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit",
      "command": "check-refactoring-safety.sh"
    }]
  }
}
```

**Script example:**
```bash
#!/bin/bash
# check-refactoring-safety.sh

FILE="$1"

# Check if tests exist
TEST_FILE=$(echo "$FILE" | sed 's/src/tests/' | sed 's/\.ts$/.test.ts/')
if [ ! -f "$TEST_FILE" ]; then
  echo "WARNING: No test file found for $FILE"
  echo "Consider adding tests before refactoring"
fi

# Check test coverage
coverage=$(npm test -- --coverage --collectCoverageFrom="$FILE" 2>/dev/null | grep -oP '\d+(?=%)')
if [ "$coverage" -lt 70 ]; then
  echo "WARNING: Low test coverage ($coverage%) for $FILE"
  echo "Consider adding tests before refactoring"
fi

# Check for uncommitted changes
if ! git diff --quiet "$FILE"; then
  echo "WARNING: Uncommitted changes in $FILE"
  echo "Commit changes before refactoring"
fi
```

**Hook response pattern:**
```typescript
interface RefactoringSafetyCheck {
  safe: boolean;
  warnings: Array<{
    type: 'no_tests' | 'low_coverage' | 'uncommitted_changes';
    message: string;
    file: string;
  }>;
  suggestions: string[];
}
```

### PostToolUse Hook - Verify Refactoring

After refactoring, run verification:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Edit",
      "command": "verify-refactoring.sh"
    }]
  }
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Refactoring Verification
on: [pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Check for behavior changes
        run: |
          npm test -- --coverage
          # Compare coverage before/after
          git diff origin/main --stat

      - name: Type check
        run: npx tsc --noEmit

      - name: Lint
        run: npm run lint

      - name: Complexity check
        run: |
          npx escomplex src/ --format json > after.json
          git checkout origin/main
          npx escomplex src/ --format json > before.json
          # Compare complexity metrics
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Ensure tests pass before committing refactoring
npm test -- --passWithNoTests || {
  echo "Tests failed - commit aborted"
  exit 1
}

# Check for console.log/debugger
if git diff --cached | grep -E "(console\.(log|debug)|debugger)"; then
  echo "Remove debug statements before committing"
  exit 1
fi
```

## Reference Files

- [references/code-smells.md](references/code-smells.md) - Complete code smell catalog
- [references/design-patterns.md](references/design-patterns.md) - GoF patterns with modern examples
- [references/typescript-migration.md](references/typescript-migration.md) - JS to TS migration guide
- [patterns/migration-guides.md](patterns/migration-guides.md) - Detailed migration patterns
