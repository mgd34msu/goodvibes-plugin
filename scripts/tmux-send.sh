#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 -t <pane> <text>"
  exit 1
}

current="${TMUX_PANE}"
# Find the other pane in this window by excluding our own pane_id
pane=$(tmux list-panes -F '#{pane_id}' | grep -v "^${current}$" | head -1)
if [[ -z "$pane" ]]; then
  echo "Error: no other pane found" >&2
  exit 1
fi

[[ $# -eq 0 ]] && usage

tmux send-keys -t "$pane" "$*"
tmux send-keys -t "$pane" Enter

# Multi-line text needs an extra Enter to submit
if [[ "$*" == *$'\n'* ]]; then
  tmux send-keys -t "$pane" Enter
fi
