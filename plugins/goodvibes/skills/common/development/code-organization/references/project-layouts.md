# Project Layouts by Framework

Complete project structure templates for common frameworks and stacks.

## Frontend Frameworks

### React (Vite/CRA)

```
project/
  src/
    assets/                    # Static assets (images, fonts)
      images/
      fonts/
    components/                # Shared/reusable components
      ui/                      # Basic UI components
        Button/
          Button.tsx
          Button.test.tsx
          Button.styles.ts
          index.ts
        Input/
        Modal/
        index.ts               # Export all UI components
      layout/                  # Layout components
        Header/
        Footer/
        Sidebar/
        index.ts
    features/                  # Feature modules
      auth/
        components/
          LoginForm/
          RegisterForm/
        hooks/
          useAuth.ts
          useLogin.ts
        api/
          auth.ts
        store/                 # Feature-specific state
          authSlice.ts
        types.ts
        index.ts               # Public API
      dashboard/
        components/
        hooks/
        api/
        index.ts
    hooks/                     # Shared custom hooks
      useFetch.ts
      useDebounce.ts
      useLocalStorage.ts
      index.ts
    services/                  # External services
      api/
        client.ts              # HTTP client setup
        interceptors.ts
      analytics.ts
      storage.ts
    stores/                    # Global state management
      index.ts
      rootReducer.ts           # Redux/Zustand
    utils/                     # Utility functions
      format/
        date.ts
        currency.ts
        number.ts
      validation/
        schemas.ts
        rules.ts
      helpers.ts
      index.ts
    types/                     # Shared TypeScript types
      api.ts
      common.ts
      index.ts
    styles/                    # Global styles
      globals.css
      variables.css
      themes/
    constants/                 # Application constants
      routes.ts
      config.ts
      api.ts
    App.tsx
    main.tsx
    vite-env.d.ts
  public/
    favicon.ico
    robots.txt
  tests/
    e2e/                       # End-to-end tests
      auth.spec.ts
    integration/               # Integration tests
    setup.ts
  .env
  .env.example
  tsconfig.json
  vite.config.ts
  package.json
```

---

### Next.js (App Router)

```
project/
  app/                         # App Router
    (auth)/                    # Route group (no URL segment)
      login/
        page.tsx
      register/
        page.tsx
      layout.tsx
    (dashboard)/
      dashboard/
        page.tsx
        loading.tsx
        error.tsx
      settings/
        page.tsx
      layout.tsx
    api/                       # API routes
      auth/
        route.ts
      users/
        [id]/
          route.ts
        route.ts
    layout.tsx                 # Root layout
    page.tsx                   # Home page
    globals.css
    not-found.tsx
  components/
    ui/                        # Shadcn/UI components
    forms/
    layout/
  lib/                         # Utility libraries
    db.ts                      # Database client
    auth.ts                    # Auth utilities
    utils.ts
  hooks/
  services/
  types/
  public/
  middleware.ts                # Edge middleware
  next.config.js
  tailwind.config.js
```

---

### Vue 3 (Vite)

```
project/
  src/
    assets/
    components/
      base/                    # Base components (prefixed)
        BaseButton.vue
        BaseInput.vue
      layout/
        TheHeader.vue          # Singleton components
        TheFooter.vue
      features/
        UserCard.vue
    composables/               # Vue composables (like hooks)
      useAuth.ts
      useFetch.ts
    views/                     # Page components
      HomeView.vue
      AboutView.vue
    router/
      index.ts
      guards.ts
    stores/                    # Pinia stores
      auth.ts
      user.ts
    services/
      api.ts
    types/
    utils/
    App.vue
    main.ts
  public/
  tests/
    unit/
    e2e/
  vite.config.ts
```

---

### Angular

```
project/
  src/
    app/
      core/                    # Singleton services, guards
        services/
          auth.service.ts
          api.service.ts
        guards/
          auth.guard.ts
        interceptors/
          http.interceptor.ts
        core.module.ts
      shared/                  # Shared components, pipes, directives
        components/
          button/
            button.component.ts
            button.component.html
            button.component.scss
        pipes/
          date-format.pipe.ts
        directives/
          highlight.directive.ts
        shared.module.ts
      features/                # Feature modules
        auth/
          components/
          services/
          auth.module.ts
          auth-routing.module.ts
        dashboard/
          components/
          services/
          dashboard.module.ts
      app.component.ts
      app.module.ts
      app-routing.module.ts
    assets/
    environments/
      environment.ts
      environment.prod.ts
    styles/
      _variables.scss
      styles.scss
    index.html
    main.ts
  angular.json
  tsconfig.json
```

---

## Backend Frameworks

### Node.js/Express

```
project/
  src/
    api/
      v1/                      # API versioning
        users/
          users.controller.ts  # Request handlers
          users.service.ts     # Business logic
          users.repository.ts  # Data access
          users.routes.ts      # Route definitions
          users.validation.ts  # Input validation
          users.types.ts
          index.ts
        products/
          ...
        index.ts               # Route aggregation
      middleware/
        auth.ts
        error.ts
        validation.ts
        logging.ts
    config/
      index.ts                 # Configuration loader
      database.ts
      redis.ts
      constants.ts
    lib/                       # Shared libraries
      logger.ts
      cache.ts
      queue.ts
    models/                    # Database models/entities
      user.model.ts
      product.model.ts
    types/
      express.d.ts             # Express type extensions
      api.ts
    utils/
      crypto.ts
      date.ts
    app.ts                     # Express app setup
    index.ts                   # Entry point
  tests/
    unit/
      services/
      utils/
    integration/
      api/
    fixtures/
    helpers/
  scripts/
    seed.ts
    migrate.ts
  prisma/                      # If using Prisma
    schema.prisma
    migrations/
  .env
  .env.example
  tsconfig.json
  package.json
```

---

### NestJS

```
project/
  src/
    modules/
      users/
        dto/
          create-user.dto.ts
          update-user.dto.ts
        entities/
          user.entity.ts
        users.controller.ts
        users.service.ts
        users.module.ts
        users.controller.spec.ts
      auth/
        strategies/
          jwt.strategy.ts
          local.strategy.ts
        guards/
          jwt-auth.guard.ts
        auth.controller.ts
        auth.service.ts
        auth.module.ts
    common/
      decorators/
        current-user.decorator.ts
      filters/
        http-exception.filter.ts
      guards/
        roles.guard.ts
      interceptors/
        logging.interceptor.ts
      pipes/
        validation.pipe.ts
    config/
      configuration.ts
      validation.ts
    app.module.ts
    main.ts
  test/
    app.e2e-spec.ts
    jest-e2e.json
  prisma/
  nest-cli.json
  tsconfig.json
```

---

### FastAPI (Python)

```
project/
  src/
    app/
      __init__.py
      main.py                  # FastAPI app entry
      api/
        __init__.py
        v1/
          __init__.py
          endpoints/
            __init__.py
            users.py
            products.py
          router.py            # Aggregate routes
        deps.py                # Dependencies (auth, db)
      core/
        __init__.py
        config.py              # Settings
        security.py            # Auth utilities
      models/
        __init__.py
        user.py
        product.py
      schemas/                 # Pydantic schemas
        __init__.py
        user.py
        product.py
      services/
        __init__.py
        user_service.py
      db/
        __init__.py
        base.py
        session.py
      utils/
        __init__.py
  tests/
    __init__.py
    conftest.py                # Pytest fixtures
    unit/
    integration/
  alembic/                     # Migrations
    versions/
    env.py
  scripts/
  .env
  .env.example
  pyproject.toml
  requirements.txt
```

---

### Django

```
project/
  config/                      # Project configuration
    __init__.py
    settings/
      __init__.py
      base.py
      development.py
      production.py
    urls.py
    wsgi.py
    asgi.py
  apps/
    users/
      __init__.py
      admin.py
      apps.py
      models.py
      views.py
      urls.py
      serializers.py           # DRF serializers
      tests/
        __init__.py
        test_models.py
        test_views.py
      migrations/
    products/
      ...
  core/                        # Shared functionality
    __init__.py
    models.py                  # Abstract base models
    permissions.py
    utils.py
  static/
  media/
  templates/
    base.html
    components/
  tests/
    conftest.py
  manage.py
  requirements/
    base.txt
    development.txt
    production.txt
```

---

## Full-Stack Monorepos

### Turborepo Structure

```
project/
  apps/
    web/                       # Next.js frontend
      src/
      package.json
    api/                       # Express backend
      src/
      package.json
    mobile/                    # React Native
      src/
      package.json
  packages/
    ui/                        # Shared components
      src/
      package.json
    config/                    # Shared config
      eslint/
      tsconfig/
      package.json
    types/                     # Shared types
      src/
      package.json
    utils/                     # Shared utilities
      src/
      package.json
  tooling/
    typescript/
    eslint/
  turbo.json
  package.json
  pnpm-workspace.yaml
```

---

### Nx Monorepo

```
project/
  apps/
    frontend/
      src/
      project.json
    backend/
      src/
      project.json
  libs/
    shared/
      ui/
        src/
        project.json
      utils/
        src/
        project.json
    feature/
      auth/
        src/
        project.json
  tools/
  nx.json
  workspace.json
  package.json
```

---

## Microservices

### Service Structure

```
services/
  user-service/
    src/
      api/
      domain/
        entities/
        repositories/
        services/
      infrastructure/
        database/
        messaging/
        external/
      application/
        commands/
        queries/
        handlers/
    tests/
    Dockerfile
    package.json
  order-service/
    ...
  gateway/
    src/
    nginx.conf
    Dockerfile
shared/
  proto/                       # gRPC definitions
  events/                      # Event schemas
docker-compose.yml
kubernetes/
  deployments/
  services/
```

---

## CLI Applications

### Node.js CLI

```
project/
  src/
    commands/
      init.ts
      build.ts
      deploy.ts
    lib/
      config.ts
      logger.ts
      prompts.ts
    utils/
    templates/                 # File templates
    types/
    index.ts                   # Entry point
    cli.ts                     # CLI setup
  bin/
    cli.js                     # Executable entry
  tests/
  package.json
```

---

## Library/Package

### NPM Package

```
package/
  src/
    core/
      index.ts
    utils/
      index.ts
    types/
      index.ts
    index.ts                   # Main entry
  tests/
  dist/                        # Build output
  examples/
  docs/
  README.md
  CHANGELOG.md
  LICENSE
  package.json
  tsconfig.json
  tsconfig.build.json
  rollup.config.js             # Or tsup.config.ts
```

---

## Key Principles

### Structure Selection Guide

| Project Type | Recommended Structure |
|-------------|----------------------|
| Small app (<10 files) | Flat, minimal nesting |
| Medium app (10-50 files) | Feature-based with shared |
| Large app (>50 files) | Feature-based with strict modules |
| Monorepo | Turborepo/Nx with packages |
| Microservices | Service-per-domain |
| Library | src/ with examples/ and docs/ |

### Universal Patterns

1. **Source code in src/**: Keep all source in dedicated directory
2. **Tests mirror src/**: Test structure matches source
3. **Config at root**: Keep config files at project root
4. **Clear entry points**: Obvious main.ts/index.ts
5. **Environment files**: .env with .env.example template
