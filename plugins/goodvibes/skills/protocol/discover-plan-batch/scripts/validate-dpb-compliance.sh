#!/usr/bin/env bash

# validate-dpb-compliance.sh
# Validates that an agent session transcript follows the Discover-Plan-Batch protocol
#
# Usage: ./validate-dpb-compliance.sh <transcript_file>
#
# Workflow:
#   1. Check discovery phase present before write/edit operations
#   2. Check plan step present with structured file lists
#   3. Check batch operations used appropriately (3+ calls → batch)
#   4. Check memory files accessed before implementation
#   5. Check verbosity usage (warn on verbose mode)
#   6. Check operation ordering (discover → plan → batch)
#   7. Check post-batch validation (precision_exec after writes)
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
  echo "Validates that an agent session transcript follows DPB protocol."
  echo ""
  echo "Checks:"
  echo "  1. discover tool called before precision_write/precision_edit"
  echo "  2. Plan step present (structured list of files/operations)"
  echo "  3. Batch operations used where 3+ sequential calls could be combined"
  echo "  4. Memory files checked before implementation"
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


echo "Validating DPB compliance for: $TRANSCRIPT"
echo ""

# ============================================================================
# CHECK 1: Discover before write/edit
# ============================================================================

echo "[1/7] Checking discovery phase..."

# Find first discover/precision_grep/precision_glob call
# Note: precision_read with extract: content is execution, not discovery
DISCOVER_LINE=$(get_line_number "discover|precision_grep|precision_glob|precision_read")

# Find first precision_write/precision_edit call
WRITE_LINE=$(get_line_number "precision_write|precision_edit")

if [[ -n "$WRITE_LINE" ]]; then
  if [[ -z "$DISCOVER_LINE" ]]; then
    add_violation "No discovery phase found before write/edit operations (line $WRITE_LINE)"
    printf '[FAIL] No discovery phase before writes\n'
  elif [[ "$WRITE_LINE" -lt "$DISCOVER_LINE" ]]; then
    add_violation "Write/edit operation (line $WRITE_LINE) before discovery (line $DISCOVER_LINE)"
    printf '[FAIL] Write before discovery\n'
  else
    echo -e "  ${GREEN}✓${NC} Discovery phase found before write operations"
    printf '[PASS] Discovery phase before writes\n'
  fi
else
  echo -e "  ${YELLOW}⊘${NC} No write/edit operations found (nothing to validate)"
fi

# ============================================================================
# CHECK 2: Plan step present
# ============================================================================

echo "[2/7] Checking plan phase..."

# Look for plan indicators
PLAN_INDICATORS=(
  "Files to create:"
  "Files to modify:"
  "Files to read:"
  "Commands to run:"
  "Order of operations:"
  "Batch opportunities:"
  "## PLAN"
  "### PLAN"
  "Phase 2: PLAN"
)

PLAN_FOUND=false
for indicator in "${PLAN_INDICATORS[@]}"; do
  if has_literal "$indicator"; then
    PLAN_FOUND=true
    echo -e "  ${GREEN}✓${NC} Plan step found: '$indicator'"
    printf '[PASS] Plan step found\n'
    break
  fi
done

if [[ "$PLAN_FOUND" == false ]]; then
  add_violation "No plan step found. Expected structured list of files to create/modify, commands to run, etc."
  printf '[FAIL] No plan step found\n'
fi

# ============================================================================
# CHECK 3: Batch operations used appropriately
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

# Check if multiple writes could be batched
if [[ "$WRITE_COUNT" -ge 3 ]]; then
  # Pattern-based detection - if we see 3+ writes, flag as potentially batchable
  add_violation "Found $WRITE_COUNT precision_write calls (pattern-based detection). Consider batching into 1 call with multiple files."
  printf '[FAIL] Multiple writes should be batched\n'
  BATCH_ISSUES=true
fi

# Check if multiple exec calls could be batched
if [[ "$EXEC_COUNT" -ge 3 ]]; then
  # Pattern-based detection - if we see 3+ execs, flag as potentially batchable
  add_violation "Found $EXEC_COUNT precision_exec calls (pattern-based detection). Consider batching into 1 call with multiple commands."
  printf '[FAIL] Multiple execs should be batched\n'
  BATCH_ISSUES=true
fi

# Check if multiple reads could be batched
if [[ "$READ_COUNT" -ge 3 ]]; then
  # Pattern-based detection - if we see 3+ reads, flag as potentially batchable
  add_violation "Found $READ_COUNT precision_read calls (pattern-based detection). Consider batching into 1 call with multiple files."
  printf '[FAIL] Multiple reads should be batched\n'
  BATCH_ISSUES=true
fi

# Check if multiple grep calls could be batched
if [[ "$GREP_COUNT" -ge 3 ]]; then
  add_violation "Found $GREP_COUNT precision_grep calls. Consider using discover tool or batching queries."
  printf '[FAIL] Multiple greps should be batched\n'
  BATCH_ISSUES=true
fi

if [[ "$BATCH_ISSUES" == false ]]; then
  echo -e "  ${GREEN}✓${NC} Batch operations used appropriately"
  printf '[PASS] Batch operations appropriate\n'
fi

# ============================================================================
# CHECK 4: Memory files checked
# ============================================================================

echo "[4/7] Checking memory access..."

# Look for memory file reads
MEMORY_FILES=(
  "failures.json"
  "patterns.json"
  "decisions.json"
)

MEMORY_CHECKED=false
for mem_file in "${MEMORY_FILES[@]}"; do
  if has_literal "$mem_file"; then
    echo -e "  ${GREEN}✓${NC} Memory file checked: $mem_file"
    printf '[PASS] Memory file checked: %s\n' "$mem_file"
    MEMORY_CHECKED=true
  fi
done

if [[ "$MEMORY_CHECKED" == false ]]; then
  add_violation "No memory files checked. Expected reads of .goodvibes/memory/{failures,patterns,decisions}.json before implementation."
  printf '[FAIL] No memory files checked\n'
fi

# ============================================================================
# CHECK 5: Verbosity usage
# ============================================================================

echo "[5/7] Checking verbosity usage..."

# Warn if verbose mode used (not a violation, just inefficient)
if grep -qE "verbosity:[[:space:]]*verbose" -- "$TRANSCRIPT" 2>/dev/null; then
  add_warning "verbose verbosity mode detected. Consider using minimal/standard for token efficiency."
else
  echo -e "  ${GREEN}✓${NC} No excessive verbosity detected"
  printf '[PASS] Verbosity appropriate\n'
fi

# ============================================================================
# CHECK 6: Operation ordering
# ============================================================================

echo "[6/7] Checking operation ordering..."

# Verify discover → plan → batch order
DISCOVER_LINE=$(get_line_number "discover|precision_grep|precision_glob")
PLAN_LINE=$(get_line_number "Files to create:|Files to modify:|## PLAN|### PLAN")
BATCH_LINE=$(get_line_number "precision_write|precision_edit|batch:")

ORDERING_OK=true

if [[ -n "$DISCOVER_LINE" && -n "$PLAN_LINE" && "$DISCOVER_LINE" -gt "$PLAN_LINE" ]]; then
  add_warning "Plan step (line $PLAN_LINE) appears before discovery (line $DISCOVER_LINE). Recommended order: discover → plan → batch."
  ORDERING_OK=false
fi

if [[ -n "$PLAN_LINE" && -n "$BATCH_LINE" && "$PLAN_LINE" -gt "$BATCH_LINE" ]]; then
  add_warning "Batch operations (line $BATCH_LINE) appear before plan (line $PLAN_LINE). Recommended order: discover → plan → batch."
  ORDERING_OK=false
fi

if [[ "$ORDERING_OK" == true ]]; then
  echo -e "  ${GREEN}✓${NC} Operation ordering follows DPB pattern"
  printf '[PASS] Operation ordering correct\n'
fi

# ============================================================================
# CHECK 7: Post-batch validation
# ============================================================================

echo "[7/7] Checking post-batch validation..."

# Check if precision_exec with typecheck/lint/test runs after writes
# Broadened check: looks for both keywords anywhere after writes, not just on same line
if [[ -n "$WRITE_LINE" ]]; then
  # Check if precision_exec appears after writes
  EXEC_LINE=$(get_line_number "precision_exec" || true)
  # Check if validation keywords appear anywhere after writes
  VALIDATION_KEYWORDS=$(sed -n "${WRITE_LINE},\$p" -- "$TRANSCRIPT" | grep -E "typecheck|lint|test" || true)
  
  if [[ -n "$EXEC_LINE" && -n "$VALIDATION_KEYWORDS" && "$EXEC_LINE" -gt "$WRITE_LINE" ]]; then
    echo -e "  ${GREEN}✓${NC} Post-batch validation detected (precision_exec + typecheck/lint/test after writes)"
    printf '[PASS] Post-batch validation present\n'
  else
    add_warning "No post-batch validation found after write operations. Consider running typecheck/lint/test."
  fi
else
  echo -e "  ${YELLOW}⊘${NC} No write operations to validate"
fi

# ============================================================================
# RESULTS
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  if [[ ${#WARNINGS[@]} -eq 0 ]]; then
    echo -e "${GREEN}✓ PASS${NC} - Transcript is DPB compliant"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  else
    echo -e "${GREEN}✓ PASS${NC} - Transcript is DPB compliant (with warnings)"
    echo ""
    echo -e "${YELLOW}Warnings:${NC}"
    for i in "${!WARNINGS[@]}"; do
      echo -e "  ${YELLOW}$((i + 1)):${NC} ${WARNINGS[$i]}"
    done
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
  fi
else
  echo -e "${RED}✗ FAIL${NC} - ${#VIOLATIONS[@]} DPB violation(s) found:"
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
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
