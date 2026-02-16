#!/usr/bin/env bash

# validate-error-recovery.sh
# Validates that agent sessions follow the error recovery protocol

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Usage
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <session-transcript-path> <failures-json-path>"
  echo ""
  echo "Arguments:"
  echo "  session-transcript-path   Path to agent session transcript (JSONL or text)"
  echo "  failures-json-path        Path to .goodvibes/memory/failures.json"
  echo ""
  echo "Example:"
  echo "  $0 ./session-2026-02-15.jsonl .goodvibes/memory/failures.json"
  exit 1
fi

TRANSCRIPT="$1"
FAILURES_JSON="$2"

# Initialize violation tracking
VIOLATIONS=()
PASS=true

# Validate files exist
if [[ ! -f "$TRANSCRIPT" ]]; then
  printf '%sERROR: Transcript file not found: %s%s\n' "$RED" "$TRANSCRIPT" "$NC"
  exit 1
fi

if [[ ! -f "$FAILURES_JSON" ]]; then
  printf '%sWARNING: failures.json not found: %s%s\n' "$YELLOW" "$FAILURES_JSON" "$NC"
  echo "This may indicate no failures were logged."
else
  # Validate JSON structure
  if command -v jq &>/dev/null; then
    if ! jq . "$FAILURES_JSON" > /dev/null 2>&1; then
      printf '  %s[!]%s failures.json is not valid JSON (jq validation)\n' "$YELLOW" "$NC"
      VIOLATIONS+=("failures.json is not valid JSON (jq validation)")
    fi
  elif command -v python3 &>/dev/null; then
    if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$FAILURES_JSON" 2>/dev/null; then
      printf '  %s[!]%s failures.json is not valid JSON (python3 validation)\n' "$YELLOW" "$NC"
      VIOLATIONS+=("failures.json is not valid JSON (python3 validation)")
    fi
  fi
fi

echo "Validating error recovery protocol compliance..."
echo ""

# Check 1: Error was categorized before retry
echo "[CHECK 1] Verifying errors were categorized before retry..."
ERROR_PATTERNS="(Error:|Exception:|Failed:|ENOENT|EACCES|TypeError|ReferenceError)"
CATEGORY_PATTERNS="(TOOL_FAILURE|BUILD_ERROR|TEST_FAILURE|TYPE_ERROR|RUNTIME_ERROR|EXTERNAL_ERROR)"

# Find lines with errors
ERROR_LINES=$(grep -n -E "$ERROR_PATTERNS" -- "$TRANSCRIPT" | cut -d: -f1 || true)

if [[ -n "$ERROR_LINES" ]]; then
  while IFS= read -r line_num; do
    # Check if categorization appears within 20 lines after the error
    CONTEXT_START=$line_num
    CONTEXT_END=$((line_num + 20))
    
    CATEGORIZED=$(sed -n "${CONTEXT_START},${CONTEXT_END}p" -- "$TRANSCRIPT" | grep -E "$CATEGORY_PATTERNS" || true)
    
    if [[ -z "$CATEGORIZED" ]]; then
      VIOLATIONS+=("Line $line_num: Error detected but not categorized within 20 lines")
      PASS=false
    fi
  done <<< "$ERROR_LINES"
fi

if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  printf '  %s[OK]%s All errors were categorized\n' "$GREEN" "$NC"
  printf '[PASS] All errors categorized\n'
else
  printf '  %s[X]%s Found uncategorized errors\n' "$RED" "$NC"
  printf '[FAIL] Uncategorized errors found\n'
fi
echo ""

# Check 2: failures.json was checked for known patterns
echo "[CHECK 2] Verifying failures.json was consulted before fixes..."
FAILURES_CHECK_PATTERNS="(precision_read.*failures\\.json|precision_grep.*failures\\.json|discover.*failures\\.json|\\.goodvibes/memory/failures\\.json)"

FAILURES_CHECKED=$(grep -i -E "$FAILURES_CHECK_PATTERNS" -- "$TRANSCRIPT" || true)

if [[ -n "$ERROR_LINES" ]] && [[ -z "$FAILURES_CHECKED" ]]; then
  VIOLATIONS+=("Errors occurred but failures.json was not checked for known patterns")
  PASS=false
  printf '  %s[X]%s failures.json was not checked\n' "$RED" "$NC"
  printf '[FAIL] failures.json not checked\n'
else
  printf '  %s[OK]%s failures.json was checked\n' "$GREEN" "$NC"
  printf '[PASS] failures.json checked\n'
fi
echo ""

# Check 3: Resolution logged to failures.json after successful recovery
echo "[CHECK 3] Verifying resolutions were logged to failures.json..."
RESOLUTION_PATTERNS="(precision_edit.*failures\\.json|logging to failures\\.json|log.*resolution|updated failures\\.json)"

RESOLUTION_LOGGED=$(grep -i -E "$RESOLUTION_PATTERNS" -- "$TRANSCRIPT" || true)

# Count errors that were resolved (look for success indicators after errors)
RESOLVED_PATTERNS="(resolved|fixed|working now|success|passed)"
RESOLVED_COUNT=$(grep -c -i -E "$RESOLVED_PATTERNS" -- "$TRANSCRIPT" || echo 0)

if [[ $RESOLVED_COUNT -gt 0 ]] && [[ -z "$RESOLUTION_LOGGED" ]]; then
  VIOLATIONS+=("Errors were resolved but not logged to failures.json")
  PASS=false
  printf '  %s[X]%s Resolutions were not logged\n' "$RED" "$NC"
  printf '[FAIL] Resolutions not logged\n'
else
  printf '  %s[OK]%s Resolutions were logged or no resolutions needed\n' "$GREEN" "$NC"
  printf '[PASS] Resolutions logged\n'
fi
echo ""

# Check 4: Escalation attempted before marking incomplete (if max attempts reached)
echo "[CHECK 4] Verifying proper escalation after max attempts..."
MAX_ATTEMPTS_PATTERNS="(attempt 3|third attempt|max attempts|tried 3 times)"
ESCALATION_PATTERNS="(escalate|report to orchestrator|blocked|need user|requires intervention)"
INCOMPLETE_PATTERNS="(task incomplete|cannot complete|unable to complete|failed to complete)"

MAX_ATTEMPTS=$(grep -i -E "$MAX_ATTEMPTS_PATTERNS" -- "$TRANSCRIPT" || true)
ESCALATION=$(grep -i -E "$ESCALATION_PATTERNS" -- "$TRANSCRIPT" || true)
MARKED_INCOMPLETE=$(grep -i -E "$INCOMPLETE_PATTERNS" -- "$TRANSCRIPT" || true)

if [[ -n "$MAX_ATTEMPTS" ]] && [[ -n "$MARKED_INCOMPLETE" ]] && [[ -z "$ESCALATION" ]]; then
  VIOLATIONS+=("Max attempts reached and task marked incomplete, but no escalation to orchestrator")
  PASS=false
  printf '  %s[X]%s Failed to escalate after max attempts\n' "$RED" "$NC"
  printf '[FAIL] No escalation after max attempts\n'
else
  printf '  %s[OK]%s Proper escalation or no max attempts reached\n' "$GREEN" "$NC"
  printf '[PASS] Proper escalation\n'
fi
echo ""

# Final report
echo "========================================"
if [[ "$PASS" == true ]]; then
  printf '%sRESULT: PASS%s\n' "$GREEN" "$NC"
  echo "Agent session is compliant with error recovery protocol."
  exit 0
else
  printf '%sRESULT: FAIL%s\n' "$RED" "$NC"
  echo ""
  echo "Protocol violations found:"
  for violation in "${VIOLATIONS[@]}"; do
    printf '  %s[X]%s %s\n' "$RED" "$NC" "${violation}"
  done
  echo ""
  echo "Review the session transcript and ensure:"
  echo "  1. All errors are categorized (TOOL_FAILURE, BUILD_ERROR, etc.)"
  echo "  2. failures.json is checked before attempting fixes"
  echo "  3. Successful resolutions are logged to failures.json"
  echo "  4. Escalation occurs after 3 failed attempts"
  exit 1
fi
