# Refactoring Patterns Reference

Common refactoring patterns with before/after examples. Use these as templates for systematic code improvements.

## Table of Contents

1. [Extract Method](#extract-method)
2. [Extract Component](#extract-component)
3. [Extract Variable](#extract-variable)
4. [Inline Function](#inline-function)
5. [Rename](#rename)
6. [Move File](#move-file)
7. [Replace Conditional with Polymorphism](#replace-conditional-with-polymorphism)
8. [Replace Magic Number with Named Constant](#replace-magic-number-with-named-constant)
9. [Introduce Parameter Object](#introduce-parameter-object)
10. [Replace Nested Conditional with Guard Clauses](#replace-nested-conditional-with-guard-clauses)
11. [Decompose Conditional](#decompose-conditional)
12. [Consolidate Duplicate Conditional Fragments](#consolidate-duplicate-conditional-fragments)
13. [Remove Dead Code](#remove-dead-code)
14. [Separate Query from Modifier](#separate-query-from-modifier)
15. [Replace Type Code with Discriminated Union](#replace-type-code-with-discriminated-union)
16. [Extract Interface](#extract-interface)
17. [Replace Constructor with Factory](#replace-constructor-with-factory)
18. [Pull Up Method](#pull-up-method)
19. [Push Down Method](#push-down-method)
20. [Replace Inheritance with Composition](#replace-inheritance-with-composition)

---

## Extract Method

**When to use:** Function is too long or does multiple things.

### Before

```typescript
function processOrder(order: Order) {
  let total = 0;
  for (const item of order.items) {
    total += item.price * item.quantity;
  }

  const tax = total * 0.08;
  const shipping = total > 100 ? 0 : 10;
  const finalTotal = total + tax + shipping;

  console.log(`Order total: ${finalTotal}`);
  return finalTotal;
}
```

### After

```typescript
function calculateSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function calculateTax(subtotal: number): number {
  return subtotal * 0.08;
}

function calculateShipping(subtotal: number): number {
  return subtotal > 100 ? 0 : 10;
}

function processOrder(order: Order): number {
  const subtotal = calculateSubtotal(order.items);
  const tax = calculateTax(subtotal);
  const shipping = calculateShipping(subtotal);
  const total = subtotal + tax + shipping;

  console.log(`Order total: ${total}`);
  return total;
}
```

**Benefits:**
- Each function has a single responsibility
- Easy to test each calculation independently
- Clear intent from function names

---

## Extract Component

**When to use:** React component is too large or has multiple responsibilities.

### Before

```typescript
function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    fetchStats().then(setStats);
    fetchRecentOrders().then(setRecentOrders);
    fetchNotifications().then(setNotifications);
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      
      <div className="stats">
        <div>Orders: {stats?.orderCount}</div>
        <div>Revenue: ${stats?.revenue}</div>
        <div>Users: {stats?.userCount}</div>
      </div>

      <div className="orders">
        <h2>Recent Orders</h2>
        {recentOrders.map(order => (
          <div key={order.id}>
            <span>{order.id}</span>
            <span>${order.total}</span>
          </div>
        ))}
      </div>

      <div className="notifications">
        <h2>Notifications</h2>
        {notifications.map(notif => (
          <div key={notif.id}>
            <span>{notif.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### After

```typescript
function StatsWidget({ stats }: { stats: Stats | null }) {
  if (!stats) return <div>Loading stats...</div>;
  
  return (
    <div className="stats">
      <div>Orders: {stats.orderCount}</div>
      <div>Revenue: ${stats.revenue}</div>
      <div>Users: {stats.userCount}</div>
    </div>
  );
}

function RecentOrders({ orders }: { orders: Order[] }) {
  return (
    <div className="orders">
      <h2>Recent Orders</h2>
      {orders.map(order => (
        <div key={order.id}>
          <span>{order.id}</span>
          <span>${order.total}</span>
        </div>
      ))}
    </div>
  );
}

function NotificationList({ notifications }: { notifications: Notification[] }) {
  return (
    <div className="notifications">
      <h2>Notifications</h2>
      {notifications.map(notif => (
        <div key={notif.id}>
          <span>{notif.message}</span>
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    fetchStats().then(setStats);
    fetchRecentOrders().then(setRecentOrders);
    fetchNotifications().then(setNotifications);
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <StatsWidget stats={stats} />
      <RecentOrders orders={recentOrders} />
      <NotificationList notifications={notifications} />
    </div>
  );
}
```

**Benefits:**
- Components can be tested independently
- Easier to optimize (React.memo on individual components)
- Reusable across the app

---

## Extract Variable

**When to use:** Expression is complex or repeated.

### Before

```typescript
function calculateDiscount(order: Order) {
  if (order.total > 100 && order.customer.membershipLevel === 'premium' && order.items.length > 5) {
    return order.total * 0.15;
  }
  return 0;
}
```

### After

```typescript
function calculateDiscount(order: Order): number {
  const isLargeOrder = order.total > 100;
  const isPremiumCustomer = order.customer.membershipLevel === 'premium';
  const hasManyItems = order.items.length > 5;
  const qualifiesForDiscount = isLargeOrder && isPremiumCustomer && hasManyItems;

  if (qualifiesForDiscount) {
    return order.total * 0.15;
  }
  return 0;
}
```

**Benefits:**
- Self-documenting code
- Easier to debug (can inspect intermediate values)
- Easier to modify conditions

---

## Inline Function

**When to use:** Function is trivial and only called once.

### Before

```typescript
function getRating(user: User): number {
  return moreThanFiveLateDeliveries(user) ? 2 : 1;
}

function moreThanFiveLateDeliveries(user: User): boolean {
  return user.lateDeliveryCount > 5;
}

// Called only once
const rating = getRating(user);
```

### After

```typescript
const rating = user.lateDeliveryCount > 5 ? 2 : 1;
```

**Benefits:**
- Removes unnecessary indirection
- Fewer lines of code

---

## Rename

**When to use:** Variable, function, or file name is unclear or misleading.

### Before

```typescript
function getData(id: string) {
  return db.query(`SELECT * FROM users WHERE id = $1`, [id]);
}

const x = getData('123');
const flag = true;
```

### After

```typescript
function getUserById(userId: string): Promise<User | null> {
  return db.query(`SELECT * FROM users WHERE id = $1`, [userId]);
}

const user = getUserById('123');
const isEmailVerified = true;
```

**Benefits:**
- Code is self-documenting
- Reduces cognitive load
- Follows naming conventions

---

## Move File

**When to use:** File is in the wrong location based on architecture.

### Before

```
src/
  utils.ts           # Contains validation, formatting, and date helpers
  api.ts             # Contains both user and post API calls
```

### After

```
src/
  utils/
    validation.ts    # Validation helpers
    formatting.ts    # Formatting helpers
    date.ts          # Date helpers
  api/
    users.ts         # User API calls
    posts.ts         # Post API calls
```

**Benefits:**
- Related code is colocated
- Easier to find files
- Clear module boundaries

---

## Replace Conditional with Polymorphism

**When to use:** Switch statement based on object type.

### Before

```typescript
function calculateSpeed(vehicle: Vehicle): number {
  switch (vehicle.type) {
    case 'car':
      return vehicle.enginePower * 2;
    case 'bike':
      return vehicle.pedalPower * 1.5;
    case 'plane':
      return vehicle.jetPower * 10;
    default:
      throw new Error('Unknown vehicle type');
  }
}
```

### After

```typescript
interface Vehicle {
  calculateSpeed(): number;
}

class Car implements Vehicle {
  constructor(private enginePower: number) {}

  calculateSpeed(): number {
    return this.enginePower * 2;
  }
}

class Bike implements Vehicle {
  constructor(private pedalPower: number) {}

  calculateSpeed(): number {
    return this.pedalPower * 1.5;
  }
}

class Plane implements Vehicle {
  constructor(private jetPower: number) {}

  calculateSpeed(): number {
    return this.jetPower * 10;
  }
}

// Usage
const speed = vehicle.calculateSpeed();
```

**Benefits:**
- Open/closed principle (easy to add new types)
- No switch statements to maintain
- Each type encapsulates its own behavior

---

## Replace Magic Number with Named Constant

**When to use:** Hardcoded numbers without context.

### Before

```typescript
function calculateTax(amount: number): number {
  return amount * 0.08;
}

function getFreeShippingThreshold(): number {
  return 100;
}

function getMaxRetries(): number {
  return 3;
}
```

### After

```typescript
const TAX_RATE = 0.08;
const FREE_SHIPPING_THRESHOLD = 100;
const MAX_RETRIES = 3;

function calculateTax(amount: number): number {
  return amount * TAX_RATE;
}

function getFreeShippingThreshold(): number {
  return FREE_SHIPPING_THRESHOLD;
}

function getMaxRetries(): number {
  return MAX_RETRIES;
}
```

**Benefits:**
- Self-documenting code
- Easy to change values globally
- Reduces errors from typos

---

## Introduce Parameter Object

**When to use:** Function has too many parameters.

### Before

```typescript
function createUser(
  name: string,
  email: string,
  age: number,
  address: string,
  city: string,
  zipCode: string,
  country: string
) {
  // ...
}

createUser('Alice', 'alice@example.com', 30, '123 Main St', 'NYC', '10001', 'USA');
```

### After

```typescript
interface CreateUserParams {
  name: string;
  email: string;
  age: number;
  address: string;
  city: string;
  zipCode: string;
  country: string;
}

function createUser(params: CreateUserParams) {
  // ...
}

createUser({
  name: 'Alice',
  email: 'alice@example.com',
  age: 30,
  address: '123 Main St',
  city: 'NYC',
  zipCode: '10001',
  country: 'USA',
});
```

**Benefits:**
- Easier to add new parameters
- Named parameters (order doesn't matter)
- Reusable type definition

---

## Replace Nested Conditional with Guard Clauses

**When to use:** Deep nesting makes code hard to follow.

### Before

```typescript
function getPayAmount(employee: Employee): number {
  let result: number;
  if (employee.isSeparated) {
    result = 0;
  } else {
    if (employee.isRetired) {
      result = 0;
    } else {
      if (employee.isPartTime) {
        result = employee.hoursWorked * 20;
      } else {
        result = employee.salary;
      }
    }
  }
  return result;
}
```

### After

```typescript
function getPayAmount(employee: Employee): number {
  if (employee.isSeparated) return 0;
  if (employee.isRetired) return 0;
  if (employee.isPartTime) return employee.hoursWorked * 20;
  return employee.salary;
}
```

**Benefits:**
- Flat structure, easier to read
- Error cases handled first
- Happy path at the end

---

## Decompose Conditional

**When to use:** Complex conditional logic.

### Before

```typescript
if (date.before(SUMMER_START) || date.after(SUMMER_END)) {
  charge = quantity * winterRate + winterServiceCharge;
} else {
  charge = quantity * summerRate;
}
```

### After

```typescript
function isWinter(date: Date): boolean {
  return date.before(SUMMER_START) || date.after(SUMMER_END);
}

function winterCharge(quantity: number): number {
  return quantity * winterRate + winterServiceCharge;
}

function summerCharge(quantity: number): number {
  return quantity * summerRate;
}

const charge = isWinter(date) ? winterCharge(quantity) : summerCharge(quantity);
```

**Benefits:**
- Self-documenting
- Reusable helper functions
- Easier to test

---

## Consolidate Duplicate Conditional Fragments

**When to use:** Same code in all branches.

### Before

```typescript
if (isSpecialDeal()) {
  total = price * 0.95;
  send();
} else {
  total = price * 0.98;
  send();
}
```

### After

```typescript
if (isSpecialDeal()) {
  total = price * 0.95;
} else {
  total = price * 0.98;
}
send();
```

**Benefits:**
- Less code duplication
- Easier to maintain

---

## Remove Dead Code

**When to use:** Code is never called.

### Before

```typescript
function processOrder(order: Order) {
  validateOrder(order);
  // calculateDiscount(order);  // Commented out
  saveOrder(order);
}

function calculateDiscount(order: Order) {
  // This function is never called
  return order.total * 0.1;
}
```

### After

```typescript
function processOrder(order: Order) {
  validateOrder(order);
  saveOrder(order);
}

// calculateDiscount removed
```

**Benefits:**
- Reduced codebase size
- Less confusion
- Easier to navigate

---

## Separate Query from Modifier

**When to use:** Function returns a value AND modifies state.

### Before

```typescript
function getTotalOutstandingAndSetReadyForSummaries(customer: Customer): number {
  let result = 0;
  for (const invoice of customer.invoices) {
    result += invoice.amount;
    invoice.readyForSummary = true;  // Side effect!
  }
  return result;
}
```

### After

```typescript
function getTotalOutstanding(customer: Customer): number {
  return customer.invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
}

function setInvoicesReadyForSummaries(customer: Customer): void {
  for (const invoice of customer.invoices) {
    invoice.readyForSummary = true;
  }
}

// Usage
const total = getTotalOutstanding(customer);
setInvoicesReadyForSummaries(customer);
```

**Benefits:**
- Pure functions are easier to test
- Side effects are explicit
- Follows command-query separation principle

---

## Replace Type Code with Discriminated Union

**When to use:** String or enum type codes with different properties.

### Before

```typescript
interface Employee {
  type: 'engineer' | 'manager' | 'salesperson';
  name: string;
  monthlySalary?: number;
  commission?: number;
}

function getPayAmount(employee: Employee): number {
  switch (employee.type) {
    case 'engineer':
      return employee.monthlySalary!;  // Non-null assertion needed
    case 'manager':
      return employee.monthlySalary!;
    case 'salesperson':
      return employee.monthlySalary! + employee.commission!;
  }
}
```

### After

```typescript
type Employee =
  | { type: 'engineer'; name: string; monthlySalary: number }
  | { type: 'manager'; name: string; monthlySalary: number }
  | { type: 'salesperson'; name: string; monthlySalary: number; commission: number };

function getPayAmount(employee: Employee): number {
  switch (employee.type) {
    case 'engineer':
      return employee.monthlySalary;
    case 'manager':
      return employee.monthlySalary;
    case 'salesperson':
      return employee.monthlySalary + employee.commission;  // TypeScript knows commission exists
  }
}
```

**Benefits:**
- Type-safe access to properties
- No non-null assertions
- Impossible states are impossible

---

## Extract Interface

**When to use:** Want to decouple implementation from interface.

### Before

```typescript
class EmailService {
  async send(to: string, subject: string, body: string): Promise<void> {
    // SendGrid implementation
  }
}

class OrderService {
  constructor(private emailService: EmailService) {}  // Tightly coupled

  async createOrder(order: Order) {
    // ...
    await this.emailService.send(order.customerEmail, 'Order Confirmed', 'Thank you!');
  }
}
```

### After

```typescript
interface IEmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}

class SendGridEmailService implements IEmailService {
  async send(to: string, subject: string, body: string): Promise<void> {
    // SendGrid implementation
  }
}

class MockEmailService implements IEmailService {
  async send(to: string, subject: string, body: string): Promise<void> {
    console.log('Mock email sent');
  }
}

class OrderService {
  constructor(private emailService: IEmailService) {}  // Depends on interface

  async createOrder(order: Order) {
    // ...
    await this.emailService.send(order.customerEmail, 'Order Confirmed', 'Thank you!');
  }
}

// Usage
const emailService = process.env.NODE_ENV === 'test'
  ? new MockEmailService()
  : new SendGridEmailService();

const orderService = new OrderService(emailService);
```

**Benefits:**
- Easy to mock in tests
- Can swap implementations
- Follows dependency inversion principle

---

## Replace Constructor with Factory

**When to use:** Complex object creation logic.

### Before

```typescript
class User {
  constructor(
    public id: string,
    public name: string,
    public email: string,
    public role: string
  ) {}
}

// Client code has to know all the details
const user = new User(
  generateId(),
  'Alice',
  'alice@example.com',
  'user'
);
```

### After

```typescript
class User {
  private constructor(
    public id: string,
    public name: string,
    public email: string,
    public role: string
  ) {}

  static create(name: string, email: string): User {
    return new User(
      generateId(),
      name,
      email,
      'user'
    );
  }

  static createAdmin(name: string, email: string): User {
    return new User(
      generateId(),
      name,
      email,
      'admin'
    );
  }
}

// Client code is simpler
const user = User.create('Alice', 'alice@example.com');
const admin = User.createAdmin('Bob', 'bob@example.com');
```

**Benefits:**
- Encapsulates creation logic
- Descriptive factory methods
- Easier to change internal structure

---

## Pull Up Method

**When to use:** Duplicate method in subclasses.

### Before

```typescript
class Engineer {
  getName(): string {
    return this.name;
  }
}

class Manager {
  getName(): string {
    return this.name;  // Duplicate!
  }
}
```

### After

```typescript
abstract class Employee {
  constructor(protected name: string) {}

  getName(): string {
    return this.name;
  }
}

class Engineer extends Employee {}

class Manager extends Employee {}
```

**Benefits:**
- Eliminates duplication
- Easier to maintain

---

## Push Down Method

**When to use:** Method is only relevant to some subclasses.

### Before

```typescript
class Employee {
  getQuota(): number {
    return 0;  // Only relevant to salespeople
  }
}

class Engineer extends Employee {}

class Salesperson extends Employee {
  override getQuota(): number {
    return this.quota;
  }
}
```

### After

```typescript
class Employee {}

class Engineer extends Employee {}

class Salesperson extends Employee {
  getQuota(): number {
    return this.quota;
  }
}
```

**Benefits:**
- Clearer class responsibilities
- No meaningless methods in base class

---

## Replace Inheritance with Composition

**When to use:** Inheritance is used for code reuse, not polymorphism.

### Before

```typescript
class Stack extends ArrayList {
  push(item: any) {
    this.add(item);
  }

  pop(): any {
    return this.remove(this.size() - 1);
  }
}

// Problem: Stack inherits all ArrayList methods (get, set, add at index, etc.)
// which violates Stack semantics
```

### After

```typescript
class Stack {
  private items: any[] = [];

  push(item: any): void {
    this.items.push(item);
  }

  pop(): any {
    return this.items.pop();
  }

  size(): number {
    return this.items.length;
  }
}

// Stack only exposes Stack operations
```

**Benefits:**
- Better encapsulation
- Clearer interface
- Composition over inheritance

---

## Summary

These refactoring patterns are building blocks for improving code quality. Apply them systematically:

1. **Identify the smell** - What pattern is causing issues?
2. **Choose the refactoring** - Which pattern fixes it?
3. **Apply incrementally** - Small changes, test after each
4. **Validate** - Run tests, typecheck, lint
5. **Commit** - Atomic commits for each refactoring

For more patterns and detailed guidance, see:
- Martin Fowler's Refactoring Catalog: https://refactoring.com/catalog/
- Clean Code by Robert C. Martin
- The main SKILL.md for workflow and precision tool usage
