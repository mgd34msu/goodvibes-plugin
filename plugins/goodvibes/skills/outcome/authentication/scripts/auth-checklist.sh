#!/usr/bin/env bash
# Requires: bash 4+ (uses arrays, [[ ]])

# auth-checklist.sh
# Validates authentication implementation completeness and security

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Usage
if [[ $# -lt 1 ]]; then
  printf 'Usage: %s <project-root>\n' "$0"
  printf '\n'
  printf 'Arguments:\n'
  printf '  project-root   Path to project directory\n'
  printf '\n'
  printf 'Example:\n'
  printf '  %s /home/user/my-app\n' "$0"
  exit 1
fi

PROJECT_ROOT="$1"

# Validate project root exists
if [[ ! -d "$PROJECT_ROOT" ]]; then
  printf '%sERROR: Project root not found: %s%s\n' "$RED" "$PROJECT_ROOT" "$NC"
  exit 1
fi

# Change to project directory
cd -- "$PROJECT_ROOT"

# Initialize tracking
VIOLATIONS=()
PASS=true

printf 'Validating authentication implementation...\n'
printf '\n'

# Check 1: Auth middleware exists
printf '[CHECK 1] Verifying auth middleware exists...\n'
MIDDLEWARE_FOUND=false

if [[ -f "middleware.ts" ]] || [[ -f "middleware.js" ]]; then
  MIDDLEWARE_FOUND=true
elif [[ -f "src/middleware.ts" ]] || [[ -f "src/middleware.js" ]]; then
  MIDDLEWARE_FOUND=true
# Pipeline pattern: find returns matches, grep -q checks if any exist (safe with pipefail)
elif find . -type f \( -name "auth.middleware.ts" -o -name "auth.middleware.js" \) | grep -q .; then
  MIDDLEWARE_FOUND=true
fi

if [[ "$MIDDLEWARE_FOUND" == true ]]; then
  printf '  %sPASS%s Auth middleware found\n' "$GREEN" "$NC"
  printf '[PASS] Auth middleware exists\n'
else
  VIOLATIONS+=("No auth middleware found (middleware.ts, src/middleware.ts, or auth.middleware.ts)")
  PASS=false
  printf '  %sFAIL%s Auth middleware not found\n' "$RED" "$NC"
  printf '[FAIL] Auth middleware not found\n'
fi
printf '\n'

# Check 2: Protected routes configured
printf '[CHECK 2] Verifying protected routes configured...\n'
PROTECTED_ROUTES_FOUND=false

if grep -rq --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
  -e "requireAuth" -e "withAuth" -e "protectedRoute" -e "isAuthenticated" -e "authMiddleware" -e "authenticate" .; then
  PROTECTED_ROUTES_FOUND=true
fi

if [[ "$PROTECTED_ROUTES_FOUND" == true ]]; then
  printf '  %sPASS%s Protected route patterns found\n' "$GREEN" "$NC"
  printf '[PASS] Protected routes configured\n'
else
  VIOLATIONS+=("No protected route patterns found (requireAuth, withAuth, etc.)")
  PASS=false
  printf '  %sFAIL%s Protected route patterns not found\n' "$RED" "$NC"
  printf '[FAIL] Protected routes not configured\n'
fi
printf '\n'

# Check 3: No hardcoded secrets in source code
printf '[CHECK 3] Scanning for hardcoded secrets...\n'
SECRETS_FOUND=false

# Common secret patterns
SECRET_PATTERNS=(
  'jwt_secret.*=.*["'"'"'][a-zA-Z0-9]{20,}["'"'"']'
  'api_key.*=.*["'"'"'][a-zA-Z0-9]{20,}["'"'"']'
  'password.*=.*["'"'"'][^"'"'"']{8,}["'"'"']'
  'secret.*=.*["'"'"'][a-zA-Z0-9]{16,}["'"'"']'
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  if grep -riq --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    --exclude-dir="node_modules" --exclude-dir=".next" --exclude-dir="dist" --exclude-dir="__tests__" \
    --exclude="*.test.*" --exclude="*.spec.*" \
    -E "$pattern" .; then
    SECRETS_FOUND=true
    break
  fi
done

if [[ "$SECRETS_FOUND" == true ]]; then
  VIOLATIONS+=("Potential hardcoded secrets found in source code")
  PASS=false
  printf '  %sFAIL%s Potential secrets found in source code\n' "$RED" "$NC"
  printf '[FAIL] Hardcoded secrets detected\n'
else
  printf '  %sPASS%s No hardcoded secrets detected\n' "$GREEN" "$NC"
  printf '[PASS] No hardcoded secrets\n'
fi
printf '\n'

# Check 4: Environment variables documented
printf '[CHECK 4] Verifying auth env vars documented...\n'
ENV_EXAMPLE_FOUND=false
AUTH_VARS_DOCUMENTED=false

if [[ -f ".env.example" ]] || [[ -f ".env.template" ]] || [[ -f "env.example" ]]; then
  ENV_EXAMPLE_FOUND=true
  
  # Check if auth-related vars are documented
  if grep -iq -e "JWT_SECRET" -e "SESSION_SECRET" -e "NEXTAUTH" -e "AUTH" \
    -- .env.example .env.template env.example 2>/dev/null; then
    AUTH_VARS_DOCUMENTED=true
  fi
fi

if [[ "$ENV_EXAMPLE_FOUND" == false ]]; then
  VIOLATIONS+=("No .env.example or .env.template file found")
  PASS=false
  printf '  %sFAIL%s No .env.example file found\n' "$RED" "$NC"
  printf '[FAIL] No .env.example file\n'
elif [[ "$AUTH_VARS_DOCUMENTED" == false ]]; then
  VIOLATIONS+=("Auth environment variables not documented in .env.example")
  PASS=false
  printf '  %sFAIL%s Auth env vars not documented\n' "$RED" "$NC"
  printf '[FAIL] Auth env vars not documented\n'
else
  printf '  %sPASS%s Auth env vars documented in .env.example\n' "$GREEN" "$NC"
  printf '[PASS] Auth env vars documented\n'
fi
printf '\n'

# Check 5: Session/token configuration present
printf '[CHECK 5] Verifying session/token configuration...\n'
SESSION_CONFIG_FOUND=false

if grep -rq --include="*.ts" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
  -e "createCookieSessionStorage" -e "jwt.sign" -e "jwt.verify" \
  -e "getSession" -e "setSession" .; then
  SESSION_CONFIG_FOUND=true
fi

if [[ "$SESSION_CONFIG_FOUND" == true ]]; then
  printf '  %sPASS%s Session/token configuration found\n' "$GREEN" "$NC"
  printf '[PASS] Session/token configuration present\n'
else
  VIOLATIONS+=("No session or token configuration found")
  PASS=false
  printf '  %sFAIL%s Session/token configuration not found\n' "$RED" "$NC"
  printf '[FAIL] Session/token configuration missing\n'
fi
printf '\n'

# Check 6: Password hashing present
printf '[CHECK 6] Verifying password hashing implementation...\n'
HASHING_FOUND=false

if grep -rq --include="*.ts" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
  -e "bcrypt" -e "argon2" -e "hashPassword" -e "pbkdf2" -e "scrypt" -e "createHash" .; then
  HASHING_FOUND=true
fi

if [[ "$HASHING_FOUND" == true ]]; then
  printf '  %sPASS%s Password hashing found\n' "$GREEN" "$NC"
  printf '[PASS] Password hashing implemented\n'
else
  # This might be OK for OAuth-only or managed auth
  printf '  %sWARN%s No password hashing found (OK if using OAuth/managed auth)\n' "$YELLOW" "$NC"
  printf '[WARN] No password hashing detected\n'
fi
printf '\n'

# Final report
printf '========================================\n'
if [[ "$PASS" == true ]]; then
  printf '%sRESULT: PASS%s\n' "$GREEN" "$NC"
  printf 'Authentication implementation is complete.\n'
  exit 0
else
  printf '%sRESULT: FAIL%s\n' "$RED" "$NC"
  printf '\n'
  printf 'Authentication violations found:\n'
  for violation in "${VIOLATIONS[@]}"; do
    printf '  %sFAIL%s %s\n' "$RED" "$NC" "${violation}"
  done
  printf '\n'
  printf 'Review the implementation and ensure:\n'
  printf '  1. Auth middleware exists (middleware.ts or equivalent)\n'
  printf '  2. Protected routes use auth wrappers (requireAuth, withAuth)\n'
  printf '  3. No secrets are hardcoded in source files\n'
  printf '  4. Auth env vars are documented in .env.example\n'
  printf '  5. Session/token configuration is present\n'
  printf '  6. Password hashing is implemented (if using credentials)\n'
  exit 1
fi
