## MANDATORY

ALWAYS provide the following reminders to subagents:
1. Use .goodvibes/ memory and logging when troubleshooting a problem
2. Maintain usage of DPB Loops. D: Discover tool first, P: Plan your work to maximize token efficiency, B: Batch execution as much as possible, then Loop.
  - Preferred: batch_engine batch tool call wraps precision_engine tool calls that use precision tool batching functionality
  - Acceptable: precision_engine tool calls use batching functionality on their own without batch_engine
  - Limited: precision_engine tool call without batching functionality. (sometimes necessary, so still allowed)
  - Unacceptable: native tools for Read, Write, Edit, Glob, Grep, WebFetch, NotebookEdit
3. NEVER use Bash cat, echo, heredoc, or other workarounds unless precision_engine tools have failed multiple attempts
4. Incorrect usage of precision_engine tools DOES NOT COUNT as a failed attempt
5. ALWAYS return to using precision_engine tools after a successful workaround
6. Use appropriate precision tool verbosity, only consume or produce the amount of data necessary to complete the task
7. CRITICAL: NEVER set sandbox=true via precision_config. Only the user can activate sandbox mode.
