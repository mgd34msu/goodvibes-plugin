#!/usr/bin/env bash

# Requires: bash 4+ (uses arrays, [[ ]])
# validate-services.sh
# Validates external service integrations for security and best practices
#
# Usage: ./validate-services.sh <project_root>
#
# Checks:
#   1. Service SDKs installed (email, CMS, uploads, analytics)
#   2. API keys documented in .env.example
#   3. No hardcoded API keys in source code
#   4. Error handling around service calls
#   5. Webhook signature verification
#   6. File upload size limits configured
#   7. Rate limiting for outbound API calls
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more checks failed

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Disable colors when not running in a terminal
if [ ! -t 1 ]; then
  RED='' GREEN='' YELLOW='' NC=''
fi

# Usage
if [[ $# -lt 1 ]]; then
  printf "Usage: %s <project_root>\n" "$0"
  printf "\n"
  printf "Validates external service integrations.\n"
  printf "\n"
  printf "Checks:\n"
  printf "  1. Service SDKs installed\n"
  printf "  2. API keys in .env.example\n"
  printf "  3. No hardcoded API keys\n"
  printf "  4. Error handling around service calls\n"
  printf "  5. Webhook signature verification\n"
  printf "  6. File upload size limits\n"
  printf "  7. Rate limiting configured\n"
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

printf "Validating service integrations in: %s\n" "$PROJECT_ROOT"
printf "\n"

# ============================================================================
# CHECK 1: Service SDKs installed
# ============================================================================

printf "[1/7] Checking for service SDKs...\n"

SDK_FOUND=false

if [[ -f "$PROJECT_ROOT/package.json" ]]; then
  # Email SDKs
  if grep -qE '("resend"|"@sendgrid/mail"|"postmark"|"nodemailer")' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b Email SDK found\n" "$GREEN" "$NC"
    SDK_FOUND=true
  fi
  
  # CMS SDKs
  if grep -qE '("@sanity/client"|"contentful"|"@payloadcms"|"@strapi")' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b CMS SDK found\n" "$GREEN" "$NC"
    SDK_FOUND=true
  fi
  
  # Upload SDKs
  if grep -qE '("uploadthing"|"cloudinary"|"@aws-sdk/client-s3")' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b Upload SDK found\n" "$GREEN" "$NC"
    SDK_FOUND=true
  fi
  
  # Analytics SDKs
  if grep -qE '("posthog-js"|"plausible"|"@vercel/analytics")' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b Analytics SDK found\n" "$GREEN" "$NC"
    SDK_FOUND=true
  fi
fi

if [[ "$SDK_FOUND" == false ]]; then
  add_warning "No external service SDKs found. This may be expected for early-stage projects."
fi

# ============================================================================
# CHECK 2: API keys documented in .env.example
# ============================================================================

printf "[2/7] Checking for API key documentation...\n"

if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
  ENV_KEYS_FOUND=false
  
  # Check for common service API keys
  if grep -qE '(RESEND_|SENDGRID_|POSTMARK_|SANITY_|CONTENTFUL_|UPLOADTHING_|CLOUDINARY_|AWS_|POSTHOG_|STRIPE_)' -- "$PROJECT_ROOT/.env.example"; then
    printf "  %b[PASS]%b Service API keys documented in .env.example\n" "$GREEN" "$NC"
    ENV_KEYS_FOUND=true
  fi
  
  if [[ "$ENV_KEYS_FOUND" == false ]]; then
    add_warning "No service API keys found in .env.example. Document all required keys."
  fi
else
  add_violation ".env.example not found. Create it to document required environment variables."
fi

# ============================================================================
# CHECK 3: No hardcoded API keys in source code
# ============================================================================

printf "[3/7] Checking for hardcoded API keys...\n"

# Patterns that indicate hardcoded secrets
HARDCODED_PATTERNS=(
  're_[a-zA-Z0-9]{32}'
  'sk_live_[a-zA-Z0-9]{24}'
  'pk_live_[a-zA-Z0-9]{24}'
  'SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}'
  'AKIA[0-9A-Z]{16}'
)

HARDCODED_FOUND=false

for pattern in "${HARDCODED_PATTERNS[@]}"; do
  if grep -r -E --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -- "$pattern" "$PROJECT_ROOT" 2>/dev/null | grep -v '.env' | grep -q .; then
    add_violation "Hardcoded API key pattern detected: $pattern. Use environment variables."
    HARDCODED_FOUND=true
  fi
done

if [[ "$HARDCODED_FOUND" == false ]]; then
  printf "  %b[PASS]%b No hardcoded API keys detected\n" "$GREEN" "$NC"
fi

# ============================================================================
# CHECK 4: Error handling around service calls
# ============================================================================

printf "[4/7] Checking error handling for service calls...\n"

# Look for service calls without error handling
UNSAFE_PATTERNS=(
  'await.*\.send\(.*\)'
  'await.*\.create\(.*\)'
  'await.*\.fetch\(.*\)'
)

ERROR_HANDLING_ISSUES=false

# Check if files with service calls also have try-catch or error checking
for pattern in "${UNSAFE_PATTERNS[@]}"; do
  FILES_WITH_CALLS=$(grep -r -l -E --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -- "$pattern" "$PROJECT_ROOT" 2>/dev/null || true)
  
  if [[ -n "$FILES_WITH_CALLS" ]]; then
    while IFS= read -r file; do
      # Check if file has try-catch or .catch() or error checking
      if ! grep -qE '(try \{|catch|if.*error|throw new Error)' -- "$file"; then
        add_warning "Service call in $file may lack error handling. Ensure proper try-catch blocks."
        ERROR_HANDLING_ISSUES=true
      fi
    done <<< "$FILES_WITH_CALLS"
  fi
done

if [[ "$ERROR_HANDLING_ISSUES" == false ]]; then
  printf "  %b[PASS]%b Error handling patterns found\n" "$GREEN" "$NC"
fi

# ============================================================================
# CHECK 5: Webhook signature verification
# ============================================================================

printf "[5/7] Checking webhook signature verification...\n"

WEBHOOK_FILES=$(find "$PROJECT_ROOT" -type f \( -path "*/api/webhooks/*" -o -path "*/webhooks/*" \) \( -name "*.ts" -o -name "*.js" \) -not -path "*/node_modules/*" 2>/dev/null || true)

if [[ -n "$WEBHOOK_FILES" ]]; then
  WEBHOOK_VERIFIED=true
  
  while IFS= read -r webhook_file; do
    # Check for signature verification patterns
    if ! grep -qE '(signature|verify|hmac|secret)' -- "$webhook_file"; then
      add_violation "Webhook handler $webhook_file lacks signature verification. Add security checks."
      WEBHOOK_VERIFIED=false
    fi
  done <<< "$WEBHOOK_FILES"
  
  if [[ "$WEBHOOK_VERIFIED" == true ]]; then
    printf "  %b[PASS]%b Webhook signature verification found\n" "$GREEN" "$NC"
  fi
else
  printf "  %b[PASS]%b No webhook handlers found\n" "$GREEN" "$NC"
fi

# ============================================================================
# CHECK 6: File upload size limits configured
# ============================================================================

printf "[6/7] Checking file upload size limits...\n"

UPLOAD_LIMITS_FOUND=false

# Check for UploadThing size limits
if grep -r -E --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -- 'maxFileSize' "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Upload size limits configured\n" "$GREEN" "$NC"
  UPLOAD_LIMITS_FOUND=true
fi

# Check for multer limits
if grep -r -E --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -- 'limits.*fileSize' "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Upload size limits configured\n" "$GREEN" "$NC"
  UPLOAD_LIMITS_FOUND=true
fi

# Check for Next.js body size limits
if [[ -f "$PROJECT_ROOT/next.config.js" ]] || [[ -f "$PROJECT_ROOT/next.config.mjs" ]] || [[ -f "$PROJECT_ROOT/next.config.ts" ]]; then
  for config_file in "$PROJECT_ROOT"/next.config.*; do
    [[ -f "$config_file" ]] || continue
    if grep -qE 'bodySizeLimit' -- "$config_file"; then
      printf "  %b[PASS]%b Body size limits configured in Next.js\n" "$GREEN" "$NC"
      UPLOAD_LIMITS_FOUND=true
      break
    fi
  done
fi

if [[ "$UPLOAD_LIMITS_FOUND" == false ]]; then
  add_warning "No file upload size limits detected. Configure limits to prevent abuse."
fi

# ============================================================================
# CHECK 7: Rate limiting for outbound API calls
# ============================================================================

printf "[7/7] Checking rate limiting for outbound calls...\n"

RATE_LIMIT_FOUND=false

# Check for rate limiting implementations
if grep -r -E --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -- '(RateLimiter|ratelimit|bottleneck|p-limit)' "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Rate limiting implementation found\n" "$GREEN" "$NC"
  RATE_LIMIT_FOUND=true
fi

# Check for retry/backoff implementations
if grep -r -E --include="*.ts" --include="*.js" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -- '(retry|backoff|exponential)' "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Retry/backoff logic found\n" "$GREEN" "$NC"
  RATE_LIMIT_FOUND=true
fi

if [[ "$RATE_LIMIT_FOUND" == false ]]; then
  add_warning "No rate limiting detected. Implement rate limiting to prevent API quota exhaustion."
fi

# ============================================================================
# RESULTS
# ============================================================================

printf "\n"
printf "%s\n" "-------------------------------------------------------"

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  if [[ ${#WARNINGS[@]} -eq 0 ]]; then
    printf "%b[PASS]%b - Service integrations validated\n" "$GREEN" "$NC"
    printf "%s\n" "-------------------------------------------------------"
    exit 0
  else
    printf "%b[PASS]%b - Service integrations validated (with warnings)\n" "$GREEN" "$NC"
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
