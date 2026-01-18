#!/usr/bin/env python3
"""
Goodvibes Codebase Review Orchestrator

Manages parallel remediation agents with:
- Max 6 concurrent agents
- Task state tracking
- Completion logging
- Integration with SubagentStart/SubagentStop hooks

Usage:
    python orchestrator.py status          # Show current state
    python orchestrator.py can-spawn       # Check if we can spawn (returns 0 if yes)
    python orchestrator.py register TASK   # Register a new task as in-progress
    python orchestrator.py complete TASK   # Mark task as complete
    python orchestrator.py fail TASK MSG   # Mark task as failed
    python orchestrator.py reset           # Reset state for new review
"""

import json
import sys
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

MAX_CONCURRENT_AGENTS = 6
STATE_FILE = ".remediation-state.json"
LOG_FILE = "remediation-log.md"


def load_state() -> Dict:
    """Load orchestration state from file."""
    if Path(STATE_FILE).exists():
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {
        "active_tasks": {},
        "completed_tasks": [],
        "failed_tasks": [],
        "created_at": datetime.now().isoformat(),
        "last_updated": datetime.now().isoformat()
    }


def save_state(state: Dict) -> None:
    """Save orchestration state to file."""
    state["last_updated"] = datetime.now().isoformat()
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def get_active_count() -> int:
    """Get number of currently active agents."""
    state = load_state()
    return len(state["active_tasks"])


def can_spawn() -> bool:
    """Check if we can spawn another agent."""
    return get_active_count() < MAX_CONCURRENT_AGENTS


def register_task(task_id: str, description: str = "", files: List[str] = None) -> bool:
    """Register a new task as in-progress."""
    if not can_spawn():
        print(f"ERROR: Cannot spawn - already at max capacity ({MAX_CONCURRENT_AGENTS})")
        return False
    
    state = load_state()
    state["active_tasks"][task_id] = {
        "description": description,
        "files": files or [],
        "started_at": datetime.now().isoformat(),
        "status": "in_progress"
    }
    save_state(state)
    update_log(state)
    print(f"Registered task {task_id} - Active agents: {len(state['active_tasks'])}/{MAX_CONCURRENT_AGENTS}")
    return True


def complete_task(task_id: str, changes: List[str] = None, notes: str = "") -> bool:
    """Mark a task as complete."""
    state = load_state()
    
    if task_id not in state["active_tasks"]:
        print(f"WARNING: Task {task_id} not found in active tasks")
        return False
    
    task = state["active_tasks"].pop(task_id)
    task["completed_at"] = datetime.now().isoformat()
    task["status"] = "success"
    task["changes"] = changes or []
    task["notes"] = notes
    
    # Calculate duration
    started = datetime.fromisoformat(task["started_at"])
    completed = datetime.fromisoformat(task["completed_at"])
    task["duration_seconds"] = (completed - started).total_seconds()
    
    state["completed_tasks"].append({
        "task_id": task_id,
        **task
    })
    
    save_state(state)
    update_log(state)
    print(f"Completed task {task_id} - Duration: {task['duration_seconds']:.1f}s")
    return True


def fail_task(task_id: str, reason: str = "", retry: bool = True) -> bool:
    """Mark a task as failed."""
    state = load_state()
    
    if task_id not in state["active_tasks"]:
        print(f"WARNING: Task {task_id} not found in active tasks")
        return False
    
    task = state["active_tasks"].pop(task_id)
    task["failed_at"] = datetime.now().isoformat()
    task["status"] = "failed"
    task["reason"] = reason
    task["retry"] = retry
    
    state["failed_tasks"].append({
        "task_id": task_id,
        **task
    })
    
    save_state(state)
    update_log(state)
    print(f"Failed task {task_id} - Reason: {reason}")
    return True


def reset_state() -> None:
    """Reset state for a new review cycle."""
    state = {
        "active_tasks": {},
        "completed_tasks": [],
        "failed_tasks": [],
        "created_at": datetime.now().isoformat(),
        "last_updated": datetime.now().isoformat()
    }
    save_state(state)
    update_log(state)
    print("State reset for new review cycle")


def get_status() -> Dict:
    """Get current status summary."""
    state = load_state()
    return {
        "active_count": len(state["active_tasks"]),
        "max_agents": MAX_CONCURRENT_AGENTS,
        "can_spawn": can_spawn(),
        "slots_available": MAX_CONCURRENT_AGENTS - len(state["active_tasks"]),
        "completed_count": len(state["completed_tasks"]),
        "failed_count": len(state["failed_tasks"]),
        "active_tasks": list(state["active_tasks"].keys()),
        "last_updated": state["last_updated"]
    }


def format_duration(seconds: float) -> str:
    """Format seconds as human-readable duration."""
    if seconds < 60:
        return f"{seconds:.0f}s"
    elif seconds < 3600:
        mins = seconds // 60
        secs = seconds % 60
        return f"{mins:.0f}m{secs:.0f}s"
    else:
        hours = seconds // 3600
        mins = (seconds % 3600) // 60
        return f"{hours:.0f}h{mins:.0f}m"


def update_log(state: Dict) -> None:
    """Update the remediation log markdown file."""
    lines = [
        "# Remediation Log",
        "",
        f"**Last Updated**: {state['last_updated']}",
        "",
    ]
    
    # Active agents section
    lines.append("## Active Agents")
    lines.append("")
    if state["active_tasks"]:
        lines.append("| Task ID | Description | Started | Elapsed |")
        lines.append("|---------|-------------|---------|---------|")
        now = datetime.now()
        for task_id, task in state["active_tasks"].items():
            started = datetime.fromisoformat(task["started_at"])
            elapsed = (now - started).total_seconds()
            started_str = started.strftime("%H:%M:%S")
            lines.append(f"| {task_id} | {task.get('description', '-')[:40]} | {started_str} | {format_duration(elapsed)} |")
    else:
        lines.append("*No active agents*")
    lines.append("")
    
    # Completed tasks section
    lines.append("## Completed Tasks")
    lines.append("")
    if state["completed_tasks"]:
        lines.append("| Task ID | Description | Status | Duration | Changes |")
        lines.append("|---------|-------------|--------|----------|---------|")
        for task in state["completed_tasks"]:
            duration = format_duration(task.get("duration_seconds", 0))
            changes = ", ".join(task.get("changes", [])[:3])
            if len(task.get("changes", [])) > 3:
                changes += "..."
            lines.append(f"| {task['task_id']} | {task.get('description', '-')[:30]} | ✅ | {duration} | {changes} |")
    else:
        lines.append("*No completed tasks*")
    lines.append("")
    
    # Failed tasks section
    if state["failed_tasks"]:
        lines.append("## Failed Tasks")
        lines.append("")
        lines.append("| Task ID | Description | Reason | Retry? |")
        lines.append("|---------|-------------|--------|--------|")
        for task in state["failed_tasks"]:
            retry = "Yes" if task.get("retry", True) else "No"
            lines.append(f"| {task['task_id']} | {task.get('description', '-')[:30]} | {task.get('reason', '-')[:40]} | {retry} |")
        lines.append("")
    
    # Summary section
    total = len(state["completed_tasks"]) + len(state["failed_tasks"]) + len(state["active_tasks"])
    completed = len(state["completed_tasks"])
    success_rate = (completed / total * 100) if total > 0 else 0
    
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- **Total Tasks**: {total}")
    lines.append(f"- **Completed**: {completed} ({success_rate:.0f}%)")
    lines.append(f"- **In Progress**: {len(state['active_tasks'])}")
    lines.append(f"- **Failed**: {len(state['failed_tasks'])}")
    lines.append(f"- **Active Agents**: {len(state['active_tasks'])}/{MAX_CONCURRENT_AGENTS}")
    
    with open(LOG_FILE, "w") as f:
        f.write("\n".join(lines))


def main():
    if len(sys.argv) < 2:
        print("Usage: orchestrator.py <command> [args...]")
        print("Commands: status, can-spawn, register, complete, fail, reset")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == "status":
        status = get_status()
        print(json.dumps(status, indent=2))
        
    elif command == "can-spawn":
        if can_spawn():
            status = get_status()
            print(f"YES - {status['slots_available']} slots available")
            sys.exit(0)
        else:
            print(f"NO - At max capacity ({MAX_CONCURRENT_AGENTS})")
            sys.exit(1)
            
    elif command == "register":
        if len(sys.argv) < 3:
            print("Usage: orchestrator.py register TASK_ID [DESCRIPTION] [FILES...]")
            sys.exit(1)
        task_id = sys.argv[2]
        description = sys.argv[3] if len(sys.argv) > 3 else ""
        files = sys.argv[4:] if len(sys.argv) > 4 else []
        success = register_task(task_id, description, files)
        sys.exit(0 if success else 1)
        
    elif command == "complete":
        if len(sys.argv) < 3:
            print("Usage: orchestrator.py complete TASK_ID [CHANGES...] [--notes NOTE]")
            sys.exit(1)
        task_id = sys.argv[2]
        # Parse optional --notes flag
        notes = ""
        changes = []
        i = 3
        while i < len(sys.argv):
            if sys.argv[i] == "--notes" and i + 1 < len(sys.argv):
                notes = sys.argv[i + 1]
                i += 2
            else:
                changes.append(sys.argv[i])
                i += 1
        success = complete_task(task_id, changes, notes)
        sys.exit(0 if success else 1)
        
    elif command == "fail":
        if len(sys.argv) < 3:
            print("Usage: orchestrator.py fail TASK_ID [REASON] [--no-retry]")
            sys.exit(1)
        task_id = sys.argv[2]
        reason = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith("--") else ""
        retry = "--no-retry" not in sys.argv
        success = fail_task(task_id, reason, retry)
        sys.exit(0 if success else 1)
        
    elif command == "reset":
        reset_state()
        
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
