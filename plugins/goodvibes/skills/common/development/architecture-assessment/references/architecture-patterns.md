# Architecture Patterns Reference

Comprehensive catalog of architectural patterns with detection criteria, evaluation rubrics, and implementation guidance.

## Layered Patterns

### MVC (Model-View-Controller)

**Purpose:** Separate data, presentation, and control flow.

**Detection Indicators:**
```
project/
├── models/           # Data and business logic
│   ├── User.js
│   └── Order.js
├── views/            # Templates/UI
│   ├── users/
│   └── orders/
├── controllers/      # Request handling
│   ├── UserController.js
│   └── OrderController.js
└── routes/           # URL mapping
```

**Framework Associations:**
- Ruby on Rails
- Laravel (PHP)
- Django (MTV variant)
- Spring MVC (Java)
- ASP.NET MVC

**Evaluation Criteria:**

| Criterion | Good | Warning | Bad |
|-----------|------|---------|-----|
| Controller size | <100 lines | 100-300 lines | >300 lines |
| Model behavior | Has business logic | Mixed | Only data |
| View complexity | Simple templates | Some logic | Heavy logic |
| Dependencies | V->C->M | Some violations | Circular |

**Common Violations:**
- Fat controllers with business logic
- Models that know about views
- Business logic in views
- Direct model access from views

---

### MVP (Model-View-Presenter)

**Purpose:** Testable UI with passive views.

**Detection Indicators:**
```
project/
├── models/
├── views/            # Passive, implements interface
│   └── UserView.tsx
├── presenters/       # Presentation logic
│   └── UserPresenter.ts
└── contracts/        # View interfaces
    └── IUserView.ts
```

**Key Differences from MVC:**
- View is passive (no logic)
- Presenter holds presentation logic
- View implements interface for testability

**Evaluation Criteria:**
- View has no conditional logic
- Presenter is fully unit testable
- Clean interface contracts

---

### MVVM (Model-View-ViewModel)

**Purpose:** Declarative data binding for UI.

**Detection Indicators:**
```
project/
├── models/
├── views/
│   └── UserList.vue   # Declarative binding
└── viewmodels/
    └── UserListVM.ts  # Observable state
```

**Framework Associations:**
- Vue.js (native pattern)
- Angular
- Knockout.js
- WPF/XAML

**Evaluation Criteria:**

| Criterion | Good | Warning | Bad |
|-----------|------|---------|-----|
| Binding | Declarative | Some imperative | All imperative |
| ViewModel testing | Fully testable | Requires mocking | Hard to test |
| View logic | None | Minimal | Significant |

---

## Clean Architecture Patterns

### Clean Architecture (Uncle Bob)

**Purpose:** Dependency inversion with business logic at center.

**Detection Indicators:**
```
project/
├── domain/               # Enterprise business rules
│   ├── entities/         # Business objects
│   │   └── Order.ts
│   └── value-objects/
│       └── Money.ts
├── application/          # Application business rules
│   ├── use-cases/
│   │   └── CreateOrder.ts
│   └── interfaces/       # Ports
│       └── OrderRepository.ts
├── infrastructure/       # External concerns
│   ├── database/
│   │   └── PostgresOrderRepository.ts
│   └── http/
│       └── OrderController.ts
└── interfaces/           # Adapters
    └── api/
```

**Dependency Rule:**
- Dependencies point inward only
- Domain has NO external dependencies
- Application depends only on domain
- Infrastructure depends on application

**Evaluation Rubric:**

| Layer | Should Contain | Should NOT Contain |
|-------|----------------|-------------------|
| Domain | Business entities, value objects | Database, HTTP, UI |
| Application | Use cases, DTOs, ports | Infrastructure specifics |
| Infrastructure | Adapters, implementations | Business logic |

**Detection Commands:**
```bash
# Check domain has no infrastructure imports
grep -r "import.*infrastructure" src/domain/
# Should return empty

# Check dependency direction
npx dependency-cruiser --validate src/
```

---

### Hexagonal Architecture (Ports & Adapters)

**Purpose:** Application core isolated from external concerns.

**Detection Indicators:**
```
project/
├── core/
│   ├── domain/
│   └── ports/            # Interfaces
│       ├── inbound/      # Driving ports
│       │   └── OrderService.ts
│       └── outbound/     # Driven ports
│           └── OrderRepository.ts
└── adapters/
    ├── inbound/          # Driving adapters
    │   ├── rest/
    │   └── grpc/
    └── outbound/         # Driven adapters
        ├── postgres/
        └── redis/
```

**Port Types:**
- **Inbound (Driving):** How outside triggers application
- **Outbound (Driven):** What application needs from outside

**Evaluation Criteria:**
- Core has zero framework dependencies
- Ports are interfaces, not implementations
- Adapters are pluggable
- Tests can use test adapters

---

### Onion Architecture

**Purpose:** Similar to Clean, emphasis on domain-centric design.

**Detection Indicators:**
```
project/
├── Domain.Core/          # Innermost
│   ├── Entities/
│   └── Interfaces/
├── Domain.Services/      # Domain services
├── Infrastructure/       # Outermost
└── UI/
```

**Layer Rules:**
- Inner layers define interfaces
- Outer layers implement them
- Domain is completely independent

---

## Modular Patterns

### Feature-Based (Vertical Slices)

**Purpose:** Organize by feature, not layer.

**Detection Indicators:**
```
project/
├── features/
│   ├── authentication/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   ├── store/
│   │   └── types.ts
│   ├── dashboard/
│   └── settings/
└── shared/
    ├── components/
    ├── hooks/
    └── utils/
```

**Evaluation Criteria:**

| Criterion | Good | Warning | Bad |
|-----------|------|---------|-----|
| Feature isolation | Self-contained | Some shared state | Heavily coupled |
| Cross-feature imports | Via shared only | Occasional direct | Many direct |
| Feature size | 5-15 files | 15-30 files | >30 files |

**Benefits:**
- Changes localized to feature
- Easy to understand scope
- Can be extracted to microservice

---

### Modular Monolith

**Purpose:** Monolith with strong module boundaries.

**Detection Indicators:**
```
project/
├── modules/
│   ├── catalog/
│   │   ├── internal/     # Private implementation
│   │   └── api/          # Public interface
│   ├── ordering/
│   └── shipping/
├── shared-kernel/        # Shared domain concepts
└── infrastructure/
```

**Key Characteristics:**
- Modules communicate via defined APIs
- Shared database, but schema ownership per module
- Can evolve to microservices

**Evaluation Criteria:**
- Module APIs are explicit
- No reaching into other module's internals
- Database tables owned by single module

---

## Distributed Patterns

### Microservices

**Purpose:** Independent, deployable services.

**Detection Indicators:**
```
project/
├── services/
│   ├── user-service/
│   │   ├── src/
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── order-service/
│   └── payment-service/
├── api-gateway/
├── docker-compose.yml
└── kubernetes/
```

**Evaluation Rubric:**

| Criterion | Good | Warning | Bad |
|-----------|------|---------|-----|
| Independence | Deploy separately | Grouped deploys | Deploy all together |
| Data ownership | Own database | Some shared tables | Shared database |
| Communication | Async preferred | Mixed | All synchronous |
| Size | 1-2 week to rewrite | 1-2 months | Larger |

**Anti-Pattern Detection (Distributed Monolith):**
```bash
# Check for shared database connections
grep -r "DATABASE_URL" services/ | sort | uniq -c
# Each service should have unique connection

# Check for synchronous chains
# Look for HTTP calls between services
grep -r "fetch\|axios\|http" services/*/src/
```

---

### Event-Driven Architecture

**Purpose:** Loose coupling via asynchronous events.

**Detection Indicators:**
```
project/
├── events/
│   ├── OrderCreated.ts
│   └── PaymentReceived.ts
├── handlers/
│   ├── order/
│   └── payment/
├── publishers/
└── subscribers/
```

**Evaluation Criteria:**

| Criterion | Good | Warning | Bad |
|-----------|------|---------|-----|
| Event design | Immutable, past tense | Mutable | Commands disguised |
| Idempotency | All handlers | Most | Few |
| Event versioning | Schema evolution | Breaking changes | None |
| Observability | Full tracing | Partial | None |

---

### CQRS (Command Query Responsibility Segregation)

**Purpose:** Separate read and write models.

**Detection Indicators:**
```
project/
├── commands/
│   ├── CreateOrder.ts
│   └── handlers/
│       └── CreateOrderHandler.ts
├── queries/
│   ├── GetOrderById.ts
│   └── handlers/
│       └── GetOrderByIdHandler.ts
├── read-models/
│   └── OrderSummary.ts
└── projections/
```

**When Appropriate:**
- Read/write patterns differ significantly
- Complex domain with many reads
- Need to scale reads independently
- Event sourcing in use

**Evaluation Criteria:**
- Commands don't return data (except ID)
- Queries don't modify state
- Read models optimized for queries
- Eventual consistency handled properly

---

## Pattern Selection Guide

| Situation | Recommended Pattern |
|-----------|-------------------|
| Simple CRUD app | MVC/Layered |
| Complex domain logic | Clean/Hexagonal |
| UI-heavy application | MVVM/MVP |
| Large team, single codebase | Feature-based/Modular Monolith |
| Scale specific functions | Microservices |
| High read/write ratio | CQRS |
| Complex integrations | Event-Driven |
| Startup/MVP | Simple MVC, evolve later |

## Pattern Evaluation Workflow

```
1. IDENTIFY
   - Scan directory structure
   - Check for pattern-specific files
   - Review import/dependency graphs

2. VERIFY
   - Check dependency directions
   - Validate layer boundaries
   - Look for violations

3. ASSESS
   - Rate adherence (1-5)
   - Document deviations
   - Identify technical debt

4. RECOMMEND
   - Fix critical violations
   - Plan gradual improvements
   - Consider pattern evolution
```

## Pattern Evolution Paths

```
Monolith MVC
     |
     v
Modular Monolith -----> Microservices
     |                       |
     v                       v
Clean Architecture     Event-Driven + CQRS
```

**Evolution Triggers:**
- Team size growth
- Scaling requirements
- Domain complexity increase
- Independent deployment needs
