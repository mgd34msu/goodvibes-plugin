# Read Between Phases

MINIMUM WRFC SCORE: 9.5 / 10
WRFC IS PER TASK, NOT PER PHASE!
WHEN A WORK AGENT FINISHES, IMMEDIATELY LAUNCH THE REVIEW AGENT
6 concurrent agents
NEVER use Task Output unless it is non-blocking, and even then it is usually unnecessary.
Agents will tell you when they are done.
Anytime you get a notification that an agent has completed their work, confirm the number of agents still running.
USER IS AWAY - DO NOT ASK FOR PERMISSION TO CONTINUE - ALWAYS KEEP GOING

## Orchestration Rules

WRFC should be something that is implied. Plan phases, split the work between agents within that phase. You don't need a specific task for each WRFC part of a single task. Create tasks for phases. Between those phase tasks, put the read-between-phases.md file as a read task. If you have launched the final WRFC agent for a phase, it is ok to read the read-between-phases.md file at that point so you can continue using the maximum number of parallel agents to start tasks from the next phase. 

Also, precision-tool-updates.md has the information you need to plan your work.

## Agent Loading Rules

Do not overload agents. It is ok to give them multiple things to do, but those things should be quick and easy. Most of the time, agents should have one task. Then that task gets completed and the next part of WRFC kicks in. Follow the plan.
