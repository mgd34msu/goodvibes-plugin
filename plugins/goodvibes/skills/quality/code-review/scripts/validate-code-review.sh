#!/usr/bin/env bash
# Requires: bash 4+ (uses arrays, [[ ]])

# validate-code-review.sh
# Validates that a code review was thorough and complete

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Usage
if [[ $# -lt 1 ]]; then
  printf 'Usage: %s <review-file-or-dir>\n' "$0"
  printf '\n'
  printf 'Arguments:\n'
  printf '  review-file-or-dir   Path to review markdown file or project directory\n'
  printf '\n'
  printf 'Example:\n'
  printf '  %s review-output.md\n' "$0"
  printf '  %s /home/user/my-app  # Validates the codebase itself\n' "$0"
  exit 1
fi

REVIEW_INPUT="$1"

# Determine if input is a file or directory
if [[ -f "$REVIEW_INPUT" ]]; then
  MODE="review_file"
  REVIEW_FILE="$REVIEW_INPUT"
elif [[ -d "$REVIEW_INPUT" ]]; then
  MODE="codebase"
  PROJECT_ROOT="$REVIEW_INPUT"
  cd -- "$PROJECT_ROOT"
else
  printf '%sERROR: Input not found: %s%s\n' "$RED" "$REVIEW_INPUT" "$NC"
  exit 1
fi

# Initialize tracking
VIOLATIONS=()
WARNINGS=()
PASS=true

printf 'Validating code review quality...\n'
printf 'Mode: %s\n' "$MODE"
printf '\n'

if [[ "$MODE" == "review_file" ]]; then
  # ============================================================================
  # MODE 1: Validate review file completeness
  # ============================================================================

  # Check 1: Review file has scoring section
  printf '[CHECK 1] Verifying review includes scoring...\n'
  if grep -q "Dimension Scores\|Overall Score" -- "$REVIEW_FILE"; then
    printf '  %s[PASS]%s Review includes scoring section\n' "$GREEN" "$NC"
  else
    VIOLATIONS+=("Review file missing scoring section (Overall Score, Dimension Scores)")
    PASS=false
    printf '  %s[FAIL]%s No scoring section found\n' "$RED" "$NC"
  fi
  printf '\n'

  # Check 2: All 10 dimensions scored
  printf '[CHECK 2] Verifying all 10 dimensions are scored...\n'
  DIMENSIONS=(
    "Correctness"
    "Type Safety"
    "Security"
    "Performance"
    "Error Handling"
    "Testing"
    "Code Quality"
    "Architecture"
    "Accessibility"
    "Documentation"
  )
  MISSING_DIMENSIONS=()
  for dim in "${DIMENSIONS[@]}"; do
    if ! grep -q "$dim" -- "$REVIEW_FILE"; then
      MISSING_DIMENSIONS+=("$dim")
    fi
  done

  if [[ ${#MISSING_DIMENSIONS[@]} -eq 0 ]]; then
    printf '  %s[PASS]%s All 10 dimensions present\n' "$GREEN" "$NC"
  else
    VIOLATIONS+=("Missing dimensions: ${MISSING_DIMENSIONS[*]}")
    PASS=false
    printf '  %s[FAIL]%s Missing dimensions: %s\n' "$RED" "$NC" "${MISSING_DIMENSIONS[*]}"
  fi
  printf '\n'

  # Check 3: Security patterns checked
  printf '[CHECK 3] Verifying security review was performed...\n'
  SECURITY_PATTERNS_FOUND=false
  if grep -qE "(SQL injection|XSS|auth|authentication|authorization|secrets|input validation)" -- "$REVIEW_FILE"; then
    SECURITY_PATTERNS_FOUND=true
  fi

  if [[ "$SECURITY_PATTERNS_FOUND" == true ]]; then
    printf '  %s[PASS]%s Security review performed\n' "$GREEN" "$NC"
  else
    VIOLATIONS+=("No security review found (SQL injection, XSS, auth, etc.)")
    PASS=false
    printf '  %s[FAIL]%s Security review not performed\n' "$RED" "$NC"
  fi
  printf '\n'

  # Check 4: Performance patterns checked
  printf '[CHECK 4] Verifying performance review was performed...\n'
  PERFORMANCE_PATTERNS_FOUND=false
  if grep -qE "(N\\+1|query|index|re-render|memoization|performance)" -- "$REVIEW_FILE"; then
    PERFORMANCE_PATTERNS_FOUND=true
  fi

  if [[ "$PERFORMANCE_PATTERNS_FOUND" == true ]]; then
    printf '  %s[PASS]%s Performance review performed\n' "$GREEN" "$NC"
  else
    WARNINGS+=("No performance review found (N+1 queries, indexes, re-renders, etc.)")
    printf '  %s[WARN]%s Performance review not mentioned\n' "$YELLOW" "$NC"
  fi
  printf '\n'

  # Check 5: Testing coverage reviewed
  printf '[CHECK 5] Verifying testing review was performed...\n'
  TESTING_FOUND=false
  if grep -qE "(test|coverage|assertion|mock)" -- "$REVIEW_FILE"; then
    TESTING_FOUND=true
  fi

  if [[ "$TESTING_FOUND" == true ]]; then
    printf '  %s[PASS]%s Testing review performed\n' "$GREEN" "$NC"
  else
    VIOLATIONS+=("No testing review found (coverage, assertions, etc.)")
    PASS=false
    printf '  %s[FAIL]%s Testing review not performed\n' "$RED" "$NC"
  fi
  printf '\n'

  # Check 6: Specific file/line references
  printf '[CHECK 6] Verifying feedback includes file/line references...\n'
  REFERENCES_FOUND=false
  if grep -qE "([a-zA-Z0-9_/-]+\\.(ts|tsx|js|jsx):[0-9]+|FILE:LINE)" -- "$REVIEW_FILE"; then
    REFERENCES_FOUND=true
  fi

  if [[ "$REFERENCES_FOUND" == true ]]; then
    printf '  %s[PASS]%s Specific file/line references found\n' "$GREEN" "$NC"
  else
    WARNINGS+=("No specific file/line references (feedback should reference exact locations)")
    printf '  %s[WARN]%s No file/line references found\n' "$YELLOW" "$NC"
  fi
  printf '\n'

  # Check 7: Issues categorized by severity
  printf '[CHECK 7] Verifying issues are categorized by severity...\n'
  SEVERITY_FOUND=false
  if grep -qE "(Critical|Major|Minor).*\\(.*fix" -- "$REVIEW_FILE"; then
    SEVERITY_FOUND=true
  fi

  if [[ "$SEVERITY_FOUND" == true ]]; then
    printf '  %s[PASS]%s Issues categorized by severity\n' "$GREEN" "$NC"
  else
    WARNINGS+=("Issues not categorized by severity (Critical, Major, Minor)")
    printf '  %s[WARN]%s Severity categorization not found\n' "$YELLOW" "$NC"
  fi
  printf '\n'

  # Check 8: Positive feedback included
  printf '[CHECK 8] Verifying positive feedback was provided...\n'
  POSITIVE_FOUND=false
  if grep -qE "(What Was Done Well|Excellent|Good)" -- "$REVIEW_FILE"; then
    POSITIVE_FOUND=true
  fi

  if [[ "$POSITIVE_FOUND" == true ]]; then
    printf '  %s[PASS]%s Positive feedback included\n' "$GREEN" "$NC"
  else
    WARNINGS+=("No positive feedback found (reviews should acknowledge good work)")
    printf '  %s[WARN]%s No positive feedback found\n' "$YELLOW" "$NC"
  fi
  printf '\n'

  # Check 9: Verdict provided
  printf '[CHECK 9] Verifying review verdict is present...\n'
  VERDICT_FOUND=false
  if grep -qE "(Verdict|APPROVE|REQUEST CHANGES|REJECT)" -- "$REVIEW_FILE"; then
    VERDICT_FOUND=true
  fi

  if [[ "$VERDICT_FOUND" == true ]]; then
    printf '  %s[PASS]%s Verdict provided\n' "$GREEN" "$NC"
  else
    VIOLATIONS+=("No verdict found (should be APPROVE, REQUEST CHANGES, or REJECT)")
    PASS=false
    printf '  %s[FAIL]%s No verdict found\n' "$RED" "$NC"
  fi
  printf '\n'

  # Check 10: Actionable feedback
  printf '[CHECK 10] Verifying feedback is actionable...\n'
  ACTIONABLE_FOUND=false
  if grep -qE "(Fix:|Impact:|Why:)" -- "$REVIEW_FILE"; then
    ACTIONABLE_FOUND=true
  fi

  if [[ "$ACTIONABLE_FOUND" == true ]]; then
    printf '  %s[PASS]%s Actionable feedback found\n' "$GREEN" "$NC"
  else
    WARNINGS+=("Feedback may not be actionable (should explain how to fix and why it matters)")
    printf '  %s[WARN]%s Actionable feedback not detected\n' "$YELLOW" "$NC"
  fi
  printf '\n'

else
  # ============================================================================
  # MODE 2: Validate codebase for review-readiness
  # ============================================================================

  # Check 1: TypeScript configured
  printf '[CHECK 1] Verifying TypeScript is configured...\n'
  if [[ -f "tsconfig.json" ]]; then
    printf '  %s[PASS]%s TypeScript configured\n' "$GREEN" "$NC"
  else
    WARNINGS+=("No tsconfig.json found (TypeScript recommended for type safety)")
    printf '  %s[WARN]%s No TypeScript configuration\n' "$YELLOW" "$NC"
  fi
  printf '\n'

  # Check 2: Linter configured
  printf '[CHECK 2] Verifying linter is configured...\n'
  LINTER_FOUND=false
  if [[ -f ".eslintrc.json" ]] || [[ -f ".eslintrc.js" ]] || [[ -f "eslint.config.js" ]] || \
     [[ -f ".eslintrc.cjs" ]] || grep -q '"eslint"' -- package.json 2>/dev/null; then
    LINTER_FOUND=true
  fi

  if [[ "$LINTER_FOUND" == true ]]; then
    printf '  %s[PASS]%s Linter configured\n' "$GREEN" "$NC"
  else
    WARNINGS+=("No ESLint configuration found")
    printf '  %s[WARN]%s No linter configuration\n' "$YELLOW" "$NC"
  fi
  printf '\n'

  # Check 3: Tests exist
  printf '[CHECK 3] Verifying tests exist...\n'
  TESTS_FOUND=false
  if find . -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" \) \
    -not -path "*/.next/*" 2>/dev/null | grep -q .; then
    TESTS_FOUND=true
  fi

  if [[ "$TESTS_FOUND" == true ]]; then
    TEST_COUNT=$(find . -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" \) \
      -not -path "*/.next/*" 2>/dev/null | wc -l)
    printf '  %s[PASS]%s Found %d test files\n' "$GREEN" "$NC" "$TEST_COUNT"
  else
    VIOLATIONS+=("No test files found")
    PASS=false
    printf '  %s[FAIL]%s No test files found\n' "$RED" "$NC"
  fi
  printf '\n'

  # Check 4: No hardcoded secrets
  printf '[CHECK 4] Checking for hardcoded secrets...\n'
  SECRETS_FOUND=false
  if grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
    -E "(password|secret|api[_-]?key)\s*=\s*[\"''][^\"'']+[\"'']" . 2>/dev/null | grep -v "process.env" | grep -q .; then
    SECRETS_FOUND=true
  fi

  if [[ "$SECRETS_FOUND" == true ]]; then
    VIOLATIONS+=("Potential hardcoded secrets found (password, apiKey, secret)")
    PASS=false
    printf '  %s[FAIL]%s Hardcoded secrets detected\n' "$RED" "$NC"
  else
    printf '  %s[PASS]%s No hardcoded secrets found\n' "$GREEN" "$NC"
  fi
  printf '\n'

  # Check 5: No any types
  printf '[CHECK 5] Checking for any types...\n'
  ANY_USAGE_FOUND=false
  if [[ -d "src" ]]; then
    if grep -r --include="*.ts" --include="*.tsx" \
      --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
      -E ":\s*any(\s|;|,|\))" src 2>/dev/null | grep -q .; then
      ANY_USAGE_FOUND=true
    fi
  fi

  if [[ "$ANY_USAGE_FOUND" == true ]]; then
    ANY_COUNT=$(grep -r --include="*.ts" --include="*.tsx" \
      --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
      -E ":\s*any(\s|;|,|\))" src 2>/dev/null | wc -l)
    WARNINGS+=("Found $ANY_COUNT usages of 'any' type (reduces type safety)")
    printf '  %s[WARN]%s Found %d any types\n' "$YELLOW" "$NC" "$ANY_COUNT"
  else
    printf '  %s[PASS]%s No any types found\n' "$GREEN" "$NC"
  fi
  printf '\n'

  # Check 6: No console.log in source
  printf '[CHECK 6] Checking for console.log in source...\n'
  CONSOLE_LOG_FOUND=false
  if [[ -d "src" ]]; then
    if grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
      --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
      "console\.log" src 2>/dev/null | grep -q .; then
      CONSOLE_LOG_FOUND=true
    fi
  fi

  if [[ "$CONSOLE_LOG_FOUND" == true ]]; then
    WARNINGS+=("Found console.log statements (use proper logger instead)")
    printf '  %s[WARN]%s console.log found in source\n' "$YELLOW" "$NC"
  else
    printf '  %s[PASS]%s No console.log in source\n' "$GREEN" "$NC"
  fi
  printf '\n'

  # Check 7: API routes have validation
  printf '[CHECK 7] Checking API route input validation...\n'
  API_ROUTES_EXIST=false
  VALIDATION_FOUND=false

  if [[ -d "src/app/api" ]] || [[ -d "app/api" ]] || [[ -d "pages/api" ]]; then
    API_ROUTES_EXIST=true
  fi

  if [[ "$API_ROUTES_EXIST" == true ]]; then
    if grep -rq --include="*.ts" --include="*.js" \
      --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
      -E "(safeParse|validate|z\.object|Joi\.object)" . 2>/dev/null; then
      VALIDATION_FOUND=true
    fi

    if [[ "$VALIDATION_FOUND" == true ]]; then
      printf '  %s[PASS]%s Input validation found in API routes\n' "$GREEN" "$NC"
    else
      VIOLATIONS+=("API routes exist but no input validation found (Zod, Joi, etc.)")
      PASS=false
      printf '  %s[FAIL]%s No input validation in API routes\n' "$RED" "$NC"
    fi
  else
    printf '  %s[PASS]%s No API routes (validation not required)\n' "$GREEN" "$NC"
  fi
  printf '\n'

  # Check 8: No focused/skipped tests
  printf '[CHECK 8] Checking for focused or skipped tests...\n'
  FOCUSED_SKIPPED_FOUND=false
  if grep -r --include="*.test.ts" --include="*.test.tsx" --include="*.spec.ts" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
    -E "(it\.only|test\.only|describe\.only|it\.skip|test\.skip|describe\.skip)" . 2>/dev/null | grep -q .; then
    FOCUSED_SKIPPED_FOUND=true
  fi

  if [[ "$FOCUSED_SKIPPED_FOUND" == true ]]; then
    VIOLATIONS+=("Focused or skipped tests found (.only, .skip) - should be removed")
    PASS=false
    printf '  %s[FAIL]%s Focused/skipped tests found\n' "$RED" "$NC"
  else
    printf '  %s[PASS]%s No focused/skipped tests\n' "$GREEN" "$NC"
  fi
  printf '\n'

  # Check 9: Database queries use ORM or prepared statements
  printf '[CHECK 9] Checking database query safety...\n'
  DB_QUERIES_EXIST=false
  SAFE_QUERIES=false

  if grep -rq --include="*.ts" --include="*.js" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
    -E "(query\\(|execute\\(|db\\.)" . 2>/dev/null; then
    DB_QUERIES_EXIST=true
  fi

  if [[ "$DB_QUERIES_EXIST" == true ]]; then
    if grep -rq --include="*.ts" --include="*.js" \
      --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
      -E '(prisma\.|drizzle|sql`|\$[1-9])' . 2>/dev/null; then
      SAFE_QUERIES=true
    fi

    if [[ "$SAFE_QUERIES" == true ]]; then
      printf '  %s[PASS]%s Using ORM or parameterized queries\n' "$GREEN" "$NC"
    else
      VIOLATIONS+=("Database queries found but not using ORM/parameterized queries (SQL injection risk)")
      PASS=false
      printf '  %s[FAIL]%s Unsafe database queries detected\n' "$RED" "$NC"
    fi
  else
    printf '  %s[PASS]%s No database queries (check not applicable)\n' "$GREEN" "$NC"
  fi
  printf '\n'

  # Check 10: No inline styles in React
  printf '[CHECK 10] Checking for inline styles in React components...\n'
  INLINE_STYLES_FOUND=false
  if grep -rq --include="*.tsx" --include="*.jsx" \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
    "style=\\{\\{" . 2>/dev/null; then
    INLINE_STYLES_FOUND=true
  fi

  if [[ "$INLINE_STYLES_FOUND" == true ]]; then
    WARNINGS+=("Inline styles found in React components (consider CSS modules or Tailwind)")
    printf '  %s[WARN]%s Inline styles detected\n' "$YELLOW" "$NC"
  else
    printf '  %s[PASS]%s No inline styles in components\n' "$GREEN" "$NC"
  fi
  printf '\n'
fi

# Final report
printf '========================================\n'
if [[ "$PASS" == true ]]; then
  if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    printf '%s[PASS with warnings] Review validation passed with warnings%s\n' "$YELLOW" "$NC"
    printf '\n'
    printf 'Warnings:\n'
    for warning in "${WARNINGS[@]}"; do
      printf '  %s[WARN]%s %s\n' "$YELLOW" "$NC" "${warning}"
    done
  else
    printf '%s[PASS] Review validation passed%s\n' "$GREEN" "$NC"
    if [[ "$MODE" == "review_file" ]]; then
      printf 'Code review is thorough and complete.\n'
    else
      printf 'Codebase is review-ready with no critical issues.\n'
    fi
  fi
  exit 0
else
  printf '%s[FAIL] Review validation failed%s\n' "$RED" "$NC"
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
  if [[ "$MODE" == "review_file" ]]; then
    printf 'Review requirements not met. Ensure:\n'
    printf '  1. All 10 dimensions are scored (Correctness, Type Safety, Security, etc.)\n'
    printf '  2. Security review was performed (SQL injection, XSS, auth, secrets)\n'
    printf '  3. Testing review was performed (coverage, quality, assertions)\n'
    printf '  4. Feedback includes specific file/line references\n'
    printf '  5. Issues are categorized by severity (Critical, Major, Minor)\n'
    printf '  6. Verdict is provided (APPROVE, REQUEST CHANGES, REJECT)\n'
  else
    printf 'Codebase has critical issues. Fix before review:\n'
    printf '  1. Add test files (*.test.ts, *.spec.ts)\n'
    printf '  2. Remove hardcoded secrets (use environment variables)\n'
    printf '  3. Add input validation to API routes (Zod, Joi, etc.)\n'
    printf '  4. Remove focused/skipped tests (.only, .skip)\n'
    printf '  5. Use ORM or parameterized queries (prevent SQL injection)\n'
  fi
  exit 1
fi
