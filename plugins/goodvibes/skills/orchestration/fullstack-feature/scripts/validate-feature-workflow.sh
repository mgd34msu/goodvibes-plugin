#!/usr/bin/env bash
set -euo pipefail

# validate-feature-workflow.sh
# Validates that a fullstack-feature workflow session followed the 7-phase protocol
# Usage: ./validate-feature-workflow.sh <transcript_file>
# Exit 0 = pass, Exit 1 = fail

if [ "$#" -lt 1 ]; then
  printf 'Usage: %s <transcript_file>\n' "$(basename -- "$0")" >&2
  exit 1
fi

TRANSCRIPT="$1"

if [ ! -f "$TRANSCRIPT" ]; then
  printf 'Error: File not found: %s\n' "$TRANSCRIPT" >&2
  exit 1
fi

# Track validation failures
FAILURES=0

# Check Phase 1: Understand
if ! grep -qi 'phase 1\|understand\|clarify requirements\|identify affected layers' "$TRANSCRIPT"; then
  printf 'FAIL: Phase 1 (Understand) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: Phase 1 (Understand) found\n'
fi

# Check Phase 2: Foundation (must be sequential, not parallel)
if ! grep -qi 'phase 2\|foundation\|database schema\|type generation' "$TRANSCRIPT"; then
  printf 'FAIL: Phase 2 (Foundation) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: Phase 2 (Foundation) found\n'
  
  # Check it's NOT marked as parallel
  if grep -qi 'phase 2.*parallel\|foundation.*parallel' "$TRANSCRIPT"; then
    printf 'FAIL: Phase 2 (Foundation) should be sequential, not parallel\n' >&2
    FAILURES=$((FAILURES + 1))
  else
    printf 'PASS: Phase 2 (Foundation) correctly marked as sequential\n'
  fi
fi

# Check Phase 3: Core Implementation (should be parallel)
if ! grep -qi 'phase 3\|core implementation\|API.*UI.*parallel\|parallel.*implementation' "$TRANSCRIPT"; then
  printf 'FAIL: Phase 3 (Core Implementation) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: Phase 3 (Core Implementation) found\n'
fi

# Check Phase 4: Integration (must be sequential)
if ! grep -qi 'phase 4\|integration\|wire UI to API\|data flow' "$TRANSCRIPT"; then
  printf 'FAIL: Phase 4 (Integration) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: Phase 4 (Integration) found\n'
  
  # Check it's NOT marked as parallel
  if grep -qi 'phase 4.*parallel\|integration.*parallel' "$TRANSCRIPT"; then
    printf 'FAIL: Phase 4 (Integration) should be sequential, not parallel\n' >&2
    FAILURES=$((FAILURES + 1))
  else
    printf 'PASS: Phase 4 (Integration) correctly marked as sequential\n'
  fi
fi

# Check Phase 5: Quality (should be parallel, must include tests)
if ! grep -qi 'phase 5\|quality\|tests.*security.*accessibility\|parallel.*quality' "$TRANSCRIPT"; then
  printf 'FAIL: Phase 5 (Quality) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: Phase 5 (Quality) found\n'
  
  # Check tests are mentioned
  if ! grep -qi 'tests\|unit test\|integration test\|e2e test\|tester agent' "$TRANSCRIPT"; then
    printf 'FAIL: Phase 5 (Quality) must include tests\n' >&2
    FAILURES=$((FAILURES + 1))
  else
    printf 'PASS: Phase 5 (Quality) includes tests\n'
  fi
fi

# Check Phase 6: Review (WRFC loop)
if ! grep -qi 'phase 6\|review\|WRFC\|work-review-fix-check\|review.*score\|verdict' "$TRANSCRIPT"; then
  printf 'FAIL: Phase 6 (Review/WRFC) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: Phase 6 (Review/WRFC) found\n'
  
  # Check score mentioned
  if ! grep -qi 'score.*9\.5\|verdict.*PASS\|overall score' "$TRANSCRIPT"; then
    printf 'FAIL: Phase 6 (Review) must include scoring and verdict\n' >&2
    FAILURES=$((FAILURES + 1))
  else
    printf 'PASS: Phase 6 (Review) includes scoring\n'
  fi
fi

# Check Phase 7: Commit + Log
if ! grep -qi 'phase 7\|commit.*log\|git commit\|update.*memory' "$TRANSCRIPT"; then
  printf 'FAIL: Phase 7 (Commit + Log) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf 'PASS: Phase 7 (Commit + Log) found\n'
fi

# Summary
printf '\n'
if [ "$FAILURES" -eq 0 ]; then
  printf 'All validations passed. Workflow follows fullstack-feature protocol.\n'
  exit 0
else
  printf 'Validation failed with %d error(s). Workflow does NOT follow fullstack-feature protocol.\n' "$FAILURES" >&2
  exit 1
fi
