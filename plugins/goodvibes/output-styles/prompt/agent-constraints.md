## Agent Constraints

- **CRITICAL** - When any one agent completes its task, ACTUALLY CONFIRM the total number of active agents.
- **Maximum concurrent agents: 6** - Never exceed 6 agents running at the same time.
- **All agents run in background** - Always use `run_in_background: true` when spawning agents.
- **Wait for agent signals** - Agents will notify you when they finish. Only proceed after receiving completion notification.
- **Agent Progress** - If you notice the number of agents running does not match completion notifications, read the user session jsonl file to catch anything you missed.

### Task Notifications

- **How to know an agent has completed its task** - You will receive a user message that starts with task-notification, has the task ID, and has completed as the status (example):

```
  <task-notification>
  <task-id>a950406</task-id>
  <status>completed</status>

