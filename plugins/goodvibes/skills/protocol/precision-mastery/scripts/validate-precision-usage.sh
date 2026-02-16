#!/usr/bin/env bash
set -euo pipefail

# validate-precision-usage.sh
# Validates that agent session transcripts follow precision tool usage best practices

VIOLATIONS=()
TRANSCRIPT_FILE="${1:-}"

if [[ -z "$TRANSCRIPT_FILE" ]]; then
  echo "Usage: $0 <transcript-file>"
  echo "  transcript-file: Path to agent session transcript (JSONL or text)"
  exit 1
fi

if [[ ! -f "$TRANSCRIPT_FILE" ]]; then
  echo "Error: File not found: $TRANSCRIPT_FILE"
  exit 1
fi

echo "Validating precision tool usage in: $TRANSCRIPT_FILE"
echo ""

# Check 1: No native tool calls (Read, Edit, Write, Glob, Grep, WebFetch)
echo "[1/4] Checking for native tool usage..."
NATIVE_TOOLS=("\"name\":\"Read\"" "\"name\":\"Edit\"" "\"name\":\"Write\"" "\"name\":\"Glob\"" "\"name\":\"Grep\"" "\"name\":\"WebFetch\"")

for tool in "${NATIVE_TOOLS[@]}"; do
  if grep -q "$tool" -- "$TRANSCRIPT_FILE"; then
    tool_name=$(printf '%s\n' "$tool" | sed 's/.*:\"\(.*\)\".*/\1/')
    VIOLATIONS+=("Native tool call detected: $tool_name (should use precision equivalent)")
  fi
done

# Check 2: Verbosity not set to "verbose" for writes/edits
echo "[2/4] Checking for verbose verbosity on write/edit operations..."
if grep -E '"name":"(mcp__plugin_goodvibes_precision-engine__)?precision_(write|edit)"' -- "$TRANSCRIPT_FILE" | grep -q '"verbosity":"verbose"'; then
  VIOLATIONS+=("Verbose verbosity detected on write/edit operation (should use count_only or minimal)")
fi

# Check 3: Discover tool used before implementation (DPB compliance)
echo "[3/4] Checking for discover usage before implementation..."
# Look for precision_write or precision_edit calls
HAS_IMPLEMENTATION=$(grep -c -E '"name":"(mcp__plugin_goodvibes_precision-engine__)?precision_(write|edit)"' -- "$TRANSCRIPT_FILE" || true)

if [[ $HAS_IMPLEMENTATION -gt 0 ]]; then
  # Check if discover was called before first write/edit
  FIRST_WRITE_LINE=$(grep -n -E '"name":"(mcp__plugin_goodvibes_precision-engine__)?precision_(write|edit)"' -- "$TRANSCRIPT_FILE" | head -1 | cut -d: -f1)
  
  if [[ -n "$FIRST_WRITE_LINE" ]]; then
    # Extract everything before first write/edit
    BEFORE_WRITE=$(head -n "$FIRST_WRITE_LINE" "$TRANSCRIPT_FILE")
    
    if ! echo "$BEFORE_WRITE" | grep -q '"name":".*discover"'; then
      VIOLATIONS+=("No discover call before implementation (DPB violation: should discover before implementing)")
    fi
  fi
fi

# Check 4: Operations batched where possible (no sequential single-item calls)
echo "[4/4] Checking for batching opportunities..."
# Look for patterns of 3+ sequential calls to same tool with single items
# This is a simplified check - in real usage, would need more sophisticated analysis

# Check for multiple sequential precision_read calls with single file
SEQUENTIAL_READS=$(grep -E '"name":"(mcp__plugin_goodvibes_precision-engine__)?precision_read"' -- "$TRANSCRIPT_FILE" | 
  grep -c '"files":\[\{[^\[\]]*\}\]' || true)

if [[ $SEQUENTIAL_READS -ge 3 ]]; then
  VIOLATIONS+=("Multiple sequential single-file precision_read calls detected ($SEQUENTIAL_READS calls - should batch into single call)")
fi

# Check for multiple sequential precision_write calls with single file
SEQUENTIAL_WRITES=$(grep -E '"name":"(mcp__plugin_goodvibes_precision-engine__)?precision_write"' -- "$TRANSCRIPT_FILE" | 
  grep -c '"files":\[\{[^\[\]]*\}\]' || true)

if [[ $SEQUENTIAL_WRITES -ge 3 ]]; then
  VIOLATIONS+=("Multiple sequential single-file precision_write calls detected ($SEQUENTIAL_WRITES calls - should batch into single call)")
fi

echo ""
echo "================================================================="

# Report results
if [[ ${#VIOLATIONS[@]} -eq 0 ]]; then
  echo "RESULT: PASS"
  echo "No precision tool usage violations found."
  exit 0
else
  echo "RESULT: FAIL"
  echo "Found ${#VIOLATIONS[@]} violation(s):"
  echo ""
  for i in "${!VIOLATIONS[@]}"; do
    echo "  $((i+1)). ${VIOLATIONS[$i]}"
  done
  exit 1
fi
