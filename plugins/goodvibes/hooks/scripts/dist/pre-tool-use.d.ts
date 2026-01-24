/**
 * Pre Tool Use Hook Entry Point
 *
 * Blocks native tools (Read, Edit, Write, Glob, Grep) and redirects to precision-engine.
 * Auto-fixes invalid JSON escapes in mcp-cli call commands.
 * Exit code 2 + stderr = blocks tool, message shown to Claude
 * Exit code 0 + no output = allows tool to proceed
 */
export {};
