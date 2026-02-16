#!/usr/bin/env bash
# Requires: bash 4+ (uses arrays, [[ ]])

# validate-tests.sh
# Validates test quality and completeness

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

printf 'Validating test implementation...\n'
printf '\n'

# Check 1: Test files exist
printf '[CHECK 1] Verifying test files exist...\n'
TEST_FILES_FOUND=false

if find . -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" \) \
  -not -path "*/node_modules/*" | grep -q .; then
  TEST_FILES_FOUND=true
fi

if [[ "$TEST_FILES_FOUND" == true ]]; then
  TEST_COUNT=$(find . -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" \) \
    -not -path "*/node_modules/*" | wc -l)
  printf '  %s[PASS]%s Found %d test files\n' "$GREEN" "$NC" "$TEST_COUNT"
else
  VIOLATIONS+=("No test files found (*.test.ts, *.spec.ts, etc.)")
  PASS=false
  printf '  %s[FAIL]%s No test files found\n' "$RED" "$NC"
fi
printf '\n'

# Check 2: Test configuration exists
printf '[CHECK 2] Verifying test configuration exists...\n'
TEST_CONFIG_FOUND=false

if [[ -f "vitest.config.ts" ]] || [[ -f "vitest.config.js" ]] || [[ -f "jest.config.js" ]] || \
   [[ -f "jest.config.ts" ]] || [[ -f "playwright.config.ts" ]]; then
  TEST_CONFIG_FOUND=true
fi

if [[ "$TEST_CONFIG_FOUND" == true ]]; then
  printf '  %s[PASS]%s Test configuration found\n' "$GREEN" "$NC"
else
  VIOLATIONS+=("No test configuration found (vitest.config.ts, jest.config.js, etc.)")
  PASS=false
  printf '  %s[FAIL]%s Test configuration not found\n' "$RED" "$NC"
fi
printf '\n'

# Check 3: Coverage configuration present
printf '[CHECK 3] Verifying coverage configuration...\n'
COVERAGE_CONFIG_FOUND=false

if [[ -f "vitest.config.ts" ]]; then
  if grep -q "coverage" -- "vitest.config.ts"; then
    COVERAGE_CONFIG_FOUND=true
  fi
elif [[ -f "jest.config.js" ]] || [[ -f "jest.config.ts" ]]; then
  if grep -q "collectCoverage\|coverageThreshold" -- jest.config.*; then
    COVERAGE_CONFIG_FOUND=true
  fi
fi

if [[ "$COVERAGE_CONFIG_FOUND" == true ]]; then
  printf '  %s[PASS]%s Coverage configuration found\n' "$GREEN" "$NC"
else
  printf '  %s[WARN]%s No coverage configuration found\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 4: No skipped tests (.skip)
printf '[CHECK 4] Checking for skipped tests (.skip)...\n'
SKIPPED_TESTS_FOUND=false

if grep -r --include="*.test.ts" --include="*.test.tsx" --include="*.spec.ts" --include="*.spec.tsx" \
  --exclude-dir="node_modules" --exclude-dir=".next" --exclude-dir="dist" \
  -E "\.skip\(|it\.skip|describe\.skip|test\.skip" . 2>/dev/null | grep -q .; then
  SKIPPED_TESTS_FOUND=true
fi

if [[ "$SKIPPED_TESTS_FOUND" == true ]]; then
  VIOLATIONS+=("Skipped tests found (.skip) - all tests should run")
  PASS=false
  printf '  %s[FAIL]%s Skipped tests found (.skip)\n' "$RED" "$NC"
else
  printf '  %s[PASS]%s No skipped tests\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 5: No focused tests (.only)
printf '[CHECK 5] Checking for focused tests (.only)...\n'
FOCUSED_TESTS_FOUND=false

if grep -r --include="*.test.ts" --include="*.test.tsx" --include="*.spec.ts" --include="*.spec.tsx" \
  --exclude-dir="node_modules" --exclude-dir=".next" --exclude-dir="dist" \
  -E "\.only\(|it\.only|describe\.only|test\.only" . 2>/dev/null | grep -q .; then
  FOCUSED_TESTS_FOUND=true
fi

if [[ "$FOCUSED_TESTS_FOUND" == true ]]; then
  VIOLATIONS+=("Focused tests found (.only) - should be removed before commit")
  PASS=false
  printf '  %s[FAIL]%s Focused tests found (.only)\n' "$RED" "$NC"
else
  printf '  %s[PASS]%s No focused tests\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 6: Test naming conventions
printf '[CHECK 6] Verifying test naming conventions...\n'
BAD_NAMES_FOUND=false

if find . -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) \
  -not -path "*/node_modules/*" -exec grep -l "^[[:space:]]*test('[^']*')" {} \; 2>/dev/null | grep -q .; then
  # Check if they're using 'test()' instead of 'it()' - warn only
  printf '  %s[WARN]%s Some tests use test() instead of it() (minor style issue)\n' "$YELLOW" "$NC"
else
  printf '  %s[PASS]%s Test naming conventions followed\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 7: No console.log in tests
printf '[CHECK 7] Checking for console.log in tests...\n'
CONSOLE_LOG_FOUND=false

if grep -r --include="*.test.ts" --include="*.test.tsx" --include="*.spec.ts" --include="*.spec.tsx" \
  --exclude-dir="node_modules" --exclude-dir=".next" --exclude-dir="dist" \
  "console\.log" . 2>/dev/null | grep -q .; then
  CONSOLE_LOG_FOUND=true
fi

if [[ "$CONSOLE_LOG_FOUND" == true ]]; then
  VIOLATIONS+=("console.log statements found in tests - use proper assertions instead")
  PASS=false
  printf '  %s[FAIL]%s console.log found in tests\n' "$RED" "$NC"
else
  printf '  %s[PASS]%s No console.log in tests\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 8: Test setup file exists
printf '[CHECK 8] Verifying test setup file...\n'
SETUP_FILE_FOUND=false

if [[ -f "src/test/setup.ts" ]] || [[ -f "tests/setup.ts" ]] || [[ -f "test/setup.ts" ]] || \
   [[ -f "vitest.setup.ts" ]] || [[ -f "jest.setup.js" ]]; then
  SETUP_FILE_FOUND=true
fi

if [[ "$SETUP_FILE_FOUND" == true ]]; then
  printf '  %s[PASS]%s Test setup file found\n' "$GREEN" "$NC"
else
  printf '  %s[WARN]%s No test setup file found (optional but recommended)\n' "$YELLOW" "$NC"
fi
printf '\n'

# Check 9: MSW handlers for API mocking (if API routes exist)
printf '[CHECK 9] Checking API mocking setup...\n'
API_ROUTES_EXIST=false
MSW_SETUP_FOUND=false

if [[ -d "src/app/api" ]] || [[ -d "app/api" ]] || [[ -d "pages/api" ]]; then
  API_ROUTES_EXIST=true
fi

if grep -rq --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist \
  -e "msw" -e "setupServer" -e "http.get" -e "http.post" . 2>/dev/null; then
  MSW_SETUP_FOUND=true
fi

if [[ "$API_ROUTES_EXIST" == true ]]; then
  if [[ "$MSW_SETUP_FOUND" == true ]]; then
    printf '  %s[PASS]%s MSW API mocking setup found\n' "$GREEN" "$NC"
  else
    printf '  %s[WARN]%s API routes exist but no MSW setup found\n' "$YELLOW" "$NC"
  fi
else
  printf '  %s[PASS]%s No API routes, MSW not required\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 10: E2E tests if Playwright config exists
printf '[CHECK 10] Checking E2E test setup...\n'
PLAYWRIGHT_CONFIG_EXISTS=false
E2E_TESTS_EXIST=false

if [[ -f "playwright.config.ts" ]]; then
  PLAYWRIGHT_CONFIG_EXISTS=true
fi

if [[ -d "e2e" ]] || [[ -d "tests/e2e" ]]; then
  if find e2e tests/e2e -type f -name "*.spec.ts" 2>/dev/null | grep -q .; then
    E2E_TESTS_EXIST=true
  fi
fi

if [[ "$PLAYWRIGHT_CONFIG_EXISTS" == true ]]; then
  if [[ "$E2E_TESTS_EXIST" == true ]]; then
    printf '  %s[PASS]%s Playwright config and E2E tests found\n' "$GREEN" "$NC"
  else
    printf '  %s[WARN]%s Playwright config exists but no E2E tests found\n' "$YELLOW" "$NC"
  fi
else
  printf '  %s[PASS]%s No Playwright config (E2E tests optional)\n' "$GREEN" "$NC"
fi
printf '\n'

# Final report
printf '========================================\n'
if [[ "$PASS" == true ]]; then
  printf '%s[PASS] Test validation passed%s\n' "$GREEN" "$NC"
  printf 'Test implementation meets quality standards.\n'
  exit 0
else
  printf '%s[FAIL] Test validation failed%s\n' "$RED" "$NC"
  printf '\n'
  printf 'Test violations found:\n'
  for violation in "${VIOLATIONS[@]}"; do
    printf '  %s[FAIL]%s %s\n' "$RED" "$NC" "${violation}"
  done
  printf '\n'
  printf 'Review the implementation and ensure:\n'
  printf '  1. Test files exist with proper naming (*.test.ts, *.spec.ts)\n'
  printf '  2. Test configuration is present (vitest.config.ts or jest.config.js)\n'
  printf '  3. Coverage configuration is set up\n'
  printf '  4. No skipped tests (.skip) in the codebase\n'
  printf '  5. No focused tests (.only) - they should be removed\n'
  printf '  6. No console.log statements in tests\n'
  printf '  7. MSW or equivalent API mocking is configured\n'
  exit 1
fi
