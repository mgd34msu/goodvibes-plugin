# Architecture Pattern Detection

Reference for identifying common architectural patterns in codebases.

## Pattern Detection Matrix

### MVC (Model-View-Controller)

**Indicators:**
```
project/
├── models/          # Data and business logic
├── views/           # Templates/UI
├── controllers/     # Request handling
└── routes/          # URL mapping
```

**Framework associations:**
- Rails (Ruby)
- Laravel (PHP)
- Django (Python) - MTV variant
- Spring MVC (Java)
- Express + templates (Node.js)

**Key files:** `routes.rb`, `urls.py`, `web.php`

---

### Clean Architecture / Hexagonal

**Indicators:**
```
project/
├── domain/          # Business entities, no deps
│   ├── entities/
│   └── usecases/
├── application/     # Use case orchestration
├── infrastructure/  # External concerns
│   ├── database/
│   ├── http/
│   └── messaging/
└── interfaces/      # Adapters (API, CLI)
```

**Key signs:**
- Dependency injection heavy
- Interface-based boundaries
- Domain folder has no imports from infrastructure
- Ports and adapters terminology

---

### Feature/Module-Based

**Indicators:**
```
project/
├── features/
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   └── types/
│   ├── dashboard/
│   └── settings/
└── shared/
```

**Key signs:**
- Self-contained feature folders
- Minimal cross-feature imports
- Shared/common utilities extracted
- Often in React/Vue/Angular apps

---

### Layered Architecture

**Indicators:**
```
project/
├── api/             # HTTP handlers
├── service/         # Business logic
├── repository/      # Data access
└── entity/          # Data models
```

**Dependency flow:** `api → service → repository → entity`

**Key signs:**
- Clear layer separation
- Each layer only calls layer below
- Common in enterprise Java/.NET

---

### Microservices

**Indicators:**
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

**Key signs:**
- Multiple package.json/go.mod files
- Service-specific Dockerfiles
- API gateway present
- Inter-service communication (REST, gRPC, queues)
- Kubernetes/docker-compose orchestration

---

### Monorepo

**Indicators:**
```
project/
├── packages/
│   ├── core/
│   ├── web/
│   ├── mobile/
│   └── shared/
├── apps/
├── lerna.json       # or
├── pnpm-workspace.yaml
└── turbo.json
```

**Tools:** Lerna, Nx, Turborepo, pnpm workspaces, Yarn workspaces

**Key signs:**
- Workspace configuration files
- Shared dependencies at root
- Cross-package references
- Unified build/test scripts

---

### Serverless

**Indicators:**
```
project/
├── functions/
│   ├── createUser/
│   ├── processOrder/
│   └── sendEmail/
├── serverless.yml   # or
├── template.yaml    # SAM
└── cdk/            # AWS CDK
```

**Platforms:** AWS Lambda, Vercel, Netlify, Cloudflare Workers

**Key signs:**
- Function-per-file structure
- Event-driven handlers
- Infrastructure as code (serverless.yml, SAM, CDK)
- Cold start optimization patterns

---

### Event-Driven / CQRS

**Indicators:**
```
project/
├── commands/        # Write operations
├── queries/         # Read operations
├── events/          # Domain events
├── handlers/        # Event processors
└── projections/     # Read models
```

**Key signs:**
- Separate read/write models
- Event store or event sourcing
- Message queue integration
- Eventually consistent patterns

---

## Anti-Pattern Detection

### Circular Dependencies

**Detection:**
```bash
# Node.js
npx madge --circular src/

# Python
pydeps --show-cycles src/

# Go
go mod graph | tsort
```

**Signs:**
- Import cycles in module graph
- Barrel files (index.ts) importing everything
- Bidirectional service dependencies

---

### God Objects/Modules

**Signs:**
- Single file > 1000 lines
- Class with 20+ methods
- Module imported by > 50% of codebase
- `utils.js` that's actually core logic

---

### Distributed Monolith

**Signs in "microservices":**
- Shared database between services
- Synchronous chains of service calls
- Deploy-all-together requirement
- Shared libraries with business logic

---

## Analysis Workflow

1. **Scan structure:**
   ```bash
   find . -type d -name "node_modules" -prune -o -type d -print | head -50
   ```

2. **Check for pattern indicators:**
   - Config files (package.json, go.mod, etc.)
   - Directory naming conventions
   - Framework-specific files

3. **Analyze imports:**
   - Direction of dependencies
   - Circular references
   - External vs internal

4. **Map boundaries:**
   - Where are the clear separations?
   - What crosses boundaries?
   - What should be extracted?

5. **Document findings:**
   - Pattern identified
   - Deviations from pattern
   - Recommendations
