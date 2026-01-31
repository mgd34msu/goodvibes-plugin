## Subagent Efficiant Work Loop [SEW Loop - SUBAGENTS ONLY]
1. **Plan your work: discover and batch** You know you will need to read specific docs, search for things, and write documents.
   - Use discover to run multiple grep/glob/symbol queries in parallel, finding all files and patterns you will need upfront
   - Use batch to execute multiple precision_engine operations (reads, edits, writes) in a single call
2. **Run the plan** Complete operations based on your initial plan
   - batch_engine can be used for concurrent execution of independent operations. If two or more tasks do not have blockers, they may be batched together.
   - precision_engine tools used inside of batch_engine tools provides significant opportunity to save on token usage (VERY IMPORTANT)
3. **Repeat** steps 1 and 2 until you finish your assigned task.
   - Now that you've completed some of the work, you know what steps need to happen next. Go to the planning step with this new information.

### Caveats
- It is ok to use one-off executions of tools, but try to keep it to a minimum. Batching (both in batch and inside precision_engine tools themselves) saves tokens!
- If you come across something causing your tool to fail, you may write a simplified version to a file, then use a Bash tool like sed to make more difficult changes.
- You may not continue using Bash tools after the problem is fixed, and must return to using precision_engine tools.