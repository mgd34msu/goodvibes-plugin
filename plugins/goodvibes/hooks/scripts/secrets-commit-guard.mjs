/**
 * @fileoverview Secrets commit guard - prevents accidental git commits of secrets files.
 *
 * @description
 * This PreToolUse hook intercepts Bash commands and checks if git add/commit operations
 * reference goodvibes.secrets.json or goodvibes.cookies.json files. These files contain
 * API secrets and credentials that should never be committed to version control.
 *
 * @author GoodVibes
 * @license MIT
 */

const BLOCKED_FILES = ['goodvibes.secrets.json', 'goodvibes.cookies.json'];

/**
 * Main hook execution.
 */
async function main() {
  // Read hook input from stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  
  // Only check Bash commands
  if (input.tool_name !== 'Bash') {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const command = input.tool_input?.command ?? '';
  
  // Check if this is a git add or git commit command
  const isGitOperation = /\bgit\s+(add|commit|stage)\b/i.test(command);
  if (!isGitOperation) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  // Check if any blocked file is referenced in the command
  const blockedFile = BLOCKED_FILES.find(file => command.includes(file));
  if (blockedFile) {
    process.stdout.write(JSON.stringify({
      continue: false,
      stopReason: `BLOCKED: Cannot commit ${blockedFile}. This file contains API secrets/credentials that must never be committed to version control. The file is already in .gitignore.`,
    }));
    return;
  }

  // Allow all other git operations (including git add -A, git add .)
  // The .gitignore should protect against accidental commits
  process.stdout.write(JSON.stringify({ continue: true }));
}

// Execute and fail open on error
main().catch(() => {
  // On error, allow the operation to continue (fail open)
  process.stdout.write(JSON.stringify({ continue: true }));
});
