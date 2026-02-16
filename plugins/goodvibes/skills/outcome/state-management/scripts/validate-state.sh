#!/usr/bin/env bash
# Requires: bash 4+ (uses arrays, [[ ]])

# validate-state.sh
# Validates state management implementation completeness and patterns

set -euo pipefail

# Disable color output if not a TTY
if [[ ! -t 1 ]]; then
  RED=''
  GREEN=''
  YELLOW=''
  NC=''
else
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  NC='\033[0m'
fi

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
  printf '%s[FAIL]%s Project root not found: %s\n' "$RED" "$NC" "$PROJECT_ROOT"
  exit 1
fi

# Change to project directory
cd -- "$PROJECT_ROOT"

# Initialize tracking
VIOLATIONS=()
WARNINGS=()
PASS=true

printf 'Validating state management implementation...\n'
printf '\n'

# Check 1: State libraries installed
printf '[CHECK 1] Verifying state management libraries...\n'
if [[ -f "package.json" ]]; then
  if grep -q -e '"@tanstack/react-query"' -e '"zustand"' -e '"react-hook-form"' -- package.json; then
    printf '  %s[PASS]%s State management libraries found in package.json\n' "$GREEN" "$NC"
  else
    WARNINGS+=("No common state libraries found (TanStack Query, Zustand, React Hook Form)")
    printf '  %s[WARN]%s No common state libraries found\n' "$YELLOW" "$NC"
  fi
else
  VIOLATIONS+=("No package.json found")
  PASS=false
  printf '  %s[FAIL]%s No package.json found\n' "$RED" "$NC"
fi
printf '\n'

# Check 2: Query client configuration (if TanStack Query is used)
printf '[CHECK 2] Verifying query client configuration...\n'
if [[ -f "package.json" ]] && grep -q '"@tanstack/react-query"' -- package.json; then
  if grep -rq --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
    -e "QueryClient" -e "queryClient" .; then
    printf '  %s[PASS]%s Query client configuration found\n' "$GREEN" "$NC"
  else
    VIOLATIONS+=("TanStack Query installed but no QueryClient configuration found")
    PASS=false
    printf '  %s[FAIL]%s No QueryClient configuration found\n' "$RED" "$NC"
  fi
else
  printf '  %s[WARN]%s TanStack Query not installed (skipping check)\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 3: No prop drilling patterns
printf '[CHECK 3] Checking for prop drilling anti-patterns...\n'
# Look for components with excessive props (>5 props passed down)
# Note: This is a heuristic check and may have false positives
if grep -rq --include="*.tsx" --include="*.jsx" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
  -E "\\<[A-Z][a-zA-Z]+ [a-z]+=[^>]+ [a-z]+=[^>]+ [a-z]+=[^>]+ [a-z]+=[^>]+ [a-z]+=[^>]+ [a-z]+=[^>]+" .; then
  WARNINGS+=("Potential prop drilling detected (components with >5 props)")
  printf '  %s[WARN]%s Potential prop drilling detected\n' "$YELLOW" "$NC"
else
  printf '  %s[PASS]%s No excessive prop drilling detected\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 4: Form validation schemas exist (if React Hook Form is used)
printf '[CHECK 4] Verifying form validation schemas...\n'
if [[ -f "package.json" ]] && grep -q '"react-hook-form"' -- package.json; then
  if grep -rq --include="*.ts" --include="*.tsx" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
    -e "z.object" -e "yup.object" -e "joi.object" .; then
    printf '  %s[PASS]%s Validation schemas found\n' "$GREEN" "$NC"
  else
    VIOLATIONS+=("React Hook Form installed but no validation schemas found")
    PASS=false
    printf '  %s[FAIL]%s No validation schemas found\n' "$RED" "$NC"
  fi
else
  printf '  %s[WARN]%s React Hook Form not installed (skipping check)\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 5: Proper cache invalidation (if TanStack Query is used)
printf '[CHECK 5] Verifying cache invalidation patterns...\n'
if [[ -f "package.json" ]] && grep -q '"@tanstack/react-query"' -- package.json; then
  if grep -rq --include="*.ts" --include="*.tsx" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
    -e "invalidateQueries" -e "refetchQueries" .; then
    printf '  %s[PASS]%s Cache invalidation patterns found\n' "$GREEN" "$NC"
  else
    WARNINGS+=("TanStack Query used but no cache invalidation found")
    printf '  %s[WARN]%s No cache invalidation patterns found\n' "$YELLOW" "$NC"
  fi
else
  printf '  %s[WARN]%s TanStack Query not installed (skipping check)\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 6: No global state overuse
printf '[CHECK 6] Checking for global state overuse...\n'
GLOBAL_STATE_FILES=0

if [[ -d "src/stores" ]] || [[ -d "src/store" ]] || [[ -d "store" ]]; then
  # Count store files
  GLOBAL_STATE_FILES=$(find . -type d \( -name node_modules -o -name .git -o -name dist -o -name .next \) -prune -o \
    -type f \( -name "*-store.ts" -o -name "*-store.tsx" -o -name "*Store.ts" \) -print 2>/dev/null | wc -l)
  
  if [[ "$GLOBAL_STATE_FILES" -gt 10 ]]; then
    WARNINGS+=("Large number of global stores found ($GLOBAL_STATE_FILES). Consider state colocation.")
    printf '  %s[WARN]%s Many global stores found (%d). Consider state colocation.\n' "$YELLOW" "$NC" "$GLOBAL_STATE_FILES"
  else
    printf '  %s[PASS]%s Reasonable number of global stores (%d)\n' "$GREEN" "$NC" "$GLOBAL_STATE_FILES"
  fi
else
  printf '  %s[PASS]%s No global store directory found (using local state)\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 7: Type safety in state definitions
printf '[CHECK 7] Verifying type safety in state...\n'
if grep -rq --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next \
  -e "create<any>" -e "useState<any>" -e ": any" .; then
  WARNINGS+=("Potential untyped state found (any types)")
  printf '  %s[WARN]%s Potential untyped state found\n' "$YELLOW" "$NC"
else
  printf '  %s[PASS]%s No untyped state patterns detected\n' "$GREEN" "$NC"
fi
printf '\n'

# Final report
printf '========================================\n'
if [[ "$PASS" == true ]]; then
  printf '%s[PASS]%s State management validation passed\n' "$GREEN" "$NC"
  
  if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    printf '\n'
    printf 'Warnings:\n'
    for warning in "${WARNINGS[@]}"; do
      printf '  %s[WARN]%s %s\n' "$YELLOW" "$NC" "${warning}"
    done
  fi
  
  exit 0
else
  printf '%s[FAIL]%s State management validation failed\n' "$RED" "$NC"
  printf '\n'
  printf 'Violations found:\n'
  for violation in "${VIOLATIONS[@]}"; do
    printf '  %s[FAIL]%s %s\n' "$RED" "$NC" "${violation}"
  done
  
  if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    printf '\n'
    printf 'Warnings:\n'
    for warning in "${WARNINGS[@]}"; do
      printf '  %s[WARN]%s %s\n' "$YELLOW" "$NC" "${warning}"
    done
  fi
  
  printf '\n'
  printf 'Review the implementation and ensure:\n'
  printf '  1. State libraries are installed (TanStack Query, Zustand, React Hook Form)\n'
  printf '  2. Query client is configured (if using TanStack Query)\n'
  printf '  3. Prop drilling is minimized (use global state when needed)\n'
  printf '  4. Form validation schemas exist (if using React Hook Form)\n'
  printf '  5. Cache invalidation is implemented (if using TanStack Query)\n'
  printf '  6. Global state is not overused (prefer state colocation)\n'
  printf '  7. State is properly typed (no any types)\n'
  exit 1
fi
