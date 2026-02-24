#!/usr/bin/env bash
# Requires: bash 4+ (uses arrays, [[ ]])
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
if ! grep -qi -- 'phase 1\|understand\|clarify requirements\|identify affected layers' "$TRANSCRIPT"; then
  printf '[FAIL] Phase 1 (Understand) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf '[PASS] Phase 1 (Understand) found\n'
fi

# Check Phase 2: Foundation (must be sequential, not parallel)
if ! grep -qi -- 'phase 2\|foundation\|database schema\|type generation' "$TRANSCRIPT"; then
  printf '[FAIL] Phase 2 (Foundation) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf '[PASS] Phase 2 (Foundation) found\n'
  
  # Check it's NOT marked as parallel
  if grep -qi -- 'phase 2.*parallel\|foundation.*parallel' "$TRANSCRIPT"; then
    printf '[FAIL] Phase 2 (Foundation) should be sequential, not parallel\n' >&2
    FAILURES=$((FAILURES + 1))
  else
    printf '[PASS] Phase 2 (Foundation) correctly marked as sequential\n'
  fi
fi

# Check Phase 3: Core Implementation (should be parallel)
if ! grep -qi -- 'phase 3\|core implementation\|API.*UI.*parallel\|parallel.*implementation' "$TRANSCRIPT"; then
  printf '[FAIL] Phase 3 (Core Implementation) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf '[PASS] Phase 3 (Core Implementation) found\n'
fi

# Check Phase 4: Integration (must be sequential)
if ! grep -qi -- 'phase 4\|integration\|wire UI to API\|data flow' "$TRANSCRIPT"; then
  printf '[FAIL] Phase 4 (Integration) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf '[PASS] Phase 4 (Integration) found\n'
  
  # Check it's NOT marked as parallel
  if grep -qi -- 'phase 4.*parallel\|integration.*parallel' "$TRANSCRIPT"; then
    printf '[FAIL] Phase 4 (Integration) should be sequential, not parallel\n' >&2
    FAILURES=$((FAILURES + 1))
  else
    printf '[PASS] Phase 4 (Integration) correctly marked as sequential\n'
  fi
fi

# Check Phase 5: Quality (should be parallel, must include tests)
if ! grep -qi -- 'phase 5\|quality\|tests.*security.*accessibility\|parallel.*quality' "$TRANSCRIPT"; then
  printf '[FAIL] Phase 5 (Quality) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf '[PASS] Phase 5 (Quality) found\n'
  
  # Check tests are mentioned
  if ! grep -qi -- 'tests\|unit test\|integration test\|e2e test\|tester agent' "$TRANSCRIPT"; then
    printf '[FAIL] Phase 5 (Quality) must include tests\n' >&2
    FAILURES=$((FAILURES + 1))
  else
    printf '[PASS] Phase 5 (Quality) includes tests\n'
  fi
fi

# Check Phase 6: Review (runtime-driven via <gv> directives)
if ! grep -qi -- 'phase 6\|review\|directive\|<gv>\|complete.*directive\|runtime' "$TRANSCRIPT"; then
  printf '[FAIL] Phase 6 (Review) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf '[PASS] Phase 6 (Review) found\n'
  
  # Check for <gv> tags (agents emitting structured output for runtime)
  GV_COUNT=$(grep -c -F '<gv>' "$TRANSCRIPT" 2>/dev/null || printf '0')
  if [ "$GV_COUNT" -eq 0 ]; then
    printf '[FAIL] Phase 6 (Review) requires <gv> tags from agents for runtime WRFC chains\n' >&2
    FAILURES=$((FAILURES + 1))
  else
    printf '[PASS] Phase 6 (Review) <gv> tags present (%d found)\n' "$GV_COUNT"
  fi
  
  # Check that orchestrator did NOT manually schedule reviewer tasks in decomposition
  if grep -qiE -- '(spawn.*reviewer|schedule.*reviewer|type.*reviewer.*task|reviewer.*agent.*spawn)' "$TRANSCRIPT"; then
    printf '[FAIL] Phase 6 (Review) reviewers must be spawned via runtime directives, not manual scheduling\n' >&2
    FAILURES=$((FAILURES + 1))
  else
    printf '[PASS] Phase 6 (Review) no manual reviewer scheduling found\n'
  fi
fi

# Check Phase 7: Commit + Log (triggered by complete directives)
if ! grep -qi -- 'phase 7\|commit.*log\|git commit\|update.*memory\|complete.*directive' "$TRANSCRIPT"; then
  printf '[FAIL] Phase 7 (Commit + Log) not found in transcript\n' >&2
  FAILURES=$((FAILURES + 1))
else
  printf '[PASS] Phase 7 (Commit + Log) found\n'
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
