---
name: code-smell-detector
description: Detects code smells, anti-patterns, and common bugs with quantified thresholds and severity scoring. Use when reviewing code quality, finding maintainability issues, detecting SOLID violations, or identifying technical debt.
---

# Code Smell Detector

Systematic detection of code smells, anti-patterns, and maintainability issues with quantified thresholds for scoring.

## Quick Start

**Full smell analysis:**
```
Analyze this codebase for code smells with severity scoring and file:line references.
```

**Specific category:**
```
Check for SOLID principle violations in the services directory.
```

## Severity Classification

| Severity | Multiplier | Impact | Action |
|----------|------------|--------|--------|
| **Bloater** | 1.5x | High cognitive load, hard to modify | Refactor soon |
| **Object-Orientation Abuser** | 1.25x | Poor extensibility, rigid design | Refactor next sprint |
| **Change Preventer** | 1.5x | Ripple effects, fear of change | Prioritize refactoring |
| **Dispensable** | 1.0x | Clutter, confusion | Clean up opportunistically |
| **Coupler** | 1.25x | Tight coupling, hard to test | Decouple incrementally |

---

## Bloaters

Code that has grown excessively large and hard to work with.

### Long Method / Function

**Threshold:** >50 lines (warning), >100 lines (violation)
**Deduction:** 0.5 points base per 10 functions over threshold

**Detection Commands:**
```bash
# Find long functions (approximate)
# TypeScript/JavaScript
grep -n "function\|=>\|async" src/**/*.ts | wc -l

# Get function lengths using AST tools
npx escomplex src/ --format json 2>/dev/null | jq '.reports[].functions[] | select(.sloc.logical > 50)'

# Python
radon cc src/ -j 2>/dev/null | jq '.[] | .[] | select(.loc > 50)'
```

**Manual Detection:**
```bash
# Count lines between function start and end
awk '/function.*\{/{start=NR} /^\s*\}/{if(NR-start>50) print FILENAME":"start":"NR-start}' src/**/*.ts
```

**Evidence Template:**
```
Location: {file}:{startLine}-{endLine}
Function: {name}()
Lines: {count} (threshold: 50)
Deduction: 0.05 * ceil(({count} - 50) / 10) points
```

---

### Large Class / Module

**Threshold:** >300 lines (warning), >500 lines (violation)
**Deduction:** 1.0 point base per class over threshold

**Detection Commands:**
```bash
# Files over 300 lines
find src -name "*.ts" -exec wc -l {} \; | awk '$1 > 300 {print}'

# Count classes per file
grep -c "^class\|^export class" src/**/*.ts
```

**Evidence Template:**
```
Location: {file}
Lines: {count} (threshold: 300)
Classes: {classCount}
Deduction: 1.0 point
```

---

### Primitive Obsession

**Threshold:** >5 primitive parameters in function
**Deduction:** 0.5 points per occurrence

**Detection Patterns:**
```typescript
// SMELL: Too many primitives
function createUser(
  name: string,
  email: string,
  phone: string,
  street: string,
  city: string,
  zip: string,
  country: string
) { ... }

// BETTER: Use objects
interface Address {
  street: string;
  city: string;
  zip: string;
  country: string;
}

function createUser(
  name: string,
  email: string,
  phone: string,
  address: Address
) { ... }
```

**Detection Commands:**
```bash
# Find functions with many parameters
grep -rn "function.*,.*,.*,.*,.*," src/
grep -rn "=>.*,.*,.*,.*,.*," src/
```

---

### Long Parameter List

**Threshold:** >4 parameters
**Deduction:** 0.25 points per function

**Detection Commands:**
```bash
# Functions with 5+ parameters
grep -rEn "function\s+\w+\s*\([^)]*,[^)]*,[^)]*,[^)]*,[^)]*\)" src/
```

**Fix Pattern:**
```typescript
// BEFORE: 6 parameters
function createOrder(userId, productId, quantity, address, paymentMethod, coupon) {}

// AFTER: Parameter object
interface CreateOrderParams {
  userId: string;
  productId: string;
  quantity: number;
  address: Address;
  paymentMethod: PaymentMethod;
  coupon?: string;
}

function createOrder(params: CreateOrderParams) {}
```

---

### Data Clumps

**Threshold:** Same 3+ fields appearing together in 3+ places
**Deduction:** 0.5 points per clump

**Example:**
```typescript
// SMELL: Same fields everywhere
function validateAddress(street, city, zip) {}
function formatAddress(street, city, zip) {}
function saveAddress(userId, street, city, zip) {}

// BETTER: Extract class
class Address {
  constructor(public street: string, public city: string, public zip: string) {}
  validate() {}
  format() {}
}
```

---

## Object-Orientation Abusers

Incorrect application of OOP principles.

### Switch Statements on Type

**Threshold:** Switch/if-else chain on type in multiple places
**Deduction:** 0.75 points per violation

**Detection Commands:**
```bash
# Type-based switches
grep -rn "switch.*type\|switch.*kind" src/
grep -rn "if.*instanceof.*else.*instanceof" src/
grep -rn "\.type\s*===\s*['\"]" src/
```

**SMELL Pattern:**
```typescript
// SMELL: Type switching
function calculateArea(shape) {
  switch (shape.type) {
    case 'circle': return Math.PI * shape.radius ** 2;
    case 'rectangle': return shape.width * shape.height;
    case 'triangle': return 0.5 * shape.base * shape.height;
  }
}

function draw(shape) {
  switch (shape.type) {  // Same switch again!
    case 'circle': drawCircle(shape);
    case 'rectangle': drawRectangle(shape);
    case 'triangle': drawTriangle(shape);
  }
}
```

**FIX Pattern:**
```typescript
// BETTER: Polymorphism
interface Shape {
  calculateArea(): number;
  draw(): void;
}

class Circle implements Shape {
  constructor(private radius: number) {}
  calculateArea() { return Math.PI * this.radius ** 2; }
  draw() { /* circle drawing */ }
}
```

---

### Refused Bequest

**Threshold:** Subclass doesn't use inherited methods/properties
**Deduction:** 0.5 points per occurrence

**Detection Signs:**
- Override methods that throw "Not Implemented"
- Empty implementations of parent methods
- Subclass only uses 1-2 of many inherited methods

**SMELL Pattern:**
```typescript
class Bird {
  fly() { /* flying logic */ }
  sing() { /* singing logic */ }
  eat() { /* eating logic */ }
}

class Penguin extends Bird {
  fly() {
    throw new Error("Penguins can't fly");  // SMELL!
  }
}
```

---

### Temporary Field

**Threshold:** Fields only used in some methods
**Deduction:** 0.25 points per field

**SMELL Pattern:**
```typescript
class Order {
  private tempTotal: number;      // Only used in calculateTotal
  private tempDiscount: number;   // Only used in calculateTotal

  calculateTotal() {
    this.tempTotal = this.items.reduce((sum, i) => sum + i.price, 0);
    this.tempDiscount = this.coupon ? this.tempTotal * 0.1 : 0;
    return this.tempTotal - this.tempDiscount;
  }
}
```

**FIX:**
```typescript
class Order {
  calculateTotal() {
    const total = this.items.reduce((sum, i) => sum + i.price, 0);
    const discount = this.coupon ? total * 0.1 : 0;
    return total - discount;  // Local variables, not fields
  }
}
```

---

## Change Preventers

Code that makes changes difficult and risky.

### Divergent Change

**Threshold:** Class changes for multiple unrelated reasons
**Deduction:** 1.0 point per class

**Detection Signs:**
- Class has methods for different domains (UI + DB + business logic)
- Multiple developers edit same class for unrelated features
- Class name is generic ("Manager", "Handler", "Processor")

**SMELL Pattern:**
```typescript
class UserManager {
  // Database concerns
  saveToDatabase(user) {}
  loadFromDatabase(id) {}

  // Email concerns
  sendWelcomeEmail(user) {}
  sendPasswordReset(user) {}

  // Validation concerns
  validateEmail(email) {}
  validatePassword(password) {}

  // Formatting concerns
  formatForDisplay(user) {}
  formatForExport(user) {}
}
```

---

### Shotgun Surgery

**Threshold:** One change requires edits to 5+ files
**Deduction:** 1.0 point per pattern

**Detection Signs:**
- Adding a new field requires changes in many files
- Same concept scattered across codebase
- Feature flags checked in 10+ places

**Detection Commands:**
```bash
# Find scattered concepts
grep -rln "userRole\|user\.role\|role.*user" src/ | wc -l
grep -rln "isAdmin\|is_admin\|admin.*true" src/ | wc -l
```

---

### Parallel Inheritance Hierarchies

**Threshold:** Adding a subclass requires adding another subclass elsewhere
**Deduction:** 0.75 points

**SMELL Pattern:**
```
Shape -> Circle, Rectangle, Triangle
ShapeRenderer -> CircleRenderer, RectangleRenderer, TriangleRenderer
ShapeSerializer -> CircleSerializer, RectangleSerializer, TriangleSerializer
```

Every new shape requires three new classes!

---

## Dispensables

Code that adds no value.

### Dead Code

**Threshold:** Any unreachable or unused code
**Deduction:** 0.25 points per 100 lines of dead code

**Detection Commands:**
```bash
# Unused exports (TypeScript)
npx ts-prune 2>/dev/null

# Unused dependencies
npx depcheck 2>/dev/null

# Unused files
npx unimported 2>/dev/null

# Python
vulture src/ 2>/dev/null
```

---

### Speculative Generality

**Threshold:** Unused abstractions "for future use"
**Deduction:** 0.5 points per occurrence

**Detection Signs:**
- Interfaces with single implementation
- Abstract methods never overridden differently
- Parameters/hooks never used
- "TODO: implement when needed" comments

**SMELL Pattern:**
```typescript
// YAGNI violation
interface DataStore {
  save(data: any): void;
  load(id: string): any;
  delete(id: string): void;
  query(filter: any): any[];  // Never used
  backup(): void;              // Never used
  restore(backup: any): void;  // Never used
}

class PostgresStore implements DataStore {
  query(filter: any) { throw new Error("Not implemented"); }
  backup() { throw new Error("Not implemented"); }
  restore() { throw new Error("Not implemented"); }
}
```

---

### Duplicate Code

**Threshold:** >10 similar lines in 2+ places
**Deduction:** 0.5 points per duplication

**Detection Commands:**
```bash
# JavaScript/TypeScript duplicate detection
npx jscpd src/ --min-lines 10 --min-tokens 50

# Generic duplicate finder
npx copy-paste-detector src/
```

**Detection Patterns:**
```bash
# Find similar function names
grep -rn "function validate\|const validate" src/ | sort

# Find repeated patterns
grep -rn "try {" src/ | head -20
```

---

### Comments (Unnecessary)

**Threshold:** Comments that explain "what" instead of "why"
**Deduction:** 0.1 points per 10 bad comments

**SMELL Patterns:**
```typescript
// UNNECESSARY: Explains what (obvious from code)
// Increment counter by 1
counter++;

// Add user to list
users.push(user);

// GOOD: Explains why (not obvious)
// Using += 1 instead of ++ for consistency with Python team's style
counter += 1;

// Storing raw user object for cache invalidation in afterSave hook
users.push(user);
```

---

## Couplers

Code with excessive coupling.

### Feature Envy

**Threshold:** Method uses more from other class than its own
**Deduction:** 0.5 points per method

**SMELL Pattern:**
```typescript
// SMELL: calculateTotal uses Order more than itself
class OrderPrinter {
  calculateTotal(order: Order) {
    let total = 0;
    for (const item of order.items) {
      total += item.price * item.quantity;
    }
    total -= order.discount;
    total *= (1 + order.taxRate);
    return total;
  }
}

// BETTER: Move to Order
class Order {
  calculateTotal() {
    let total = this.items.reduce((sum, item) =>
      sum + item.price * item.quantity, 0);
    return (total - this.discount) * (1 + this.taxRate);
  }
}
```

---

### Inappropriate Intimacy

**Threshold:** Classes access each other's private/internal data
**Deduction:** 0.75 points per occurrence

**Detection Commands:**
```bash
# Direct property access on other classes
grep -rn "\._\w\+\s*=" src/  # Accessing _private fields
grep -rn "\.#\w\+\s*=" src/   # Accessing #private fields
```

---

### Message Chains

**Threshold:** >3 chained method calls accessing data
**Deduction:** 0.25 points per occurrence

**SMELL Pattern:**
```typescript
// SMELL: Long chain
const city = order.customer.address.city.name;

// BETTER: Tell, don't ask
const city = order.getDeliveryCity();
```

**Detection Commands:**
```bash
# Find long chains
grep -rn "\.\w\+\.\w\+\.\w\+\.\w\+" src/
```

---

### Middle Man

**Threshold:** Class delegates most work to another class
**Deduction:** 0.5 points per class

**SMELL Pattern:**
```typescript
// SMELL: UserService just delegates to User
class UserService {
  getName(user: User) { return user.getName(); }
  getEmail(user: User) { return user.getEmail(); }
  setEmail(user: User, email: string) { user.setEmail(email); }
}
```

---

## SOLID Violations

### Single Responsibility Principle (SRP)

**Threshold:** Class has >1 reason to change
**Deduction:** 1.0 point per violation

**Detection Heuristics:**
- Class has methods in different domains
- Class imports from many unrelated modules
- Class has >300 lines
- Class name contains "And" or is very generic

---

### Open/Closed Principle (OCP)

**Threshold:** Modifying existing code to add features
**Deduction:** 0.75 points per violation

**Detection Signs:**
- Switch statements that grow with each feature
- If-else chains on type
- God functions with many conditionals

---

### Liskov Substitution Principle (LSP)

**Threshold:** Subclass can't substitute for parent
**Deduction:** 0.75 points per violation

**Detection Signs:**
- Override that throws NotImplementedException
- Override that changes behavior contract
- Type checking before calling inherited method

---

### Interface Segregation Principle (ISP)

**Threshold:** Interface with >7 methods or unused methods
**Deduction:** 0.5 points per violation

**Detection Commands:**
```bash
# Large interfaces
grep -A 20 "^interface\|^export interface" src/**/*.ts | grep -c "("
```

---

### Dependency Inversion Principle (DIP)

**Threshold:** High-level module depends on low-level implementation
**Deduction:** 0.75 points per violation

**SMELL Pattern:**
```typescript
// SMELL: Direct instantiation
class OrderService {
  private db = new PostgresDatabase();  // Concrete!
  private mailer = new SendGridMailer();  // Concrete!
}

// BETTER: Inject interfaces
class OrderService {
  constructor(
    private db: Database,        // Interface
    private mailer: EmailService  // Interface
  ) {}
}
```

---

## Summary Scoring Table

| Category | Smell | Threshold | Base Deduction |
|----------|-------|-----------|----------------|
| Bloater | Long Method | >50 lines | 0.5 |
| Bloater | Large Class | >300 lines | 1.0 |
| Bloater | Primitive Obsession | >5 params | 0.5 |
| Bloater | Long Parameter List | >4 params | 0.25 |
| OO Abuser | Switch on Type | multiple places | 0.75 |
| OO Abuser | Refused Bequest | unused inheritance | 0.5 |
| Change Preventer | Divergent Change | multi-reason class | 1.0 |
| Change Preventer | Shotgun Surgery | 5+ file changes | 1.0 |
| Dispensable | Dead Code | any | 0.25/100 lines |
| Dispensable | Speculative Generality | unused abstractions | 0.5 |
| Dispensable | Duplicate Code | >10 similar lines | 0.5 |
| Coupler | Feature Envy | method uses other class | 0.5 |
| Coupler | Message Chains | >3 chained calls | 0.25 |
| SOLID | SRP Violation | multiple responsibilities | 1.0 |
| SOLID | OCP Violation | modifying for extension | 0.75 |
| SOLID | DIP Violation | concrete dependencies | 0.75 |

## Report Template

```markdown
## Code Smell Analysis: {project}

### Summary
| Category | Count | Total Deduction |
|----------|-------|-----------------|
| Bloaters | {n} | {points} |
| OO Abusers | {n} | {points} |
| Change Preventers | {n} | {points} |
| Dispensables | {n} | {points} |
| Couplers | {n} | {points} |
| SOLID Violations | {n} | {points} |
| **Total** | **{sum}** | **{totalPoints}** |

### Top Offenders

#### 1. {ClassName} - God Class
- **Location:** `{file}:{line}`
- **Lines:** {count}
- **Responsibilities:** {list}
- **Deduction:** {points}

{repeat for top 10 issues}
```

## Integration with Brutal Reviewer

This skill contributes to multiple categories:

- **Maintainability (8%):** Bloaters, Dispensables
- **SOLID/DRY (10%):** SOLID violations, Couplers
- **Organization (12%):** Change Preventers, Large Classes
