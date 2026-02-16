#!/usr/bin/env bash

# Requires: bash 4+ (uses arrays, [[ ]])
# validate-payments.sh
# Validates payment integration for security and best practices
#
# Usage: ./validate-payments.sh <project_root>
#
# Checks:
#   1. Payment library installed
#   2. API keys documented in .env.example
#   3. Webhook endpoint exists
#   4. Webhook signature verification present
#   5. No hardcoded API keys in source
#   6. HTTPS enforcement for payment URLs
#   7. Error handling around payment operations
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more checks failed

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Disable colors when not running in a terminal
if [ ! -t 1 ]; then
  RED='' GREEN='' YELLOW='' NC=''
fi

# Usage
if [[ $# -lt 1 ]]; then
  printf "Usage: %s <project_root>\n" "$0"
  printf "\n"
  printf "Validates payment integration implementation.\n"
  printf "\n"
  printf "Checks:\n"
  printf "  1. Payment library installed\n"
  printf "  2. API keys in .env.example\n"
  printf "  3. Webhook endpoint exists\n"
  printf "  4. Webhook signature verification\n"
  printf "  5. No hardcoded secrets\n"
  printf "  6. HTTPS enforcement\n"
  printf "  7. Error handling present\n"
  printf "\n"
  printf "Exit codes:\n"
  printf "  0 = PASS\n"
  printf "  1 = FAIL\n"
  exit 1
fi

PROJECT_ROOT="$1"

if [[ ! -d "$PROJECT_ROOT" ]]; then
  printf "%bERROR: Directory not found: %s%b\n" "$RED" "$PROJECT_ROOT" "$NC"
  exit 1
fi

# Violation tracking
VIOLATIONS=()
WARNINGS=()

# Helper: Add violation
add_violation() {
  VIOLATIONS+=("$1")
}

# Helper: Add warning
add_warning() {
  WARNINGS+=("$1")
}

printf "Validating payment integration in: %s\n" "$PROJECT_ROOT"
printf "\n"

# ============================================================================
# CHECK 1: Payment library installed
# ============================================================================

printf "[1/7] Checking for payment library...\n"

PAYMENT_LIB_FOUND=false

if [[ -f "$PROJECT_ROOT/package.json" ]]; then
  if grep -qE '"stripe"|"@lemonsqueezy/lemonsqueezy.js"|"@paddle/paddle-node-sdk"' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b Payment library found in package.json\n" "$GREEN" "$NC"
    PAYMENT_LIB_FOUND=true
  fi
fi

if [[ "$PAYMENT_LIB_FOUND" == false ]]; then
  add_violation "No payment library found. Install stripe, @lemonsqueezy/lemonsqueezy.js, or @paddle/paddle-node-sdk."
fi

# ============================================================================
# CHECK 2: API keys documented in .env.example
# ============================================================================

printf "[2/7] Checking API key documentation...\n"

KEY_DOCS_FOUND=false

if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
  if grep -qE '(STRIPE_SECRET_KEY|LEMONSQUEEZY_API_KEY|PADDLE_API_KEY)' -- "$PROJECT_ROOT/.env.example"; then
    printf "  %b[PASS]%b Payment API keys documented in .env.example\n" "$GREEN" "$NC"
    KEY_DOCS_FOUND=true
  else
    add_violation "Payment API keys not documented in .env.example."
  fi
else
  add_violation ".env.example not found. Create it to document required environment variables."
fi

# ============================================================================
# CHECK 3: Webhook endpoint exists
# ============================================================================

printf "[3/7] Checking for webhook endpoint...\n"

WEBHOOK_FOUND=false

if find "$PROJECT_ROOT" -type f \( -name "*.ts" -o -name "*.js" \) \
     -not -path "*/node_modules/*" \
     -not -path "*/.git/*" \
     -not -path "*/dist/*" \
     -not -path "*/.next/*" \
     -exec grep -lE '(webhooks?|/api/webhooks)' {} \; | grep -q .; then
  printf "  %b[PASS]%b Webhook endpoint found\n" "$GREEN" "$NC"
  WEBHOOK_FOUND=true
fi

if [[ "$WEBHOOK_FOUND" == false ]]; then
  add_warning "No webhook endpoint detected. Webhooks are required for production payment processing."
fi

# ============================================================================
# CHECK 4: Webhook signature verification
# ============================================================================

printf "[4/7] Checking webhook signature verification...\n"

SIG_VERIFY_FOUND=false

PATTERNS=(
  'constructEvent'
  'createHmac'
  'x-signature'
  'stripe-signature'
)

for pattern in "${PATTERNS[@]}"; do
  if find "$PROJECT_ROOT" -type f \( -name "*.ts" -o -name "*.js" \) \
       -not -path "*/node_modules/*" \
       -not -path "*/.git/*" \
       -not -path "*/dist/*" \
       -not -path "*/.next/*" \
       -exec grep -lF "$pattern" {} \; | grep -q .; then
    printf "  %b[PASS]%b Webhook signature verification found: %s\n" "$GREEN" "$NC" "$pattern"
    SIG_VERIFY_FOUND=true
    break
  fi
done

if [[ "$SIG_VERIFY_FOUND" == false ]] && [[ "$WEBHOOK_FOUND" == true ]]; then
  add_violation "Webhook signature verification not found. Always verify webhook signatures."
fi

# ============================================================================
# CHECK 5: No hardcoded API keys
# ============================================================================

printf "[5/7] Checking for hardcoded API keys...\n"

HARDCODED_FOUND=false

KEY_PATTERNS=(
  'sk_live_[a-zA-Z0-9]{24,}'
  'sk_test_[a-zA-Z0-9]{24,}'
  'pk_live_[a-zA-Z0-9]{24,}'
  'pk_test_[a-zA-Z0-9]{24,}'
)

for pattern in "${KEY_PATTERNS[@]}"; do
  if find "$PROJECT_ROOT" -type f \( -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" \) \
       -not -path "*/node_modules/*" \
       -not -path "*/.git/*" \
       -not -path "*/dist/*" \
       -not -path "*/.next/*" \
       -exec grep -lE "$pattern" {} \; | grep -q .; then
    add_violation "Hardcoded API key detected: $pattern. Use environment variables."
    HARDCODED_FOUND=true
  fi
done

if [[ "$HARDCODED_FOUND" == false ]]; then
  printf "  %b[PASS]%b No hardcoded API keys detected\n" "$GREEN" "$NC"
fi

# ============================================================================
# CHECK 6: HTTPS enforcement
# ============================================================================

printf "[6/7] Checking HTTPS enforcement...\n"

HTTPS_FOUND=false

if find "$PROJECT_ROOT" -type f \( -name "*.ts" -o -name "*.js" \) \
     -not -path "*/node_modules/*" \
     -not -path "*/.git/*" \
     -not -path "*/dist/*" \
     -not -path "*/.next/*" \
     -exec grep -lE "(x-forwarded-proto.*https|protocol.*https|HTTPS)" {} \; | grep -q .; then
  printf "  %b[PASS]%b HTTPS enforcement found\n" "$GREEN" "$NC"
  HTTPS_FOUND=true
fi

if [[ "$HTTPS_FOUND" == false ]]; then
  add_warning "No HTTPS enforcement detected. Enforce HTTPS for payment endpoints in production."
fi

# ============================================================================
# CHECK 7: Error handling around payments
# ============================================================================

printf "[7/7] Checking error handling...\n"

ERROR_HANDLING_FOUND=false

if find "$PROJECT_ROOT" -type f \( -name "*.ts" -o -name "*.js" \) \
     -not -path "*/node_modules/*" \
     -not -path "*/.git/*" \
     -not -path "*/dist/*" \
     -not -path "*/.next/*" \
     -print0 | xargs -0 grep -l "try" | \
     xargs grep -lE "(stripe|lemonsqueezy|paddle)" | grep -q .; then
  printf "  %b[PASS]%b Error handling found around payment operations\n" "$GREEN" "$NC"
  ERROR_HANDLING_FOUND=true
fi

if [[ "$ERROR_HANDLING_FOUND" == false ]]; then
  add_warning "Limited error handling detected. Wrap payment operations in try-catch blocks."
fi

# ============================================================================
# RESULTS
# ============================================================================

printf "\n"
printf "%s\n" "-------------------------------------------------------"

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  if [[ ${#WARNINGS[@]} -eq 0 ]]; then
    printf "%b[PASS]%b - Payment integration validated\n" "$GREEN" "$NC"
    printf "%s\n" "-------------------------------------------------------"
    exit 0
  else
    printf "%b[PASS]%b - Payment integration validated (with warnings)\n" "$GREEN" "$NC"
    printf "\n"
    printf "%bWarnings:%b\n" "$YELLOW" "$NC"
    for i in "${!WARNINGS[@]}"; do
      printf "  %b%d:%b %s\n" "$YELLOW" "$((i + 1))" "$NC" "${WARNINGS[$i]}"
    done
    printf "%s\n" "-------------------------------------------------------"
    exit 0
  fi
else
  printf "%b[FAIL]%b - %d violation(s) found:\n" "$RED" "$NC" "${#VIOLATIONS[@]}"
  printf "\n"
  for i in "${!VIOLATIONS[@]}"; do
    printf "  %b%d:%b %s\n" "$RED" "$((i + 1))" "$NC" "${VIOLATIONS[$i]}"
  done
  
  if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    printf "\n"
    printf "%bWarnings:%b\n" "$YELLOW" "$NC"
    for i in "${!WARNINGS[@]}"; do
      printf "  %b%d:%b %s\n" "$YELLOW" "$((i + 1))" "$NC" "${WARNINGS[$i]}"
    done
  fi
  
  printf "%s\n" "-------------------------------------------------------"
  exit 1
fi
