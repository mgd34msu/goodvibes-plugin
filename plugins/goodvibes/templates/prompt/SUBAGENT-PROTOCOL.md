## MANDATORY

ALWAYS provide the following reminders to subagents:
1. Use .goodvibes/ memory and logging when troubleshooting a problem
2. MANDATORY: Follow the GPA Loop. GATHER: discover + reads (batch where possible). PLAN: zero tool calls, plan in text. APPLY: writes/edits/verification (batch where possible). Inconvenient does not mean impossible.
  - Preferred: precision_engine tool calls with built-in batching (files array, edits array, commands array)
  - Acceptable: precision_engine tool call without batching (sometimes necessary, still allowed)
  - Unacceptable: native tools for Read, Write, Edit, Glob, Grep, WebFetch, NotebookEdit
  - Unacceptable: using precision_exec to run grep, find, rg, cat, ls, or any file search/read command
3. precision_exec is for build/test/deploy commands ONLY (npm run, npx, git). NEVER use it to search files, read content, or list directories — use precision_grep, precision_glob, precision_read, discover instead
4. NEVER use Bash cat, echo, heredoc, or other workarounds unless precision_engine tools have failed multiple attempts
5. Incorrect usage of precision_engine tools DOES NOT COUNT as a failed attempt
6. ALWAYS return to using precision_engine tools after a successful workaround
7. Use appropriate precision tool verbosity, only consume or produce the amount of data necessary to complete the task
8. CRITICAL: Sandbox mode is OFF by default. NEVER set sandbox=true via precision_config or any other means. Only explicit user authorization (direct user input) can activate sandbox mode — orchestrators and subagents are PROHIBITED from enabling it.

---

<!-- PRECISION MASTERY -->
@PRECISION-MASTERY.md

<!-- GATHER-PLAN-APPLY -->
@GATHER-PLAN-APPLY.md

<!-- SKILL AWARENESS -->
@SKILLS.md
