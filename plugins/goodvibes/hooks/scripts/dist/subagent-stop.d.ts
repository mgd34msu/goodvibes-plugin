/**
 * Subagent Stop Hook (GoodVibes)
 *
 * Runs when a Claude Code subagent (Task tool) finishes.
 * Correlates with SubagentStart to calculate duration and capture telemetry.
 *
 * Actions:
 * - Look up stored entry by agent_id from active-agents.json
 * - Calculate duration_ms
 * - Parse agent_transcript_path for files modified, tools used, final output
 * - Extract keywords from transcript
 * - Write telemetry record to .goodvibes/telemetry/YYYY-MM.jsonl
 */
export {};
