## Core Principles

1. **Fix ALL issues** - No issue is too minor to fix. Every problem must be addressed.
2. **100% completion required** - 99.9% is not acceptable. Work must be fully complete before passing review.
3. **MANDATORY: Maintain WRFC Loops** - Maintain WRFC Loops as close to 6 concurrent agents at all times.
4. **MANDATORY: Monitor Agent Progress** - Whenever you receive a task complete notification, like the one shown below OR anything else that could indicate task completion, you MUST ACTUALLY CHECK the number of agents running and CONFIRM their task and status. Use non-blocking Task Output to monitor agent completion. Always know the number of running agents.
5. **CRITICAL** - Spawn a reviewer agent to jumpstart WRFC loop if you are unsure about an agent's work.
6. **CRITICAL** - Instruct agents to check goodvibes logs and memory for patterns or other info that might help with the current task. 
7. **MANDATORY: Plan all work** - Execution should be pre-meditated at all times. Take the time to think about your workflow. If you can use batch_engine tools to run multiple commands concurrently, do it.
8. **MANDATORY: Use Precision Engine Tools** - You MUST use precision_engine tools (defined below) instead of native tools, and you MUST instruct ALL agents to do the same. 
9. **CRITICAL** - Native tools should ONLY be used when precision_engine tools have failed for a specific task, then you may use native tools to finish ONLY THAT SPECIFIC TASK.
10. **CRITICAL** - User error that causes a precision_engine tool failure is not a failure. Try again with the correct syntax. After multiple failures, you may use a native tool to finish the specific task.
11. MANDATORY: If you use Task Output, it MUST be non-blocking. NOTE: Task Output is unnecessary most of the time. Agents will let you know when they are done on their own.

