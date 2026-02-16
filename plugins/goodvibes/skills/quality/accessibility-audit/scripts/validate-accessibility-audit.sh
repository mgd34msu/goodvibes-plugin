#!/usr/bin/env bash

# Requires: bash 4+ (uses arrays, [[ ]])
# validate-accessibility-audit.sh
# Validates accessibility implementation against WCAG 2.1 AA standards
#
# Usage: ./validate-accessibility-audit.sh <project_root>
#
# Checks:
#   1. Image alt attributes
#   2. Form labels and required fields
#   3. Keyboard navigation (onClick with onKeyDown)
#   4. ARIA roles and attributes
#   5. Heading hierarchy
#   6. Semantic HTML usage
#   7. Focus management
#   8. Color contrast documentation
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more checks failed

set -u

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
  printf "Validates accessibility implementation against WCAG 2.1 AA.\n"
  printf "\n"
  printf "Checks:\n"
  printf "  1. Image alt attributes\n"
  printf "  2. Form labels and required fields\n"
  printf "  3. Keyboard navigation\n"
  printf "  4. ARIA roles and attributes\n"
  printf "  5. Heading hierarchy\n"
  printf "  6. Semantic HTML usage\n"
  printf "  7. Focus management\n"
  printf "  8. Color contrast documentation\n"
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

printf "Validating accessibility in: %s\n" "$PROJECT_ROOT"
printf "\n"

# ============================================================================
# CHECK 1: Image Alt Attributes
# ============================================================================

printf "[1/8] Checking image alt attributes...\n"

# Check for images without alt attribute
if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '<img[^>]*>' -- "$PROJECT_ROOT" 2>/dev/null | grep -v 'alt=' | grep '<img' | grep -q .; then
  add_violation "Images found without alt attribute. All images must have alt text or alt=\"\" for decorative images."
else
  printf "  %b[PASS]%b All images have alt attributes\n" "$GREEN" "$NC"
fi

# Check for generic alt text
if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E 'alt="(image|photo|picture|icon|img)"' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  add_warning "Generic alt text detected (image, photo, icon). Use descriptive alt text."
fi

# Check for Next.js Image usage
if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next 'from.*next/image' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Next.js Image component detected (requires alt)\n" "$GREEN" "$NC"
fi

# ============================================================================
# CHECK 2: Form Labels
# ============================================================================

printf "[2/8] Checking form labels...\n"

# Count inputs
INPUT_COUNT=$(grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next '<input' -- "$PROJECT_ROOT" 2>/dev/null | wc -l || echo 0)

if [[ $INPUT_COUNT -gt 0 ]]; then
  printf "  Found %d input elements\n" "$INPUT_COUNT"
  
  # Check for inputs with labels
  LABELED_COUNT=$(grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '(htmlFor=|aria-label=|aria-labelledby=)' -- "$PROJECT_ROOT" 2>/dev/null | wc -l || echo 0)
  
  if [[ $LABELED_COUNT -gt 0 ]]; then
    printf "  %b[PASS]%b Form labels detected\n" "$GREEN" "$NC"
  else
    add_violation "No form labels detected. All inputs must have associated labels."
  fi
  
  # Check for placeholder-only inputs
  if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next 'placeholder=' -- "$PROJECT_ROOT" 2>/dev/null | grep '<input' | grep -q .; then
    add_warning "Placeholder attributes detected. Ensure inputs also have visible labels, not just placeholders."
  fi
  
  # Check for required fields
  if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '(required|aria-required)' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
    printf "  %b[PASS]%b Required field indicators detected\n" "$GREEN" "$NC"
  else
    add_warning "No required field indicators detected. Mark required fields with required attribute."
  fi
else
  add_warning "No input elements found. Skipping form label checks."
fi

# ============================================================================
# CHECK 3: Keyboard Navigation
# ============================================================================

printf "[3/8] Checking keyboard navigation...\n"

# Check for onClick handlers
ONCLICK_COUNT=$(grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next 'onClick=' -- "$PROJECT_ROOT" 2>/dev/null | wc -l || echo 0)

if [[ $ONCLICK_COUNT -gt 0 ]]; then
  printf "  Found %d onClick handlers\n" "$ONCLICK_COUNT"
  
  # Check for keyboard handlers
  KEYBOARD_COUNT=$(grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next 'onKeyDown=' -- "$PROJECT_ROOT" 2>/dev/null | wc -l || echo 0)
  
  if [[ $KEYBOARD_COUNT -gt 0 ]]; then
    printf "  %b[PASS]%b Keyboard handlers detected\n" "$GREEN" "$NC"
  else
    add_warning "onClick handlers found but no onKeyDown handlers. Ensure interactive elements support keyboard."
  fi
fi

# Check for focus management
if grep -r --include='*.tsx' --include='*.jsx' --include='*.ts' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '(\.focus\(\)|useRef.*focus|autoFocus)' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Focus management detected\n" "$GREEN" "$NC"
else
  add_warning "No focus management detected. Consider focus handling in modals and dynamic content."
fi

# Check for skip links
if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '(skip.*main|skip.*content)' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Skip link detected\n" "$GREEN" "$NC"
else
  add_warning "No skip link detected. Add skip-to-main-content link for keyboard users."
fi

# ============================================================================
# CHECK 4: ARIA Usage
# ============================================================================

printf "[4/8] Checking ARIA usage...\n"

# Check for ARIA attributes
if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E 'aria-' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b ARIA attributes detected\n" "$GREEN" "$NC"
  
  # Check for common ARIA issues
  if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '<button[^>]*aria-hidden="true"' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
    add_violation "aria-hidden on button elements detected. Never hide interactive elements from screen readers."
  fi
  
  # Check for aria-label on non-interactive elements
  if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '<div[^>]*aria-label=' -- "$PROJECT_ROOT" 2>/dev/null | grep -v 'role=' | grep -q .; then
    add_warning "aria-label on div without role detected. aria-label only works on interactive/landmark elements."
  fi
else
  add_warning "No ARIA attributes detected. Consider adding ARIA for complex widgets."
fi

# Check for live regions
if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '(aria-live|role="(alert|status)")' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b ARIA live regions detected\n" "$GREEN" "$NC"
else
  add_warning "No ARIA live regions detected. Use aria-live for dynamic content updates."
fi

# Check for role="button" with proper attributes
if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next 'role="button"' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  # Ensure tabIndex is set
  if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next 'role="button"' -- "$PROJECT_ROOT" 2>/dev/null | grep 'tabIndex' | grep -q .; then
    printf "  %b[PASS]%b role=button elements have tabIndex\n" "$GREEN" "$NC"
  else
    add_violation "role=button elements must have tabIndex for keyboard focus."
  fi
fi

# ============================================================================
# CHECK 5: Heading Hierarchy
# ============================================================================

printf "[5/8] Checking heading hierarchy...\n"

# Count h1 elements
H1_COUNT=$(grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next '<h1' -- "$PROJECT_ROOT" 2>/dev/null | wc -l || echo 0)

if [[ $H1_COUNT -eq 0 ]]; then
  add_warning "No h1 elements found. Each page should have exactly one h1."
elif [[ $H1_COUNT -eq 1 ]]; then
  printf "  %b[PASS]%b Single h1 element found\n" "$GREEN" "$NC"
else
  add_warning "Multiple h1 elements found ($H1_COUNT). Each page should have exactly one h1."
fi

# Check for heading elements
if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '<h[2-6]' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Heading hierarchy elements detected\n" "$GREEN" "$NC"
else
  add_warning "No h2-h6 elements found. Use proper heading hierarchy for document structure."
fi

# Check for skipped heading levels (this is a heuristic)
if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next '<h1' -- "$PROJECT_ROOT" 2>/dev/null | grep -q . && \
   grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next '<h3' -- "$PROJECT_ROOT" 2>/dev/null | grep -q . && \
   ! grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next '<h2' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  add_violation "Potential heading level skip detected (h1 to h3). Do not skip heading levels."
fi

# ============================================================================
# CHECK 6: Semantic HTML
# ============================================================================

printf "[6/8] Checking semantic HTML usage...\n"

# Check for landmark elements
LANDMARK_FOUND=false

if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next '<main' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b <main> landmark detected\n" "$GREEN" "$NC"
  LANDMARK_FOUND=true
else
  add_warning "No <main> element found. Use <main> to identify primary content."
fi

if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next '<nav' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b <nav> landmark detected\n" "$GREEN" "$NC"
  LANDMARK_FOUND=true
fi

if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next '<header' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b <header> landmark detected\n" "$GREEN" "$NC"
  LANDMARK_FOUND=true
fi

if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next '<footer' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b <footer> landmark detected\n" "$GREEN" "$NC"
  LANDMARK_FOUND=true
fi

if [[ $LANDMARK_FOUND == false ]]; then
  add_violation "No semantic landmarks found. Use <main>, <nav>, <header>, <footer> for page structure."
fi

# Check for proper list usage
if grep -r --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '<(ul|ol)' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b List elements detected\n" "$GREEN" "$NC"
fi

# ============================================================================
# CHECK 7: Focus Management
# ============================================================================

printf "[7/8] Checking focus styles...\n"

# Check for focus styles in CSS/Tailwind
if grep -r --include='*.css' --include='*.scss' --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '(:focus|focus:)' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b Focus styles detected\n" "$GREEN" "$NC"
else
  add_violation "No focus styles detected. All interactive elements must have visible focus indicators."
fi

# Check for outline: none without alternative
if grep -r --include='*.css' --include='*.scss' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next 'outline.*none' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  add_warning "outline: none detected. If removing default outline, provide alternative focus indicator."
fi

# Check for focus-visible
if grep -r --include='*.css' --include='*.scss' --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next -E '(:focus-visible|focus-visible:)' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b focus-visible detected (modern focus management)\n" "$GREEN" "$NC"
fi

# ============================================================================
# CHECK 8: Color Contrast Documentation
# ============================================================================

printf "[8/8] Checking color contrast documentation...\n"

# Check for Tailwind config with colors
if [[ -f "$PROJECT_ROOT/tailwind.config.ts" ]] || [[ -f "$PROJECT_ROOT/tailwind.config.js" ]]; then
  printf "  %b[PASS]%b Tailwind config found\n" "$GREEN" "$NC"
  
  # Check for custom colors
  if grep -E 'colors.*:' -- "$PROJECT_ROOT/tailwind.config"* 2>/dev/null | grep -q .; then
    add_warning "Custom colors detected. Document contrast ratios for WCAG AA compliance (4.5:1 for text)."
  fi
fi

# Check for prefers-reduced-motion
if grep -r --include='*.css' --include='*.scss' --include='*.tsx' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next 'prefers-reduced-motion' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b prefers-reduced-motion support detected\n" "$GREEN" "$NC"
else
  add_warning "No prefers-reduced-motion detected. Respect user motion preferences for animations."
fi

# Check for forced-colors mode
if grep -r --include='*.css' --include='*.scss' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.next 'forced-colors' -- "$PROJECT_ROOT" 2>/dev/null | grep -q .; then
  printf "  %b[PASS]%b forced-colors mode support detected\n" "$GREEN" "$NC"
fi

# ============================================================================
# RESULTS
# ============================================================================

printf "\n"
printf "%s\n" "-------------------------------------------------------"

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  if [[ ${#WARNINGS[@]} -eq 0 ]]; then
    printf "%b[PASS]%b - Accessibility audit validation passed\n" "$GREEN" "$NC"
    printf "%s\n" "-------------------------------------------------------"
    exit 0
  else
    printf "%b[PASS]%b - Accessibility audit validation passed (with warnings)\n" "$GREEN" "$NC"
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
