#!/usr/bin/env bash
# Component Architecture Validator
# Checks component implementation quality gates
# Usage: ./validate-components.sh <project_root>
# Requires: bash 4+

set -euo pipefail

PROJECT_ROOT="${1:-.}"
EXIT_CODE=0

# Detect if output is to a terminal for color support
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  NC=''
fi

log_pass() {
  printf '%s[PASS]%s %s\n' "$GREEN" "$NC" "$1"
}

log_fail() {
  printf '%s[FAIL]%s %s\n' "$RED" "$NC" "$1"
  EXIT_CODE=1
}

log_warn() {
  printf '%s[WARN]%s %s\n' "$YELLOW" "$NC" "$1"
}

log_info() {
  printf "[INFO] %s\n" "$1"
}

log_info "Component Architecture Validator"
log_info "Project root: ${PROJECT_ROOT}"
printf "\n"

# Check 1: Component files exist
log_info "Check 1: Component files exist"
COMPONENT_COUNT=0

if [ -d "${PROJECT_ROOT}/src/components" ] || [ -d "${PROJECT_ROOT}/components" ]; then
  COMPONENT_COUNT=$(find "${PROJECT_ROOT}" -type f -not -path '*/node_modules/*' \( -name '*.tsx' -o -name '*.jsx' -o -name '*.vue' -o -name '*.svelte' \) 2>/dev/null | wc -l)
fi

if [ "$COMPONENT_COUNT" -gt 0 ]; then
  log_pass "Found ${COMPONENT_COUNT} component files"
else
  log_fail "No component files found (.tsx, .jsx, .vue, .svelte)"
fi
printf "\n"

# Check 2: Component prop types defined
log_info "Check 2: Component prop types/interfaces defined"
PROP_TYPES_COUNT=0

PROP_TYPES_COUNT=$(grep -rE "(interface.*Props|type.*Props|PropType|defineProps)" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next --exclude-dir=build --include="*.ts" --include="*.tsx" --include="*.vue" -- "${PROJECT_ROOT}" 2>/dev/null | wc -l || true)

if [ "$PROP_TYPES_COUNT" -gt 0 ]; then
  log_pass "Found ${PROP_TYPES_COUNT} prop type definitions"
else
  log_fail "No prop type definitions found (TypeScript interfaces/types)"
fi
printf "\n"

# Check 3: No inline styles in components
log_info "Check 3: No inline styles (prefer className/class)"
INLINE_STYLES_COUNT=0

INLINE_STYLES_COUNT=$(grep -rE 'style=\{\{|style="[^"]*:[^"]*"' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next --exclude-dir=build --include="*.tsx" --include="*.jsx" --include="*.vue" --include="*.svelte" -- "${PROJECT_ROOT}" 2>/dev/null | wc -l || true)

if [ "$INLINE_STYLES_COUNT" -eq 0 ]; then
  log_pass "No inline styles detected"
else
  log_warn "Found ${INLINE_STYLES_COUNT} inline style usages (consider CSS modules or utility classes)"
fi
printf "\n"

# Check 4: Barrel exports present (index files)
log_info "Check 4: Barrel exports present (index.ts/index.tsx files)"
INDEX_COUNT=0

if [ -d "${PROJECT_ROOT}/src/components" ] || [ -d "${PROJECT_ROOT}/components" ]; then
  INDEX_COUNT=$(find "${PROJECT_ROOT}" -type f -not -path '*/node_modules/*' \( -name 'index.ts' -o -name 'index.tsx' -o -name 'index.js' \) -path '*/components/*' 2>/dev/null | wc -l)
fi

if [ "$INDEX_COUNT" -gt 0 ]; then
  log_pass "Found ${INDEX_COUNT} barrel export files"
else
  log_warn "No barrel exports found (consider adding index.ts files for cleaner imports)"
fi
printf "\n"

# Check 5: Test files exist for components
log_info "Check 5: Component test files exist"
TEST_COUNT=0

TEST_COUNT=$(find "${PROJECT_ROOT}" -type f -not -path '*/node_modules/*' \( -name '*.test.tsx' -o -name '*.test.ts' -o -name '*.spec.tsx' -o -name '*.spec.ts' \) 2>/dev/null | wc -l)

if [ "$TEST_COUNT" -gt 0 ]; then
  log_pass "Found ${TEST_COUNT} test files"
else
  log_warn "No test files found (.test.tsx, .spec.tsx)"
fi
printf "\n"

# Check 6: No 'any' types in component props
log_info "Check 6: No 'any' types in component interfaces"
ANY_TYPES_COUNT=0

ANY_TYPES_COUNT=$(grep -rE "(interface.*Props|type.*Props)" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next --exclude-dir=build --include="*.ts" --include="*.tsx" -A 10 -- "${PROJECT_ROOT}" 2>/dev/null | grep -E ':\s*any' | wc -l || true)

if [ "$ANY_TYPES_COUNT" -eq 0 ]; then
  log_pass "No 'any' types in component props"
else
  log_fail "Found ${ANY_TYPES_COUNT} 'any' type usages in component props (use specific types)"
fi
printf "\n"

# Check 7: Accessibility attributes present
log_info "Check 7: Accessibility attributes used (ARIA)"
ARIA_COUNT=0

ARIA_COUNT=$(grep -rE "(aria-|role=|alt=)" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next --exclude-dir=build --include="*.tsx" --include="*.jsx" --include="*.vue" --include="*.svelte" -- "${PROJECT_ROOT}" 2>/dev/null | wc -l || true)

if [ "$ARIA_COUNT" -gt 0 ]; then
  log_pass "Found ${ARIA_COUNT} accessibility attributes"
else
  log_warn "Limited accessibility attributes found (consider adding ARIA labels, roles)"
fi
printf "\n"

# Check 8: No console.log in components
log_info "Check 8: No console.log statements in production code"
CONSOLE_COUNT=0

CONSOLE_COUNT=$(grep -rE 'console\.(log|debug|info)' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next --exclude-dir=build --include="*.tsx" --include="*.jsx" --include="*.vue" --include="*.svelte" -- "${PROJECT_ROOT}" 2>/dev/null | wc -l || true)

if [ "$CONSOLE_COUNT" -eq 0 ]; then
  log_pass "No console.log statements found"
else
  log_warn "Found ${CONSOLE_COUNT} console statements (remove before production)"
fi
printf "\n"

# Check 9: Component file organization
log_info "Check 9: Component file organization (colocation check)"

if [ -d "${PROJECT_ROOT}/src/components" ]; then
  # Count directories that contain both component and test files
  COMPONENT_DIRS=$(find "${PROJECT_ROOT}/src/components" -mindepth 1 -maxdepth 1 -type d -not -path '*/node_modules/*' 2>/dev/null | wc -l)
  if [ "$COMPONENT_DIRS" -gt 0 ]; then
    log_pass "Component directory structure detected (${COMPONENT_DIRS} component directories)"
  else
    log_warn "Flat component structure (consider organizing into directories)"
  fi
else
  log_warn "No src/components directory found"
fi
printf "\n"

# Check 10: Performance optimizations present
log_info "Check 10: Performance optimizations (memo, useMemo, useCallback)"
PERF_OPT_COUNT=0

PERF_OPT_COUNT=$(grep -rE '(React\.memo|useMemo|useCallback|computed|\$:)' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next --exclude-dir=build --include="*.tsx" --include="*.jsx" --include="*.vue" --include="*.svelte" -- "${PROJECT_ROOT}" 2>/dev/null | wc -l || true)

if [ "$PERF_OPT_COUNT" -gt 0 ]; then
  log_pass "Found ${PERF_OPT_COUNT} performance optimizations"
else
  log_warn "No performance optimizations detected (consider memo, useMemo for expensive components)"
fi
printf "\n"

# Summary
printf "\n"
if [ $EXIT_CODE -eq 0 ]; then
  log_pass "All critical checks passed"
else
  log_fail "Some critical checks failed (see above)"
fi

exit $EXIT_CODE
