/**
 * Subagent Stop Hook (GoodVibes)
 *
 * Runs when a Claude Code subagent (Task tool) finishes.
 * Correlates with SubagentStart to calculate duration and capture telemetry.
 *
 * Actions:
 * - Look up stored entry by agent_id from agent-tracking.json
 * - Parse agent_transcript_path for files modified, tools used, final output
 * - Validate agent output (type check if TS files modified)
 * - Verify tests for modified files
 * - Build telemetry entry with keywords, files, tools, summary
 * - Write telemetry record to .goodvibes/telemetry/YYYY-MM.jsonl
 * - Remove tracking entry
 * - Return validation results in output
 */
export {};
