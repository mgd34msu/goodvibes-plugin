#!/usr/bin/env bash

# Requires: bash 4+ (uses arrays, [[ ]])
# validate-security-audit.sh
# Validates security audit thoroughness and security posture
#
# Usage: ./validate-security-audit.sh <project_root>
#
# Checks:
#   1. Authentication patterns (no hardcoded credentials, secure session handling)
#   2. Input validation (no eval, raw SQL, dangerouslySetInnerHTML without sanitization)
#   3. Dependency vulnerabilities (npm audit)
#   4. Secrets management (no .env committed, no hardcoded API keys)
#   5. Security headers (CORS, CSP, HSTS)
#   6. Authorization checks (API routes protected)
#   7. Encryption usage (sensitive data protection)
#   8. Docker security (non-root user, minimal images)
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
  printf "Validates security audit thoroughness and security posture.\n"
  printf "\n"
  printf "Checks:\n"
  printf "  1. Authentication patterns\n"
  printf "  2. Input validation\n"
  printf "  3. Dependency vulnerabilities\n"
  printf "  4. Secrets management\n"
  printf "  5. Security headers\n"
  printf "  6. Authorization checks\n"
  printf "  7. Encryption usage\n"
  printf "  8. Docker security\n"
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

printf "Validating security audit in: %s\n" "$PROJECT_ROOT"
printf "\n"

# ============================================================================
# CHECK 1: Authentication Patterns
# ============================================================================

printf "[1/8] Checking authentication security...\n"

# Check for hardcoded passwords
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "password.*=.*[\"'][^\"']{8,}[\"']" -- "$PROJECT_ROOT" 2>/dev/null | grep -v "password.*process\.env" | grep -q .; then
  add_violation "Potential hardcoded password detected. Use environment variables."
else
  printf "  %b[PASS]%b No hardcoded passwords detected\n" "$GREEN" "$NC"
fi

# Check for secure cookie configuration
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "httpOnly.*false|secure.*false" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  add_violation "Insecure cookie configuration detected (httpOnly or secure set to false)."
else
  printf "  %b[PASS]%b No insecure cookie configurations\n" "$GREEN" "$NC"
fi

# Check for weak hashing algorithms
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "(md5|sha1)\\(" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  add_violation "Weak hashing algorithm detected (MD5 or SHA1). Use bcrypt, argon2, or scrypt."
else
  printf "  %b[PASS]%b No weak hashing algorithms detected\n" "$GREEN" "$NC"
fi

# Check for password hashing implementation
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "(bcrypt|argon2|scrypt)" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Strong password hashing detected\n" "$GREEN" "$NC"
else
  add_warning "No password hashing library detected. If handling passwords, use bcrypt or argon2."
fi

# ============================================================================
# CHECK 2: Input Validation
# ============================================================================

printf "[2/8] Checking input validation...\n"

# Check for SQL injection vulnerabilities
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '(\$queryRaw|\$executeRaw).*\$\{|query.*\+.*req\.(body|params|query)' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  add_violation "Potential SQL injection vulnerability detected. Use parameterized queries."
else
  printf "  %b[PASS]%b No SQL injection patterns detected\n" "$GREEN" "$NC"
fi

# Check for XSS vulnerabilities
if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next "dangerouslySetInnerHTML" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  add_warning "dangerouslySetInnerHTML usage detected. Ensure HTML is sanitized with DOMPurify."
fi

# Check for command injection vulnerabilities
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "(exec|spawn).*req\\.(body|params|query)" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  add_violation "Potential command injection vulnerability detected. Validate and sanitize shell inputs."
else
  printf "  %b[PASS]%b No command injection patterns detected\n" "$GREEN" "$NC"
fi

# Check for path traversal vulnerabilities
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "(readFile|writeFile).*req\\.(body|params|query)" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  add_violation "Potential path traversal vulnerability detected. Validate file paths."
else
  printf "  %b[PASS]%b No path traversal patterns detected\n" "$GREEN" "$NC"
fi

# Check for input validation library usage
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "(zod|yup|joi)\." -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Input validation library detected\n" "$GREEN" "$NC"
else
  add_warning "No input validation library detected. Consider using Zod, Yup, or Joi."
fi

# ============================================================================
# CHECK 3: Dependency Vulnerabilities
# ============================================================================

printf "[3/8] Checking dependency vulnerabilities...\n"

if [[ -f "$PROJECT_ROOT/package.json" ]]; then
  if command -v npm &> /dev/null; then
    if (cd "$PROJECT_ROOT" && npm audit --audit-level=high 2>/dev/null); then
      printf "  %b[PASS]%b No high/critical vulnerabilities detected\n" "$GREEN" "$NC"
    else
      add_violation "npm audit detected high or critical vulnerabilities. Run 'npm audit fix'."
    fi
  else
    add_warning "npm not found. Skipping dependency vulnerability check."
  fi
else
  add_warning "No package.json found. Skipping dependency check."
fi

# ============================================================================
# CHECK 4: Secrets Management
# ============================================================================

printf "[4/8] Checking secrets management...\n"

# Check if .env is committed
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  if git -C "$PROJECT_ROOT" ls-files --error-unmatch .env 2>/dev/null; then
    add_violation ".env file is committed to version control. Add it to .gitignore immediately."
  else
    add_warning ".env file exists but not committed. Ensure it's in .gitignore."
  fi
fi

# Check for .env.example
if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
  printf "  %b[PASS]%b .env.example found\n" "$GREEN" "$NC"
else
  add_warning ".env.example not found. Create it to document required environment variables."
fi

# Check for hardcoded API keys
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "(api.*key|secret.*key).*=.*[\"'][a-zA-Z0-9]{20,}[\"']|sk_live_[a-zA-Z0-9]{24,}|sk_test_[a-zA-Z0-9]{24,}" -- "$PROJECT_ROOT" 2>/dev/null | grep -v "process\.env" | grep -q .; then
  add_violation "Hardcoded API key detected. Use environment variables."
else
  printf "  %b[PASS]%b No hardcoded API keys detected\n" "$GREEN" "$NC"
fi

# Check for .gitignore with .env
if [[ -f "$PROJECT_ROOT/.gitignore" ]]; then
  if grep -q "\.env" -- "$PROJECT_ROOT/.gitignore"; then
    printf "  %b[PASS]%b .env is in .gitignore\n" "$GREEN" "$NC"
  else
    add_violation ".env not found in .gitignore. Add it to prevent committing secrets."
  fi
else
  add_warning "No .gitignore found. Create one and add .env to it."
fi

# ============================================================================
# CHECK 5: Security Headers
# ============================================================================

printf "[5/8] Checking security headers configuration...\n"

# Check for CSP configuration
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.json' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next "Content-Security-Policy" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Content-Security-Policy header configured\n" "$GREEN" "$NC"
else
  add_warning "Content-Security-Policy header not configured. Add CSP headers for XSS protection."
fi

# Check for HSTS
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.json' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next "Strict-Transport-Security" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b HSTS header configured\n" "$GREEN" "$NC"
else
  add_warning "HSTS header not configured. Add Strict-Transport-Security for HTTPS enforcement."
fi

# Check for X-Frame-Options
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.json' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next "X-Frame-Options" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b X-Frame-Options header configured\n" "$GREEN" "$NC"
else
  add_warning "X-Frame-Options header not configured. Add it to prevent clickjacking."
fi

# Check for CORS configuration
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "(Access-Control-Allow-Origin|cors)" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  # Check for wildcard CORS with credentials
  if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next "Access-Control-Allow-Origin.*\\*.*credentials.*true" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
    add_violation "Insecure CORS configuration detected (wildcard with credentials). Specify allowed origins."
  else
    printf "  %b[PASS]%b CORS configured\n" "$GREEN" "$NC"
  fi
else
  add_warning "No CORS configuration detected. Configure CORS if building an API."
fi

# ============================================================================
# CHECK 6: Authorization Checks
# ============================================================================

printf "[6/8] Checking authorization implementation...\n"

# Count API routes
API_ROUTE_COUNT=$(find "$PROJECT_ROOT" \( -path "*/api/*" -name "*.ts" -o -path "*/api/*" -name "*.js" \) 2>/dev/null | wc -l)

if [[ $API_ROUTE_COUNT -gt 0 ]]; then
  printf "  Found %d API route files\n" "$API_ROUTE_COUNT"
  
  # Check for auth middleware usage
  if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "(requireAuth|withAuth|authorize|checkPermission|getServerSession|auth\\(\\))" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
    printf "  %b[PASS]%b Authentication middleware detected\n" "$GREEN" "$NC"
  else
    add_violation "No authentication middleware found. Protect API routes with auth checks."
  fi
  
  # Check for ownership/permission checks
  if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "(userId.*===|authorId.*===|ownerId.*===|role.*===|hasPermission)" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
    printf "  %b[PASS]%b Authorization checks detected\n" "$GREEN" "$NC"
  else
    add_warning "No authorization checks detected. Verify users can only access their own resources."
  fi
else
  add_warning "No API routes found. Skipping authorization checks."
fi

# ============================================================================
# CHECK 7: Encryption Usage
# ============================================================================

printf "[7/8] Checking encryption implementation...\n"

# Check for encryption library usage
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "(crypto|createCipheriv|encrypt|decrypt)" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Encryption usage detected\n" "$GREEN" "$NC"
  
  # Check for weak encryption algorithms
  if grep -r -E --include='*.ts' --include='*.js' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next "(createCipher|algorithm).*\\b(des|rc4|3des)\\b" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
    add_violation "Weak encryption algorithm detected (DES/RC4/3DES). Use AES-256-GCM."
  fi
else
  add_warning "No encryption usage detected. If handling sensitive data, implement encryption."
fi

# Check for HTTPS enforcement
if grep -r --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.json' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E "(secure.*true|https|tls)" -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b HTTPS/TLS configuration detected\n" "$GREEN" "$NC"
else
  add_warning "No HTTPS enforcement detected. Ensure secure flag on cookies and HSTS headers."
fi

# ============================================================================
# CHECK 8: Docker Security
# ============================================================================

printf "[8/8] Checking Docker security...\n"

if [[ -f "$PROJECT_ROOT/Dockerfile" ]]; then
  printf "  %b[PASS]%b Dockerfile found\n" "$GREEN" "$NC"
  
  # Check for non-root user
  if ! grep -qE "USER[[:space:]]+root" -- "$PROJECT_ROOT/Dockerfile" && grep -qE "USER[[:space:]]|adduser|addgroup" -- "$PROJECT_ROOT/Dockerfile"; then
    printf "  %b[PASS]%b Non-root user configured\n" "$GREEN" "$NC"
  else
    add_violation "Dockerfile does not configure non-root user. Running containers as root is a security risk."
  fi
  
  # Check for alpine or distroless base image
  if grep -qE "FROM.*alpine|FROM.*distroless" -- "$PROJECT_ROOT/Dockerfile"; then
    printf "  %b[PASS]%b Minimal base image detected\n" "$GREEN" "$NC"
  else
    add_warning "Dockerfile does not use minimal base image (alpine/distroless). Consider reducing attack surface."
  fi
  
  # Check for multi-stage build
  if grep -q "FROM.*AS" -- "$PROJECT_ROOT/Dockerfile"; then
    printf "  %b[PASS]%b Multi-stage build detected\n" "$GREEN" "$NC"
  else
    add_warning "Dockerfile does not use multi-stage build. Consider optimizing image size."
  fi
  
  # Check for HEALTHCHECK
  if grep -q "HEALTHCHECK" -- "$PROJECT_ROOT/Dockerfile"; then
    printf "  %b[PASS]%b HEALTHCHECK configured\n" "$GREEN" "$NC"
  else
    add_warning "Dockerfile does not include HEALTHCHECK. Add health check for monitoring."
  fi
  
  # Check for version pinning
  if grep -qE "FROM.*:latest" -- "$PROJECT_ROOT/Dockerfile"; then
    add_violation "Dockerfile uses :latest tag. Pin base image versions for reproducibility."
  else
    printf "  %b[PASS]%b Base image version pinned\n" "$GREEN" "$NC"
  fi
else
  add_warning "No Dockerfile found. If using Docker, create a secure Dockerfile."
fi

# ============================================================================
# RESULTS
# ============================================================================

printf "\n"
printf "%s\n" "-------------------------------------------------------"

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  if [[ ${#WARNINGS[@]} -eq 0 ]]; then
    printf "%b[PASS]%b - Security audit validation passed\n" "$GREEN" "$NC"
    printf "%s\n" "-------------------------------------------------------"
    exit 0
  else
    printf "%b[PASS]%b - Security audit validation passed (with warnings)\n" "$GREEN" "$NC"
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
