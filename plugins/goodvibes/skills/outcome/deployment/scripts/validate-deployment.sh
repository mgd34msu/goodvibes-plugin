#!/usr/bin/env bash

# Requires: bash 4+ (uses arrays, [[ ]])
# validate-deployment.sh
# Validates deployment readiness for production
#
# Usage: ./validate-deployment.sh <project_root>
#
# Checks:
#   1. Dockerfile exists and follows best practices
#   2. .env.example exists and documents required variables
#   3. CI/CD configuration present (GitHub Actions)
#   4. Health check endpoint implemented
#   5. .dockerignore exists
#   6. No hardcoded secrets in code
#   7. Build command succeeds
#   8. Migration configuration present
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
  printf "Validates deployment readiness for production.\n"
  printf "\n"
  printf "Checks:\n"
  printf "  1. Dockerfile exists\n"
  printf "  2. .env.example exists\n"
  printf "  3. CI/CD configuration\n"
  printf "  4. Health check endpoint\n"
  printf "  5. .dockerignore exists\n"
  printf "  6. No hardcoded secrets\n"
  printf "  7. Build command succeeds\n"
  printf "  8. Migration configuration\n"
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

printf "Validating deployment readiness in: %s\n" "$PROJECT_ROOT"
printf "\n"

# ============================================================================
# CHECK 1: Dockerfile exists and follows best practices
# ============================================================================

printf "[1/8] Checking Dockerfile...\n"

if [[ -f "$PROJECT_ROOT/Dockerfile" ]]; then
  printf "  %b[PASS]%b Dockerfile found\n" "$GREEN" "$NC"
  
  # Check for multi-stage build
  if grep -q "FROM.*AS" -- "$PROJECT_ROOT/Dockerfile"; then
    printf "  %b[PASS]%b Multi-stage build detected\n" "$GREEN" "$NC"
  else
    add_warning "Dockerfile does not use multi-stage build. Consider optimizing image size."
  fi
  
  # Check for non-root user
  if grep -qE "USER [^r]|adduser|addgroup" -- "$PROJECT_ROOT/Dockerfile"; then
    printf "  %b[PASS]%b Non-root user configured\n" "$GREEN" "$NC"
  else
    add_violation "Dockerfile does not configure non-root user. Running as root is a security risk."
  fi
  
  # Check for HEALTHCHECK
  if grep -q "HEALTHCHECK" -- "$PROJECT_ROOT/Dockerfile"; then
    printf "  %b[PASS]%b HEALTHCHECK configured\n" "$GREEN" "$NC"
  else
    add_warning "Dockerfile does not include HEALTHCHECK. Add health check for better monitoring."
  fi
else
  add_warning "No Dockerfile found. If deploying with Docker, create a Dockerfile."
fi

# ============================================================================
# CHECK 2: .env.example exists
# ============================================================================

printf "[2/8] Checking .env.example...\n"

if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
  printf "  %b[PASS]%b .env.example found\n" "$GREEN" "$NC"
  
  # Check for required environment variables
  REQUIRED_VARS=("DATABASE_URL" "NODE_ENV")
  for var in "${REQUIRED_VARS[@]}"; do
    if grep -q "$var" -- "$PROJECT_ROOT/.env.example"; then
      printf "  %b[PASS]%b %s documented\n" "$GREEN" "$NC" "$var"
    else
      add_warning "$var not documented in .env.example. Consider documenting all environment variables."
    fi
  done
else
  add_violation ".env.example not found. Create it to document required environment variables."
fi

# ============================================================================
# CHECK 3: CI/CD configuration
# ============================================================================

printf "[3/8] Checking CI/CD configuration...\n"

CI_FOUND=false

# Check for GitHub Actions
if [[ -d "$PROJECT_ROOT/.github/workflows" ]]; then
  if find "$PROJECT_ROOT/.github/workflows" -name "*.yml" -o -name "*.yaml" | grep -q .; then
    printf "  %b[PASS]%b GitHub Actions workflows found\n" "$GREEN" "$NC"
    CI_FOUND=true
  fi
fi

# Check for GitLab CI
if [[ -f "$PROJECT_ROOT/.gitlab-ci.yml" ]]; then
  printf "  %b[PASS]%b GitLab CI configuration found\n" "$GREEN" "$NC"
  CI_FOUND=true
fi

# Check for CircleCI
if [[ -f "$PROJECT_ROOT/.circleci/config.yml" ]]; then
  printf "  %b[PASS]%b CircleCI configuration found\n" "$GREEN" "$NC"
  CI_FOUND=true
fi

if [[ "$CI_FOUND" == false ]]; then
  add_warning "No CI/CD configuration found. Consider setting up automated deployments."
fi

# ============================================================================
# CHECK 4: Health check endpoint
# ============================================================================

printf "[4/8] Checking health check endpoint...\n"

HEALTH_FOUND=false

# Search for health check routes
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '/api/health|/health|route.*health' -- "$PROJECT_ROOT" | grep -q .; then
  printf "  %b[PASS]%b Health check endpoint found\n" "$GREEN" "$NC"
  HEALTH_FOUND=true
fi

if [[ "$HEALTH_FOUND" == false ]]; then
  add_violation "No health check endpoint found. Create /api/health for monitoring."
fi

# ============================================================================
# CHECK 5: .dockerignore exists
# ============================================================================

printf "[5/8] Checking .dockerignore...\n"

if [[ -f "$PROJECT_ROOT/.dockerignore" ]]; then
  printf "  %b[PASS]%b .dockerignore found\n" "$GREEN" "$NC"
  
  # Check for node_modules exclusion
  if grep -q "node_modules" -- "$PROJECT_ROOT/.dockerignore"; then
    printf "  %b[PASS]%b node_modules excluded\n" "$GREEN" "$NC"
  else
    add_warning ".dockerignore does not exclude node_modules. Add it to reduce image size."
  fi
  
  # Check for .git exclusion
  if grep -q "\.git" -- "$PROJECT_ROOT/.dockerignore"; then
    printf "  %b[PASS]%b .git excluded\n" "$GREEN" "$NC"
  else
    add_warning ".dockerignore does not exclude .git. Add it to reduce image size."
  fi
else
  if [[ -f "$PROJECT_ROOT/Dockerfile" ]]; then
    add_violation ".dockerignore not found. Create it to exclude unnecessary files from Docker builds."
  fi
fi

# ============================================================================
# CHECK 6: No hardcoded secrets
# ============================================================================

printf "[6/8] Checking for hardcoded secrets...\n"

SECRETS_FOUND=false

# Patterns for common secrets
SECRET_PATTERNS=(
  'api[_-]?key.*=.*["\x27][a-zA-Z0-9]{20,}["\x27]'
  'secret.*=.*["\x27][a-zA-Z0-9]{20,}["\x27]'
  'password.*=.*["\x27][^"\x27]{8,}["\x27]'
  'token.*=.*["\x27][a-zA-Z0-9]{20,}["\x27]'
  'sk_live_[a-zA-Z0-9]{24,}'
  'sk_test_[a-zA-Z0-9]{24,}'
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E -i -- "$pattern" "$PROJECT_ROOT" | grep -q .; then
    add_violation "Potential hardcoded secret detected (pattern: $pattern). Use environment variables."
    SECRETS_FOUND=true
  fi
done

if [[ "$SECRETS_FOUND" == false ]]; then
  printf "  %b[PASS]%b No obvious hardcoded secrets detected\n" "$GREEN" "$NC"
fi

# ============================================================================
# CHECK 7: Build command succeeds
# ============================================================================

printf "[7/8] Checking build command...\n"

if [[ -f "$PROJECT_ROOT/package.json" ]]; then
  if grep -q '"build"' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b Build script found in package.json\n" "$GREEN" "$NC"
    
    # Check for output directory configuration
    if grep -qE 'output.*standalone|outDir|out' -- "$PROJECT_ROOT/package.json" || \
       [[ -f "$PROJECT_ROOT/next.config.js" ]] || \
       [[ -f "$PROJECT_ROOT/next.config.mjs" ]] || \
       [[ -f "$PROJECT_ROOT/vite.config.ts" ]]; then
      printf "  %b[PASS]%b Build output configured\n" "$GREEN" "$NC"
    fi
  else
    add_violation "No build script found in package.json. Add 'build' script for production builds."
  fi
else
  add_warning "No package.json found. If using npm/yarn/pnpm, create package.json."
fi

# ============================================================================
# CHECK 8: Migration configuration
# ============================================================================

printf "[8/8] Checking database migration configuration...\n"

MIGRATION_FOUND=false

# Check for Prisma migrations
if [[ -d "$PROJECT_ROOT/prisma/migrations" ]]; then
  printf "  %b[PASS]%b Prisma migrations directory found\n" "$GREEN" "$NC"
  MIGRATION_FOUND=true
  
  # Check for deploy command in package.json
  if [[ -f "$PROJECT_ROOT/package.json" ]]; then
    if grep -q 'prisma migrate deploy' -- "$PROJECT_ROOT/package.json"; then
      printf "  %b[PASS]%b Prisma migration deploy script configured\n" "$GREEN" "$NC"
    else
      add_warning "Prisma migrations found but no 'migrate deploy' script. Add it for production deployments."
    fi
  fi
fi

# Check for Drizzle migrations
if [[ -d "$PROJECT_ROOT/drizzle" ]] || [[ -d "$PROJECT_ROOT/migrations" ]]; then
  printf "  %b[PASS]%b Drizzle/migration directory found\n" "$GREEN" "$NC"
  MIGRATION_FOUND=true
fi

if [[ "$MIGRATION_FOUND" == false ]]; then
  add_warning "No migration directory found. If using a database, consider setting up migrations."
fi

# ============================================================================
# RESULTS
# ============================================================================

printf "\n"
printf "%s\n" "-------------------------------------------------------"

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  if [[ ${#WARNINGS[@]} -eq 0 ]]; then
    printf "%b[PASS]%b - Deployment configuration validated\n" "$GREEN" "$NC"
    printf "%s\n" "-------------------------------------------------------"
    exit 0
  else
    printf "%b[PASS]%b - Deployment configuration validated (with warnings)\n" "$GREEN" "$NC"
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
