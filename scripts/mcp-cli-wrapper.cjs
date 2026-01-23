#!/usr/bin/env node

/**
 * mcp-cli-wrapper - Enhanced mcp-cli with --json-file support
 *
 * Usage:
 *   mcp-cli-wrapper call <server>/<tool> '<json>'            # Inline JSON
 *   mcp-cli-wrapper call <server>/<tool> -                   # Read from stdin
 *   mcp-cli-wrapper call <server>/<tool> --json-file <path>  # Read from file
 *   mcp-cli-wrapper <other-commands>                         # Pass through to mcp-cli
 *
 * The --json-file flag solves heredoc escaping issues with complex JSON.
 */

const { readFileSync, existsSync } = require('fs');
const { resolve, join } = require('path');
const { spawnSync } = require('child_process');
const { homedir } = require('os');

// Locate the actual mcp-cli implementation
function getMcpCliCommand() {
  // On Windows, mcp-cli is typically an alias to the Claude Code CLI
  const possiblePaths = [
    join(homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    join(homedir(), '.npm-global', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return ['node', path, '--mcp-cli'];
    }
  }

  // Fallback to using mcp-cli directly (might work if in PATH)
  return ['mcp-cli'];
}

function main() {
  const args = process.argv.slice(2);

  // Check if this is a 'call' command with --json-file flag
  if (args.length >= 2 && args[0] === 'call') {
    const jsonFileIndex = args.indexOf('--json-file');

    if (jsonFileIndex !== -1) {
      if (!args[jsonFileIndex + 1]) {
        console.error('Error: --json-file requires a file path argument');
        process.exit(1);
      }
      // Read JSON from file
      const jsonFilePath = resolve(args[jsonFileIndex + 1]);
      let jsonInput;

      try {
        jsonInput = readFileSync(jsonFilePath, 'utf-8');
      } catch (error) {
        console.error(`Error: Failed to read JSON file: ${jsonFilePath}`);
        console.error(error.message);
        process.exit(1);
      }

      // Validate JSON
      try {
        JSON.parse(jsonInput);
      } catch (error) {
        console.error(`Error: Invalid JSON in file: ${jsonFilePath}`);
        console.error(error.message);
        process.exit(1);
      }

      // Build args without --json-file and its value
      // Keep 'call' and the server/tool, remove --json-file and path, add '-' for stdin
      const newArgs = [
        args[0], // 'call'
        ...args.slice(1, jsonFileIndex), // server/tool and any other args before --json-file
        ...args.slice(jsonFileIndex + 2), // any args after the file path
        '-' // indicate stdin input
      ];

      // Get the mcp-cli command
      const mcpCliCmd = getMcpCliCommand();
      const fullCmd = [...mcpCliCmd, ...newArgs];

      // Call mcp-cli with the JSON content
      const result = spawnSync(fullCmd[0], fullCmd.slice(1), {
        input: jsonInput,
        stdio: ['pipe', 'inherit', 'inherit'],
      });

      process.exit(result.status || 0);
    }
  }

  // Pass through to mcp-cli for all other cases
  const mcpCliCmd = getMcpCliCommand();
  const fullCmd = [...mcpCliCmd, ...args];

  const result = spawnSync(fullCmd[0], fullCmd.slice(1), {
    stdio: 'inherit',
  });

  process.exit(result.status || 0);
}

main();
