#!/usr/bin/env bash
# Launch 4 Claude Code sessions in a tmux layout:
# +------------------+----------+
# |                  |  Pane 2  |
# |     Pane 1       +----------+
# |    (left 50%)    |  Pane 3  |
# |                  +----------+
# |                  |  Pane 4  |
# +------------------+----------+

SESSION="claude-code"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Kill existing session if it exists
tmux kill-session -t "$SESSION" 2>/dev/null

# Create session with pane 1
tmux new-session -d -s "$SESSION" -c "$PROJECT_DIR"

# Split right for pane 2 (50% width)
tmux split-window -h -t "$SESSION" -c "$PROJECT_DIR"

# Split pane 2 down for pane 3
tmux split-window -v -t "$SESSION:.0.1" -c "$PROJECT_DIR"

# Split pane 3 down for pane 4
tmux split-window -v -t "$SESSION:.0.2" -c "$PROJECT_DIR"

# Even out the right side
tmux select-layout -t "$SESSION" main-vertical

# Launch Claude in all 4 panes
for pane in 0 1 2 3; do
  tmux send-keys -t "$SESSION:.0.$pane" "claude --dangerously-skip-permissions" Enter
done

# Select pane 1
tmux select-pane -t "$SESSION:.0.0"

# Attach
tmux attach-session -t "$SESSION"
