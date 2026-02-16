#!/usr/bin/env bash
# validate-memory-usage.sh
# Validates that an agent session followed the GoodVibes memory protocol
#
# Usage:
#   bash validate-memory-usage.sh <transcript_file> <memory_dir>
#
# Exit codes:
#   0 = compliant (all checks passed)
#   1 = violations found
#   2 = usage error

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script constants
SCRIPT_NAME=$(basename "$0")

# Usage message
usage() {
  cat <<EOF
Usage: $SCRIPT_NAME <transcript_file> <memory_dir>

Validates GoodVibes memory protocol compliance in agent session transcripts.

Arguments:
  transcript_file   Agent session transcript (JSONL or text format)
  memory_dir        Path to .goodvibes/memory/ directory

Example:
  $SCRIPT_NAME session-2026-02-15.jsonl .goodvibes/memory/

Exit codes:
  0 = compliant (all checks passed)
  1 = violations found
  2 = usage error
EOF
  exit 2
}

# Validate arguments
if [[ $# -ne 2 ]]; then
  echo -e "${RED}Error: Expected 2 arguments, got $#${NC}" >&2
  usage
fi

TRANSCRIPT_FILE="$1"
MEMORY_DIR="$2"

# Validate transcript file exists
if [[ ! -f "$TRANSCRIPT_FILE" ]]; then
  echo -e "${RED}Error: Transcript file not found: $TRANSCRIPT_FILE${NC}" >&2
  exit 2
fi

# Validate memory directory exists
if [[ ! -d "$MEMORY_DIR" ]]; then
  echo -e "${RED}Error: Memory directory not found: $MEMORY_DIR${NC}" >&2
  exit 2
fi

# Normalize memory dir path (remove trailing slash)
MEMORY_DIR="${MEMORY_DIR%/}"

# Initialize violation tracking
VIOLATIONS=()

# Function to add violation
add_violation() {
  local message="$1"
  VIOLATIONS+=("$message")
}

# Function to check if pattern exists in file
pattern_exists() {
  local pattern="$1"
  local file="$2"
  grep -qE "$pattern" "$file" 2>/dev/null
}

# Check 1: Memory files read at task start
echo "[CHECK 1] Verifying memory files read at task start..."

# Check for precision_read of failures.json
if ! pattern_exists 'precision_read.*failures\.json' "$TRANSCRIPT_FILE"; then
  add_violation "failures.json not read at task start (no precision_read call found)"
  printf '[FAIL] failures.json not read\n'
else
  printf '%s[OK]%s failures.json read\n' "$GREEN" "$NC"
  printf '[PASS] failures.json read\n'
fi

# Check for precision_read of patterns.json
if ! pattern_exists 'precision_read.*patterns\.json' "$TRANSCRIPT_FILE"; then
  add_violation "patterns.json not read at task start (no precision_read call found)"
  printf '[FAIL] patterns.json not read\n'
else
  printf '%s[OK]%s patterns.json read\n' "$GREEN" "$NC"
  printf '[PASS] patterns.json read\n'
fi

# Check for precision_read of decisions.json
if ! pattern_exists 'precision_read.*decisions\.json' "$TRANSCRIPT_FILE"; then
  add_violation "decisions.json not read at task start (no precision_read call found)"
  printf '[FAIL] decisions.json not read\n'
else
  printf '%s[OK]%s decisions.json read\n' "$GREEN" "$NC"
  printf '[PASS] decisions.json read\n'
fi

# Check for precision_read of preferences.json
if ! pattern_exists 'precision_read.*preferences\.json' "$TRANSCRIPT_FILE"; then
  add_violation "preferences.json not read at task start (no precision_read call found)"
  printf '[FAIL] preferences.json not read\n'
else
  printf '%s[OK]%s preferences.json read\n' "$GREEN" "$NC"
  printf '[PASS] preferences.json read\n'
fi

# Check 2: Activity logged after task completion
echo ""
echo "[CHECK 2] Verifying activity logged after task completion..."

# Look for patterns indicating task completion
if pattern_exists '(task.*complete|implementation.*done|review.*pass)' "$TRANSCRIPT_FILE"; then
  # Task was completed, check for activity.md write
  if ! pattern_exists 'activity\.md' "$TRANSCRIPT_FILE"; then
    add_violation "Task completed but no write to activity.md found"
    printf '[FAIL] activity.md not updated\n'
  else
    printf '%s[OK]%s activity.md updated after task completion\n' "$GREEN" "$NC"
    printf '[PASS] activity.md updated\n'
  fi
else
  printf '%s[-]%s No task completion detected (skipping activity.md check)\n' "$YELLOW" "$NC"
fi

# Check 3: Failures logged when errors encountered and resolved
echo ""
echo "[CHECK 3] Verifying failures logged when errors resolved..."

# Look for error patterns (tightened to avoid false positives from normal conversation)
if pattern_exists '(TOOL_FAILURE|BUILD_ERROR|TEST_FAILURE|Error:|failed with exit|exception thrown|stack trace)' "$TRANSCRIPT_FILE"; then
  # Error encountered, check if it was resolved
  if pattern_exists '(resolved|fixed|solution|workaround)' "$TRANSCRIPT_FILE"; then
    # Error was resolved, check for failures.json write
    if ! pattern_exists 'precision_edit.*failures\.json|precision_write.*failures\.json' "$TRANSCRIPT_FILE"; then
      add_violation "Error encountered and resolved but no write to failures.json found"
      printf '[FAIL] failures.json not updated\n'
    else
      printf '%s[OK]%s failures.json updated after error resolution\n' "$GREEN" "$NC"
      printf '[PASS] failures.json updated\n'
    fi
    
    # Also check for errors.md write
    if ! pattern_exists 'errors\.md' "$TRANSCRIPT_FILE"; then
      add_violation "Error encountered and resolved but no write to errors.md found"
      printf '[FAIL] errors.md not updated\n'
    else
      printf '%s[OK]%s errors.md updated after error resolution\n' "$GREEN" "$NC"
      printf '[PASS] errors.md updated\n'
    fi
  else
    printf '%s[-]%s Error encountered but not resolved (skipping failure logging check)\n' "$YELLOW" "$NC"
  fi
else
  printf '%s[-]%s No errors detected (skipping failure logging check)\n' "$YELLOW" "$NC"
fi

# Check 4: Patterns logged when reusable approaches discovered
echo ""
echo "[CHECK 4] Verifying patterns logged when reusable approaches discovered..."

# Look for patterns indicating new pattern discovery
# This is harder to detect automatically, so we use heuristics:
# - New files created with reusable code
# - Comments about "pattern" or "approach"
# - Multiple similar implementations
# Note: This is a soft warning check, not a hard violation
if pattern_exists '(pattern|approach|reusable|abstraction)' "$TRANSCRIPT_FILE"; then
  # Potential pattern discovered
  if ! pattern_exists 'precision_edit.*patterns\.json|precision_write.*patterns\.json' "$TRANSCRIPT_FILE"; then
    # This is a soft warning, not a hard violation
    printf '%s[!]%s Pattern-related work detected but no write to patterns.json (may be intentional)\n' "$YELLOW" "$NC"
  else
    printf '%s[OK]%s patterns.json updated when pattern discovered\n' "$GREEN" "$NC"
    printf '[PASS] patterns.json updated\n'
  fi
else
  printf '%s[-]%s No pattern discovery detected (skipping pattern logging check)\n' "$YELLOW" "$NC"
fi

# Check 5: Decisions logged when architectural choices made
echo ""
echo "[CHECK 5] Verifying decisions logged when choices made..."

# Look for decision-making patterns
if pattern_exists '(chose|selected|decided|option)' "$TRANSCRIPT_FILE"; then
  # Decision may have been made
  if pattern_exists 'precision_edit.*decisions\.json|precision_write.*decisions\.json' "$TRANSCRIPT_FILE"; then
    printf '%s[OK]%s decisions.json updated when choice made\n' "$GREEN" "$NC"
    printf '[PASS] decisions.json updated\n'
  else
    # Soft warning - not all choices are architectural decisions
    printf '%s[-]%s Decision-making detected but no write to decisions.json (may be intentional)\n' "$YELLOW" "$NC"
  fi
else
  printf '%s[-]%s No decision-making detected (skipping decision logging check)\n' "$YELLOW" "$NC"
fi

# Summary
echo ""
echo "================================================="
if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  echo -e "${GREEN}PASS${NC} - Memory protocol compliant"
  echo "All required memory operations detected in transcript."
  exit 0
else
  echo -e "${RED}FAIL${NC} - Memory protocol violations found"
  echo ""
  echo "Violations (${#VIOLATIONS[@]}):"
  for violation in "${VIOLATIONS[@]}"; do
    printf '  %s[X]%s %s\n' "$RED" "$NC" "$violation"
  done
  echo ""
  echo "Fix these violations by:"
  echo "  1. Reading failures.json, patterns.json, decisions.json at task start"
  echo "  2. Writing to activity.md after completing tasks"
  echo "  3. Writing to failures.json + errors.md when resolving errors"
  echo "  4. Writing to patterns.json when discovering reusable approaches"
  echo "  5. Writing to decisions.json when making architectural choices"
  exit 1
fi
