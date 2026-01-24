const chunks: Buffer[] = [];
process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());

  if (input.tool_name === 'Bash') {
    const command = input.tool_input?.command || '';

    // If it's the specific mcp-cli command with bad escape, replace with fixed version
    if (command.includes('model-pricing') && command.includes('mcp-cli')) {
      console.log(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          updatedInput: {
            command: 'mcp-cli call plugin_goodvibes_precision-engine/precision_grep \'{"queries": [{"id": "test", "pattern": "model-pricing\\\\\\\\.json"}]}\''
          }
        }
      }));
      return;
    }
  }

  // Allow other tools
  console.log(JSON.stringify({
    continue: true,
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow'
    }
  }));
});
