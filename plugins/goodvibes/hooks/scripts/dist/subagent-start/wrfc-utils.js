/**
 * WRFC utilities for SubagentStart hook (Phase 6 behaviors)
 *
 * Pure helper functions extracted for testability.
 * These implement the three new behaviors added in Phase 6:
 *   1. WRFC regex extraction from task descriptions
 *   2. Agent field normalization (agent_id ?? subagent_id, agent_type ?? subagent_type)
 *   3. Runtime system message merging with hook-built system message
 */
import { execSync } from 'child_process';
/** Regex that matches [WRFC:some_workflow_id] in a task description string. */
const WRFC_REGEX = /\[WRFC:([^\]]+)\]/;
/**
 * Extracts a workflow ID from a task description string.
 *
 * Looks for the pattern `[WRFC:workflow_id]` and returns the captured id.
 * Returns the FIRST match when multiple tags are present.
 * Returns null when no valid tag is found (including empty `[WRFC:]`).
 *
 * @param taskDescription - The task description string to search
 * @returns The extracted workflow id, or null if not found
 */
export function extractWorkflowId(taskDescription) {
    const match = WRFC_REGEX.exec(taskDescription);
    if (!match)
        return null;
    const wid = match[1].trim();
    return wid.length > 0 ? wid : null;
}
/**
 * Extracts a workflow ID by grepping the parent session transcript for [WRFC:wid].
 *
 * Uses a targeted grep to find [WRFC:...] tags in lines that also contain the
 * agent type, avoiding bulk file reads and JSON parsing.
 *
 * NOTE: When the orchestrator spawns multiple agents of the same type in a single
 * turn, all tool calls appear on the same JSONL line. We take the LAST matching
 * line and extract the FIRST [WRFC:wid] from it to reduce (but not eliminate)
 * ambiguity. For unambiguous resolution, SubagentStop also greps the agent's
 * own transcript via extractWorkflowIdFromFile().
 *
 * @param transcriptPath - Path to the parent session JSONL file
 * @param agentType - The agent type to match in the transcript
 * @returns Extracted workflow ID, or null if not found
 */
export function extractWorkflowIdFromTranscript(transcriptPath, agentType) {
    try {
        // Take the LAST line containing the agent type, then extract the FIRST
        // [WRFC:wid] from that line. This scopes to the most recent orchestrator
        // message and picks the first workflow marker, reducing cross-workflow
        // contamination when multiple agents are spawned in the same turn.
        const result = execSync(`grep -F '${agentType}' "${transcriptPath}" | tail -1 | grep -oP '\\[WRFC:[^\\]]+\\]' | head -1`, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        if (!result)
            return null;
        return extractWorkflowId(result);
    }
    catch {
        // grep returns exit code 1 on no match, or any other failure — never break the hook
        return null;
    }
}
/**
 * Extracts a workflow ID by grepping any file for the first [WRFC:wid] marker.
 *
 * Used by SubagentStop to search the agent's OWN transcript for the [WRFC:wid]
 * that was in its system prompt, providing an unambiguous workflow binding
 * even when the parent transcript grep is ambiguous (multiple agents of the
 * same type spawned in one turn).
 *
 * @param filePath - Path to the file to search
 * @returns Extracted workflow ID, or null if not found
 */
export function extractWorkflowIdFromFile(filePath) {
    try {
        const result = execSync(`grep -oP '\\[WRFC:[^\\]]+\\]' "${filePath}" | head -1`, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        if (!result)
            return null;
        return extractWorkflowId(result);
    }
    catch {
        return null;
    }
}
/**
 * Normalises agent identity fields from raw hook input.
 *
 * Claude may send either `agent_id` or `subagent_id` (and similarly for type).
 * This function coalesces them so the caller always works with `agent_id` /
 * `agent_type`, matching the normalization logic in the Phase 6 block of
 * subagent-start/index.ts.
 *
 * Precedence: explicit field > fallback field > undefined
 *
 * @param input - Object that may contain any combination of the four fields
 * @returns Normalized `{ agent_id, agent_type }` pair
 */
export function normalizeAgentFields(input) {
    return {
        agent_id: input.agent_id ?? input.subagent_id,
        agent_type: input.agent_type ?? input.subagent_type ?? 'unknown',
    };
}
/**
 * Merges a runtime-provided system message with a hook-built system message.
 *
 * Merge rules (matching the Phase 6 ternary in subagent-start/index.ts):
 *   - Both present  → `"<runtime>\n\n<hook>"`
 *   - Runtime only  → `"<runtime>"`
 *   - Hook only     → `"<hook>"`
 *   - Neither       → `undefined`
 *
 * @param runtimeMessage - System message returned by the runtime engine query, or undefined
 * @param hookMessage    - System message built by the hook logic, or undefined
 * @returns Merged system message, or undefined when both inputs are absent
 */
export function mergeSystemMessages(runtimeMessage, hookMessage) {
    return runtimeMessage
        ? hookMessage
            ? runtimeMessage + '\n\n' + hookMessage
            : runtimeMessage
        : hookMessage;
}
