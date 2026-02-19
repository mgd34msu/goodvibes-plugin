#!/usr/bin/env bash

# validate-gpa-compliance.sh
# Validates that an agent session transcript follows the Gather-Plan-Apply protocol
#
# Usage: ./validate-gpa-compliance.sh <transcript_file>
#
# Workflow:
#   1. Check gather phase present before write/edit operations
#   2. Check memory files accessed before implementation
#   3. Check batch operations used appropriately (same-type ops -> one call)
#   4. Check plan step present with structured file lists
#   5. Check verbosity usage (warn on verbose mode)
#   6. Check operation ordering (gather -> plan -> apply)
#   7. Check post-apply validation (precision_exec after writes)
#
# Exit codes:
#   0 = compliant (PASS)
#   1 = violations found (FAIL)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Usage
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <transcript_file>"
  echo ""
  echo "Validates that an agent session transcript follows GPA protocol."
  echo ""
  echo "Checks:"
  echo "  1. discover/precision_read called before precision_write/precision_edit"
  echo "  2. Memory files checked before implementation"
  echo "  3. Batch operations used where same-type sequential calls could be combined"
  echo "  4. Plan step present (structured list of files/operations)"
  echo ""
  echo "Exit codes:"
  echo "  0 = compliant (PASS)"
  echo "  1 = violations found (FAIL)"
  exit 1
fi

TRANSCRIPT="$1"

if [[ ! -f "$TRANSCRIPT" ]]; then
  echo -e "${RED}ERROR: File not found: $TRANSCRIPT${NC}"
  exit 1
fi

# Violation and warning tracking
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

# Helper: Check if literal string exists in transcript (fixed string mode)
has_literal() {
  grep -qF "$1" -- "$TRANSCRIPT" 2>/dev/null
}

# Helper: Get line number of first occurrence
get_line_number() {
  grep -nE "$1" -- "$TRANSCRIPT" 2>/dev/null | head -1 | cut -d: -f1 || true
}


echo "Validating GPA compliance for: $TRANSCRIPT"
echo ""

# ============================================================================
# CHECK 1: Gather before write/edit
# ============================================================================

echo "[1/7] Checking gather phase..."

# Find first discover/precision_grep/precision_glob/precision_read call
GATHER_LINE=$(get_line_number "discover|precision_grep|precision_glob|precision_read")

# Find first precision_write/precision_edit call
WRITE_LINE=$(get_line_number "precision_write|precision_edit")

if [[ -n "$WRITE_LINE" ]]; then
  if [[ -z "$GATHER_LINE" ]]; then
    add_violation "No gather phase found before write/edit operations (line $WRITE_LINE)"
    printf '[FAIL] No gather phase before writes\n'
  elif [[ "$WRITE_LINE" -lt "$GATHER_LINE" ]]; then
    add_violation "Write/edit operation (line $WRITE_LINE) before gather (line $GATHER_LINE)"
    printf '[FAIL] Write before gather\n'
  else
    printf '  %sPASS%s Gather phase found before write operations\n' "$GREEN" "$NC"
    printf '[PASS] Gather phase before writes\n'
  fi
else
  printf '  %s[-]%s No write/edit operations found (nothing to validate)\n' "$YELLOW" "$NC"
fi

# ============================================================================
# CHECK 2: Memory files checked
# ============================================================================

echo "[2/7] Checking memory access..."

# Look for memory file reads
MEMORY_FILES=(
  "failures.json"
  "patterns.json"
  "decisions.json"
)

MEMORY_CHECKED=false
for mem_file in "${MEMORY_FILES[@]}"; do
  if has_literal "$mem_file"; then
    printf '  %s[OK]%s Memory file checked: %s\n' "$GREEN" "$NC" "$mem_file"
    printf '[PASS] Memory file checked: %s\n' "$mem_file"
    MEMORY_CHECKED=true
  fi
done

if [[ "$MEMORY_CHECKED" == false ]]; then
  add_violation "No memory files checked. Expected reads of .goodvibes/memory/{failures,patterns,decisions}.json before implementation."
  printf '[FAIL] No memory files checked\n'
fi

# ============================================================================
# CHECK 3: Batch operations used appropriately (one call per tool type)
# ============================================================================

echo "[3/7] Checking batch usage..."

# Count lines that look like actual tool invocations, not prose mentions
# Require YAML structure: tool name at line start followed by colon
WRITE_COUNT=$(grep -cE "^[[:space:]]*precision_write:" -- "$TRANSCRIPT" 2>/dev/null || true)
[[ -z "$WRITE_COUNT" ]] && WRITE_COUNT=0
EXEC_COUNT=$(grep -cE "^[[:space:]]*precision_exec:" -- "$TRANSCRIPT" 2>/dev/null || true)
[[ -z "$EXEC_COUNT" ]] && EXEC_COUNT=0
READ_COUNT=$(grep -cE "^[[:space:]]*precision_read:" -- "$TRANSCRIPT" 2>/dev/null || true)
[[ -z "$READ_COUNT" ]] && READ_COUNT=0
GREP_COUNT=$(grep -cE "^[[:space:]]*precision_grep:" -- "$TRANSCRIPT" 2>/dev/null || true)
[[ -z "$GREP_COUNT" ]] && GREP_COUNT=0

BATCH_ISSUES=false

# Check if multiple writes could be batched (same-type calls in same phase)
if [[ "$WRITE_COUNT" -ge 3 ]]; then
  add_violation "Found $WRITE_COUNT precision_write calls. GPA rule: one call per tool type — batch all writes into 1 call with multiple files."
  printf '[FAIL] Multiple writes violate one-call-per-tool-type rule\n'
  BATCH_ISSUES=true
fi

# Check if multiple exec calls could be batched
if [[ "$EXEC_COUNT" -ge 3 ]]; then
  add_violation "Found $EXEC_COUNT precision_exec calls. GPA rule: one call per tool type — batch all commands into 1 call with multiple commands."
  printf '[FAIL] Multiple execs violate one-call-per-tool-type rule\n'
  BATCH_ISSUES=true
fi

# Check if multiple reads could be batched
if [[ "$READ_COUNT" -ge 3 ]]; then
  add_violation "Found $READ_COUNT precision_read calls. GPA rule: one call per tool type — batch all reads into 1 call with multiple files."
  printf '[FAIL] Multiple reads violate one-call-per-tool-type rule\n'
  BATCH_ISSUES=true
fi

# Check if multiple grep calls could be batched
if [[ "$GREP_COUNT" -ge 3 ]]; then
  add_violation "Found $GREP_COUNT precision_grep calls. Consider using discover tool or batching queries."
  printf '[FAIL] Multiple greps should be batched\n'
  BATCH_ISSUES=true
fi

if [[ "$BATCH_ISSUES" == false ]]; then
  printf '  %s[OK]%s Batch operations used appropriately\n' "$GREEN" "$NC"
  printf '[PASS] Batch operations appropriate\n'
fi

# ============================================================================
# CHECK 4: Plan step present
# ============================================================================

echo "[4/7] Checking plan phase..."

# Look for plan indicators
PLAN_INDICATORS=(
  "Files to create:"
  "Files to modify:"
  "Files to read:"
  "Commands to run:"
  "Order of operations:"
  "Batch opportunities:"
  "Apply batch plan:"
  "Apply Call"
  "## PLAN"
  "### PLAN"
  "Phase 2: PLAN"
)

PLAN_FOUND=false
for indicator in "${PLAN_INDICATORS[@]}"; do
  if has_literal "$indicator"; then
    PLAN_FOUND=true
    printf '  %s[OK]%s Plan step found: %s\n' "$GREEN" "$NC" "$indicator"
    printf '[PASS] Plan step found\n'
    break
  fi
done

if [[ "$PLAN_FOUND" == false ]]; then
  add_violation "No plan step found. Expected structured list of files to create/modify, commands to run, batch opportunities."
  printf '[FAIL] No plan step found\n'
fi

# ============================================================================
# CHECK 5: Verbosity usage
# ============================================================================

echo "[5/7] Checking verbosity usage..."

# Warn if verbose mode used (not a violation, just inefficient)
if grep -qE "verbosity:[[:space:]]*verbose" -- "$TRANSCRIPT" 2>/dev/null; then
  add_warning "verbose verbosity mode detected. Consider using minimal/standard for token efficiency."
  printf '[FAIL] Verbose verbosity detected\n'
else
  printf '  %s[OK]%s No excessive verbosity detected\n' "$GREEN" "$NC"
  printf '[PASS] Verbosity appropriate\n'
fi

# ============================================================================
# CHECK 6: Operation ordering (gather -> plan -> apply)
# ============================================================================

echo "[6/7] Checking operation ordering..."

# Verify gather -> plan -> apply order
GATHER_LINE=$(get_line_number "discover|precision_grep|precision_glob")
PLAN_LINE=$(get_line_number "Files to create:|Files to modify:|Apply batch plan:|## PLAN|### PLAN")
APPLY_LINE=$(get_line_number "precision_write|precision_edit|batch:")

ORDERING_OK=true

if [[ -n "$GATHER_LINE" && -n "$PLAN_LINE" && "$GATHER_LINE" -gt "$PLAN_LINE" ]]; then
  add_warning "Plan step (line $PLAN_LINE) appears before gather (line $GATHER_LINE). Recommended order: gather -> plan -> apply."
  ORDERING_OK=false
fi

if [[ -n "$PLAN_LINE" && -n "$APPLY_LINE" && "$PLAN_LINE" -gt "$APPLY_LINE" ]]; then
  add_warning "Apply operations (line $APPLY_LINE) appear before plan (line $PLAN_LINE). Recommended order: gather -> plan -> apply."
  ORDERING_OK=false
fi

if [[ "$ORDERING_OK" == true ]]; then
  printf '  %s[OK]%s Operation ordering follows GPA pattern\n' "$GREEN" "$NC"
  printf '[PASS] Operation ordering correct\n'
else
  printf '[FAIL] Operation ordering incorrect\n'
fi

# ============================================================================
# CHECK 7: Post-apply validation
# ============================================================================

echo "[7/7] Checking post-apply validation..."

# Check if precision_exec with typecheck/lint/test runs after writes
if [[ -n "$WRITE_LINE" ]]; then
  # Check if precision_exec appears after writes
  EXEC_LINE=$(get_line_number "precision_exec" || true)
  # Check if validation keywords appear anywhere after writes
  VALIDATION_KEYWORDS=$(sed -n "${WRITE_LINE},\$p" -- "$TRANSCRIPT" | grep -E "typecheck|lint|test" || true)
  
  if [[ -n "$EXEC_LINE" && -n "$VALIDATION_KEYWORDS" && "$EXEC_LINE" -gt "$WRITE_LINE" ]]; then
    printf '  %s[OK]%s Post-apply validation detected (precision_exec + typecheck/lint/test after writes)\n' "$GREEN" "$NC"
    printf '[PASS] Post-apply validation present\n'
  else
    add_warning "No post-apply validation found after write operations. Consider running typecheck/lint/test."
    printf '[FAIL] No post-apply validation found\n'
  fi
else
  printf '  %s[-]%s No write operations to validate\n' "$YELLOW" "$NC"
fi

# ============================================================================
# RESULTS
# ============================================================================

echo ""
printf '%s\n' "================================================================="

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  if [[ ${#WARNINGS[@]} -eq 0 ]]; then
    printf '%s[OK] PASS%s - Transcript is GPA compliant\n' "$GREEN" "$NC"
    printf '%s\n' "================================================================="
    exit 0
  else
    printf '%s[OK] PASS%s - Transcript is GPA compliant (with warnings)\n' "$GREEN" "$NC"
    echo ""
    echo -e "${YELLOW}Warnings:${NC}"
    for i in "${!WARNINGS[@]}"; do
      echo -e "  ${YELLOW}$((i + 1)):${NC} ${WARNINGS[$i]}"
    done
    printf '%s\n' "================================================================="
    exit 0
  fi
else
  printf '%s[X] FAIL%s - %d GPA violation(s) found:\n' "$RED" "$NC" "${#VIOLATIONS[@]}"
  echo ""
  for i in "${!VIOLATIONS[@]}"; do
    echo -e "  ${RED}$((i + 1)):${NC} ${VIOLATIONS[$i]}"
  done
  
  if [[ ${#WARNINGS[@]} -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}Warnings:${NC}"
    for i in "${!WARNINGS[@]}"; do
      echo -e "  ${YELLOW}$((i + 1)):${NC} ${WARNINGS[$i]}"
    done
  fi
  
  printf '%s\n' "================================================================="
  exit 1
fi
