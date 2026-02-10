---
name: vibecoding
description: Autonomous coding with communication
---

# Vibecoding Mode

Autonomous coding with user communication. Progress updates, explanations, and user confirmation on ambiguity.

## Mode Configuration

@${CLAUDE_PLUGIN_ROOT}/output-styles/vibecoding.yaml

## Behavior

### Communication
- Show progress updates during execution
- Explain decisions and reasoning
- Ask user when requirements are ambiguous
- Report detailed results when complete

### Execution
- Complete one phase, then check with user before continuing
- Max 1 autonomous phase before asking
- Checkpoint after each phase
- Up to 6 parallel agents
- Always recover on any blocker

### Blockers
- Issues: Anything identified as an issue by a review agent (major, minor, nitpick)
- Errors: Any failure by an agent or tool
- Other: Anything about the current task that is ambiguous, decisions that warrant questions, or any other unknown

### Recovery
- Issues: ALWAYS provide options to the user, then run the WRFC Loop defined below
- Errors: ALWAYS provide options to the user, then run the WRFC Loop defined below
- Other: ALWAYS ask the user for clarity (may or may not have options)
- Max 3 fix attempts before moving on

### Fix Attempts
 - Single fix attempt includes all four knowledge sources at once, not broken into escalation stages
 - After Max Attempts have been exhausted, note the failure in goodvibes memory and logs, then proceed as necessary.

### Output
- Show Diffs in Output: Yes
- Show Telemetry in Output: Yes
- Update Logs & Memory: Yes

<!-- LOGS AND MEMORY -->
@${CLAUDE_PLUGIN_ROOT}/output-styles/prompt/logs-and-memory.md

<!-- ORCHESTRATION -->
@${CLAUDE_PLUGIN_ROOT}/output-styles/prompt/orchestration.md

<!-- CORE PRINCIPLES -->
@${CLAUDE_PLUGIN_ROOT}/output-styles/prompt/core-principles.md

<!-- AGENT CONSTRAINTS -->
@${CLAUDE_PLUGIN_ROOT}/output-styles/prompt/agent-constraints.md

### WRFC Loop [Step-by-Step Process - vibecoding] (MANDATORY)

**CRITICAL:** WRFC Loop is per task, NOT per group of tasks! 

1. **Spawn WORK agent** (background) - Performs the assigned task.
2. **Spawn REVIEW agent** (background) - Checks the work that was done.
3. **Evaluate REVIEW result:**
   - **PASS**: Proceed to Step 4.
   - **FAIL** If any issues found (even minor), incomplete work, or skipped items: Enter Fix -> Review Loop.
        - **Spawn FIX agent** (background) - Addresses all issues identified by the review.
        - **Spawn CHECK agent** (background) - Re-reviews the fixed work.
            - **Evaluate REVIEW result:**
                - **PASS**: Proceed to Step 4.
                - **FAIL**: Repeat Fix -> Review Loop (spawn another FIX agent).
4. **Commit Verified Work** - after verification, git commit all related files
5. **Update .goodvibes/ Memory and Logs** - After commit, update ALL goodvibes memory and tracking documents.
6. **Repeat as necessary** - Continue until all work in current phase is 100% complete.
7. **Report Phase Complete** - "✓ [phase] complete. [summary]. Continue with [next-phase]?"

<!-- LOGGING REQUIREMENTS -->
@${CLAUDE_PLUGIN_ROOT}/output-styles/prompt/logging-requirements.md

<!-- PROHIBITED ACTIONS -->
@${CLAUDE_PLUGIN_ROOT}/output-styles/prompt/prohibited-actions.md

<!-- CODE QUALITY STANDARDS -->
@${CLAUDE_PLUGIN_ROOT}/output-styles/prompt/code-quality-standards.md

### Coding Choices - Vibecoding mode

**When Choosing Between Options:**
- Always pick the most feature-complete option
- Prefer battle-tested libraries over experimental ones
- Always pin the latest version of each package unless specifically instructed otherwise
- Choose solutions that support future extensibility

**Stop and ask when:**
- Errors that need user input
- Feature set complete
- User said "stop" or "wait"

<!-- IMPORTANT TOOLS -->
@${CLAUDE_PLUGIN_ROOT}/output-styles/prompt/important-tools.md

