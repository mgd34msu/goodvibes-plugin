#!/usr/bin/env bash
# validate-fix.sh - Validates fix agent output addresses all critical/major issues
# Usage: ./validate-fix.sh <fix-output.md> <original-review.md>
# Exit codes: 0 = all addressed, 1 = issues remaining

set -euo pipefail

if [ $# -ne 2 ]; then
    echo "Usage: $0 <fix-output.md> <original-review.md>" >&2
    exit 1
fi

FIX_FILE="$1"
REVIEW_FILE="$2"

if [ ! -f "$FIX_FILE" ]; then
    echo "ERROR: Fix output file not found: $FIX_FILE" >&2
    exit 1
fi

if [ ! -f "$REVIEW_FILE" ]; then
    echo "ERROR: Original review file not found: $REVIEW_FILE" >&2
    exit 1
fi

if [ ! -s "$FIX_FILE" ]; then
    echo "ERROR: Fix output file is empty: $FIX_FILE" >&2
    exit 1
fi

if [ ! -s "$REVIEW_FILE" ]; then
    echo "ERROR: Original review file is empty: $REVIEW_FILE" >&2
    exit 1
fi

# Track validation failures
ERRORS=()
UNADDRESSED_CRITICAL=()
UNADDRESSED_MAJOR=()

# Extract critical issues from original review
CRITICAL_ISSUES=$(sed -En '/^### Critical \(must fix\)/,/^### Major|^### Minor|^##/p' -- "$REVIEW_FILE" | grep '^- \[' || true)

# Extract major issues from original review
MAJOR_ISSUES=$(sed -En '/^### Major \(should fix\)/,/^### Minor|^##/p' -- "$REVIEW_FILE" | grep '^- \[' || true)

# Check if fix output has required sections
if ! grep -qE '^## Fixes Applied' -- "$FIX_FILE"; then
    ERRORS+=("Missing 'Fixes Applied' section in fix output")
fi

# Function to extract FILE:LINE from issue line
extract_file_line() {
    echo "$1" | grep -oE '\[[^:]+:[0-9]+\]' | tr -d '[]'
}

# Check each critical issue is addressed
if [ -n "$CRITICAL_ISSUES" ]; then
    while IFS= read -r issue; do
        if [ -z "$issue" ]; then
            continue
        fi
        
        FILE_LINE=$(extract_file_line "$issue")
        
        # Check if this FILE:LINE appears in fix output
        if ! grep -qF -- "$FILE_LINE" "$FIX_FILE"; then
            UNADDRESSED_CRITICAL+=("$issue")
        else
            # Verify it's marked as fixed (not in "Issues Not Fixed" section)
            if sed -En '/^### Issues Not Fixed/,/^### |^##/p' -- "$FIX_FILE" | grep -qF -- "$FILE_LINE"; then
                UNADDRESSED_CRITICAL+=("$issue (listed as not fixed)")
            fi
        fi
    done <<< "$CRITICAL_ISSUES"
fi

# Check each major issue is addressed
if [ -n "$MAJOR_ISSUES" ]; then
    while IFS= read -r issue; do
        if [ -z "$issue" ]; then
            continue
        fi
        
        FILE_LINE=$(extract_file_line "$issue")
        
        # Check if this FILE:LINE appears in fix output
        if ! grep -qF -- "$FILE_LINE" "$FIX_FILE"; then
            UNADDRESSED_MAJOR+=("$issue")
        else
            # Verify it's marked as fixed (not in "Issues Not Fixed" section)
            if sed -En '/^### Issues Not Fixed/,/^### |^##/p' -- "$FIX_FILE" | grep -qF -- "$FILE_LINE"; then
                # Major issues in "not fixed" must have valid reason
                # Extract 3 lines starting from the match (POSIX-compatible)
                start_line=$(grep -n -F "$FILE_LINE" -- "$FIX_FILE" | head -1 | cut -d: -f1)
                if [ -n "$start_line" ]; then
                    end_line=$((start_line + 2))
                    if ! sed -n "${start_line},${end_line}p" -- "$FIX_FILE" | grep -qE 'Reason:|reason:'; then
                        ERRORS+=("Major issue not fixed without reason: $FILE_LINE")
                    fi
                fi
            fi
        fi
    done <<< "$MAJOR_ISSUES"
fi

# Check that fixes reference specific files
if grep -qE '^### Critical Issues Addressed|^### Major Issues Addressed' -- "$FIX_FILE"; then
    FIX_DESCRIPTIONS=$(sed -En '/^### Critical Issues Addressed|^### Major Issues Addressed/,/^### [^CM]|^## /p' -- "$FIX_FILE" | grep -- '^- \[' || true)
    
    if [ -n "$FIX_DESCRIPTIONS" ]; then
        # Check for FILE:LINE and Fixed by/→ within multi-line blocks
        current_block=""
        while IFS= read -r line; do
            if [[ "$line" =~ ^'-  ' ]]; then
                # Process previous block if exists
                if [ -n "$current_block" ]; then
                    if ! echo "$current_block" | grep -qE '\[[^:]+:[0-9]+\]'; then
                        ERRORS+=("Fix description missing FILE:LINE reference: ${current_block:0:80}...")
                    fi
                    if ! echo "$current_block" | grep -Eqi 'Fixed by:|→'; then
                        ERRORS+=("Fix description missing 'Fixed by:' explanation: ${current_block:0:80}...")
                    fi
                fi
                # Start new block
                current_block="$line"
            else
                # Continue current block
                current_block="$current_block $line"
            fi
        done <<< "$FIX_DESCRIPTIONS"
        # Process final block
        if [ -n "$current_block" ]; then
            if ! echo "$current_block" | grep -qE '\[[^:]+:[0-9]+\]'; then
                ERRORS+=("Fix description missing FILE:LINE reference: ${current_block:0:80}...")
            fi
            if ! echo "$current_block" | grep -Eqi 'Fixed by:|→'; then
                ERRORS+=("Fix description missing 'Fixed by:' explanation: ${current_block:0:80}...")
            fi
        fi
    fi
fi

# Report results
HAS_ERRORS=false

if [ ${#UNADDRESSED_CRITICAL[@]} -gt 0 ]; then
    echo "[FAIL] Critical issues not addressed" >&2
    echo "" >&2
    for issue in "${UNADDRESSED_CRITICAL[@]}"; do
        echo "  - $issue" >&2
    done
    HAS_ERRORS=true
fi

if [ ${#UNADDRESSED_MAJOR[@]} -gt 0 ]; then
    echo "[FAIL] Major issues not addressed" >&2
    echo "" >&2
    for issue in "${UNADDRESSED_MAJOR[@]}"; do
        echo "  - $issue" >&2
    done
    HAS_ERRORS=true
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
    echo "[FAIL] Fix output validation failed" >&2
    echo "" >&2
    echo "Errors found:" >&2
    for error in "${ERRORS[@]}"; do
        echo "  - $error" >&2
    done
    HAS_ERRORS=true
fi

if [ "$HAS_ERRORS" = true ]; then
    exit 1
else
    echo "[PASS] All critical and major issues addressed"
    exit 0
fi
