# Important: tmux info for collaboration

## Same Window, Different Pane

You can use the script in scripts/tmux-send.sh to communicate between panes.
For long messages, write what you would like to send in a file in docs/ and then send the path to the other session.
You will likely receive long messages the same way, so be on the lookout for that.

## Different Window

For communication between windows, you will need to use the tmux send-keys functionality as there is no script currently, and no plans to make one.
To communicate with the other window you will need to send your message in one send-keys command and then use a separate send-keys command to send the Enter keystroke.
The best way to make sure your message is always delivered is to send two separate Enter keystrokes in their own send-keys command.

## Collaboration

You may use the other session to your advantage with complex work. Each session has access to its own WRFC chains, so this essentially doubles your potential throughput.
Other sessions also make great top-level reviewers for things like implementation specs etc. You can have it look for things you might have missed or correct things that don't make sense. This is very valuable.
And really, the most benefit comes from those things that we have yet to even think about. The possibilities are endless.

