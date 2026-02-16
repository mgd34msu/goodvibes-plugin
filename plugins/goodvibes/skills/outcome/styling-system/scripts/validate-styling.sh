#!/usr/bin/env bash
# Styling System Validator
# Checks styling implementation quality gates
# Requires: bash 4+
# Usage: ./validate-styling.sh <project_root>

set -euo pipefail

PROJECT_ROOT="${1:-.}"
EXIT_CODE=0

# Disable colors if not a TTY
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

log_info "Styling System Validator"
log_info "Project root: ${PROJECT_ROOT}"
printf "\n"

# Check 1: Tailwind config exists (if Tailwind is used)
log_info "Check 1: Tailwind configuration"
if [ -f "${PROJECT_ROOT}/tailwind.config.ts" ] || [ -f "${PROJECT_ROOT}/tailwind.config.js" ]; then
  log_pass "Tailwind config found"
  TAILWIND_USED=true
else
  log_info "No Tailwind config found (may use different styling approach)"
  TAILWIND_USED=false
fi
printf "\n"

# Check 2: Design tokens defined
log_info "Check 2: Design tokens defined"
TOKENS_COUNT=0

if [ -f "${PROJECT_ROOT}/src/styles/tokens.ts" ] || [ -f "${PROJECT_ROOT}/src/styles/tokens.js" ]; then
  log_pass "Design tokens file found"
  TOKENS_COUNT=1
elif grep -rq --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git "colors.*:.*{" -- "${PROJECT_ROOT}/tailwind.config.ts" "${PROJECT_ROOT}/tailwind.config.js" 2>/dev/null; then
  log_pass "Design tokens defined in Tailwind config"
  TOKENS_COUNT=1
else
  log_warn "No design tokens found (recommended for consistency)"
fi
printf "\n"

# Check 3: Responsive utilities used
log_info "Check 3: Responsive design patterns"
RESPONSIVE_COUNT=0

if [ "$TAILWIND_USED" = true ]; then
  RESPONSIVE_COUNT=$(grep -rE --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git "(sm:|md:|lg:|xl:|2xl:)" --include="*.tsx" --include="*.jsx" --include="*.vue" -- "${PROJECT_ROOT}/src" 2>/dev/null | wc -l)
  if [ "$RESPONSIVE_COUNT" -gt 0 ]; then
    log_pass "Found ${RESPONSIVE_COUNT} responsive utility usages"
  else
    log_warn "No responsive utilities found (check mobile-first approach)"
  fi
else
  RESPONSIVE_COUNT=$(grep -rE --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git "@media.*min-width|@media.*max-width" --include="*.css" --include="*.scss" -- "${PROJECT_ROOT}/src" 2>/dev/null | wc -l)
  if [ "$RESPONSIVE_COUNT" -gt 0 ]; then
    log_pass "Found ${RESPONSIVE_COUNT} media queries"
  else
    log_warn "No responsive patterns detected"
  fi
fi
printf "\n"

# Check 4: Dark mode configured
log_info "Check 4: Dark mode implementation"
DARK_MODE_FOUND=false

if [ "$TAILWIND_USED" = true ]; then
  if grep -q "darkMode:" -- "${PROJECT_ROOT}/tailwind.config.ts" "${PROJECT_ROOT}/tailwind.config.js" 2>/dev/null; then
    log_pass "Dark mode configured in Tailwind"
    DARK_MODE_FOUND=true
  fi
fi

if grep -rq --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git "dark:" --include="*.tsx" --include="*.jsx" -- "${PROJECT_ROOT}/src" 2>/dev/null; then
  log_pass "Dark mode classes found in components"
  DARK_MODE_FOUND=true
fi

if grep -rq --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git "\.dark.*{" --include="*.css" --include="*.scss" -- "${PROJECT_ROOT}/src" 2>/dev/null; then
  log_pass "Dark mode styles found in CSS"
  DARK_MODE_FOUND=true
fi

if [ "$DARK_MODE_FOUND" = false ]; then
  log_warn "No dark mode implementation detected"
fi
printf "\n"

# Check 5: No inline styles (anti-pattern)
log_info "Check 5: No inline styles"
INLINE_STYLES_COUNT=0

INLINE_STYLES_COUNT=$(grep -rE --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git 'style=\{\{|style="[^"]*:' --include="*.tsx" --include="*.jsx" --include="*.vue" -- "${PROJECT_ROOT}/src" 2>/dev/null | wc -l)

if [ "$INLINE_STYLES_COUNT" -eq 0 ]; then
  log_pass "No inline styles detected"
elif [ "$INLINE_STYLES_COUNT" -lt 5 ]; then
  log_warn "Found ${INLINE_STYLES_COUNT} inline styles (prefer utility classes or CSS)"
else
  log_fail "Found ${INLINE_STYLES_COUNT} inline styles (refactor to utility classes or CSS)"
fi
printf "\n"

# Check 6: Globals CSS exists
log_info "Check 6: Global styles file exists"
if [ -f "${PROJECT_ROOT}/src/styles/globals.css" ] || [ -f "${PROJECT_ROOT}/src/app/globals.css" ] || [ -f "${PROJECT_ROOT}/app/globals.css" ]; then
  log_pass "Global styles file found"
else
  log_warn "No globals.css found (may use different structure)"
fi
printf "\n"

# Check 7: CSS variables defined (for theming)
log_info "Check 7: CSS variables for theming"
CSS_VARS_COUNT=0

CSS_VARS_COUNT=$(grep -rE --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git "--[a-z-]+:" --include="*.css" --include="*.scss" -- "${PROJECT_ROOT}/src" 2>/dev/null | wc -l)

if [ "$CSS_VARS_COUNT" -gt 0 ]; then
  log_pass "Found ${CSS_VARS_COUNT} CSS variable definitions"
else
  log_warn "No CSS variables found (recommended for dynamic theming)"
fi
printf "\n"

# Check 8: Component variant system (CVA or similar)
log_info "Check 8: Component variant system"
if grep -rEq --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git "class-variance-authority|cva" --include="*.tsx" --include="*.ts" -- "${PROJECT_ROOT}/src" 2>/dev/null; then
  log_pass "Component variant system detected (CVA)"
elif grep -rEq --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git "styled-components|@emotion" --include="*.tsx" --include="*.ts" -- "${PROJECT_ROOT}/src" 2>/dev/null; then
  log_pass "CSS-in-JS library detected"
else
  log_info "No variant system detected (optional but recommended)"
fi
printf "\n"

# Summary
printf "\n"
if [ $EXIT_CODE -eq 0 ]; then
  log_pass "All critical checks passed"
else
  log_fail "Some checks failed (see above)"
fi

exit $EXIT_CODE
