#!/usr/bin/env bash

# Requires: bash 4+ (uses arrays, [[ ]])
# database-checklist.sh
# Validates database layer implementation for security and best practices
#
# Usage: ./database-checklist.sh <project_root>
#
# Checks:
#   1. Schema file exists (Prisma or Drizzle)
#   2. Migration directory present
#   3. Database URL documented in .env.example
#   4. Type generation configured
#   5. No raw SQL with string concatenation (injection risk)
#   6. Connection pooling configured
#   7. Indexes on foreign keys
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
  printf "Validates database layer implementation.\n"
  printf "\n"
  printf "Checks:\n"
  printf "  1. Schema file exists\n"
  printf "  2. Migration directory present\n"
  printf "  3. Database URL in .env.example\n"
  printf "  4. Type generation configured\n"
  printf "  5. No SQL injection patterns\n"
  printf "  6. Connection pooling configured\n"
  printf "  7. Indexes on foreign keys\n"
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

printf "Validating database implementation in: %s\n" "$PROJECT_ROOT"
printf "\n"

# ============================================================================
# CHECK 1: Schema file exists
# ============================================================================

printf "[1/7] Checking for schema file...\n"

SCHEMA_FOUND=false

# Check for Prisma schema
if [[ -f "$PROJECT_ROOT/prisma/schema.prisma" ]]; then
  printf "  %b[PASS]%b Prisma schema found: prisma/schema.prisma\n" "$GREEN" "$NC"
  SCHEMA_FOUND=true
  SCHEMA_TYPE="prisma"
fi

# Check for Drizzle schema
if [[ -f "$PROJECT_ROOT/src/db/schema.ts" ]] || [[ -f "$PROJECT_ROOT/db/schema.ts" ]]; then
  printf "  %b[PASS]%b Drizzle schema found\n" "$GREEN" "$NC"
  SCHEMA_FOUND=true
  SCHEMA_TYPE="drizzle"
fi

# Check for Mongoose models
if find -- "$PROJECT_ROOT" -name "*.model.ts" -o -name "*.model.js" | grep -q .; then
  printf "  %b[PASS]%b Mongoose models found\n" "$GREEN" "$NC"
  SCHEMA_FOUND=true
  SCHEMA_TYPE="mongoose"
fi

if [[ "$SCHEMA_FOUND" == false ]]; then
  add_violation "No schema file found. Expected prisma/schema.prisma, src/db/schema.ts, or *.model.ts files."
fi

# ============================================================================
# CHECK 2: Migration directory present
# ============================================================================

printf "[2/7] Checking for migration directory...\n"

MIGRATION_FOUND=false

if [[ -d "$PROJECT_ROOT/prisma/migrations" ]]; then
  printf "  %b[PASS]%b Migration directory found: prisma/migrations\n" "$GREEN" "$NC"
  MIGRATION_FOUND=true
fi

if [[ -d "$PROJECT_ROOT/drizzle" ]] || [[ -d "$PROJECT_ROOT/migrations" ]]; then
  printf "  %b[PASS]%b Migration directory found\n" "$GREEN" "$NC"
  MIGRATION_FOUND=true
fi

if [[ "$MIGRATION_FOUND" == false ]]; then
  add_warning "No migration directory found. Migrations are recommended for production databases."
fi

# ============================================================================
# CHECK 3: Database URL documented
# ============================================================================

printf "[3/7] Checking for DATABASE_URL documentation...\n"

if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
  if grep -q "DATABASE_URL" -- "$PROJECT_ROOT/.env.example"; then
    printf "  %b[PASS]%b DATABASE_URL documented in .env.example\n" "$GREEN" "$NC"
  else
    add_violation "DATABASE_URL not found in .env.example. Document required environment variables."
  fi
else
  add_violation ".env.example not found. Create it to document required environment variables."
fi

# ============================================================================
# CHECK 4: Type generation configured
# ============================================================================

printf "[4/7] Checking type generation configuration...\n"

TYPE_GEN_FOUND=false

if [[ -f "$PROJECT_ROOT/package.json" ]]; then
  # Check for Prisma generate script
  if grep -q '"prisma".*"generate"' -- "$PROJECT_ROOT/package.json" || \
     grep -q 'prisma generate' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b Prisma type generation configured\n" "$GREEN" "$NC"
    TYPE_GEN_FOUND=true
  fi

  # Check for Drizzle generate script
  if grep -q 'drizzle-kit' -- "$PROJECT_ROOT/package.json"; then
    printf "  %b[PASS]%b Drizzle kit configured\n" "$GREEN" "$NC"
    TYPE_GEN_FOUND=true
  fi
fi

if [[ "$TYPE_GEN_FOUND" == false ]]; then
  add_warning "Type generation not configured in package.json. Consider adding generate scripts."
fi

# ============================================================================
# CHECK 5: No SQL injection patterns
# ============================================================================

printf "[5/7] Checking for SQL injection vulnerabilities...\n"

# Note: Tagged template SQL (Prisma $queryRaw, Drizzle sql``) is safe but may trigger false positives.
# This check targets string concatenation in raw SQL, not parameterized queries.
# Look for dangerous patterns: raw SQL with string concatenation
INJECTION_PATTERNS=(
  '\$queryRaw.*\+'
  '\$executeRaw.*\+'
  '\`SELECT.*\$\{'
  '\`INSERT.*\$\{'
  '\`UPDATE.*\$\{'
  '\`DELETE.*\$\{'
  'query\(.*\+'
  '.raw\(.*\+'
)

INJECTION_FOUND=false

for pattern in "${INJECTION_PATTERNS[@]}"; do
  if find -- "$PROJECT_ROOT" -type f \( -name "*.ts" -o -name "*.js" \) \
       -not -path "*/node_modules/*" \
       -exec grep -l -E "$pattern" {} \; | grep -q .; then
    add_violation "SQL injection pattern detected: $pattern. Use parameterized queries."
    INJECTION_FOUND=true
  fi
done

if [[ "$INJECTION_FOUND" == false ]]; then
  printf "  %b[PASS]%b No SQL injection patterns detected\n" "$GREEN" "$NC"
fi

# ============================================================================
# CHECK 6: Connection pooling configured
# ============================================================================

printf "[6/7] Checking connection pooling...\n"

POOLING_FOUND=false

# Check .env.example for pooling indicators
if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
  if grep -qE 'pgbouncer|pool|connection_limit' -- "$PROJECT_ROOT/.env.example"; then
    printf "  %b[PASS]%b Connection pooling configured in environment\n" "$GREEN" "$NC"
    POOLING_FOUND=true
  fi
fi

# Check for Prisma Accelerate or pooling in schema
if [[ -f "$PROJECT_ROOT/prisma/schema.prisma" ]]; then
  if grep -qE 'directUrl|pgbouncer' -- "$PROJECT_ROOT/prisma/schema.prisma"; then
    printf "  %b[PASS]%b Connection pooling configured in Prisma schema\n" "$GREEN" "$NC"
    POOLING_FOUND=true
  fi
fi

# Check Drizzle connection config
if find -- "$PROJECT_ROOT" -type f \( -name "*.ts" -o -name "*.js" \) \
     -not -path "*/node_modules/*" \
     -exec grep -l -E 'max:.*[0-9]+|poolSize' {} \; | grep -q .; then
  printf "  %b[PASS]%b Connection pooling configured in code\n" "$GREEN" "$NC"
  POOLING_FOUND=true
fi

if [[ "$POOLING_FOUND" == false ]]; then
  add_warning "No connection pooling detected. Consider configuring pool size for production."
fi

# ============================================================================
# CHECK 7: Indexes on foreign keys
# ============================================================================

printf "[7/7] Checking indexes on foreign keys...\n"

INDEX_FOUND=false

# Check Prisma schema for @@index
if [[ -f "$PROJECT_ROOT/prisma/schema.prisma" ]]; then
  if grep -qE '@@index\(\[.*Id.*\]\)' -- "$PROJECT_ROOT/prisma/schema.prisma"; then
    printf "  %b[PASS]%b Indexes found on foreign keys in Prisma schema\n" "$GREEN" "$NC"
    INDEX_FOUND=true
  else
    add_warning "No @@index directives found on foreign keys in Prisma schema. Add indexes for better query performance."
  fi
fi

# Check Drizzle schema for index()
if [[ -f "$PROJECT_ROOT/src/db/schema.ts" ]] || [[ -f "$PROJECT_ROOT/db/schema.ts" ]]; then
  DRIZZLE_SCHEMA="$PROJECT_ROOT/src/db/schema.ts"
  [[ -f "$PROJECT_ROOT/db/schema.ts" ]] && DRIZZLE_SCHEMA="$PROJECT_ROOT/db/schema.ts"
  
  if grep -qE 'index\(' -- "$DRIZZLE_SCHEMA"; then
    printf "  %b[PASS]%b Indexes found in Drizzle schema\n" "$GREEN" "$NC"
    INDEX_FOUND=true
  else
    add_warning "No index() calls found in Drizzle schema. Add indexes for better query performance."
  fi
fi

# ============================================================================
# RESULTS
# ============================================================================

printf "\n"
printf "-------------------------------------------------------\n"

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  if [[ ${#WARNINGS[@]} -eq 0 ]]; then
    printf "%b[PASS]%b - Database implementation validated\n" "$GREEN" "$NC"
    printf "-------------------------------------------------------\n"
    exit 0
  else
    printf "%b[PASS]%b - Database implementation validated (with warnings)\n" "$GREEN" "$NC"
    printf "\n"
    printf "%bWarnings:%b\n" "$YELLOW" "$NC"
    for i in "${!WARNINGS[@]}"; do
      printf "  %b%d:%b %s\n" "$YELLOW" "$((i + 1))" "$NC" "${WARNINGS[$i]}"
    done
    printf "-------------------------------------------------------\n"
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
  
  printf "-------------------------------------------------------\n"
  exit 1
fi
