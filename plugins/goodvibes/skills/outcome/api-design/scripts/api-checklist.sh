#!/bin/sh
# API Checklist Validator
# Checks API implementation quality gates
# Usage: ./api-checklist.sh <project_root>

set -euo pipefail

PROJECT_ROOT="${1:-.}"
EXIT_CODE=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_pass() {
  printf "${GREEN}[PASS]${NC} %s\n" "$1"
}

log_fail() {
  printf "${RED}[FAIL]${NC} %s\n" "$1"
  EXIT_CODE=1
}

log_warn() {
  printf "${YELLOW}[WARN]${NC} %s\n" "$1"
}

log_info() {
  printf "[INFO] %s\n" "$1"
}

log_info "API Checklist Validator"
log_info "Project root: ${PROJECT_ROOT}"
printf "\n"

# Check 1: Route files exist
log_info "Check 1: Route files exist"
ROUTE_COUNT=0

if [ -d "${PROJECT_ROOT}/src/app/api" ]; then
  ROUTE_COUNT=$(find "${PROJECT_ROOT}/src/app/api" -name 'route.ts' -o -name 'route.js' 2>/dev/null | wc -l)
elif [ -d "${PROJECT_ROOT}/src/api" ]; then
  ROUTE_COUNT=$(find "${PROJECT_ROOT}/src/api" -name '*.ts' -o -name '*.js' 2>/dev/null | wc -l)
elif [ -d "${PROJECT_ROOT}/app/api" ]; then
  ROUTE_COUNT=$(find "${PROJECT_ROOT}/app/api" -name 'route.ts' -o -name 'route.js' 2>/dev/null | wc -l)
fi

if [ "$ROUTE_COUNT" -gt 0 ]; then
  log_pass "Found ${ROUTE_COUNT} route files"
else
  log_fail "No route files found in common API directories"
fi
printf "\n"

# Check 2: Error handling middleware present
log_info "Check 2: Error handling patterns present"
ERROR_HANDLING_COUNT=0

if [ -f "${PROJECT_ROOT}/src/middleware.ts" ] || [ -f "${PROJECT_ROOT}/middleware.ts" ]; then
  ERROR_HANDLING_COUNT=$(grep -r "catch\|try\|Error" "${PROJECT_ROOT}/src/middleware.ts" "${PROJECT_ROOT}/middleware.ts" 2>/dev/null | wc -l)
fi

if [ "$ERROR_HANDLING_COUNT" -gt 0 ]; then
  log_pass "Error handling middleware found"
else
  log_warn "No error handling middleware detected (check middleware.ts)"
fi
printf "\n"

# Check 3: Validation schemas defined
log_info "Check 3: Validation schemas defined"
VALIDATION_COUNT=0

if command -v grep >/dev/null 2>&1; then
  VALIDATION_COUNT=$(grep -r "z\.object\|yup\.object\|joi\.object" "${PROJECT_ROOT}" --include="*.ts" --include="*.js" 2>/dev/null | wc -l)
fi

if [ "$VALIDATION_COUNT" -gt 0 ]; then
  log_pass "Found ${VALIDATION_COUNT} validation schemas"
else
  log_fail "No validation schemas found (Zod, Yup, or Joi)"
fi
printf "\n"

# Check 4: No untyped request bodies
log_info "Check 4: No untyped request bodies (TypeScript check)"
UNTYPED_COUNT=0

if command -v grep >/dev/null 2>&1; then
  UNTYPED_COUNT=$(grep -r "request\.json()" "${PROJECT_ROOT}" --include="*.ts" --include="*.js" 2>/dev/null | grep -v "safeParse\|parse\|validate" | wc -l)
fi

if [ "$UNTYPED_COUNT" -eq 0 ]; then
  log_pass "No untyped request.json() calls found"
else
  log_warn "Found ${UNTYPED_COUNT} potentially untyped request.json() calls (verify they use validation)"
fi
printf "\n"

# Check 5: API documentation present
log_info "Check 5: API documentation present"
DOCS_FOUND=false

if [ -f "${PROJECT_ROOT}/docs/openapi.yaml" ] || [ -f "${PROJECT_ROOT}/docs/openapi.json" ] || [ -f "${PROJECT_ROOT}/openapi.yaml" ]; then
  log_pass "OpenAPI documentation found"
  DOCS_FOUND=true
elif [ -f "${PROJECT_ROOT}/README.md" ]; then
  if grep -q "API" "${PROJECT_ROOT}/README.md" 2>/dev/null; then
    log_pass "API documentation found in README.md"
    DOCS_FOUND=true
  fi
fi

if [ "$DOCS_FOUND" = false ]; then
  log_warn "No API documentation found (openapi.yaml or README.md)"
fi
printf "\n"

# Check 6: Status code usage (check for common codes)
log_info "Check 6: Proper HTTP status code usage"
STATUS_CODES_FOUND=0

if command -v grep >/dev/null 2>&1; then
  STATUS_CODES_FOUND=$(grep -r "status:.*40[0134]\|status:.*20[014]" "${PROJECT_ROOT}" --include="*.ts" --include="*.js" 2>/dev/null | wc -l)
fi

if [ "$STATUS_CODES_FOUND" -gt 0 ]; then
  log_pass "Found proper status code usage (200, 201, 204, 400, 401, 403, 404)"
else
  log_warn "Limited status code usage detected (verify error responses)"
fi
printf "\n"

# Check 7: No hardcoded secrets
log_info "Check 7: No hardcoded secrets"
SECRETS_FOUND=0

if command -v grep >/dev/null 2>&1; then
  SECRETS_FOUND=$(grep -rE "(apiKey|api_key|secret|password|token).*=.*['\"]" "${PROJECT_ROOT}" --include="*.ts" --include="*.js" --exclude-dir=node_modules 2>/dev/null | grep -v "process.env\|import\|export\|type\|interface" | wc -l)
fi

if [ "$SECRETS_FOUND" -eq 0 ]; then
  log_pass "No hardcoded secrets detected"
else
  log_fail "Found ${SECRETS_FOUND} potential hardcoded secrets (verify they use env variables)"
fi
printf "\n"

# Summary
printf "\n"
if [ $EXIT_CODE -eq 0 ]; then
  log_pass "All checks passed"
else
  log_fail "Some checks failed (see above)"
fi

exit $EXIT_CODE
