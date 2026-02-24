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
SKILL_LIST_PATTERNS="(gather-plan-apply|precision-mastery|error-recovery|goodvibes-memory)"

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
      VIOLATIONS+=("Agent prompts missing protocol skills (gather-plan-apply, precision-mastery, etc.)")
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

# Check 3: <gv> directive compliance
printf '[CHECK 3] Verifying <gv> directive compliance...\n'
GV_TAG_PATTERN='<gv>'

# Check for <gv> tags in transcript (agents emitting structured output)
GV_TAGS_FOUND=$(grep -c -F '<gv>' -- "$TRANSCRIPT" 2>/dev/null || true)
[[ -z "$GV_TAGS_FOUND" ]] && GV_TAGS_FOUND=0

if [[ "$FIRST_SPAWN_LINE" -gt 0 ]]; then
  if [[ "$GV_TAGS_FOUND" -gt 0 ]]; then
    # Check that spawn directives from runtime are followed by Task tool calls (execution)
    SPAWN_DIRECTIVE_LINES=$(grep -n -i -E '"action".*"spawn"' -- "$TRANSCRIPT" | cut -d: -f1 || true)
    DEFERRED_DIRECTIVES=false
    
    if [[ -n "$SPAWN_DIRECTIVE_LINES" ]]; then
      while IFS= read -r dir_line; do
        # Look for Task tool call within 5 lines of directive
        EXEC_WINDOW_END=$((dir_line + 5))
        TASK_AFTER=$(sed -n "${dir_line},${EXEC_WINDOW_END}p" -- "$TRANSCRIPT" | grep -i -E "(Task tool|spawn.*agent|new.*agent)" || true)
        
        if [[ -z "$TASK_AFTER" ]]; then
          DEFERRED_DIRECTIVES=true
          break
        fi
      done <<< "$SPAWN_DIRECTIVE_LINES"
    fi
    
    if [[ "$DEFERRED_DIRECTIVES" == "true" ]]; then
      VIOLATIONS+=("Directive spawn not immediately followed by agent execution")
      PASS=false
      printf '  %s[FAIL]%s Directive not executed immediately\n' "$RED" "$NC"
    else
      printf '  %s[PASS]%s <gv> directives present and appear to be executed\n' "$GREEN" "$NC"
    fi
  else
    # No <gv> tags: check if agents ran at all (simple task may not have completed)
    printf '  %s[PASS]%s No <gv> tags detected (agents may still be running or simple task)\n' "$YELLOW" "$NC"
  fi

  # Check: orchestrator should NOT manually schedule reviewers before directives arrive
  MANUAL_REVIEWER_PATTERN="(spawn.*reviewer|schedule.*reviewer|type.*reviewer.*task|reviewer.*agent.*spawn)"
  MANUAL_REVIEWER=$(grep -i -E "$MANUAL_REVIEWER_PATTERN" -- "$TRANSCRIPT" || true)
  if [[ -n "$MANUAL_REVIEWER" ]]; then
    VIOLATIONS+=("Orchestrator manually scheduled reviewer tasks in decomposition (should come from runtime directives)")
    PASS=false
    printf '  %s[FAIL]%s Manual reviewer scheduling found — runtime issues these via directives\n' "$RED" "$NC"
  else
    printf '  %s[PASS]%s No manual reviewer scheduling in decomposition\n' "$GREEN" "$NC"
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
    VIOLATIONS+=("More than 6 concurrent agent chains detected")
    PASS=false
    printf '  %s[FAIL]%s Concurrent agent limit exceeded\n' "$RED" "$NC"
  else
    printf '  %s[PASS]%s Concurrent agent limit respected\n' "$GREEN" "$NC"
  fi
else
  printf '  %s[PASS]%s No concurrent agent tracking detected (likely <=6)\n' "$GREEN" "$NC"
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
  printf '  3. <gv> directives from the runtime are executed immediately (no deferral)\n'
  printf '  4. No more than 6 concurrent agent chains\n'
  printf '  5. Reviewer tasks are NOT manually scheduled in decomposition\n'
  exit 1
fi
