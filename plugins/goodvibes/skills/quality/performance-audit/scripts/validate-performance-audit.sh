#!/usr/bin/env bash
# Requires: bash 4+
# Description: Validates that a performance audit was thorough and complete.

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

cd "$PROJECT_ROOT"

# Color codes for output
readonly RED="\033[0;31m"
readonly GREEN="\033[0;32m"
readonly YELLOW="\033[1;33m"
readonly NC="\033[0m" # No Color

readonly PASS="${GREEN}[PASS]${NC}"
readonly FAIL="${RED}[FAIL]${NC}"
readonly WARN="${YELLOW}[WARN]${NC}"

# Common grep exclusions
readonly GREP_EXCLUDE=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next --exclude-dir=.turbo)

total_checks=0
passed_checks=0
failed_checks=0
warnings=0

# Helper function for printing results
print_result() {
  local status="$1"
  local message="$2"
  printf "%b %s\n" "$status" "$message"
}

check_bundle_analysis() {
  printf "\n%s\n" "=== Bundle Analysis Checks ==="
  
  # Check if bundle analyzer is configured
  ((total_checks++))
  if grep -q "@next/bundle-analyzer" package.json 2>/dev/null; then
    print_result "$PASS" "Bundle analyzer dependency found"
    ((passed_checks++))
  else
    print_result "$WARN" "Bundle analyzer not installed (optional but recommended)"
    ((warnings++))
  fi
  
  # Check for large dependencies
  ((total_checks++))
  if grep -qE "(moment|lodash\":|chart\\.js)" package.json 2>/dev/null; then
    print_result "$WARN" "Heavy dependencies detected (moment, lodash, chart.js) - consider alternatives"
    ((warnings++))
  else
    print_result "$PASS" "No obviously heavy dependencies detected"
    ((passed_checks++))
  fi
  
  # Check for dynamic imports
  ((total_checks++))
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js" -- "(import\(|next/dynamic|React\.lazy)" . >/dev/null 2>&1; then
    print_result "$PASS" "Code splitting patterns found (dynamic imports)"
    ((passed_checks++))
  else
    print_result "$FAIL" "No code splitting detected - check for dynamic imports"
    ((failed_checks++))
  fi
}

check_database_patterns() {
  printf "\n%s\n" "=== Database Performance Checks ==="
  
  # Check for potential N+1 queries
  ((total_checks++))
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.ts" --include="*.tsx" -- "(map|forEach).*await.*(findUnique|findFirst)" . >/dev/null 2>&1; then
    print_result "$FAIL" "Potential N+1 query pattern detected (map/forEach + await findUnique)"
    ((failed_checks++))
  else
    print_result "$PASS" "No obvious N+1 query patterns detected"
    ((passed_checks++))
  fi
  
  # Check for proper eager loading
  ((total_checks++))
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.ts" --include="*.tsx" -- "findMany.*include:" . >/dev/null 2>&1; then
    print_result "$PASS" "Eager loading patterns found (include)"
    ((passed_checks++))
  else
    print_result "$WARN" "No eager loading detected - verify queries are optimized"
    ((warnings++))
  fi
  
  # Check for database indexes in schema
  ((total_checks++))
  if [ -f "prisma/schema.prisma" ]; then
    if grep -q "@@index" prisma/schema.prisma; then
      print_result "$PASS" "Database indexes defined in schema"
      ((passed_checks++))
    else
      print_result "$FAIL" "No database indexes found in Prisma schema"
      ((failed_checks++))
    fi
  else
    print_result "$WARN" "No Prisma schema found (skipping index check)"
    ((warnings++))
  fi
}

check_rendering_patterns() {
  printf "\n%s\n" "=== Rendering Performance Checks ==="
  
  # Check for memoization usage
  ((total_checks++))
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.tsx" --include="*.jsx" -- "(useMemo|useCallback|React\.memo)" . >/dev/null 2>&1; then
    print_result "$PASS" "Memoization patterns found (useMemo/useCallback/React.memo)"
    ((passed_checks++))
  else
    print_result "$FAIL" "No memoization detected - check for unnecessary re-renders"
    ((failed_checks++))
  fi
  
  # Check for virtualization libraries
  ((total_checks++))
  
  # First check if there are large list patterns in the codebase
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.tsx" --include="*.jsx" -- "{.*\.map\(.*=>\s*<" . >/dev/null 2>&1; then
    # Large lists exist, check for virtualizer
    if grep -qE "(react-window|react-virtualized|@tanstack/react-virtual)" package.json 2>/dev/null; then
      print_result "$PASS" "Virtual list library detected"
      ((passed_checks++))
    else
      print_result "$WARN" "No virtualization library found - may be needed for large lists"
      ((warnings++))
    fi
  else
    # No large lists, skip warning
    print_result "$PASS" "No large list patterns detected (virtualization not needed)"
    ((passed_checks++))
  fi
}

check_image_optimization() {
  printf "\n%s\n" "=== Image Optimization Checks ==="
  
  # Check for next/image usage
  ((total_checks++))
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.tsx" --include="*.jsx" -- "next/image" . >/dev/null 2>&1; then
    print_result "$PASS" "next/image usage detected"
    ((passed_checks++))
  else
    print_result "$WARN" "No next/image usage found - verify images are optimized"
    ((warnings++))
  fi
  
  # Check for unoptimized <img> tags
  ((total_checks++))
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.tsx" --include="*.jsx" --include="*.html" -- "<img\\s+" . >/dev/null 2>&1; then
    print_result "$FAIL" "Unoptimized <img> tags detected - use next/image instead"
    ((failed_checks++))
  else
    print_result "$PASS" "No unoptimized <img> tags found"
    ((passed_checks++))
  fi
  
  # Check for lazy loading
  ((total_checks++))
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.tsx" --include="*.jsx" -- 'loading="lazy"' . >/dev/null 2>&1; then
    print_result "$PASS" "Lazy loading attributes found"
    ((passed_checks++))
  else
    print_result "$WARN" "No lazy loading detected - check if needed"
    ((warnings++))
  fi
}

check_caching_strategies() {
  printf "\n%s\n" "=== Caching Strategy Checks ==="
  
  # Check for cache headers or revalidation
  ((total_checks++))
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.ts" --include="*.tsx" -- "(Cache-Control|revalidate|stale-while-revalidate)" . >/dev/null 2>&1; then
    print_result "$PASS" "Caching strategies detected"
    ((passed_checks++))
  else
    print_result "$FAIL" "No caching strategies found - add Cache-Control headers"
    ((failed_checks++))
  fi
}

check_memory_management() {
  printf "\n%s\n" "=== Memory Management Checks ==="
  
  # Check for cleanup in useEffect
  ((total_checks++))
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.tsx" --include="*.jsx" -- "useEffect.*addEventListener" . >/dev/null 2>&1; then
    # Now check if there are corresponding cleanups
    if grep -rE "${GREP_EXCLUDE[@]}" --include="*.tsx" --include="*.jsx" -- "removeEventListener" . >/dev/null 2>&1; then
      print_result "$PASS" "Event listener cleanup detected"
      ((passed_checks++))
    else
      print_result "$FAIL" "Event listeners found without cleanup - memory leak risk"
      ((failed_checks++))
    fi
  else
    print_result "$WARN" "No event listeners found (skipping cleanup check)"
    ((warnings++))
  fi
  
  # Check for interval cleanup
  ((total_checks++))
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js" -- "setInterval" . >/dev/null 2>&1; then
    if grep -rE "${GREP_EXCLUDE[@]}" --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js" -- "clearInterval" . >/dev/null 2>&1; then
      print_result "$PASS" "Interval cleanup detected"
      ((passed_checks++))
    else
      print_result "$FAIL" "setInterval found without clearInterval - memory leak risk"
      ((failed_checks++))
    fi
  else
    print_result "$WARN" "No intervals found (skipping cleanup check)"
    ((warnings++))
  fi
}

check_web_vitals() {
  printf "\n%s\n" "=== Core Web Vitals Checks ==="
  
  # Check for web-vitals library
  ((total_checks++))
  if grep -q "web-vitals" package.json 2>/dev/null; then
    print_result "$PASS" "web-vitals library installed"
    ((passed_checks++))
  else
    print_result "$WARN" "web-vitals library not found - consider adding for monitoring"
    ((warnings++))
  fi
  
  # Check for priority image preloading
  ((total_checks++))
  if grep -rE "${GREP_EXCLUDE[@]}" --include="*.tsx" --include="*.jsx" -- 'priority' . >/dev/null 2>&1; then
    print_result "$PASS" "Priority image loading detected"
    ((passed_checks++))
  else
    print_result "$WARN" "No priority image loading - check LCP optimization"
    ((warnings++))
  fi
}

print_summary() {
  printf "\n%s\n" "======================================"
  printf "%s\n" "Performance Audit Validation Summary"
  printf "%s\n" "======================================"
  printf "Total checks: %d\n" "$total_checks"
  printf "%b Passed: %d\n" "$GREEN" "$passed_checks"
  printf "%b Failed: %d\n" "$RED" "$failed_checks"
  printf "%b Warnings: %d\n" "$YELLOW" "$warnings"
  printf "%b\n" "$NC"
  
  if [ "$failed_checks" -eq 0 ]; then
    printf "%b Performance audit validation PASSED\n" "$GREEN"
    printf "%b\n" "$NC"
    return 0
  else
    printf "%b Performance audit validation FAILED\n" "$RED"
    printf "%b\n" "$NC"
    printf "Fix the failed checks above and re-run validation.\n"
    return 1
  fi
}

main() {
  printf "\n%s\n" "Starting performance audit validation..."
  printf "%s\n" "Project root: $PROJECT_ROOT"
  
  check_bundle_analysis
  check_database_patterns
  check_rendering_patterns
  check_image_optimization
  check_caching_strategies
  check_memory_management
  check_web_vitals
  
  print_summary
}

main "$@"
