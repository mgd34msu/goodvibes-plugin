#!/usr/bin/env bash
# Split the current pane into 3 equal horizontal panes.
# Run this from the pane you want to split — other panes are untouched.

PANE_ID=$(tmux display-message -p '#{pane_id}')

# First split: new pane gets bottom 66%
tmux split-window -v -t "$PANE_ID" -p 66

# Second split: split that bottom pane in half
tmux split-window -v -p 50

# Return focus to the top pane
tmux select-pane -t "$PANE_ID"
