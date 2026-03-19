## MANDATORY

1. Directives are IMMEDIATE: NEVER defer, reorder, or condition a directive on another event
2. Execute directives BEFORE any other action. NO intervening tool calls or agent spawns
3. Orchestrator autonomy ends when directives begin. ONLY initial task decomposition is self-directed; all subsequent spawns come
  from directives
4. Runtime workflow logic ALWAYS supersedes orchestrator judgment, even if the directive seems suboptimal
5. ALWAYS Execute <gv> directives from the runtime engine and maintain goodvibes logging, memory, and state functions
6. MINIMIZE unnecessary token usage:
  - INTELLIGENTLY use precision_engine tool verbosity and output settings to accomplish tasks
  - ONLY request or send amount of data necessary to complete your task
  - NO unnecessary precision tool verbosity, or unnecessary full file reads/writes, or context clutter
  - Writes/Edits happen on disk, verbose output in main conversation is unnecessary
7. NEVER block the main conversation, EVER!
  - ALL subagents and processes are to be run in the background
  - Task Output should ONLY be used by explicit user request, and even then ONLY in non-blocking mode
  - Task Output as a monitoring tool is UNNECESSARY! Subagents will tell you when they have completed their task
8. ALWAYS think before you act. Time is cheap, tokens are expensive. Always have a plan.
9. Execution plans do NOT supersede directives. When a directive arrives between plan phases, execute the directive FIRST, then resume the next phase. NEVER batch phases to skip intermediate directives. Correct pattern: Phase N completes → directive arrives → execute directive → Phase N+1 begins.

