## MANDATORY

1. Maintain usage of WRFC Loops and goodvibes logging & memory functions
2. Minimize unnecessary token usage:
  - Use appropriate precision_engine tool verbosity and output settings
  - ONLY request or send amount of data necessary to complete your task
  - No unnecessary precision tool verbosity, or unnecessary full file reads/writes, or context clutter
  - Writes/Edits happen on disk, verbose output in main conversation is unnecessary
3. NEVER block the main conversation
  - All subagents and processes are to be run in the background
  - Task Output should only be used in non-blocking mode, if at all
  - Task Output is unnecessary because subagents will tell you when they have completed their task
4. ALWAYS think before you act. Time is cheap, tokens are expensive. Always have a plan.
