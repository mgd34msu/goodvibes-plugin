# Naming Conventions Guide

Comprehensive naming conventions for files, directories, and code elements.

## File Naming

### By Language/Framework

| Context | Convention | Examples |
|---------|------------|----------|
| **React Components** | PascalCase | `UserProfile.tsx`, `Button.tsx` |
| **React Hooks** | camelCase + `use` prefix | `useAuth.ts`, `useFetch.ts` |
| **TypeScript Types** | PascalCase | `User.types.ts`, `ApiTypes.ts` |
| **JavaScript/TypeScript** | camelCase | `userService.ts`, `apiClient.ts` |
| **Python** | snake_case | `user_service.py`, `api_client.py` |
| **Go** | snake_case | `user_service.go`, `api_client.go` |
| **CSS/SCSS** | kebab-case | `button-styles.css`, `user-profile.scss` |
| **Test Files** | Source name + `.test`/`.spec` | `Button.test.tsx`, `userService.spec.ts` |
| **Story Files** | Source name + `.stories` | `Button.stories.tsx` |
| **Config Files** | lowercase, dotted | `tsconfig.json`, `.eslintrc.js` |

### Component File Patterns

```
// Single component per file
Button.tsx                    # Component
Button.test.tsx               # Tests
Button.styles.ts              # Styled-components
Button.module.css             # CSS modules
Button.stories.tsx            # Storybook

// Component with related files
UserProfile/
  UserProfile.tsx
  UserProfile.test.tsx
  UserProfile.styles.ts
  useUserProfile.ts           # Related hook
  index.ts                    # Export
```

### Special File Names

| File | Purpose |
|------|---------|
| `index.ts` | Module entry point, barrel exports |
| `types.ts` | Type definitions for module |
| `constants.ts` | Module constants |
| `utils.ts` | Module utilities |
| `helpers.ts` | Helper functions |
| `schema.ts` | Validation schemas |
| `config.ts` | Configuration |

---

## Directory Naming

### General Rules

| Rule | Example |
|------|---------|
| **Use kebab-case** | `user-profile/`, `shopping-cart/` |
| **Plural for collections** | `components/`, `hooks/`, `utils/` |
| **Singular for features** | `auth/`, `checkout/`, `dashboard/` |
| **Lowercase always** | `api/` not `API/` |
| **No special characters** | No spaces, underscores (except Python) |

### Framework-Specific

```
// React/Next.js
components/                   # Plural
  user-profile/               # kebab-case
hooks/
features/
  auth/                       # Singular feature name

// Python
components/                   # Plural
  user_profile/               # snake_case
services/
features/
  auth/

// Go
cmd/
internal/
  userprofile/                # No separator (Go convention)
pkg/
```

### Route-Based Directories

```
// Next.js App Router
app/
  (marketing)/                # Route group (parentheses)
    about/
    contact/
  (dashboard)/
    dashboard/
    settings/
  api/
    users/
      [id]/                   # Dynamic route (brackets)
```

---

## Naming Patterns by Type

### Components

```typescript
// UI Components: Noun describing element
Button.tsx
Modal.tsx
Dropdown.tsx
TextField.tsx
Card.tsx

// Container/Smart Components: Feature + noun
UserProfileCard.tsx
OrderSummaryPanel.tsx
ProductListGrid.tsx

// Layout Components: Position/structure word
Header.tsx
Sidebar.tsx
Footer.tsx
MainLayout.tsx
PageContainer.tsx

// HOCs: with + feature
withAuth.tsx
withLoading.tsx
withErrorBoundary.tsx

// Providers: Feature + Provider
AuthProvider.tsx
ThemeProvider.tsx
CartProvider.tsx
```

### Hooks

```typescript
// State hooks: use + noun
useUser()
useCart()
useAuth()

// Action hooks: use + verb
useFetch()
useSubmit()
useNavigate()

// Lifecycle hooks: use + lifecycle
useMount()
useUnmount()
useUpdateEffect()

// Feature hooks: use + feature
useUserProfile()
useShoppingCart()
useCheckout()

// Utility hooks: use + utility
useDebounce()
useThrottle()
useLocalStorage()
useMediaQuery()
```

### Services

```typescript
// Pattern: domain + Service
userService.ts
authService.ts
paymentService.ts
notificationService.ts

// API clients: domain + Api or + Client
userApi.ts
ordersApi.ts
httpClient.ts
apiClient.ts

// Repositories: domain + Repository
userRepository.ts
productRepository.ts
orderRepository.ts
```

### Types and Interfaces

```typescript
// Types: PascalCase, noun
type User = { ... }
type Product = { ... }
type OrderStatus = 'pending' | 'completed'

// Interfaces: PascalCase, I prefix (optional)
interface UserProfile { ... }
interface IUserService { ... }    // Some prefer I prefix

// Props: Component + Props
interface ButtonProps { ... }
interface UserCardProps { ... }

// State: Feature + State
interface AuthState { ... }
interface CartState { ... }

// API Types: Domain + Request/Response
interface CreateUserRequest { ... }
interface UserResponse { ... }
interface PaginatedResponse<T> { ... }

// Enums: PascalCase, singular
enum UserRole { Admin, User, Guest }
enum OrderStatus { Pending, Processing, Completed }
```

### Constants

```typescript
// File naming
constants.ts                  // General module constants
apiEndpoints.ts               // API-specific constants
config.ts                     // Configuration values

// Inside files: SCREAMING_SNAKE_CASE
export const MAX_RETRIES = 3;
export const API_BASE_URL = '/api/v1';
export const DEFAULT_PAGE_SIZE = 20;

// Object constants: PascalCase or SCREAMING_SNAKE_CASE
export const HttpStatus = {
  OK: 200,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
} as const;

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
} as const;
```

### Utilities and Helpers

```typescript
// Naming: verb + noun (what it does)
formatDate.ts
parseQueryString.ts
validateEmail.ts
calculateTotal.ts
generateId.ts

// Pure utility collections
stringUtils.ts     // or strings.ts
dateUtils.ts       // or dates.ts
arrayUtils.ts      // or arrays.ts

// Inside files: camelCase functions
export function formatDate(date: Date): string { ... }
export function parseQueryString(query: string): object { ... }
```

---

## Anti-Patterns to Avoid

### Generic Names

```typescript
// BAD: Too generic
utils.ts
helpers.ts
misc.ts
stuff.ts
common.ts
data.ts
index.ts (when not barrel file)

// GOOD: Specific purpose
dateFormatters.ts
validationHelpers.ts
apiUtils.ts
userDataTransformers.ts
```

### Numbered Files

```typescript
// BAD: Numbers are meaningless
component1.tsx
handler2.ts
util3.js

// GOOD: Descriptive names
UserProfileCard.tsx
OrderSubmitHandler.ts
dateFormatUtils.js
```

### Inconsistent Casing

```typescript
// BAD: Mixed conventions
userProfile.tsx       // camelCase
user_settings.tsx     // snake_case
UserData.tsx          // PascalCase (but not component)
USER-AVATAR.tsx       // SCREAMING-KEBAB

// GOOD: Consistent per type
UserProfile.tsx       // Component: PascalCase
useUserSettings.ts    // Hook: camelCase
userDataUtils.ts      // Utility: camelCase
```

### Unclear Abbreviations

```typescript
// BAD: Cryptic abbreviations
usr.ts
auth_mgr.ts
btn.tsx
cfg.ts
util.ts

// GOOD: Clear or standard abbreviations
user.ts
authManager.ts
Button.tsx
config.ts
utilities.ts

// Acceptable abbreviations
api, url, id, db, io, ui
http, https, html, css, json
auth, config, utils (well-known)
```

### Hungarian Notation (in most cases)

```typescript
// BAD: Type in name (JavaScript/TypeScript)
strName
arrUsers
boolIsActive
objConfig

// GOOD: Descriptive without type
name
users
isActive
config

// Exception: Interfaces (some teams prefer)
interface IUserService { }  // OK if team convention
interface UserService { }   // Also OK
```

---

## Naming by Domain

### E-commerce

```
features/
  products/
    ProductCard.tsx
    ProductList.tsx
    useProducts.ts
    productApi.ts

  cart/
    CartItem.tsx
    CartSummary.tsx
    useCart.ts
    cartService.ts

  checkout/
    CheckoutForm.tsx
    PaymentStep.tsx
    ShippingStep.tsx
    useCheckout.ts
```

### Authentication

```
features/
  auth/
    LoginForm.tsx
    RegisterForm.tsx
    ForgotPasswordForm.tsx
    useAuth.ts
    useSession.ts
    authService.ts
    authGuard.ts
```

### Dashboard/Admin

```
features/
  dashboard/
    DashboardLayout.tsx
    MetricsCard.tsx
    RecentActivityFeed.tsx
    useDashboardData.ts

  admin/
    AdminPanel.tsx
    UserManagement.tsx
    SettingsForm.tsx
    useAdminActions.ts
```

---

## Python-Specific Conventions

### PEP 8 Naming

```python
# Modules: lowercase with underscores
user_service.py
api_client.py
database_utils.py

# Classes: CapWords (PascalCase)
class UserService:
class ApiClient:
class DatabaseConnection:

# Functions/Methods: lowercase with underscores
def get_user_by_id(user_id):
def calculate_total_price(items):

# Constants: UPPERCASE with underscores
MAX_CONNECTIONS = 10
DEFAULT_TIMEOUT = 30
API_BASE_URL = "https://api.example.com"

# Private: single underscore prefix
def _internal_helper():
class _PrivateClass:

# Name mangling: double underscore prefix
def __really_private():
```

### Package Structure

```python
project/
  src/
    my_package/
      __init__.py
      user_service.py
      api/
        __init__.py
        routes.py
        handlers.py
      models/
        __init__.py
        user.py
        product.py
```

---

## Go-Specific Conventions

### Go Naming

```go
// Packages: short, lowercase, no underscores
package user
package httputil
package stringconv

// Files: lowercase, can use underscores for tests
user.go
user_test.go
http_client.go

// Exported (public): PascalCase
func GetUser(id string) User
type UserService struct {}

// Unexported (private): camelCase
func getUserFromDB(id string) user
type userCache struct {}

// Acronyms: maintain case
func GetHTTPClient()      // Not GetHttpClient
type URLParser struct {}  // Not UrlParser
```

---

## Naming Checklist

```markdown
## General
- [ ] Descriptive and meaningful
- [ ] Consistent with project conventions
- [ ] Matches language/framework idioms
- [ ] No cryptic abbreviations

## Files
- [ ] Component files: PascalCase
- [ ] Hook files: camelCase with use prefix
- [ ] Utility files: camelCase
- [ ] Test files: match source + .test/.spec
- [ ] Config files: lowercase, dotted

## Directories
- [ ] kebab-case (JS/TS) or snake_case (Python)
- [ ] Plural for collections (components/, utils/)
- [ ] Singular for features (auth/, checkout/)

## Code Elements
- [ ] Types/Interfaces: PascalCase
- [ ] Constants: SCREAMING_SNAKE_CASE
- [ ] Functions: camelCase (JS) or snake_case (Python)
- [ ] Private members: underscore prefix where appropriate
```
