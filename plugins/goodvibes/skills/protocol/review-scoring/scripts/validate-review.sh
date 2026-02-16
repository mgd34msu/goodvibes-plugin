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

# NOTE: Dimension score regex expects exact markdown table format:
# | Dimension Name | Score/10 | Notes |
# with single spaces around pipe delimiters
for dimension in "${DIMENSIONS[@]}"; do
    if ! grep -qE "^\| $dimension \| [0-9]+/10 \|" "$REVIEW_FILE"; then
        ERRORS+=("Missing or malformed dimension score for: $dimension")
    fi
done

# Check critical dimension rule (SKILL.md line 236)
# Extract verdict for later comparison
VERDICT=$(grep -oE '^- \*\*Verdict\*\*: (PASS|CONDITIONAL PASS|FAIL)' "$REVIEW_FILE" | grep -oE '(PASS|CONDITIONAL PASS|FAIL)$' || echo "UNKNOWN")

for dimension in "${DIMENSIONS[@]}"; do
    # Extract dimension score (just the number, not /10)
    dim_score=$(grep -oP "^\| $dimension \| \K[0-9]+" "$REVIEW_FILE" || echo "0")
    if [[ "$dim_score" -lt 4 ]] && [[ "$dim_score" -ne 0 ]]; then
        # Score below 4 (and not missing/0) requires FAIL verdict
        if [[ "$VERDICT" != "FAIL" ]]; then
            ERRORS+=("Dimension '$dimension' scored $dim_score/10 (below 4) — verdict must be FAIL per critical dimension rule, but verdict is $VERDICT")
        fi
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
ISSUE_LINES=$(grep -E -A 100 '^### Critical|^### Major|^### Minor' "$REVIEW_FILE" | grep '^- \[' || true)

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
# Note: VERDICT already extracted above for critical dimension check

# Convert score to integer (multiply by 10 to avoid float comparison)
SCORE_INT=$(awk -v score="$SCORE" 'BEGIN {printf "%.0f", score * 10}')

# Determine expected verdict based on score
if [ "$SCORE_INT" -ge 95 ]; then
    EXPECTED_VERDICT="PASS"
elif [ "$SCORE_INT" -ge 80 ]; then
    EXPECTED_VERDICT="CONDITIONAL PASS"
else
    EXPECTED_VERDICT="FAIL"
fi

# Only check verdict-score match if critical dimension rule hasn't already triggered FAIL
if [ "$VERDICT" != "$EXPECTED_VERDICT" ] && [ "$VERDICT" != "UNKNOWN" ]; then
    # Check if a critical dimension rule violation already flagged this
    CRIT_DIM_FAIL=false
    for error in "${ERRORS[@]}"; do
        if [[ "$error" == *"critical dimension rule"* ]]; then
            CRIT_DIM_FAIL=true
            break
        fi
    done
    
    # Only add verdict mismatch if it's not due to critical dimension rule
    if [ "$CRIT_DIM_FAIL" = false ]; then
        ERRORS+=("Verdict mismatch: Score $SCORE should be $EXPECTED_VERDICT but got $VERDICT")
    fi
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
