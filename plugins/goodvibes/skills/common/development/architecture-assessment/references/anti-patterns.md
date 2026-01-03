# Architecture Anti-Patterns Reference

Comprehensive catalog of architectural anti-patterns with detection methods, impact analysis, and remediation strategies.

## Structural Anti-Patterns

### God Class / God Object

**Definition:** A class that knows too much or does too much.

**Symptoms:**
- File exceeds 1000 lines
- Class has 20+ methods
- Class has 15+ instance variables
- Single class handles multiple responsibilities
- Most other classes depend on it

**Detection:**
```bash
# Find large files
find src -name "*.ts" -exec wc -l {} \; | awk '$1 > 500' | sort -rn

# Find classes with many methods (TypeScript)
grep -c "^\s*\(public\|private\|protected\)\?\s*\w\+(" src/**/*.ts

# Dependency analysis - what depends on this?
npx madge --depends-on src/core/MainService.ts
```

**Impact:**
- Impossible to test in isolation
- Changes have unpredictable effects
- Merge conflicts on every PR
- Performance bottlenecks

**Remediation:**
1. Identify distinct responsibilities
2. Extract each to separate class
3. Use composition to coordinate
4. Apply Interface Segregation

```javascript
// BEFORE: God class
class OrderService {
  createOrder() { }
  validateOrder() { }
  calculateTax() { }
  applyDiscount() { }
  sendConfirmationEmail() { }
  updateInventory() { }
  processPayment() { }
  generateInvoice() { }
  // ... 50 more methods
}

// AFTER: Extracted responsibilities
class OrderService {
  constructor(
    private validator: OrderValidator,
    private calculator: PriceCalculator,
    private notifier: OrderNotifier,
    private inventory: InventoryService,
    private payment: PaymentProcessor
  ) {}

  async createOrder(data: OrderData) {
    const order = await this.validator.validate(data);
    const priced = await this.calculator.price(order);
    await this.payment.process(priced);
    await this.inventory.reserve(priced.items);
    await this.notifier.sendConfirmation(priced);
    return priced;
  }
}
```

---

### Spaghetti Architecture

**Definition:** No clear structure, tangled dependencies, impossible to follow.

**Symptoms:**
- No consistent directory organization
- Any file can import any other file
- Circular dependencies everywhere
- Business logic mixed with infrastructure
- No clear entry points

**Detection:**
```bash
# Circular dependency count
npx madge --circular src/ | wc -l

# Dependency graph visualization
npx madge --image graph.png src/

# Check for mixed concerns
grep -l "import.*database" src/components/**/*.tsx
```

**Impact:**
- Cannot understand system without reading everything
- Every change breaks something unexpected
- New developers take months to onboard
- Testing requires full system

**Remediation:**
1. **Identify natural boundaries** - Group related functionality
2. **Define layers** - Establish dependency rules
3. **Extract shared utilities** - Create common layer
4. **Enforce boundaries** - Use linting/architecture tests
5. **Incremental cleanup** - Fix one module at a time

```javascript
// Architecture test (dependency-cruiser)
{
  "forbidden": [
    {
      "name": "no-circular",
      "from": {},
      "to": { "circular": true }
    },
    {
      "name": "no-ui-to-db",
      "from": { "path": "^src/ui" },
      "to": { "path": "^src/database" }
    }
  ]
}
```

---

### Big Ball of Mud

**Definition:** System with no discernible architecture.

**Symptoms:**
- No documentation of intended architecture
- Code added wherever convenient
- Duplicated functionality throughout
- No clear module boundaries
- "Legacy" is the only description

**Detection:**
```bash
# Entropy measurement - file coupling
npx madge src/ --json | jq '.[] | length' | sort -rn | head -20

# Find duplicated code
npx jscpd src/ --min-lines 5 --reporters console

# Check for architecture violations
# If no rules exist, it's probably a ball of mud
```

**Impact:**
- Technical bankruptcy risk
- Developer turnover
- Feature velocity decreases over time
- Customer-visible bugs increase

**Remediation (Strangler Fig Pattern):**
1. **Stop the bleeding** - No new code in old style
2. **Identify seams** - Find natural boundaries
3. **Create new modules** - Build clean new components
4. **Redirect traffic** - Route to new components
5. **Sunset old code** - Eventually remove

```
Old System           New System
+--------+          +--------+
| Mud    |  ------> | Clean  |
| Ball   |  <------ | Module |
+--------+          +--------+
    ^                   ^
    |                   |
    +------ API --------+

Gradually move functionality to clean modules
```

---

### Distributed Monolith

**Definition:** Microservices with all the downsides of both monolith and distribution.

**Symptoms:**
- Services share database
- Synchronous call chains between services
- Must deploy services together
- Shared libraries contain business logic
- Service boundaries don't match domain

**Detection:**
```bash
# Database sharing
grep -r "DATABASE_URL" */config/ | cut -d: -f1 | sort -u | wc -l
# If count < number of services, they share DB

# Synchronous chains
grep -r "await.*fetch\|await.*axios" */src/**/*.ts | \
  awk -F: '{print $1}' | sort | uniq -c

# Check for shared business logic in libs
ls shared/lib/ | grep -v "utils\|types\|config"
```

**Impact:**
- Network latency for every operation
- Partial failure handling complexity
- Distributed transactions needed
- Worse than either monolith or microservices

**Remediation:**
1. **Define true boundaries** - By domain, not technical layer
2. **Database per service** - Strict data ownership
3. **Event-driven communication** - Replace sync with async
4. **Saga pattern** - For distributed transactions
5. **Or... embrace monolith** - It might be the right choice

---

### Anemic Domain Model

**Definition:** Domain objects with no behavior, logic scattered in services.

**Symptoms:**
- Entities are just data containers (getters/setters)
- All logic in "Service" classes
- DTOs and entities are identical
- Can't tell domain rules from code
- Validation duplicated everywhere

**Detection:**
```bash
# Find anemic classes (only getters/setters)
grep -l "get\|set" src/domain/**/*.ts | while read f; do
  methods=$(grep -c "^\s*\(public\|private\)\s*\w\+(" "$f")
  getset=$(grep -c "get\|set" "$f")
  if [ "$methods" -eq "$getset" ]; then
    echo "Anemic: $f"
  fi
done

# Large service classes (indicates logic not in domain)
wc -l src/services/**/*.ts | sort -rn | head -10
```

**Impact:**
- Business rules scattered and duplicated
- Domain knowledge hard to find
- Validation logic inconsistent
- Testing requires service setup

**Remediation:**
```javascript
// BEFORE: Anemic
class Order {
  customerId: string;
  items: OrderItem[];
  status: string;
}

class OrderService {
  addItem(order: Order, item: Item) {
    if (order.status !== 'draft') throw new Error('Cannot modify');
    if (item.quantity <= 0) throw new Error('Invalid quantity');
    order.items.push(new OrderItem(item));
  }

  submit(order: Order) {
    if (order.items.length === 0) throw new Error('Empty order');
    if (!this.inventoryService.check(order.items)) {
      throw new Error('Out of stock');
    }
    order.status = 'submitted';
  }
}

// AFTER: Rich domain
class Order {
  private readonly customerId: CustomerId;
  private items: OrderItem[] = [];
  private status: OrderStatus = OrderStatus.Draft;

  addItem(item: Item): void {
    this.ensureModifiable();
    this.items.push(OrderItem.create(item));
  }

  submit(): void {
    if (this.items.length === 0) {
      throw new EmptyOrderError();
    }
    this.status = OrderStatus.Submitted;
    this.record(new OrderSubmittedEvent(this));
  }

  private ensureModifiable(): void {
    if (this.status !== OrderStatus.Draft) {
      throw new OrderNotModifiableError();
    }
  }
}
```

---

### Circular Dependencies

**Definition:** Module A depends on B, B depends on A (directly or transitively).

**Symptoms:**
- Import order matters
- Initialization race conditions
- Cannot extract module independently
- Testing requires both modules

**Detection:**
```bash
# Node.js
npx madge --circular src/

# Python
pydeps --show-cycles src/

# Go
go mod graph | tsort 2>&1 | grep "cycle"
```

**Impact:**
- Modules cannot evolve independently
- Difficult to test in isolation
- Increased build complexity
- Memory leaks possible

**Remediation Strategies:**

1. **Dependency Inversion:**
```javascript
// BEFORE: Circular
// user.ts imports order.ts
// order.ts imports user.ts

// AFTER: Extract interface
// user.ts imports IOrderService interface
// order.ts implements IOrderService
```

2. **Extract Shared:**
```javascript
// BEFORE: A <-> B
// AFTER: A -> Shared <- B
```

3. **Event-based Decoupling:**
```javascript
// BEFORE: Direct call
class Order {
  constructor(private userService: UserService) {}
  complete() {
    this.userService.updatePurchaseHistory(this);
  }
}

// AFTER: Event
class Order {
  complete() {
    this.emit(new OrderCompletedEvent(this));
  }
}

// User module subscribes independently
orderEvents.on(OrderCompletedEvent, (e) => {
  userService.updatePurchaseHistory(e.order);
});
```

---

## Behavioral Anti-Patterns

### Chatty Services

**Definition:** Excessive communication between components.

**Symptoms:**
- Many small API calls for single operation
- N+1 query patterns
- High network overhead
- Latency-sensitive operations

**Detection:**
```bash
# Count API calls per operation (in logs)
grep "API call" logs/*.log | cut -d: -f2 | sort | uniq -c | sort -rn

# Database query count
# Enable query logging and count per request
```

**Impact:**
- High latency
- Network congestion
- Reduced throughput
- Brittle under load

**Remediation:**
- Batch operations
- Facade pattern
- GraphQL or similar batching
- Eager loading for databases

---

### Leaky Abstractions

**Definition:** Implementation details leak through abstraction boundaries.

**Symptoms:**
- Must understand implementation to use correctly
- Abstraction provides incomplete coverage
- Error messages expose internal details
- Performance characteristics leak through

**Detection:**
- Code review for exposed implementation details
- Check error handling for internal exceptions
- Review public API for implementation-specific types

**Impact:**
- Cannot change implementation
- Users depend on internals
- Abstraction provides false security

**Remediation:**
- Strengthen abstraction boundaries
- Wrap exceptions appropriately
- Use DTOs at boundaries
- Document intended behavior, not implementation

---

### Vendor Lock-in

**Definition:** Excessive dependency on specific vendor/platform.

**Symptoms:**
- Vendor-specific APIs throughout codebase
- No abstraction over external services
- Vendor SDK deeply embedded
- Configuration tied to platform

**Detection:**
```bash
# Find vendor-specific imports
grep -r "import.*@aws-sdk" src/
grep -r "import.*firebase" src/

# Count vendor SDK usage
wc -l $(grep -rl "@aws-sdk" src/)
```

**Impact:**
- Cannot switch vendors
- Cost negotiation disadvantage
- Vendor outage = total outage
- Testing requires vendor access

**Remediation:**
```javascript
// BEFORE: Direct usage
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

async function uploadFile(file: Buffer, key: string) {
  const client = new S3Client({ region: "us-east-1" });
  await client.send(new PutObjectCommand({
    Bucket: "my-bucket",
    Key: key,
    Body: file
  }));
}

// AFTER: Abstraction
interface FileStorage {
  upload(file: Buffer, key: string): Promise<void>;
  download(key: string): Promise<Buffer>;
}

class S3Storage implements FileStorage {
  private client = new S3Client({ region: "us-east-1" });

  async upload(file: Buffer, key: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file
    }));
  }
}

// Can swap to GCS, Azure, local filesystem
class GCSStorage implements FileStorage { }
class LocalStorage implements FileStorage { }
```

---

## Data Anti-Patterns

### Shared Database Integration

**Definition:** Multiple services/applications share the same database.

**Symptoms:**
- Multiple apps connect to same DB
- Schema changes require coordinating teams
- No clear data ownership
- Direct table access instead of APIs

**Detection:**
```bash
# Database connection strings
grep -r "DATABASE_URL\|connectionString" */config/

# Table access from multiple services
# Analyze query logs for table access patterns
```

**Impact:**
- Schema changes break multiple systems
- No clear ownership
- Performance interference
- Data consistency issues

**Remediation:**
1. Define data ownership
2. Create APIs for data access
3. Migrate to separate schemas/databases
4. Use events for cross-service data needs

---

### Golden Hammer

**Definition:** Using one technology for everything regardless of fit.

**Symptoms:**
- Same framework/database/language for all problems
- "We're a {X} shop"
- Forcing technology into inappropriate use cases
- Ignoring better-suited alternatives

**Detection:**
- Technology portfolio analysis
- Comparison with industry patterns
- Team skill evaluation

**Impact:**
- Suboptimal solutions
- Technical debt accumulation
- Missing competitive advantages
- Developer frustration

**Remediation:**
- Evaluate technology per problem
- Allow polyglot where beneficial
- Build abstraction layers
- Educate team on alternatives

---

## Anti-Pattern Severity Matrix

| Anti-Pattern | Severity | Detection Ease | Fix Effort |
|--------------|----------|----------------|------------|
| God Class | High | Easy | Medium |
| Spaghetti | Critical | Easy | High |
| Big Ball of Mud | Critical | Easy | Very High |
| Distributed Monolith | High | Medium | High |
| Anemic Domain | Medium | Medium | Medium |
| Circular Dependencies | Medium | Easy | Medium |
| Chatty Services | Medium | Medium | Medium |
| Leaky Abstractions | Medium | Hard | Medium |
| Vendor Lock-in | Low-High* | Easy | High |
| Shared Database | High | Easy | High |

*Vendor lock-in severity depends on switching likelihood and vendor stability.

## Anti-Pattern Assessment Workflow

```
1. SCAN
   - Run static analysis tools
   - Generate dependency graphs
   - Calculate code metrics

2. IDENTIFY
   - Map findings to anti-patterns
   - Document specific instances
   - Note affected components

3. ASSESS IMPACT
   - Current pain points
   - Risk of continuation
   - Business impact

4. PRIORITIZE
   - Severity x Impact
   - Fix effort consideration
   - Quick wins first

5. REMEDIATE
   - Create fix plan
   - Incremental approach
   - Validate improvements
```
