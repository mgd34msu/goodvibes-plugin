#!/usr/bin/env bash
# Requires: bash 4+ (uses arrays, [[ ]])

# validate-orchestration.sh
# Validates that orchestrator sessions follow the task orchestration protocol

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Usage
if [[ $# -lt 1 ]]; then
  printf 'Usage: %s <orchestrator-transcript-path>\n' "$0"
  printf '\n'
  printf 'Arguments:\n'
  printf '  orchestrator-transcript-path   Path to orchestrator session transcript\n'
  printf '\n'
  printf 'Example:\n'
  printf '  %s ./session-2026-02-15.jsonl\n' "$0"
  exit 1
fi

TRANSCRIPT="$1"

# Initialize violation tracking
VIOLATIONS=()
PASS=true

# Validate transcript exists
if [[ ! -f "$TRANSCRIPT" ]]; then
  printf '%sERROR: Transcript file not found: %s%s\n' "$RED" "$TRANSCRIPT" "$NC"
  exit 1
fi

printf 'Validating task orchestration protocol compliance...\n'
printf '\n'

# Check 1: Task decomposition before agent spawn
printf '[CHECK 1] Verifying task decomposition before agent spawn...\n'
AGENT_SPAWN_PATTERNS="(spawn.*agent|create.*agent|agent.*task|batch.*agent)"
DECOMPOSITION_PATTERNS="(task_id|blocking|blocked_by|decompose|parallel.*task|task.*breakdown)"

# Find first agent spawn line
FIRST_SPAWN_LINE=$(grep -n -m 1 -i -E "$AGENT_SPAWN_PATTERNS" -- "$TRANSCRIPT" | cut -d: -f1 || printf '0')

if [[ "$FIRST_SPAWN_LINE" -gt 0 ]]; then
  # Check if decomposition appears before first spawn
  DECOMPOSITION_BEFORE=$(sed -n "1,${FIRST_SPAWN_LINE}p" -- "$TRANSCRIPT" | grep -i -E "$DECOMPOSITION_PATTERNS" || true)
  
  if [[ -z "$DECOMPOSITION_BEFORE" ]]; then
    VIOLATIONS+=("Agent spawned without prior task decomposition")
    PASS=false
    printf '  %s[FAIL]%s No decomposition before agent spawn\n' "$RED" "$NC"
  else
    printf '  %s[PASS]%s Task decomposition found before agent spawn\n' "$GREEN" "$NC"
  fi
else
  printf '  %s[PASS]%s No agent spawns detected (not applicable)\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 2: Agent prompts include skill references
printf '[CHECK 2] Verifying agent prompts include skill references...\n'
AGENT_PROMPT_PATTERNS="(## Skills Available|skills:|Skills to use)"
SKILL_LIST_PATTERNS="(discover-plan-batch|precision-mastery|error-recovery|goodvibes-memory)"

AGENT_PROMPTS=$(grep -n -i -E "$AGENT_PROMPT_PATTERNS" -- "$TRANSCRIPT" || true)

if [[ "$FIRST_SPAWN_LINE" -gt 0 ]]; then
  if [[ -z "$AGENT_PROMPTS" ]]; then
    VIOLATIONS+=("Agent prompts missing skill references")
    PASS=false
    printf '  %s[FAIL]%s No skill references in agent prompts\n' "$RED" "$NC"
  else
    # Check if protocol skills are included (look in context around skill sections)
    SKILL_SECTION_LINES=$(grep -n -i -E "$AGENT_PROMPT_PATTERNS" -- "$TRANSCRIPT" | cut -d: -f1 || true)
    PROTOCOL_SKILLS_FOUND=false
    
    if [[ -n "$SKILL_SECTION_LINES" ]]; then
      while IFS= read -r line_num; do
        # Check 10 lines after skill section header for protocol skills
        CONTEXT_START=$line_num
        CONTEXT_END=$((line_num + 10))
        
        PROTOCOL_IN_CONTEXT=$(sed -n "${CONTEXT_START},${CONTEXT_END}p" -- "$TRANSCRIPT" | grep -i -E "$SKILL_LIST_PATTERNS" || true)
        
        if [[ -n "$PROTOCOL_IN_CONTEXT" ]]; then
          PROTOCOL_SKILLS_FOUND=true
          break
        fi
      done <<< "$SKILL_SECTION_LINES"
    fi
    
    if [[ "$PROTOCOL_SKILLS_FOUND" == "false" ]]; then
      VIOLATIONS+=("Agent prompts missing protocol skills (discover-plan-batch, precision-mastery, etc.)")
      PASS=false
      printf '  %s[FAIL]%s Protocol skills not referenced in prompts\n' "$RED" "$NC"
    else
      printf '  %s[PASS]%s Agent prompts include skill references\n' "$GREEN" "$NC"
    fi
  fi
else
  printf '  %s[PASS]%s No agent spawns detected (not applicable)\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 3: WRFC loop maintained
printf '[CHECK 3] Verifying WRFC loop coordination...\n'
WRITE_PATTERNS="(spawn.*agent|WRITE phase|agent.*running)"
REPORT_PATTERNS="(agent.*report|REPORT phase|agent.*complete|Summary:|Changes Made:)"
FIX_PATTERNS="(FIX phase|analyzing.*report|issue.*found)"
CONTINUE_PATTERNS="(CONTINUE phase|next.*wave|spawn.*next)"

WRITE_FOUND=$(grep -c -i -E "$WRITE_PATTERNS" -- "$TRANSCRIPT" 2>/dev/null || true)
REPORT_FOUND=$(grep -c -i -E "$REPORT_PATTERNS" -- "$TRANSCRIPT" 2>/dev/null || true)

# Normalize empty results to 0
[[ -z "$WRITE_FOUND" ]] && WRITE_FOUND=0
[[ -z "$REPORT_FOUND" ]] && REPORT_FOUND=0

# WRFC loop should have balanced WRITE and REPORT phases
if [[ "$FIRST_SPAWN_LINE" -gt 0 ]]; then
  if [[ "$WRITE_FOUND" -gt 0 ]] && [[ "$REPORT_FOUND" -eq 0 ]]; then
    VIOLATIONS+=("WRITE phase detected but no REPORT phase found")
    PASS=false
    printf '  %s[FAIL]%s Incomplete WRFC loop (missing REPORT)\n' "$RED" "$NC"
  elif [[ "$WRITE_FOUND" -gt 0 ]] && [[ "$REPORT_FOUND" -gt 0 ]]; then
    printf '  %s[PASS]%s WRFC loop phases present\n' "$GREEN" "$NC"
  else
    printf '  %s[PASS]%s No WRFC loop detected (simple task)\n' "$GREEN" "$NC"
  fi
else
  printf '  %s[PASS]%s No agent spawns detected (not applicable)\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 4: Concurrent agent limit (6 max)
printf '[CHECK 4] Verifying concurrent agent limit...\n'
CONCURRENT_PATTERNS="(concurrent.*agent|parallel.*agent|agent.*chain|active.*task)"

# Look for mentions of concurrent agent counts
CONCURRENT_MENTIONS=$(grep -i -E "$CONCURRENT_PATTERNS" -- "$TRANSCRIPT" || true)

if [[ -n "$CONCURRENT_MENTIONS" ]]; then
  # Check for counts > 6
  OVER_LIMIT=$(printf '%s' "$CONCURRENT_MENTIONS" | grep -E "(concurrent|parallel|active).*([7-9]|[1-9][0-9]+).*agent" || true)
  
  if [[ -n "$OVER_LIMIT" ]]; then
    VIOLATIONS+=("More than 6 concurrent agents detected")
    PASS=false
    printf '  %s[FAIL]%s Concurrent agent limit exceeded\n' "$RED" "$NC"
  else
    printf '  %s[PASS]%s Concurrent agent limit respected\n' "$GREEN" "$NC"
  fi
else
  printf '  %s[PASS]%s No concurrent agent tracking detected (likely <=6)\n' "$GREEN" "$NC"
fi
printf '\n'

# Check 5: Structured output format from agents
printf '[CHECK 5] Verifying agents use structured output format...\n'
STRUCTURED_OUTPUT_PATTERNS="(## Summary|### Changes Made|### Decisions Made|### Issues Encountered|### Next Steps)"

if [[ "$FIRST_SPAWN_LINE" -gt 0 ]] && [[ "$REPORT_FOUND" -gt 0 ]]; then
  STRUCTURED_OUTPUT=$(grep -c -E "$STRUCTURED_OUTPUT_PATTERNS" -- "$TRANSCRIPT" 2>/dev/null || true)
  [[ -z "$STRUCTURED_OUTPUT" ]] && STRUCTURED_OUTPUT=0
  
  # Should have at least 3 of the 5 sections
  if [[ "$STRUCTURED_OUTPUT" -lt 3 ]]; then
    VIOLATIONS+=("Agent reports missing structured output format")
    PASS=false
    printf '  %s[FAIL]%s Structured output format not used\n' "$RED" "$NC"
  else
    printf '  %s[PASS]%s Agents use structured output format\n' "$GREEN" "$NC"
  fi
else
  printf '  %s[PASS]%s No agent reports detected (not applicable)\n' "$GREEN" "$NC"
fi
printf '\n'

# Final report
printf '========================================\n'
if [[ "$PASS" == "true" ]]; then
  printf '%sRESULT: PASS%s\n' "$GREEN" "$NC"
  printf 'Orchestrator session is compliant with task orchestration protocol.\n'
  exit 0
else
  printf '%sRESULT: FAIL%s\n' "$RED" "$NC"
  printf '\n'
  printf 'Protocol violations found:\n'
  for violation in "${VIOLATIONS[@]}"; do
    printf '  %s[FAIL]%s %s\n' "$RED" "$NC" "${violation}"
  done
  printf '\n'
  printf 'Review the orchestrator transcript and ensure:\n'
  printf '  1. Tasks are decomposed before spawning agents\n'
  printf '  2. Agent prompts include skill references (especially protocol skills)\n'
  printf '  3. WRFC loop is maintained (WRITE -> REPORT -> FIX -> CONTINUE)\n'
  printf '  4. No more than 6 concurrent agent chains\n'
  printf '  5. Agents use structured output format\n'
  exit 1
fi
