● Error 1: Invalid JSON with Multiline Strings

  What I was trying to do:
  mcp-cli call plugin_goodvibes_precision-engine/precision_edit '{"edits": [{"file": "plugins/goodvibes/hooks/scripts/src/pre-tool-use/hook.ts", "find": "async function handleBashTool(input: HookInput):
  Promise<void> {\n  debug(\"handleBashTool ENTRY\", { tool_input: input.tool_input });\n  const command = extractBashCommand(input);\n  debug(\"extractBashCommand result\", { command: command?.substring(0,
  100), hasCommand: !!command });\n\n  if (!command) {", "replace": "async function handleBashTool(input: HookInput): Promise<void> {\n  const command = extractBashCommand(input);\n\n  if (!command) {"}]}'

  Error:
  Error: Invalid JSON arguments
  SyntaxError: Expected ',' or '}' after property value in JSON at position 166 (line 1 column 167)

  Cause:
  The JSON string contains \n newlines and double quotes inside the single-quoted shell string. When the shell parses this, the embedded quotes and special characters break the JSON structure before it even
  reaches mcp-cli.

  Fix:
  Use heredoc with stdin to pass JSON without shell interpretation:
  mcp-cli call plugin_goodvibes_precision-engine/precision_edit - <<'EOF'
  {
    "edits": [{"file": "...", "find": "...", "replace": "..."}]
  }
  EOF

  ---
  Error 2: Pattern Not Found (Line Endings)

  What I was trying to do:
  mcp-cli call plugin_goodvibes_precision-engine/precision_edit - <<'EOF'
  {
    "edits": [
      {
        "file": "plugins/goodvibes/hooks/scripts/src/pre-tool-use/hook.ts",
        "find": "async function handleBashTool(input: HookInput): Promise<void> {\n  debug('handleBashTool ENTRY', { tool_input: input.tool_input });\n  const command = extractBashCommand(input);\n
  debug('extractBashCommand result', { command: command?.substring(0, 100), hasCommand: !!command });\n\n  if (!command) {",
        "replace": "async function handleBashTool(input: HookInput): Promise<void> {\n  const command = extractBashCommand(input);\n\n  if (!command) {"
      }
    ]
  }
  EOF

  Error:
  {
    "status": "not_found",
    "edits_applied": 0,
    "error": "{\"message\":\"Pattern not found\",\"pattern_length\":297,\"file_length\":5141,\"closest_matches\":[{\"line\":74,\"similarity\":1,\"preview\":\"async function handleBashTool(input: HookInput):
  Promise<void> {\\r\"}]}"
  }

  Cause:
  The file uses Windows line endings (\r\n aka CRLF). My find pattern used Unix line endings (\n aka LF). The pattern function(...) {\n  debug doesn't match function(...) {\r\n  debug because the \r carriage
  return is missing.

  Fix:
  Either:
  1. Use \r\n explicitly in patterns for Windows files
  2. Use regex mode with optional carriage return: \r?\n
  3. Normalize the file to Unix line endings first

  ---
  Error 3: Regex Escapes Fail with Heredoc/Stdin

  What I was trying to do:
  mcp-cli call plugin_goodvibes_precision-engine/precision_edit - <<'EOF'
  {
    "edits": [
      {
        "file": "plugins/goodvibes/hooks/scripts/src/pre-tool-use/hook.ts",
        "find": "  debug\\('handleBashTool ENTRY'.*\\);\\r?\\n",
        "replace": ""
      }
    ],
    "match": {"mode": "regex"}
  }
  EOF

  Error:
  Error: Invalid JSON arguments
  SyntaxError: Bad escaped character in JSON at position 118 (line 5 column 24)

  Cause:
  The heredoc with - passes JSON directly to mcp-cli via stdin, completely bypassing the Bash tool and therefore bypassing the tool-update hook. The hook only intercepts commands that look like mcp-cli call
  server/tool '{...}' with single-quoted JSON arguments.

  When using stdin (-), the JSON never goes through the hook's escape-fixing logic. So \( and \) remain as invalid JSON escape sequences instead of being converted to \\( and \\).

  Fix:
  For heredoc/stdin usage, you must manually double-escape all backslashes:
  - \s → \\s (for regex whitespace)
  - \( → \\( (for literal parenthesis in regex)
  - \r?\n → \\r?\\n (for line endings in regex)

  Or avoid mcp-cli entirely and use node/sed for complex regex replacements:
  node -e "
  const fs = require('fs');
  let content = fs.readFileSync('file.ts', 'utf8');
  content = content.replace(/debug\('handleBashTool ENTRY'.*;\r?\n/g, '');
  fs.writeFileSync('file.ts', content);
  "
