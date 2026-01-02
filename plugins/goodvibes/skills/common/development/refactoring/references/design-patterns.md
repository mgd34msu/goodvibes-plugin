# Design Patterns Reference

Gang of Four patterns with modern JavaScript/TypeScript examples.

## Creational Patterns

### Singleton

Ensure only one instance exists:

```typescript
class Database {
  private static instance: Database;
  private connection: Connection;

  private constructor() {
    this.connection = createConnection();
  }

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  query(sql: string) {
    return this.connection.execute(sql);
  }
}

// Usage
const db1 = Database.getInstance();
const db2 = Database.getInstance();
console.log(db1 === db2); // true

// Modern alternative: Module-level singleton
// database.ts
const connection = createConnection();
export const query = (sql: string) => connection.execute(sql);
```

### Factory Method

Define interface for creating objects:

```typescript
interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(`[Console] ${message}`);
  }
}

class FileLogger implements Logger {
  constructor(private path: string) {}
  log(message: string) {
    fs.appendFileSync(this.path, `${message}\n`);
  }
}

class LoggerFactory {
  static create(type: 'console' | 'file', options?: { path?: string }): Logger {
    switch (type) {
      case 'console':
        return new ConsoleLogger();
      case 'file':
        return new FileLogger(options?.path || 'app.log');
      default:
        throw new Error(`Unknown logger type: ${type}`);
    }
  }
}

// Usage
const logger = LoggerFactory.create('file', { path: 'debug.log' });
logger.log('Application started');
```

### Builder

Construct complex objects step by step:

```typescript
class QueryBuilder {
  private query: {
    select: string[];
    from: string;
    where: string[];
    orderBy?: string;
    limit?: number;
  } = { select: [], from: '', where: [] };

  select(...columns: string[]): this {
    this.query.select = columns;
    return this;
  }

  from(table: string): this {
    this.query.from = table;
    return this;
  }

  where(condition: string): this {
    this.query.where.push(condition);
    return this;
  }

  orderBy(column: string): this {
    this.query.orderBy = column;
    return this;
  }

  limit(n: number): this {
    this.query.limit = n;
    return this;
  }

  build(): string {
    let sql = `SELECT ${this.query.select.join(', ')} FROM ${this.query.from}`;
    if (this.query.where.length) {
      sql += ` WHERE ${this.query.where.join(' AND ')}`;
    }
    if (this.query.orderBy) {
      sql += ` ORDER BY ${this.query.orderBy}`;
    }
    if (this.query.limit) {
      sql += ` LIMIT ${this.query.limit}`;
    }
    return sql;
  }
}

// Usage
const query = new QueryBuilder()
  .select('id', 'name', 'email')
  .from('users')
  .where('active = true')
  .where('role = "admin"')
  .orderBy('name')
  .limit(10)
  .build();
```

---

## Structural Patterns

### Adapter

Convert interface to another:

```typescript
// Old interface
class LegacyPaymentGateway {
  processPayment(accountNumber: string, amount: number): boolean {
    // Legacy implementation
    return true;
  }
}

// New interface we want to use
interface PaymentProcessor {
  charge(payment: { cardNumber: string; amount: number }): Promise<boolean>;
}

// Adapter
class LegacyPaymentAdapter implements PaymentProcessor {
  constructor(private legacy: LegacyPaymentGateway) {}

  async charge(payment: { cardNumber: string; amount: number }): Promise<boolean> {
    // Adapt new interface to old
    return this.legacy.processPayment(payment.cardNumber, payment.amount);
  }
}

// Usage
const legacyGateway = new LegacyPaymentGateway();
const processor: PaymentProcessor = new LegacyPaymentAdapter(legacyGateway);
await processor.charge({ cardNumber: '1234', amount: 100 });
```

### Decorator

Add responsibilities dynamically:

```typescript
interface Coffee {
  cost(): number;
  description(): string;
}

class SimpleCoffee implements Coffee {
  cost() { return 2; }
  description() { return 'Coffee'; }
}

// Decorator base
abstract class CoffeeDecorator implements Coffee {
  constructor(protected coffee: Coffee) {}
  abstract cost(): number;
  abstract description(): string;
}

class MilkDecorator extends CoffeeDecorator {
  cost() { return this.coffee.cost() + 0.5; }
  description() { return `${this.coffee.description()}, Milk`; }
}

class SugarDecorator extends CoffeeDecorator {
  cost() { return this.coffee.cost() + 0.25; }
  description() { return `${this.coffee.description()}, Sugar`; }
}

// Usage
let coffee: Coffee = new SimpleCoffee();
coffee = new MilkDecorator(coffee);
coffee = new SugarDecorator(coffee);

console.log(coffee.description()); // "Coffee, Milk, Sugar"
console.log(coffee.cost()); // 2.75

// Modern alternative: Function composition
const withMilk = (cost: number) => cost + 0.5;
const withSugar = (cost: number) => cost + 0.25;
const price = withSugar(withMilk(2)); // 2.75
```

### Proxy

Control access to object:

```typescript
interface DataService {
  getData(id: string): Promise<Data>;
}

class RealDataService implements DataService {
  async getData(id: string): Promise<Data> {
    // Expensive operation
    return await database.query(`SELECT * FROM data WHERE id = ?`, [id]);
  }
}

class CachingProxy implements DataService {
  private cache = new Map<string, Data>();

  constructor(private service: DataService) {}

  async getData(id: string): Promise<Data> {
    if (this.cache.has(id)) {
      console.log('Cache hit');
      return this.cache.get(id)!;
    }

    console.log('Cache miss');
    const data = await this.service.getData(id);
    this.cache.set(id, data);
    return data;
  }
}

// Usage
const service = new CachingProxy(new RealDataService());
await service.getData('123'); // Cache miss
await service.getData('123'); // Cache hit
```

### Facade

Simplified interface to complex subsystem:

```typescript
// Complex subsystems
class CPU {
  freeze() { /* ... */ }
  jump(address: number) { /* ... */ }
  execute() { /* ... */ }
}

class Memory {
  load(address: number, data: string) { /* ... */ }
}

class HardDrive {
  read(sector: number, size: number): string { return ''; }
}

// Facade
class ComputerFacade {
  private cpu = new CPU();
  private memory = new Memory();
  private hardDrive = new HardDrive();

  start(): void {
    this.cpu.freeze();
    this.memory.load(0, this.hardDrive.read(0, 1024));
    this.cpu.jump(0);
    this.cpu.execute();
  }
}

// Usage - simple interface
const computer = new ComputerFacade();
computer.start();
```

---

## Behavioral Patterns

### Strategy

Interchangeable algorithms:

```typescript
interface SortStrategy<T> {
  sort(data: T[]): T[];
}

class QuickSort<T> implements SortStrategy<T> {
  sort(data: T[]): T[] {
    // Quick sort implementation
    return [...data].sort();
  }
}

class MergeSort<T> implements SortStrategy<T> {
  sort(data: T[]): T[] {
    // Merge sort implementation
    return [...data].sort();
  }
}

class Sorter<T> {
  constructor(private strategy: SortStrategy<T>) {}

  setStrategy(strategy: SortStrategy<T>) {
    this.strategy = strategy;
  }

  sort(data: T[]): T[] {
    return this.strategy.sort(data);
  }
}

// Usage
const sorter = new Sorter<number>(new QuickSort());
sorter.sort([3, 1, 2]);

sorter.setStrategy(new MergeSort());
sorter.sort([3, 1, 2]);

// Modern alternative: Higher-order functions
type SortFn<T> = (data: T[]) => T[];

const quickSort: SortFn<number> = (data) => [...data].sort((a, b) => a - b);
const mergeSort: SortFn<number> = (data) => [...data].sort((a, b) => a - b);

const sort = <T>(data: T[], strategy: SortFn<T>) => strategy(data);
```

### Observer

Notify dependents of changes:

```typescript
type Observer<T> = (data: T) => void;

class Observable<T> {
  private observers: Observer<T>[] = [];

  subscribe(observer: Observer<T>): () => void {
    this.observers.push(observer);
    // Return unsubscribe function
    return () => {
      this.observers = this.observers.filter(o => o !== observer);
    };
  }

  notify(data: T): void {
    this.observers.forEach(observer => observer(data));
  }
}

// Usage
const priceUpdates = new Observable<number>();

const unsubscribe = priceUpdates.subscribe((price) => {
  console.log(`Price updated: $${price}`);
});

priceUpdates.notify(99.99); // "Price updated: $99.99"
unsubscribe();
priceUpdates.notify(89.99); // No output

// Modern: Using EventEmitter
import { EventEmitter } from 'events';

class PriceTracker extends EventEmitter {
  updatePrice(price: number) {
    this.emit('priceUpdate', price);
  }
}
```

### Command

Encapsulate request as object:

```typescript
interface Command {
  execute(): void;
  undo(): void;
}

class AddTextCommand implements Command {
  constructor(
    private editor: TextEditor,
    private text: string,
    private position: number
  ) {}

  execute() {
    this.editor.insertAt(this.position, this.text);
  }

  undo() {
    this.editor.deleteAt(this.position, this.text.length);
  }
}

class CommandHistory {
  private history: Command[] = [];
  private undone: Command[] = [];

  execute(command: Command) {
    command.execute();
    this.history.push(command);
    this.undone = []; // Clear redo stack
  }

  undo() {
    const command = this.history.pop();
    if (command) {
      command.undo();
      this.undone.push(command);
    }
  }

  redo() {
    const command = this.undone.pop();
    if (command) {
      command.execute();
      this.history.push(command);
    }
  }
}

// Usage
const history = new CommandHistory();
const editor = new TextEditor();

history.execute(new AddTextCommand(editor, 'Hello', 0));
history.execute(new AddTextCommand(editor, ' World', 5));
history.undo(); // Removes " World"
history.redo(); // Adds " World" back
```

### State

Alter behavior based on state:

```typescript
interface OrderState {
  next(order: Order): void;
  cancel(order: Order): void;
  status(): string;
}

class PendingState implements OrderState {
  next(order: Order) {
    order.setState(new ProcessingState());
  }
  cancel(order: Order) {
    order.setState(new CancelledState());
  }
  status() { return 'Pending'; }
}

class ProcessingState implements OrderState {
  next(order: Order) {
    order.setState(new ShippedState());
  }
  cancel(order: Order) {
    throw new Error('Cannot cancel - already processing');
  }
  status() { return 'Processing'; }
}

class ShippedState implements OrderState {
  next(order: Order) {
    order.setState(new DeliveredState());
  }
  cancel(order: Order) {
    throw new Error('Cannot cancel - already shipped');
  }
  status() { return 'Shipped'; }
}

class Order {
  private state: OrderState = new PendingState();

  setState(state: OrderState) {
    this.state = state;
  }

  next() { this.state.next(this); }
  cancel() { this.state.cancel(this); }
  getStatus() { return this.state.status(); }
}

// Usage
const order = new Order();
console.log(order.getStatus()); // "Pending"
order.next();
console.log(order.getStatus()); // "Processing"
```

### Chain of Responsibility

Pass request along chain:

```typescript
abstract class Handler {
  protected next?: Handler;

  setNext(handler: Handler): Handler {
    this.next = handler;
    return handler;
  }

  handle(request: Request): Response | null {
    if (this.next) {
      return this.next.handle(request);
    }
    return null;
  }
}

class AuthHandler extends Handler {
  handle(request: Request): Response | null {
    if (!request.headers.authorization) {
      return { status: 401, body: 'Unauthorized' };
    }
    return super.handle(request);
  }
}

class ValidationHandler extends Handler {
  handle(request: Request): Response | null {
    if (!request.body || Object.keys(request.body).length === 0) {
      return { status: 400, body: 'Invalid body' };
    }
    return super.handle(request);
  }
}

class RateLimitHandler extends Handler {
  private requests = new Map<string, number>();

  handle(request: Request): Response | null {
    const ip = request.ip;
    const count = this.requests.get(ip) || 0;
    if (count > 100) {
      return { status: 429, body: 'Too many requests' };
    }
    this.requests.set(ip, count + 1);
    return super.handle(request);
  }
}

// Usage
const handler = new AuthHandler();
handler.setNext(new ValidationHandler()).setNext(new RateLimitHandler());

const response = handler.handle(request);
```

---

## Modern Patterns

### Dependency Injection

```typescript
// Without DI - hard to test
class UserService {
  private db = new Database();
  private mailer = new MailService();

  async createUser(data: UserData) {
    const user = await this.db.insert('users', data);
    await this.mailer.sendWelcome(user.email);
    return user;
  }
}

// With DI - testable
class UserService {
  constructor(
    private db: Database,
    private mailer: MailService
  ) {}

  async createUser(data: UserData) {
    const user = await this.db.insert('users', data);
    await this.mailer.sendWelcome(user.email);
    return user;
  }
}

// Test with mocks
const mockDb = { insert: jest.fn() };
const mockMailer = { sendWelcome: jest.fn() };
const service = new UserService(mockDb, mockMailer);
```

### Repository Pattern

```typescript
interface Repository<T> {
  findById(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

class UserRepository implements Repository<User> {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User | null> {
    return this.db.query('SELECT * FROM users WHERE id = ?', [id]);
  }

  async findAll(): Promise<User[]> {
    return this.db.query('SELECT * FROM users');
  }

  // ... other methods
}

// Usage in service
class UserService {
  constructor(private userRepo: Repository<User>) {}

  async getUser(id: string) {
    return this.userRepo.findById(id);
  }
}
```

### Module Pattern (JavaScript)

```javascript
const UserModule = (function() {
  // Private
  let users = [];

  function validateEmail(email) {
    return email.includes('@');
  }

  // Public API
  return {
    addUser(user) {
      if (!validateEmail(user.email)) {
        throw new Error('Invalid email');
      }
      users.push(user);
    },

    getUsers() {
      return [...users];
    },

    clear() {
      users = [];
    }
  };
})();

UserModule.addUser({ email: 'test@example.com' });
console.log(UserModule.getUsers());
```
