#!/usr/bin/env bash

# validate-dpb-compliance.sh
# Validates that an agent session transcript follows the Discover-Plan-Batch protocol

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

# Violation tracking
VIOLATIONS=()

# Helper: Add violation
add_violation() {
  VIOLATIONS+=("$1")
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

echo "[1/4] Checking discovery phase..."

# Find first discover/precision_grep/precision_glob call
DISCOVER_LINE=$(get_line_number "discover|precision_grep|precision_glob|precision_read")

# Find first precision_write/precision_edit call
WRITE_LINE=$(get_line_number "precision_write|precision_edit")

if [[ -n "$WRITE_LINE" ]]; then
  if [[ -z "$DISCOVER_LINE" ]]; then
    add_violation "No discovery phase found before write/edit operations (line $WRITE_LINE)"
  elif [[ "$WRITE_LINE" -lt "$DISCOVER_LINE" ]]; then
    add_violation "Write/edit operation (line $WRITE_LINE) before discovery (line $DISCOVER_LINE)"
  else
    echo -e "  ${GREEN}✓${NC} Discovery phase found before write operations"
  fi
else
  echo -e "  ${YELLOW}⊘${NC} No write/edit operations found (nothing to validate)"
fi

# ============================================================================
# CHECK 2: Plan step present
# ============================================================================

echo "[2/4] Checking plan phase..."

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
    break
  fi
done

if [[ "$PLAN_FOUND" == false ]]; then
  add_violation "No plan step found. Expected structured list of files to create/modify, commands to run, etc."
fi

# ============================================================================
# CHECK 3: Batch operations used appropriately
# ============================================================================

echo "[3/4] Checking batch usage..."

# Count lines that look like actual tool invocations, not prose mentions
# Look for tool name followed by typical invocation patterns (colon, opening brace, etc.)
WRITE_COUNT=$(grep -cE "precision_write[[:space:]]*[:({.]" -- "$TRANSCRIPT" 2>/dev/null || true)
[[ -z "$WRITE_COUNT" ]] && WRITE_COUNT=0
EXEC_COUNT=$(grep -cE "precision_exec[[:space:]]*[:({.]" -- "$TRANSCRIPT" 2>/dev/null || true)
[[ -z "$EXEC_COUNT" ]] && EXEC_COUNT=0
READ_COUNT=$(grep -cE "precision_read[[:space:]]*[:({.]" -- "$TRANSCRIPT" 2>/dev/null || true)
[[ -z "$READ_COUNT" ]] && READ_COUNT=0

BATCH_ISSUES=false

# Check if multiple writes could be batched
if [[ "$WRITE_COUNT" -ge 3 ]]; then
  # Pattern-based detection - if we see 3+ writes, flag as potentially batchable
  add_violation "Found $WRITE_COUNT precision_write calls (pattern-based detection). Consider batching into 1 call with multiple files."
  BATCH_ISSUES=true
fi

# Check if multiple exec calls could be batched
if [[ "$EXEC_COUNT" -ge 3 ]]; then
  # Pattern-based detection - if we see 3+ execs, flag as potentially batchable
  add_violation "Found $EXEC_COUNT precision_exec calls (pattern-based detection). Consider batching into 1 call with multiple commands."
  BATCH_ISSUES=true
fi

# Check if multiple reads could be batched
if [[ "$READ_COUNT" -ge 3 ]]; then
  # Pattern-based detection - if we see 3+ reads, flag as potentially batchable
  add_violation "Found $READ_COUNT precision_read calls (pattern-based detection). Consider batching into 1 call with multiple files."
  BATCH_ISSUES=true
fi

if [[ "$BATCH_ISSUES" == false ]]; then
  echo -e "  ${GREEN}✓${NC} Batch operations used appropriately"
fi

# ============================================================================
# CHECK 4: Memory files checked
# ============================================================================

echo "[4/4] Checking memory access..."

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
    MEMORY_CHECKED=true
  fi
done

if [[ "$MEMORY_CHECKED" == false ]]; then
  add_violation "No memory files checked. Expected reads of .goodvibes/memory/{failures,patterns,decisions}.json before implementation."
fi

# ============================================================================
# RESULTS
# ============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  echo -e "${GREEN}✓ PASS${NC} - Transcript is DPB compliant"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  echo -e "${RED}✗ FAIL${NC} - ${#VIOLATIONS[@]} DPB violation(s) found:"
  echo ""
  for i in "${!VIOLATIONS[@]}"; do
    echo -e "  ${RED}$((i + 1)):${NC} ${VIOLATIONS[$i]}"
  done
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
