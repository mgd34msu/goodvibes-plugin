/* Bundled with esbuild */

// src/post-tool-use-failure.ts
import { stdin } from "process";
async function main() {
  const chunks = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString());
  const command = input.tool_input?.command || "";
  if (command.includes("plugin_goodvibes_precision-engine/precision_")) {
    const toolMatch = command.match(/precision_(write|edit|read|grep|glob|exec|symbols)/);
    const toolName = toolMatch ? toolMatch[0] : "precision_tool";
    const feedback = {
      hookSpecificOutput: {
        hookEventName: "PostToolUseFailure",
        additionalContext: `SHELL ESCAPING ERROR in ${toolName} call.

The command failed because content contains characters that break shell parsing.

FIX: Use base64-encoded parameters instead:
  - For 'content': Use 'content_base64' parameter
  - For 'find'/'replace': Use 'find_base64'/'replace_base64' parameters  
  - For 'pattern': Use 'pattern_base64' parameter

HOW TO ENCODE:
  1. Write content to temp file, then: base64 -w0 < tempfile
  2. Or use heredoc: cat << 'CONTENT_EOF' | base64 -w0
     your content here
     CONTENT_EOF

IMPORTANT: Only use base64 for THIS call. Return to normal parameters after.`
      }
    };
    console.log(JSON.stringify(feedback));
  } else {
    console.log("{}");
  }
}
main().catch(() => console.log("{}"));
