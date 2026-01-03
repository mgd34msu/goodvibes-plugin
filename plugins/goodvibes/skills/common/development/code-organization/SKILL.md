---
name: code-organization
description: Provides patterns for file structure, module boundaries, naming conventions, directory organization, and import/export patterns. Use when organizing code, creating new projects, restructuring codebases, establishing module boundaries, or reviewing project architecture.
---

# Code Organization

Systematic patterns for organizing code into maintainable, scalable structures.

## Quick Start

**Analyze project structure:**
```
Review this project's file organization and suggest improvements
```

**Set up new project:**
```
Help me organize a new React/Node/Python project with proper structure
```

**Identify module boundaries:**
```
Analyze this codebase and identify where module boundaries should be
```

## Capabilities

### 1. File Structure Patterns

Standard layouts by framework type.

#### React/Frontend Projects

```
project/
  src/
    components/           # Reusable UI components
      Button/
        Button.tsx
        Button.test.tsx
        Button.styles.ts
        index.ts
    features/             # Feature-based modules
      auth/
        components/
        hooks/
        api/
        types.ts
        index.ts
    hooks/                # Shared custom hooks
    utils/                # Utility functions
    services/             # API/external services
    stores/               # State management
    types/                # Shared TypeScript types
    App.tsx
    main.tsx
  tests/
```

#### Node.js/Backend Projects

```
project/
  src/
    api/
      v1/
        users/
          controller.ts
          service.ts
          repository.ts
          routes.ts
    config/
    middleware/
    models/
    services/
    utils/
    index.ts
  tests/
```

#### Python Projects

```
project/
  src/
    package_name/
      __init__.py
      api/
      core/
      models/
      services/
      utils/
      config.py
  tests/
```

See [references/project-layouts.md](references/project-layouts.md) for complete layouts.

---

### 2. Module Boundaries

#### Signs of Good Boundaries

| Indicator | Description |
|-----------|-------------|
| **Single Responsibility** | Module has one clear purpose |
| **Cohesion** | Internal components relate closely |
| **Minimal Interface** | Few, well-defined exports |
| **Loose Coupling** | Changes don't cascade across modules |

#### Signs of Poor Boundaries

| Smell | Fix |
|-------|-----|
| **Circular Dependencies** | Extract shared code to third module |
| **Feature Envy** | Move related code together |
| **Shotgun Surgery** | Consolidate related functionality |
| **God Module** | Split by responsibility |

#### Creating Module Boundaries

```typescript
// BEFORE: No clear boundaries
src/
  components/
    UserProfile.tsx      // Mixes auth, user data, UI
    LoginForm.tsx
  api/
    users.ts
    auth.ts

// AFTER: Clear domain boundaries
src/
  features/
    auth/
      components/
      hooks/
      api/
      types.ts
      index.ts          # Public API
    users/
      components/
      hooks/
      api/
      types.ts
      index.ts          # Public API
```

See [references/module-patterns.md](references/module-patterns.md) for complete patterns.

---

### 3. Naming Conventions

| Type | Convention | Examples |
|------|------------|----------|
| **React Components** | PascalCase | `UserProfile.tsx`, `Button.tsx` |
| **Hooks** | camelCase + `use` | `useAuth.ts`, `useFetch.ts` |
| **Utilities** | camelCase | `formatDate.ts`, `validators.ts` |
| **Tests** | Source + `.test`/`.spec` | `UserProfile.test.tsx` |
| **Python modules** | snake_case | `user_service.py` |
| **Directories** | kebab-case | `user-profile/` |

#### Avoid These Patterns

```
// BAD: Generic names
utils.ts, helpers.ts, misc.ts

// BAD: Numbered files
component1.tsx, handler2.ts

// BAD: Inconsistent casing
userProfile.tsx, user_settings.tsx

// BAD: Unclear abbreviations
usr.ts, auth_mgr.ts, btn.tsx
```

See [references/naming-conventions.md](references/naming-conventions.md) for complete guide.

---

### 4. Directory Organization

#### When to Create Subdirectories

| Trigger | Action |
|---------|--------|
| **>5-7 files** | Group by function or domain |
| **Related tests** | Co-locate or mirror structure |
| **Multiple file types** | Group by component |

#### Co-location Pattern

```typescript
// Component co-location
UserProfile/
  UserProfile.tsx
  UserProfile.test.tsx
  UserProfile.styles.ts
  useUserProfile.ts
  index.ts

// Feature co-location
features/
  checkout/
    components/
    hooks/
    api/
    types.ts
    index.ts
```

#### Layer-based vs Feature-based

```typescript
// LAYER-BASED: Small apps, simple domains
src/
  components/
  services/
  models/
  utils/

// FEATURE-BASED: Large apps, complex domains
src/
  features/
    users/
    products/
    orders/
  shared/
    components/
    utils/
```

---

### 5. Import/Export Patterns

#### Barrel Exports (index.ts)

```typescript
// components/Button/index.ts
export { Button } from './Button';
export type { ButtonProps } from './Button';

// Usage: Clean imports
import { Button } from '@/components/Button';
```

#### Feature Module API

```typescript
// features/auth/index.ts - PUBLIC API
export { LoginForm } from './components/LoginForm';
export { useAuth } from './hooks/useAuth';
export type { User, AuthState } from './types';

// Internal components NOT exported
```

#### Path Aliases

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"],
      "@features/*": ["src/features/*"]
    }
  }
}
```

See [references/import-export-patterns.md](references/import-export-patterns.md) for complete patterns.

---

### 6. Separation of Concerns

| Code Type | Location | Purpose |
|-----------|----------|---------|
| **Components** | `components/` | UI presentation |
| **Hooks** | `hooks/` | Reusable stateful logic |
| **Services** | `services/` | External API interactions |
| **Utils** | `utils/` | Pure functions, helpers |
| **Types** | `types/` | TypeScript definitions |

#### Utils vs Helpers vs Services

```typescript
// UTILS: Pure functions, no side effects
utils/
  formatDate.ts
  validators.ts

// HELPERS: May have side effects
helpers/
  localStorage.ts
  dom.ts

// SERVICES: External interactions, async
services/
  api.ts
  analytics.ts
```

---

## Decision Framework

```
1. PROJECT SIZE
   Small (<10 files)     -> Flat structure
   Medium (10-50 files)  -> Simple grouping
   Large (>50 files)     -> Feature-based

2. TEAM SIZE
   Solo/Pair             -> Flexible structure
   Small team (3-5)      -> Consistent conventions
   Large team (>5)       -> Strict boundaries

3. DOMAIN COMPLEXITY
   Simple                -> Layer-based
   Complex               -> Feature-based

4. SCALING EXPECTATIONS
   Stable                -> Current needs only
   Growing               -> Plan for modularity
```

### Refactoring Triggers

| Trigger | Action |
|---------|--------|
| Adding feature takes too long | Extract modules |
| Merge conflicts on same files | Split by responsibility |
| Hard to find files | Improve naming |
| Circular dependencies | Restructure hierarchy |
| God files (>500 lines) | Split by concern |
| Import paths too deep | Add barrel exports |

---

## Organization Checklist

```markdown
## Project Setup
- [ ] Clear root structure (src/, tests/, scripts/)
- [ ] Consistent file naming convention
- [ ] Path aliases configured
- [ ] Index files for clean imports

## Module Organization
- [ ] Features grouped by domain
- [ ] Shared code extracted
- [ ] Clear public APIs (index.ts)
- [ ] No circular dependencies

## File Organization
- [ ] Co-located related files
- [ ] Appropriate nesting depth
- [ ] Consistent naming patterns

## Imports
- [ ] Barrel exports for features
- [ ] Path aliases for common paths
- [ ] Absolute imports preferred
- [ ] No deep relative imports
```

---

## Reference Files

- [references/project-layouts.md](references/project-layouts.md) - Complete layouts by framework
- [references/module-patterns.md](references/module-patterns.md) - Module boundary patterns
- [references/naming-conventions.md](references/naming-conventions.md) - Complete naming guide
- [references/import-export-patterns.md](references/import-export-patterns.md) - Import/export patterns
