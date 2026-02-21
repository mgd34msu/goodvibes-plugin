/**
 * JSONLReader — Parse Claude session JSONL files.
 *
 * Reads Claude Code JSONL files line-by-line with byte-offset tracking for
 * incremental / tail-style parsing. Each line is a self-contained JSON object.
 *
 * Key design choices:
 *   - Memory-efficient: uses readline for line-by-line streaming; never loads
 *     the entire file into memory.
 *   - Byte-offset tracking: callers can persist `newOffset` from JSONLParseResult
 *     and pass it back as `fromOffset` on the next call to read only new lines.
 *   - Defensive parsing: malformed lines are warned and skipped — never fatal.
 *   - No external dependencies: only Node.js built-ins (fs, readline, path).
 */

import { createReadStream, statSync } from 'node:fs';
import { stat, readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';

import type {
  JSONLRecord,
  JSONLAssistantRecord,
  JSONLUserRecord,
  JSONLProgressRecord,
  JSONLFileHistoryRecord,
  JSONLParseResult,
  ToolCallInfo,
  AgentActivityInfo,
  SessionInfo,
  PrecisionToolTiming,
  ToolUseBlock,
  ToolResultBlock,
} from './jsonl-types.js';
import type { ApiCallRecord } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cost multiplier for cache_read tokens relative to input cost (Anthropic pricing: ~10%). */
const CACHE_READ_COST_RATIO = 0.1;

/** Cost multiplier for cache_write tokens relative to input cost (Anthropic pricing: ~25%). */
const CACHE_WRITE_COST_RATIO = 0.25;

// ---------------------------------------------------------------------------
// JSONLReader
// ---------------------------------------------------------------------------

/**
 * Parses Claude Code JSONL session log files.
 *
 * @example
 * const reader = new JSONLReader({ cost_per_1k_input_tokens: 0.003, cost_per_1k_output_tokens: 0.015 });
 * const result = await reader.parseFile('/path/to/session.jsonl');
 * const apiCalls = reader.extractApiCalls(result.records);
 */
export class JSONLReader {
  private readonly costPer1kInput: number;
  private readonly costPer1kOutput: number;

  /**
   * @param config - Pricing config for cost calculation.
   * @param config.cost_per_1k_input_tokens  - USD cost per 1,000 input tokens.
   * @param config.cost_per_1k_output_tokens - USD cost per 1,000 output tokens.
   */
  constructor(config: { cost_per_1k_input_tokens: number; cost_per_1k_output_tokens: number }) {
    this.costPer1kInput = config.cost_per_1k_input_tokens;
    this.costPer1kOutput = config.cost_per_1k_output_tokens;
  }

  // -------------------------------------------------------------------------
  // Core parsing
  // -------------------------------------------------------------------------

  /**
   * Parse a JSONL file from an optional byte offset.
   *
   * Uses readline for memory-efficient line-by-line reading. The byte offset
   * enables incremental / tail-style reads: persist `result.newOffset` and
   * pass it as `fromOffset` on the next call to read only new content.
   *
   * @param filePath   - Absolute path to the JSONL file.
   * @param fromOffset - Byte offset to start reading from (default: 0).
   * @returns Parsed records, new byte offset, and parse statistics.
   */
  async parseFile(filePath: string, fromOffset = 0): Promise<JSONLParseResult> {
    const errors: string[] = [];
    const records: JSONLRecord[] = [];
    let linesParsed = 0;
    let linesSkipped = 0;
    let byteOffset = fromOffset;

    // Verify the file exists and has content beyond fromOffset.
    let fileSize: number;
    try {
      const fileStat = await stat(filePath);
      fileSize = fileStat.size;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        records,
        newOffset: fromOffset,
        linesParsed: 0,
        linesSkipped: 0,
        errors: [`Failed to stat file "${filePath}": ${message}`],
      };
    }

    if (fromOffset >= fileSize) {
      // No new content since last read.
      return { records, newOffset: fromOffset, linesParsed: 0, linesSkipped: 0, errors };
    }

    // Stream only the new portion of the file.
    const stream = createReadStream(filePath, { start: fromOffset, encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    // Track actual bytes consumed for accurate offset bookkeeping.
    // readline does not expose byte positions, so we accumulate line lengths.
    // Note: byte length differs from string length for multi-byte characters.
    let bytesConsumed = 0;
    let lastValidOffset = fromOffset;

    for await (const line of rl) {
      // Each line occupies its character bytes + 1 byte for the newline (\n).
      const lineByteLength = Buffer.byteLength(line, 'utf8') + 1;

      const trimmed = line.trim();
      if (trimmed === '') {
        // Empty line — count bytes and skip.
        bytesConsumed += lineByteLength;
        linesSkipped++;
        continue;
      }

      linesParsed++;
      const record = this.parseLine(trimmed);
      if (record !== null) {
        records.push(record);
        bytesConsumed += lineByteLength;
        lastValidOffset = fromOffset + bytesConsumed;
      } else {
        errors.push(`Skipped malformed line at ~offset ${fromOffset + bytesConsumed}: ${trimmed.slice(0, 80)}...`);
        bytesConsumed += lineByteLength;
        lastValidOffset = fromOffset + bytesConsumed;
        linesSkipped++;
      }
    }

    byteOffset = lastValidOffset;

    return {
      records,
      newOffset: byteOffset,
      linesParsed,
      linesSkipped,
      errors,
    };
  }

  /**
   * Parse an array of pre-split text lines.
   *
   * Useful for testing or when the caller has already split content.
   * Skips empty lines silently.
   *
   * @param lines - Array of raw text lines (not yet JSON.parse'd).
   * @returns Successfully parsed records (malformed lines silently dropped).
   */
  parseLines(lines: string[]): JSONLRecord[] {
    const records: JSONLRecord[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      const record = this.parseLine(trimmed);
      if (record !== null) records.push(record);
    }
    return records;
  }

  /**
   * Parse a single JSON line into a JSONLRecord.
   *
   * Returns null on any parse failure (invalid JSON, missing type field,
   * or unrecognised type value) — never throws.
   *
   * @param line - Single trimmed line of text from a JSONL file.
   * @returns Parsed record, or null if the line is malformed or unrecognised.
   */
  parseLine(line: string): JSONLRecord | null {
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed !== 'object' || parsed === null) return null;

      const record = parsed as Record<string, unknown>;
      const type = record['type'];

      if (type === 'assistant') return record as unknown as JSONLAssistantRecord;
      if (type === 'user') return record as unknown as JSONLUserRecord;
      if (type === 'progress') return record as unknown as JSONLProgressRecord;
      if (type === 'file-history-snapshot') return record as unknown as JSONLFileHistoryRecord;

      // Unknown type — return null silently. Format may have evolved.
      return null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Extraction: ApiCallRecord
  // -------------------------------------------------------------------------

  /**
   * Extract API call records from assistant JSONL records.
   *
   * Each assistant record represents one Claude API response. Token counts
   * and cost are extracted from message.usage. Cost is calculated from
   * configured rates (cost_usd is NOT present in the JSONL format).
   *
   * Cache tokens are costed at reduced rates:
   *   - cache_read:  10% of input token cost (reading from cache is cheap)
   *   - cache_write: 25% of input token cost (writing to cache has a premium)
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One ApiCallRecord per assistant record with usage data.
   */
  extractApiCalls(records: JSONLRecord[]): ApiCallRecord[] {
    const results: ApiCallRecord[] = [];

    for (const record of records) {
      if (record.type !== 'assistant') continue;
      const assistant = record as JSONLAssistantRecord;

      const usage = assistant.message?.usage;
      if (usage === undefined) continue;

      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
      const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;

      // Skip records with no meaningful token data.
      if (inputTokens === 0 && outputTokens === 0 && cacheReadTokens === 0 && cacheWriteTokens === 0) continue;

      const inputCost = (inputTokens / 1000) * this.costPer1kInput;
      const outputCost = (outputTokens / 1000) * this.costPer1kOutput;
      const cacheReadCost = (cacheReadTokens / 1000) * this.costPer1kInput * CACHE_READ_COST_RATIO;
      const cacheWriteCost = (cacheWriteTokens / 1000) * this.costPer1kInput * CACHE_WRITE_COST_RATIO;
      const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost;

      results.push({
        session_id: assistant.sessionId ?? '',
        timestamp: assistant.timestamp ?? new Date().toISOString(),
        model: assistant.message?.model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens,
        cache_write_tokens: cacheWriteTokens,
        cost_usd: totalCost,
        duration_ms: 0, // Not available in JSONL; may be filled in by progress record correlation.
        stop_reason: assistant.message?.stop_reason,
      });
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Extraction: ToolCallInfo
  // -------------------------------------------------------------------------

  /**
   * Extract tool call information by correlating assistant tool_use blocks
   * with their corresponding user tool_result blocks.
   *
   * Correlation is by tool_use_id (present in both the tool_use block and
   * the tool_result block).
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One ToolCallInfo per tool_use block found in assistant records.
   */
  extractToolCalls(records: JSONLRecord[]): ToolCallInfo[] {
    const results: ToolCallInfo[] = [];

    // Build a lookup map: tool_use_id -> ToolResultBlock
    const resultMap = new Map<string, ToolResultBlock>();
    for (const record of records) {
      if (record.type !== 'user') continue;
      const user = record as JSONLUserRecord;
      const content = user.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        const b = block as ToolResultBlock;
        if (b?.type === 'tool_result' && b.tool_use_id !== undefined) {
          resultMap.set(b.tool_use_id, b);
        }
      }
    }

    // Now extract tool_use blocks from assistant records.
    for (const record of records) {
      if (record.type !== 'assistant') continue;
      const assistant = record as JSONLAssistantRecord;
      const content = assistant.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        const b = block as ToolUseBlock;
        if (b?.type !== 'tool_use') continue;
        if (b.id === undefined || b.name === undefined) continue;

        const result = resultMap.get(b.id);
        results.push({
          id: b.id,
          name: b.name,
          input: b.input ?? {},
          sessionId: assistant.sessionId ?? '',
          timestamp: assistant.timestamp ?? new Date().toISOString(),
          assistantRecordUuid: assistant.uuid ?? '',
          resultContent: result?.content,
          isError: result?.is_error,
        });
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Extraction: AgentActivityInfo
  // -------------------------------------------------------------------------

  /**
   * Infer agent activity from JSONL records.
   *
   * Agent spawns are NOT explicit record types. They are inferred from assistant
   * records containing tool_use blocks with name === 'Task'. Completion is
   * inferred by the presence of a tool_result block for the Task tool_use_id.
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One AgentActivityInfo per Task tool_use block found.
   */
  extractAgentActivity(records: JSONLRecord[]): AgentActivityInfo[] {
    const taskCalls = this.extractToolCalls(records).filter(tc => tc.name === 'Task');

    // Build map: tool_use_id -> user record timestamp (= agent completion time).
    const resultTimestamps = new Map<string, string>();
    for (const record of records) {
      if (record.type !== 'user') continue;
      const user = record as JSONLUserRecord;
      const content = user.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        const b = block as ToolResultBlock;
        if (b?.type === 'tool_result' && b.tool_use_id !== undefined && record.timestamp) {
          resultTimestamps.set(b.tool_use_id, record.timestamp);
        }
      }
    }

    return taskCalls.map(tc => ({
      agentId: tc.id,
      parentSessionId: tc.sessionId,
      spawnedAt: tc.timestamp,
      completedAt: resultTimestamps.get(tc.id),
      taskInput: tc.input,
      completed: tc.resultContent !== undefined,
      exitStatus: tc.isError === true ? 'error' : (tc.resultContent !== undefined ? 'success' : undefined),
    }));
  }

  // -------------------------------------------------------------------------
  // Extraction: SessionInfo
  // -------------------------------------------------------------------------

  /**
   * Extract session-level summary information from a set of JSONL records.
   *
   * Uses the first record for session ID, cwd, and git branch.
   * Scans all records to find the earliest and latest timestamps.
   * Model comes from the first assistant record.
   *
   * @param records - All parsed records for a session.
   * @returns Session summary, or a stub with empty strings if no records are provided.
   */
  extractSessionInfo(records: JSONLRecord[]): SessionInfo {
    if (records.length === 0) {
      return {
        sessionId: '',
        model: 'unknown',
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        cwd: '',
        gitBranch: '',
        version: '',
      };
    }

    const first = records[0];
    let model = 'unknown';
    let startedAt = first.timestamp ?? new Date().toISOString();
    let lastActivityAt = startedAt;

    for (const record of records) {
      // Pick earliest timestamp.
      if (record.timestamp !== undefined && record.timestamp < startedAt) {
        startedAt = record.timestamp;
      }
      // Pick latest timestamp.
      if (record.timestamp !== undefined && record.timestamp > lastActivityAt) {
        lastActivityAt = record.timestamp;
      }
      // Pick model from first assistant record.
      if (model === 'unknown' && record.type === 'assistant') {
        const assistantRecord = record as JSONLAssistantRecord;
        const m = assistantRecord.message?.model;
        if (m !== undefined && m !== '') model = m;
      }
    }

    return {
      sessionId: first.sessionId ?? '',
      model,
      startedAt,
      lastActivityAt,
      cwd: first.cwd ?? '',
      gitBranch: first.gitBranch ?? '',
      version: first.version ?? '',
    };
  }

  // -------------------------------------------------------------------------
  // Extraction: PrecisionToolTiming
  // -------------------------------------------------------------------------

  /**
   * Extract precision tool timing data from JSONL progress records.
   *
   * Only 'completed' progress records contain elapsedTimeMs — 'started'
   * records are ignored since we only need the total duration.
   *
   * @param records - Parsed JSONL records to scan.
   * @returns One PrecisionToolTiming per completed progress event.
   */
  extractPrecisionToolTimings(records: JSONLRecord[]): PrecisionToolTiming[] {
    const results: PrecisionToolTiming[] = [];

    for (const record of records) {
      if (record.type !== 'progress') continue;
      const progress = record as JSONLProgressRecord;

      const data = progress.data;
      if (data?.status !== 'completed') continue;
      if (data.elapsedTimeMs === undefined) continue;
      if (progress.toolUseID === undefined) continue;

      results.push({
        toolUseId: progress.toolUseID,
        serverName: data.serverName ?? '',
        toolName: data.toolName ?? '',
        elapsedTimeMs: data.elapsedTimeMs,
        sessionId: progress.sessionId ?? '',
        timestamp: progress.timestamp ?? new Date().toISOString(),
      });
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // Cost calculation helper
  // -------------------------------------------------------------------------

  /**
   * Calculate the USD cost for a given token breakdown.
   *
   * Uses configured per-1k rates with reduced rates for cache operations:
   *   - Input tokens:       full input rate
   *   - Output tokens:      full output rate
   *   - Cache read tokens:  10% of input rate
   *   - Cache write tokens: 25% of input rate
   *
   * @param usage - Token counts to calculate cost for.
   * @returns Total estimated cost in USD.
   */
  calculateCost(usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
  }): number {
    const inputCost = ((usage.input_tokens ?? 0) / 1000) * this.costPer1kInput;
    const outputCost = ((usage.output_tokens ?? 0) / 1000) * this.costPer1kOutput;
    const cacheReadCost = ((usage.cache_read_tokens ?? 0) / 1000) * this.costPer1kInput * CACHE_READ_COST_RATIO;
    const cacheWriteCost = ((usage.cache_write_tokens ?? 0) / 1000) * this.costPer1kInput * CACHE_WRITE_COST_RATIO;
    return inputCost + outputCost + cacheReadCost + cacheWriteCost;
  }
}

// ---------------------------------------------------------------------------
// JSONL file location helpers
// ---------------------------------------------------------------------------

/**
 * Find the most recently modified JSONL file in a project directory.
 *
 * The active session JSONL is the most recently written file in the
 * ~/.claude/projects/<project-hash>/ directory.
 *
 * @param projectDir - Absolute path to the project directory.
 * @returns Absolute path to the most recently modified JSONL, or null if none found.
 */
export async function findActiveJsonlFile(projectDir: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = await readdir(projectDir);
  } catch {
    return null;
  }

  const jsonlFiles = entries.filter(e => e.endsWith('.jsonl'));
  if (jsonlFiles.length === 0) return null;

  let latestPath: string | null = null;
  let latestMtime = 0;

  for (const file of jsonlFiles) {
    const fullPath = join(projectDir, file);
    try {
      const s = statSync(fullPath);
      if (s.mtimeMs > latestMtime) {
        latestMtime = s.mtimeMs;
        latestPath = fullPath;
      }
    } catch {
      // File may have been deleted between readdir and stat.
    }
  }

  return latestPath;
}

/**
 * Extract the session ID from a JSONL file path.
 *
 * Session ID is the filename without the .jsonl extension.
 *
 * @param jsonlPath - Absolute path to the JSONL file.
 * @returns Session UUID string.
 */
export function sessionIdFromPath(jsonlPath: string): string {
  return basename(jsonlPath, '.jsonl');
}

/**
 * Resolve the Claude projects directory from environment or home directory.
 *
 * Resolution order:
 *   1. CLAUDE_PROJECTS_DIR environment variable
 *   2. ~/.claude/projects (default)
 *
 * @returns Absolute path to the Claude projects base directory.
 */
export function resolveProjectsBaseDir(): string {
  const envDir = process.env['CLAUDE_PROJECTS_DIR'];
  if (envDir !== undefined && envDir !== '') return envDir;
  return join(homedir(), '.claude', 'projects');
}
