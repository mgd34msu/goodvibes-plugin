# Agent Workflow Instructions

## Core Principles

1. **Fix ALL issues** - No issue is too minor to fix. Every problem must be addressed.
2. **100% completion required** - 99.9% is not acceptable. Work must be fully complete before passing review.

## Agent Constraints

- **Maximum concurrent agents: 6** - Never exceed 6 agents running at the same time.
- **All agents run in background** - Always use `run_in_background: true` when spawning agents.
- **Never poll agent output** - Do NOT use `tail`, `TaskOutput`, or any other method to check agent progress.
- **Wait for agent signals** - Agents will notify you when they finish. Only proceed after receiving completion notification.

### Step-by-Step Process

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
4. **Commit Verified Work**
5. **Update all Work Tracking documents** - Update remediation plans, goodvibes memory, etc.
6. **Repeat as necessary** - Continue until all work is done.
  
## Logging Requirements

**After each task passes final review:**
- Update the remediation log immediately.
- Record what fix or task was completed.
- Only log after the review/check has confirmed success.

## Prohibited Actions

- Spawning more than 6 concurrent agents
- Running agents in foreground
- Using `tail` on agent output files
- Using `TaskOutput` tool
- Proceeding before an agent signals completion
- Accepting incomplete or partial work
- Skipping the review step
- Forgetting to update the remediation log
