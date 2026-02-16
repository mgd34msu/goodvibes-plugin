#!/usr/bin/env bash
# validate-review.sh - Validates review output format compliance
# Usage: ./validate-review.sh <review-file.md>
# Exit codes: 0 = valid, 1 = invalid format

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <review-file.md>" >&2
    exit 1
fi

REVIEW_FILE="$1"

if [ ! -f "$REVIEW_FILE" ]; then
    echo "ERROR: File not found: $REVIEW_FILE" >&2
    exit 1
fi

if [ ! -s "$REVIEW_FILE" ]; then
    echo "ERROR: File is empty: $REVIEW_FILE" >&2
    exit 1
fi

# Track validation failures
ERRORS=()

# Check 1: Overall numeric score present (X.X/10 format)
if ! grep -qE '^- \*\*Overall Score\*\*: [0-9]+\.[0-9]+/10' "$REVIEW_FILE"; then
    ERRORS+=("Missing or malformed Overall Score (expected format: X.X/10)")
fi

# Check 2: Verdict present and valid
if ! grep -qE '^- \*\*Verdict\*\*: (PASS|CONDITIONAL PASS|FAIL)' "$REVIEW_FILE"; then
    ERRORS+=("Missing or invalid Verdict (must be: PASS, CONDITIONAL PASS, or FAIL)")
fi

# Check 3: All 10 dimension scores present with numeric values
DIMENSIONS=(
    "Correctness"
    "Completeness"
    "Security"
    "Performance"
    "Conventions"
    "Testability"
    "Readability"
    "Error Handling"
    "Type Safety"
    "Integration"
)

for dimension in "${DIMENSIONS[@]}"; do
    if ! grep -qE "^\| $dimension \| [0-9]+/10 \|" "$REVIEW_FILE"; then
        ERRORS+=("Missing or malformed dimension score for: $dimension")
    fi
done

# Check 4: Issue categories present (Critical, Major, Minor)
if ! grep -qE '^### Critical \(must fix\)' "$REVIEW_FILE"; then
    ERRORS+=("Missing 'Critical (must fix)' section")
fi

if ! grep -qE '^### Major \(should fix\)' "$REVIEW_FILE"; then
    ERRORS+=("Missing 'Major (should fix)' section")
fi

if ! grep -qE '^### Minor \(nice to fix\)' "$REVIEW_FILE"; then
    ERRORS+=("Missing 'Minor (nice to fix)' section")
fi

# Check 5: Issues have FILE:LINE references and fix suggestions
# Extract issue lines (those starting with '- [' after category headers)
ISSUE_LINES=$(grep -A 100 '^### Critical\|^### Major\|^### Minor' "$REVIEW_FILE" | grep '^- \[' || true)

if [ -n "$ISSUE_LINES" ]; then
    # Check each issue line has FILE:LINE format
    while IFS= read -r line; do
        if ! echo "$line" | grep -qE '\[[^:]+:[0-9]+\]'; then
            ERRORS+=("Issue missing FILE:LINE reference: ${line:0:80}...")
        fi
        
        # Check for fix suggestion ("Fix:" keyword)
        if ! echo "$line" | grep -qi 'Fix:'; then
            ERRORS+=("Issue missing fix suggestion: ${line:0:80}...")
        fi
    done <<< "$ISSUE_LINES"
fi

# Check 6: "What Was Done Well" section exists
if ! grep -qE '^## What Was Done Well' "$REVIEW_FILE"; then
    ERRORS+=("Missing 'What Was Done Well' section")
fi

# Check 7: Verdict matches score thresholds
SCORE=$(grep -oE '^- \*\*Overall Score\*\*: [0-9]+\.[0-9]+' "$REVIEW_FILE" | grep -oE '[0-9]+\.[0-9]+' || echo "0.0")
VERDICT=$(grep -oE '^- \*\*Verdict\*\*: (PASS|CONDITIONAL PASS|FAIL)' "$REVIEW_FILE" | grep -oE '(PASS|CONDITIONAL PASS|FAIL)$' || echo "UNKNOWN")

# Convert score to integer (multiply by 10 to avoid float comparison)
SCORE_INT=$(awk "BEGIN {printf \"%.0f\", $SCORE * 10}")

if [ "$SCORE_INT" -ge 95 ]; then
    EXPECTED_VERDICT="PASS"
elif [ "$SCORE_INT" -ge 80 ]; then
    EXPECTED_VERDICT="CONDITIONAL PASS"
else
    EXPECTED_VERDICT="FAIL"
fi

if [ "$VERDICT" != "$EXPECTED_VERDICT" ] && [ "$VERDICT" != "UNKNOWN" ]; then
    ERRORS+=("Verdict mismatch: Score $SCORE should be $EXPECTED_VERDICT but got $VERDICT")
fi

# Report results
if [ ${#ERRORS[@]} -eq 0 ]; then
    echo "✅ PASS: Review format is valid"
    exit 0
else
    echo "❌ FAIL: Review format validation failed" >&2
    echo "" >&2
    echo "Errors found:" >&2
    for error in "${ERRORS[@]}"; do
        echo "  - $error" >&2
    done
    exit 1
fi
