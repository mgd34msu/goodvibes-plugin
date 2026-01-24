/* Bundled with esbuild */

// src/pre-tool-use.ts
import { appendFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
var chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  appendFileSync(join(tmpdir(), "tools.log"), `${input.tool_name}
`);
  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow"
    }
  }));
});
