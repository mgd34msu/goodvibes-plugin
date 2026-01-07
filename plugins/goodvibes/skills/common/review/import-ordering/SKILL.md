---
name: import-ordering
description: Fixes import statement ordering and organization issues. Use when encountering import-x/order errors or when imports are disorganized. Auto-fixable with ESLint.
---

# Import Ordering Fixes

Fixes for import statement organization. Consistent import ordering makes files scannable and dependency analysis easier.

## Quick Start

**Auto-fix all import ordering issues:**

```bash
npx eslint --fix --rule 'import-x/order: error' src/
```

Or fix all files:

```bash
npx eslint --fix src/
```

## Priority

**P2 - Fix this sprint.** Auto-fixable, improves code consistency.

---

## Preferred Import Order

1. **Node.js builtins** (`fs`, `path`, `crypto`)
2. **External packages** (`lodash`, `react`, `zod`)
3. **Internal aliases** (`@/utils`, `@/types`, `@/config`)
4. **Relative imports** (`./local`, `../parent`)
5. **Type-only imports** (last within each group)

### Example

```typescript
// 1. Node.js builtins
import fs from 'node:fs';
import path from 'node:path';

// 2. External packages
import lodash from 'lodash';
import { z } from 'zod';

// 3. Internal aliases
import { config } from '@/config';
import { logger } from '@/utils/logger';

// 4. Relative imports
import { helper } from './helper';
import { utils } from '../shared/utils';

// 5. Type-only imports
import type { Config } from '@/types';
import type { LocalType } from './types';
```

---

## ESLint Configuration

### Recommended Rule Config

```typescript
// eslint.config.js
import importPlugin from 'eslint-plugin-import-x';

export default [
  {
    plugins: {
      'import-x': importPlugin,
    },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',     // Node.js built-in modules
            'external',    // npm packages
            'internal',    // Aliased paths (@/)
            'parent',      // Parent imports (../)
            'sibling',     // Sibling imports (./)
            'index',       // Index imports (./)
            'type',        // Type imports
          ],
          pathGroups: [
            {
              pattern: '@/**',
              group: 'internal',
              position: 'before',
            },
          ],
          pathGroupsExcludedImportTypes: ['type'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
    },
  },
];
```

### Path Aliases Setup

Ensure your `tsconfig.json` has path aliases:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

---

## Common Issues

### Issue #13: import-x/order (14 occurrences)

**Pattern**: Imports not following group/alphabetical order.

```typescript
// PROBLEM - wrong order
import { helper } from './helper';
import fs from 'fs';
import { config } from '@/config';
import lodash from 'lodash';
```

**Fix**: Auto-fix or manual reorder.

```typescript
// SOLUTION
import fs from 'node:fs';

import lodash from 'lodash';

import { config } from '@/config';

import { helper } from './helper';
```

---

## Scripts

### Check Import Order

```bash
node scripts/check-imports.js /path/to/src
```

### Fix Import Order

```bash
node scripts/fix-imports.js /path/to/file.ts
```

---

## IDE Integration

### VS Code Settings

Add to `.vscode/settings.json`:

```json
{
  "editor.codeActionsOnSave": {
    "source.organizeImports": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "javascript.preferences.importModuleSpecifier": "non-relative"
}
```

### WebStorm/IntelliJ

1. Settings > Editor > Code Style > TypeScript
2. Imports tab
3. Configure "Sort imports by groups"

---

## Best Practices

### Use Node Protocol

```typescript
// GOOD - explicit Node.js module
import fs from 'node:fs';
import path from 'node:path';

// AVOID - ambiguous
import fs from 'fs';
```

### Separate Type Imports

```typescript
// GOOD - type imports separated
import { UserService } from './user-service';
import type { User, UserRole } from './types';

// AVOID - mixed
import { UserService, User, UserRole } from './user-service';
```

### Avoid Deep Relative Imports

```typescript
// AVOID - hard to read and maintain
import { config } from '../../../config/settings';

// GOOD - use path alias
import { config } from '@/config/settings';
```

### Barrel File Imports

```typescript
// GOOD - import from barrel
import { User, Order, Product } from '@/models';

// AVOID - importing from individual files
import { User } from '@/models/user';
import { Order } from '@/models/order';
import { Product } from '@/models/product';
```

---

## Troubleshooting

### ESLint Not Fixing Imports

1. Ensure `eslint-plugin-import-x` is installed
2. Check plugin is configured in flat config
3. Run with `--fix` flag

### Path Aliases Not Recognized

1. Verify `tsconfig.json` paths
2. Add `eslint-import-resolver-typescript` if using TypeScript
3. Configure resolver in ESLint:

```typescript
{
  settings: {
    'import-x/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
    },
  },
}
```

### Conflicting with Prettier

Use `eslint-config-prettier` to disable conflicting rules:

```bash
npm install --save-dev eslint-config-prettier
```

```typescript
import prettierConfig from 'eslint-config-prettier';

export default [
  // ... other configs
  prettierConfig,
];
```
