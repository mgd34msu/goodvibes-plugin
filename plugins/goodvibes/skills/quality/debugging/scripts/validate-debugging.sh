#!/usr/bin/env bash
# Requires: bash 4+ (uses arrays, [[ ]])

# validate-debugging.sh
# Validates debugging practices in a codebase

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Usage
if [[ $# -lt 1 ]]; then
  printf 'Usage: %s <project-directory>\n' "$0"
  printf '\n'
  printf 'Arguments:\n'
  printf '  project-directory   Path to project root directory\n'
  printf '\n'
  printf 'Example:\n'
  printf '  %s /home/user/my-app\n' "$0"
  exit 1
fi

PROJECT_ROOT="$1"

# Validate project root exists
if [[ ! -d "$PROJECT_ROOT" ]]; then
  printf '%sERROR: Directory not found: %s%s\n' "$RED" "$PROJECT_ROOT" "$NC"
  exit 1
fi

cd -- "$PROJECT_ROOT"

# Initialize tracking
VIOLATIONS=()
WARNINGS=()
PASS=true

printf 'Validating debugging practices...\n'
printf 'Project: %s\n' "$PROJECT_ROOT"
printf '\n'

# Check 1: No console.log in production code
printf '[CHECK 1] Checking for console.log in source...\n'
CONSOLE_LOG_FOUND=false
if [[ -d "src" ]]; then
  if grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
    --exclude-dir=coverage --exclude-dir=build \
    "console\\.log" src 2>/dev/null | grep -q .; then
    CONSOLE_LOG_FOUND=true
  fi
fi

if [[ "$CONSOLE_LOG_FOUND" == true ]]; then
  CONSOLE_COUNT=$(grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
    --exclude-dir=coverage --exclude-dir=build \
    "console\\.log" src 2>/dev/null | wc -l)
  VIOLATIONS+=("Found $CONSOLE_COUNT console.log statements (use proper logger instead)")
  PASS=false
  printf '  %s[FAIL]%s Found %d console.log statements\n' "$RED" "$NC" "$CONSOLE_COUNT"
else
  printf '  %s[PASS]%s No console.log in production code\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 2: Error boundaries exist (React projects)
printf '[CHECK 2] Checking for error boundaries...\n'
ERROR_BOUNDARY_FOUND=false
REACT_PROJECT=false

# Check if React project
if [[ -f "package.json" ]] && grep -q '"react"' -- package.json 2>/dev/null; then
  REACT_PROJECT=true
fi

if [[ "$REACT_PROJECT" == true ]]; then
  if grep -rq --include="*.tsx" --include="*.jsx" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
    -E "(ErrorBoundary|componentDidCatch|static getDerivedStateFromError)" . 2>/dev/null; then
    ERROR_BOUNDARY_FOUND=true
  fi

  if [[ "$ERROR_BOUNDARY_FOUND" == true ]]; then
    printf '  %s[PASS]%s Error boundaries implemented\n' "$GREEN" "$NC"
  else
    WARNINGS+=("No error boundaries found (React apps should handle component errors)")
    printf '  %s[WARN]%s No error boundaries detected\n' "$YELLOW" "$NC"
  fi
else
  printf '  %s[PASS]%s Not a React project (error boundaries not applicable)\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 3: Source maps configured
printf '[CHECK 3] Checking for source map configuration...\n'
SOURCE_MAPS_CONFIGURED=false

if [[ -f "tsconfig.json" ]] && grep -q '"sourceMap".*true' -- tsconfig.json 2>/dev/null; then
  SOURCE_MAPS_CONFIGURED=true
elif [[ -f "next.config.js" ]] || [[ -f "next.config.mjs" ]] || [[ -f "next.config.ts" ]]; then
  SOURCE_MAPS_CONFIGURED=true
elif [[ -f "vite.config.ts" ]] || [[ -f "vite.config.js" ]]; then
  SOURCE_MAPS_CONFIGURED=true
fi

if [[ "$SOURCE_MAPS_CONFIGURED" == true ]]; then
  printf '  %s[PASS]%s Source maps configured\n' "$GREEN" "$NC"
else
  WARNINGS+=("Source maps not detected (needed for production debugging)")
  printf '  %s[WARN]%s Source maps not configured\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 4: Proper logging library used
printf '[CHECK 4] Checking for logging library...\n'
LOGGING_LIB_FOUND=false

if [[ -f "package.json" ]] && \
   grep -qE '"(winston|pino|bunyan|loglevel|consola)"' -- package.json 2>/dev/null; then
  LOGGING_LIB_FOUND=true
fi

if grep -rq --include="*.ts" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
  -E "(logger\\.(info|error|warn|debug)|log\\.(info|error))" . 2>/dev/null; then
  LOGGING_LIB_FOUND=true
fi

if [[ "$LOGGING_LIB_FOUND" == true ]]; then
  printf '  %s[PASS]%s Logging library in use\n' "$GREEN" "$NC"
else
  WARNINGS+=("No logging library found (use winston, pino, or similar)")
  printf '  %s[WARN]%s No logging library detected\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 5: Try/catch blocks handling errors properly
printf '[CHECK 5] Checking error handling in try/catch blocks...\n'
EMPTY_CATCH_FOUND=false

if grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
  -E "catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}" . 2>/dev/null | grep -q .; then
  EMPTY_CATCH_FOUND=true
fi

if [[ "$EMPTY_CATCH_FOUND" == true ]]; then
  VIOLATIONS+=("Empty catch blocks found (errors should be logged or handled)")
  PASS=false
  printf '  %s[FAIL]%s Empty catch blocks detected\n' "$RED" "$NC"
else
  printf '  %s[PASS]%s No empty catch blocks\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 6: Debug dependencies not in production
printf '[CHECK 6] Checking debug dependencies...\n'
DEBUG_DEPS_IN_PROD=false

if [[ -f "package.json" ]]; then
  if grep -A 999 '"dependencies"' -- package.json 2>/dev/null | \
     grep -qE '"(debug|why-did-you-render|react-devtools)"'; then
    DEBUG_DEPS_IN_PROD=true
  fi
fi

if [[ "$DEBUG_DEPS_IN_PROD" == true ]]; then
  WARNINGS+=("Debug dependencies found in production dependencies (move to devDependencies)")
  printf '  %s[WARN]%s Debug dependencies in production\n' "$YELLOW" "$NC"
else
  printf '  %s[PASS]%s Debug dependencies in devDependencies\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 7: No debugger statements
printf '[CHECK 7] Checking for debugger statements...\n'
DEBUGGER_FOUND=false

if grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
  "debugger;" . 2>/dev/null | grep -q .; then
  DEBUGGER_FOUND=true
fi

if [[ "$DEBUGGER_FOUND" == true ]]; then
  VIOLATIONS+=("debugger statements found (remove before production)")
  PASS=false
  printf '  %s[FAIL]%s debugger statements found\n' "$RED" "$NC"
else
  printf '  %s[PASS]%s No debugger statements\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 8: Error monitoring configured
printf '[CHECK 8] Checking for error monitoring...\n'
ERROR_MONITORING_FOUND=false

if [[ -f "package.json" ]] && \
   grep -qE '"(@sentry|rollbar|bugsnag|airbrake)' -- package.json 2>/dev/null; then
  ERROR_MONITORING_FOUND=true
fi

if grep -rq --include="*.ts" --include="*.js" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
  -E "(Sentry\\.init|Rollbar\\.init|bugsnag)" . 2>/dev/null; then
  ERROR_MONITORING_FOUND=true
fi

if [[ "$ERROR_MONITORING_FOUND" == true ]]; then
  printf '  %s[PASS]%s Error monitoring configured\n' "$GREEN" "$NC"
else
  WARNINGS+=("No error monitoring found (consider Sentry, Rollbar, etc.)")
  printf '  %s[WARN]%s No error monitoring detected\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 9: Proper error types used
printf '[CHECK 9] Checking error handling patterns...\n'
THROWING_STRINGS_FOUND=false

if grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
  -E 'throw ["'\''`]' . 2>/dev/null | grep -q .; then
  THROWING_STRINGS_FOUND=true
fi

if [[ "$THROWING_STRINGS_FOUND" == true ]]; then
  VIOLATIONS+=("Throwing string literals found (use Error objects instead)")
  PASS=false
  printf '  %s[FAIL]%s Throwing string literals detected\n' "$RED" "$NC"
else
  printf '  %s[PASS]%s Proper error types used\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 10: Unhandled promise rejections
printf '[CHECK 10] Checking for unhandled promises...\n'
FLOATING_PROMISES_FOUND=false

if grep -r --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
  -E '^[[:space:]]+(fetch|axios|prisma)\\.' . 2>/dev/null | \
  grep -v 'await' | grep -v '\\.then' | grep -v '\\.catch' | grep -q .; then
  FLOATING_PROMISES_FOUND=true
fi

if [[ "$FLOATING_PROMISES_FOUND" == true ]]; then
  WARNINGS+=("Potential floating promises found (use await or .catch())")
  printf '  %s[WARN]%s Floating promises detected\n' "$YELLOW" "$NC"
else
  printf '  %s[PASS]%s No floating promises\n' "$GREEN" "$NC"
fi
printf '\n'

# Final report
printf "%s\n" "----------------------------------------"
if [[ "$PASS" == true ]]; then
  if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    printf '%s[PASS with warnings] Debugging validation passed with warnings%s\n' "$YELLOW" "$NC"
    printf '\n'
    printf 'Warnings:\n'
    for warning in "${WARNINGS[@]}"; do
      printf '  %s[WARN]%s %s\n' "$YELLOW" "$NC" "${warning}"
    done
  else
    printf '%s[PASS] Debugging validation passed%s\n' "$GREEN" "$NC"
    printf 'Codebase follows good debugging practices.\n'
  fi
  exit 0
else
  printf '%s[FAIL] Debugging validation failed%s\n' "$RED" "$NC"
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
  printf 'Debugging best practices not followed. Fix:\n'
  printf '  1. Remove console.log statements (use proper logger)\n'
  printf '  2. Remove debugger statements\n'
  printf '  3. Handle all errors in catch blocks (no empty catches)\n'
  printf '  4. Throw Error objects, not strings\n'
  printf '  5. Add error boundaries for React apps\n'
  printf '  6. Configure source maps for debugging\n'
  exit 1
fi
