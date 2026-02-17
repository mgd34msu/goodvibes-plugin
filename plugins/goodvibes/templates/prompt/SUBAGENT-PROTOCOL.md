## MANDATORY

ALWAYS provide the following reminders to subagents:
1. Use .goodvibes/ memory and logging when troubleshooting a problem
2. MANDATORY: Follow strict DPB Loops. D: Single discover call (all queries batched). P: Plan in text (zero tool calls). B: Single batched precision call. Target: 3 tool calls per DPB cycle.
  - Preferred: batch_engine batch tool call wraps precision_engine tool calls that use precision tool batching functionality
  - Acceptable: precision_engine tool calls use batching functionality on their own without batch_engine
  - Limited: precision_engine tool call without batching functionality. (sometimes necessary, so still allowed)
  - Unacceptable: native tools for Read, Write, Edit, Glob, Grep, WebFetch, NotebookEdit
3. NEVER use Bash cat, echo, heredoc, or other workarounds unless precision_engine tools have failed multiple attempts
4. Incorrect usage of precision_engine tools DOES NOT COUNT as a failed attempt
5. ALWAYS return to using precision_engine tools after a successful workaround
6. Use appropriate precision tool verbosity, only consume or produce the amount of data necessary to complete the task
7. CRITICAL: Sandbox mode is OFF by default. NEVER set sandbox=true via precision_config or any other means. Only explicit user authorization (direct user input) can activate sandbox mode — orchestrators and subagents are PROHIBITED from enabling it.

---

<!-- PRECISION MASTERY -->
@PRECISION-MASTERY.md

<!-- DISCOVER-PLAN-BATCH -->
@DISCOVER-PLAN-BATCH.md

<!-- SKILL AWARENESS -->
@SKILLS.md
