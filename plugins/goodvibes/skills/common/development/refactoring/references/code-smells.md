# Code Smell Catalog

Comprehensive catalog of code smells with detection and remediation patterns.

## Bloaters

Code that has grown too large to handle effectively.

### Long Method

**Symptoms:**
- Method > 20 lines
- Multiple levels of abstraction
- Many local variables
- Deeply nested conditionals

**Detection:**
```javascript
// Lines of code check
function isLongMethod(method) {
  return method.lineCount > 20;
}

// Complexity check
function hasHighComplexity(method) {
  return method.cyclomaticComplexity > 10;
}
```

**Refactoring: Extract Method**
```javascript
// BEFORE
function printOwing() {
  printBanner();

  // Calculate outstanding
  let outstanding = 0;
  for (const order of orders) {
    outstanding += order.amount;
  }

  // Print details
  console.log(`name: ${name}`);
  console.log(`amount: ${outstanding}`);
}

// AFTER
function printOwing() {
  printBanner();
  const outstanding = calculateOutstanding();
  printDetails(outstanding);
}

function calculateOutstanding() {
  return orders.reduce((sum, order) => sum + order.amount, 0);
}

function printDetails(outstanding) {
  console.log(`name: ${name}`);
  console.log(`amount: ${outstanding}`);
}
```

---

### Large Class

**Symptoms:**
- Class > 300 lines
- Too many instance variables
- Too many methods
- Low cohesion (methods don't use same fields)

**Refactoring: Extract Class**
```javascript
// BEFORE
class Person {
  name;
  officeAreaCode;
  officeNumber;
  homeAreaCode;
  homeNumber;

  getOfficeTelephone() { return `${this.officeAreaCode}-${this.officeNumber}`; }
  getHomeTelephone() { return `${this.homeAreaCode}-${this.homeNumber}`; }
  // ... many more phone-related methods
}

// AFTER
class Person {
  name;
  officePhone;  // TelephoneNumber
  homePhone;    // TelephoneNumber
}

class TelephoneNumber {
  areaCode;
  number;

  toString() {
    return `${this.areaCode}-${this.number}`;
  }
}
```

---

### Long Parameter List

**Symptoms:**
- Method has > 3-4 parameters
- Parameters often passed together
- Boolean flags that change behavior

**Refactoring: Introduce Parameter Object**
```javascript
// BEFORE
function createOrder(customerId, productId, quantity, discount, shippingAddress, billingAddress, notes) {
  // ...
}

// AFTER
function createOrder(orderParams) {
  const { customerId, productId, quantity, discount, shippingAddress, billingAddress, notes } = orderParams;
  // ...
}

// Or with a class
class OrderRequest {
  constructor(customerId, productId, quantity) {
    this.customerId = customerId;
    this.productId = productId;
    this.quantity = quantity;
  }

  withDiscount(discount) {
    this.discount = discount;
    return this;
  }

  withShipping(address) {
    this.shippingAddress = address;
    return this;
  }
}
```

---

### Data Clumps

**Symptoms:**
- Same group of variables appear together repeatedly
- Methods share similar parameter groups
- Related data scattered across objects

**Refactoring: Extract Class**
```javascript
// BEFORE
function calculateDistance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function translatePoint(x, y, dx, dy) {
  return { x: x + dx, y: y + dy };
}

// AFTER
class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  distanceTo(other) {
    return Math.sqrt((other.x - this.x) ** 2 + (other.y - this.y) ** 2);
  }

  translate(dx, dy) {
    return new Point(this.x + dx, this.y + dy);
  }
}
```

---

## Object-Orientation Abusers

### Switch Statements

**Symptoms:**
- Switch on type to determine behavior
- Same switch appears in multiple places
- Adding new types requires modifying switches

**Refactoring: Replace with Polymorphism**
```javascript
// BEFORE
function calculatePay(employee) {
  switch (employee.type) {
    case 'hourly':
      return employee.hours * employee.rate;
    case 'salaried':
      return employee.salary / 12;
    case 'commission':
      return employee.basePay + employee.sales * employee.commissionRate;
  }
}

// AFTER
class Employee {
  calculatePay() { throw new Error('Abstract'); }
}

class HourlyEmployee extends Employee {
  calculatePay() {
    return this.hours * this.rate;
  }
}

class SalariedEmployee extends Employee {
  calculatePay() {
    return this.salary / 12;
  }
}

class CommissionEmployee extends Employee {
  calculatePay() {
    return this.basePay + this.sales * this.commissionRate;
  }
}
```

---

### Temporary Field

**Symptoms:**
- Instance variable only set in certain circumstances
- Object has fields that are null/undefined most of the time
- Complex null-checking throughout class

**Refactoring: Extract Class / Introduce Null Object**
```javascript
// BEFORE
class Order {
  discount;        // Only set for discounted orders
  discountReason;  // Only set for discounted orders

  calculateTotal() {
    if (this.discount) {
      return this.subtotal * (1 - this.discount);
    }
    return this.subtotal;
  }
}

// AFTER
class Order {
  discountPolicy;  // Always set, could be NoDiscount

  calculateTotal() {
    return this.discountPolicy.apply(this.subtotal);
  }
}

class PercentageDiscount {
  constructor(percent, reason) {
    this.percent = percent;
    this.reason = reason;
  }

  apply(amount) {
    return amount * (1 - this.percent);
  }
}

class NoDiscount {
  apply(amount) {
    return amount;
  }
}
```

---

### Feature Envy

**Symptoms:**
- Method uses more data from another class than its own
- Frequently accessing getters of another object
- Manipulating another object's internal state

**Refactoring: Move Method**
```javascript
// BEFORE
class Order {
  calculateShipping() {
    const customer = this.customer;
    const zone = determineZone(customer.address.country, customer.address.state);
    const distance = calculateDistance(customer.address.zip, this.warehouse.zip);
    const weight = this.items.reduce((sum, item) => sum + item.weight, 0);
    return this.shippingRates.calculate(zone, distance, weight);
  }
}

// AFTER: Move to Customer or create ShippingCalculator
class ShippingCalculator {
  calculate(customer, order) {
    const zone = this.determineZone(customer.address);
    const distance = this.calculateDistance(customer.address, order.warehouse);
    const weight = order.totalWeight;
    return this.rates.calculate(zone, distance, weight);
  }
}
```

---

## Change Preventers

These smells make code difficult to change.

### Divergent Change

**Symptoms:**
- One class changed for many different reasons
- Changes to unrelated features affect same class
- Class has methods for multiple domains

**Refactoring: Extract Class**
```javascript
// BEFORE: Changes for both UI and data reasons
class UserManager {
  // Data-related
  saveUser(user) {}
  loadUser(id) {}
  validateUser(user) {}

  // UI-related
  formatUserForDisplay(user) {}
  generateUserCard(user) {}
  createUserAvatar(user) {}
}

// AFTER: Separate concerns
class UserRepository {
  save(user) {}
  load(id) {}
  validate(user) {}
}

class UserPresenter {
  formatForDisplay(user) {}
  generateCard(user) {}
  createAvatar(user) {}
}
```

---

### Shotgun Surgery

**Symptoms:**
- Single change requires modifying many classes
- Related changes scattered across codebase
- Risk of missing a required change

**Refactoring: Move Method / Move Field**
```javascript
// BEFORE: Phone format logic in many places
class Customer {
  formatPhone() {
    return `(${this.areaCode}) ${this.number}`;
  }
}

class Vendor {
  formatPhone() {
    return `(${this.areaCode}) ${this.number}`;
  }
}

// AFTER: Centralized
class PhoneNumber {
  constructor(areaCode, number) {
    this.areaCode = areaCode;
    this.number = number;
  }

  format() {
    return `(${this.areaCode}) ${this.number}`;
  }
}

class Customer {
  phone; // PhoneNumber instance
}
```

---

## Dispensables

Code that could be removed without affecting functionality.

### Comments (Excessive)

**Symptoms:**
- Comments explain what, not why
- Code needs comments to be understood
- Outdated comments that don't match code

**Refactoring: Extract Method / Rename**
```javascript
// BEFORE
// Check if customer can get discount
if (customer.purchaseHistory.length > 10 && customer.memberSince < yearAgo) {
  // Apply 10% discount
  total = total * 0.9;
}

// AFTER: Self-documenting code
if (customer.isEligibleForLoyaltyDiscount()) {
  total = applyLoyaltyDiscount(total);
}

class Customer {
  isEligibleForLoyaltyDiscount() {
    return this.purchaseHistory.length > 10 && this.memberSince < yearAgo;
  }
}
```

---

### Duplicate Code

**Symptoms:**
- Same code structure in multiple places
- Copy-paste with minor variations
- Parallel inheritance hierarchies

**Refactoring: Extract Method / Extract Superclass**
```javascript
// BEFORE
function validateEmail(email) {
  if (!email) throw new Error('Email required');
  if (!email.includes('@')) throw new Error('Invalid email');
  return email.toLowerCase().trim();
}

function validateWorkEmail(email) {
  if (!email) throw new Error('Email required');
  if (!email.includes('@')) throw new Error('Invalid email');
  if (!email.endsWith('@company.com')) throw new Error('Must be company email');
  return email.toLowerCase().trim();
}

// AFTER
function validateEmail(email, { requireDomain } = {}) {
  if (!email) throw new Error('Email required');
  if (!email.includes('@')) throw new Error('Invalid email');
  if (requireDomain && !email.endsWith(requireDomain)) {
    throw new Error(`Must be ${requireDomain} email`);
  }
  return email.toLowerCase().trim();
}

const validateWorkEmail = (email) => validateEmail(email, { requireDomain: '@company.com' });
```

---

### Dead Code

**Symptoms:**
- Unreachable code after return/throw
- Unused variables, parameters, or methods
- Commented-out code
- Obsolete feature flags

**Refactoring: Delete**
```javascript
// DELETE: Unreachable
function process() {
  return result;
  console.log('Done');  // Never runs
}

// DELETE: Unused parameter
function calculate(a, b, unusedC) {
  return a + b;
}

// DELETE: Commented code
function oldMethod() {
  // This was the old implementation
  // const x = doOldThing();
  // return transformOld(x);
  return newImplementation();
}
```

---

### Speculative Generality

**Symptoms:**
- Abstract classes with only one subclass
- Unused parameters "for future use"
- Methods that only delegate
- Overly generic names

**Refactoring: Collapse Hierarchy / Remove**
```javascript
// BEFORE: Unnecessary abstraction
abstract class Shape { abstract draw(); }
class Rectangle extends Shape { draw() { /* only implementation */ } }

// AFTER: Just use the concrete class
class Rectangle { draw() { /* implementation */ } }

// BEFORE: Unused flexibility
class DataProcessor {
  process(data, options = {}) {
    // options never used
    return this.transform(data);
  }
}

// AFTER: Simplified
class DataProcessor {
  process(data) {
    return this.transform(data);
  }
}
```

---

## Couplers

Code with excessive coupling between classes.

### Inappropriate Intimacy

**Symptoms:**
- Classes access each other's private parts
- Bidirectional associations
- Subclass knows too much about parent

**Refactoring: Move Method / Extract Class**
```javascript
// BEFORE: Too much knowledge of internals
class Order {
  calculateTotal() {
    let total = 0;
    for (const item of this.customer._privateCart._items) {
      total += item._price * item._quantity;
    }
    return total;
  }
}

// AFTER: Proper encapsulation
class Order {
  calculateTotal() {
    return this.customer.getCartTotal();
  }
}

class Customer {
  getCartTotal() {
    return this.cart.getTotal();
  }
}

class Cart {
  getTotal() {
    return this.items.reduce((sum, item) => sum + item.getSubtotal(), 0);
  }
}
```

---

### Message Chains

**Symptoms:**
- Long chains of method calls: `a.b().c().d().e()`
- Client depends on navigation structure
- Changes ripple through chain

**Refactoring: Hide Delegate**
```javascript
// BEFORE
const managerName = employee.getDepartment().getManager().getName();

// AFTER
const managerName = employee.getManagerName();

class Employee {
  getManagerName() {
    return this.department.getManagerName();
  }
}

class Department {
  getManagerName() {
    return this.manager.getName();
  }
}
```

---

### Middle Man

**Symptoms:**
- Class delegates most of its methods
- Wrapper that adds no value
- Pass-through methods

**Refactoring: Remove Middle Man**
```javascript
// BEFORE: Manager just delegates
class Manager {
  getDepartment() { return this.person.getDepartment(); }
  setDepartment(d) { this.person.setDepartment(d); }
  getName() { return this.person.getName(); }
  // ... all methods just delegate
}

// AFTER: Use Person directly where appropriate
// Or if some wrapping needed, remove excessive delegation
class Manager {
  get person() { return this._person; }
  // Only keep methods that add value
  approve(request) {
    if (this.canApprove(request)) {
      request.approve(this.person);
    }
  }
}
```
