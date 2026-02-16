#!/usr/bin/env bash
# Requires: bash 4+ (uses arrays, [[ ]])

# validate-refactoring.sh
# Validates that refactoring improved code quality without breaking behavior

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

# Validate project directory exists
if [[ ! -d "$PROJECT_ROOT" ]]; then
  printf '%sERROR: Project directory not found: %s%s\n' "$RED" "$PROJECT_ROOT" "$NC"
  exit 1
fi

cd -- "$PROJECT_ROOT"

# Initialize tracking
VIOLATIONS=()
WARNINGS=()
PASS=true

printf 'Validating refactoring quality...\n'
printf 'Project: %s\n' "$PROJECT_ROOT"
printf '\n'

# Check 1: TypeScript configured
printf '[CHECK 1] Verifying TypeScript is configured...\n'
if [[ -f "tsconfig.json" ]]; then
  printf '  %s[PASS]%s TypeScript configured\n' "$GREEN" "$NC"
else
  WARNINGS+=("No tsconfig.json found (TypeScript recommended)")
  printf '  %s[WARN]%s No TypeScript configuration\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 2: Tests exist
printf '[CHECK 2] Verifying tests exist...\n'
TESTS_FOUND=false
if find . -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" \) 2>/dev/null | grep -q .; then
  TESTS_FOUND=true
fi

if [[ "$TESTS_FOUND" == true ]]; then
  TEST_COUNT=$(find . -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" \) 2>/dev/null | wc -l)
  printf '  %s[PASS]%s Found %d test files\n' "$GREEN" "$NC" "$TEST_COUNT"
else
  VIOLATIONS+=("No test files found - refactoring without tests is unsafe")
  PASS=false
  printf '  %s[FAIL]%s No test files found\n' "$RED" "$NC"
fi
printf '\n'

# Check 3: No increased any usage
printf '[CHECK 3] Checking for any types...\n'
ANY_USAGE_COUNT=0
if [[ -d "src" ]]; then
  if grep -r --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E -- ":\\s*any(\\s|;|,|\\))" src 2>/dev/null | grep -q .; then
    ANY_USAGE_COUNT=$(grep -r --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E -- ":\\s*any(\\s|;|,|\\))" src 2>/dev/null | wc -l)
  fi
fi

if [[ $ANY_USAGE_COUNT -eq 0 ]]; then
  printf '  %s[PASS]%s No any types found\n' "$GREEN" "$NC"
elif [[ $ANY_USAGE_COUNT -lt 5 ]]; then
  WARNINGS+=("Found $ANY_USAGE_COUNT any types (should be eliminated during refactoring)")
  printf '  %s[WARN]%s Found %d any types\n' "$YELLOW" "$NC" "$ANY_USAGE_COUNT"
else
  VIOLATIONS+=("Found $ANY_USAGE_COUNT any types (refactoring should improve type safety)")
  PASS=false
  printf '  %s[FAIL]%s Found %d any types\n' "$RED" "$NC" "$ANY_USAGE_COUNT"
fi
printf '\n'

# Check 4: Functions within size limits
printf '[CHECK 4] Checking function sizes...\n'
LARGE_FILES_FOUND=false
if [[ -d "src" ]]; then
  LARGE_FILES=$(find src -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/.next/*' -type f \( -name "*.ts" -o -name "*.tsx" \) -exec wc -l {} + 2>/dev/null | awk '$1 > 300 {print $2}' || true)
  if [[ -n "$LARGE_FILES" ]]; then
    LARGE_FILES_FOUND=true
  fi
fi

if [[ "$LARGE_FILES_FOUND" == true ]]; then
  LARGE_COUNT=$(printf "%s\n" "$LARGE_FILES" | wc -l)
  WARNINGS+=("Found $LARGE_COUNT files over 300 lines (consider splitting)")
  printf '  %s[WARN]%s Found %d large files (>300 lines)\n' "$YELLOW" "$NC" "$LARGE_COUNT"
else
  printf '  %s[PASS]%s No files over 300 lines\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 5: No console.log in source
printf '[CHECK 5] Checking for console.log statements...\n'
CONSOLE_LOG_FOUND=false
if [[ -d "src" ]]; then
  if grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -- "console\\.log" src 2>/dev/null | grep -q .; then
    CONSOLE_LOG_FOUND=true
  fi
fi

if [[ "$CONSOLE_LOG_FOUND" == true ]]; then
  WARNINGS+=("Found console.log statements (should use proper logger)")
  printf '  %s[WARN]%s console.log found in source\n' "$YELLOW" "$NC"
else
  printf '  %s[PASS]%s No console.log in source\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 6: No hardcoded secrets
printf '[CHECK 6] Checking for hardcoded secrets...\n'
SECRETS_FOUND=false
if grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git -E -- "(password|secret|api[_-]?key)\\s*=\\s*[\\\"''][^\\\"'']+[\\\"'']" . 2>/dev/null | grep -v "process.env" | grep -q .; then
  SECRETS_FOUND=true
fi

if [[ "$SECRETS_FOUND" == true ]]; then
  VIOLATIONS+=("Hardcoded secrets found (must use environment variables)")
  PASS=false
  printf '  %s[FAIL]%s Hardcoded secrets detected\n' "$RED" "$NC"
else
  printf '  %s[PASS]%s No hardcoded secrets found\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 7: Import cycles detection
printf '[CHECK 7] Checking for circular dependencies...\n'
CIRCULAR_DEPS=false
if command -v madge &> /dev/null; then
  if madge --circular src 2>/dev/null | grep -q "Circular"; then
    CIRCULAR_DEPS=true
  fi
  if [[ "$CIRCULAR_DEPS" == true ]]; then
    VIOLATIONS+=("Circular dependencies found (should be eliminated)")
    PASS=false
    printf '  %s[FAIL]%s Circular dependencies detected\n' "$RED" "$NC"
  else
    printf '  %s[PASS]%s No circular dependencies\n' "$GREEN" "$NC"
  fi
else
  WARNINGS+=("madge not installed (install with: npm install -g madge)")
  printf '  %s[WARN]%s madge not available (skipping check)\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 8: TypeScript compilation
printf '[CHECK 8] Running TypeScript type check...\n'
if [[ -f "package.json" ]] && grep -q '"typecheck"' -- package.json 2>/dev/null; then
  if npm run typecheck &>/dev/null; then
    printf '  %s[PASS]%s TypeScript compilation successful\n' "$GREEN" "$NC"
  else
    VIOLATIONS+=("TypeScript compilation failed")
    PASS=false
    printf '  %s[FAIL]%s TypeScript compilation failed\n' "$RED" "$NC"
  fi
elif [[ -f "tsconfig.json" ]]; then
  if npx tsc --noEmit &>/dev/null; then
    printf '  %s[PASS]%s TypeScript compilation successful\n' "$GREEN" "$NC"
  else
    VIOLATIONS+=("TypeScript compilation failed")
    PASS=false
    printf '  %s[FAIL]%s TypeScript compilation failed\n' "$RED" "$NC"
  fi
else
  printf '  %s[WARN]%s TypeScript check skipped (no tsconfig.json)\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 9: Linting
printf '[CHECK 9] Running linter...\n'
if [[ -f "package.json" ]] && grep -q '"lint"' -- package.json 2>/dev/null; then
  if npm run lint &>/dev/null; then
    printf '  %s[PASS]%s Linting passed\n' "$GREEN" "$NC"
  else
    WARNINGS+=("Linting found issues")
    printf '  %s[WARN]%s Linting found issues\n' "$YELLOW" "$NC"
  fi
else
  printf '  %s[WARN]%s Linter not configured (skipping)\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 10: Tests passing
printf '[CHECK 10] Running tests...\n'
if [[ -f "package.json" ]] && grep -q '"test"' -- package.json 2>/dev/null; then
  if npm run test &>/dev/null; then
    printf '  %s[PASS]%s All tests passing\n' "$GREEN" "$NC"
  else
    VIOLATIONS+=("Tests are failing (refactoring broke behavior)")
    PASS=false
    printf '  %s[FAIL]%s Tests failing\n' "$RED" "$NC"
  fi
else
  VIOLATIONS+=("No test script configured (tests are mandatory)")
  PASS=false
  printf '  %s[FAIL]%s No test script found\n' "$RED" "$NC"
fi
printf '\n'

# Final report
printf '%s\n' "========================================"
if [[ "$PASS" == true ]]; then
  if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    printf '%s[PASS with warnings] Refactoring validation passed with warnings%s\n' "$YELLOW" "$NC"
    printf '\n'
    printf 'Warnings:\n'
    for warning in "${WARNINGS[@]}"; do
      printf '  %s[WARN]%s %s\n' "$YELLOW" "$NC" "${warning}"
    done
  else
    printf '%s[PASS] Refactoring validation passed%s\n' "$GREEN" "$NC"
    printf 'Refactoring improved code quality without breaking behavior.\n'
  fi
  exit 0
else
  printf '%s[FAIL] Refactoring validation failed%s\n' "$RED" "$NC"
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
  printf 'Refactoring requirements not met. Ensure:\n'
  printf '  1. All tests pass (refactoring should preserve behavior)\n'
  printf '  2. TypeScript compilation succeeds (no type errors)\n'
  printf '  3. No hardcoded secrets (use environment variables)\n'
  printf '  4. No circular dependencies (use dependency inversion)\n'
  printf '  5. Type safety improved (reduce any usage)\n'
  printf '  6. Tests exist and are comprehensive\n'
  exit 1
fi
