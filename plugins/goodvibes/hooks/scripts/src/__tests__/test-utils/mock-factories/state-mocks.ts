/**
 * State Mock Factories
 *
 * Provides properly typed mock factory functions for state objects.
 */

import type { FileState, HooksState } from '../../../types/state.js';
import type { ErrorState, ErrorCategory } from '../../../types/errors.js';
import type { HookInput } from '../../../shared/hook-io.js';
import type {
  ActiveAgentEntry,
  ActiveAgentsState,
  ParsedTranscript,
  TelemetryRecord,
} from '../../../telemetry/index.js';

// ============================================================================
// State Mocks
// ============================================================================

/**
 * Creates a partial FileState object with default empty arrays.
 *
 * Useful when you need to test with a FileState that has missing properties,
 * without using `as any`.
 *
 * @param overrides - Optional partial FileState to merge
 * @returns A complete FileState object
 *
 * @example
 * const state: HooksState = {
 *   ...baseState,
 *   files: createMockFileState(), // Empty but typed
 * };
 *
 * // Or with partial data:
 * const state: HooksState = {
 *   ...baseState,
 *   files: createMockFileState({ modifiedThisSession: ['/src/file.ts'] }),
 * };
 */
export function createMockFileState(overrides?: Partial<FileState>): FileState {
  return {
    modifiedSinceCheckpoint: [],
    modifiedThisSession: [],
    createdThisSession: [],
    ...overrides,
  };
}

/**
 * Creates a minimal HooksState object for testing.
 *
 * Provides sensible defaults for all required fields while allowing
 * overrides for specific test scenarios.
 *
 * @param overrides - Optional partial HooksState to merge
 * @returns A complete HooksState object
 *
 * @example
 * const state = createMockHooksState({
 *   files: createMockFileState({ modifiedThisSession: ['/src/test.ts'] }),
 * });
 */
export function createMockHooksState(
  overrides?: Partial<HooksState>
): HooksState {
  return {
    session: {
      id: 'test-session',
      startedAt: new Date().toISOString(),
      mode: 'default',
      featureDescription: null,
    },
    errors: {},
    tests: {
      lastFullRun: null,
      lastQuickRun: null,
      passingFiles: [],
      failingFiles: [],
      pendingFixes: [],
    },
    build: {
      lastRun: null,
      status: 'unknown',
      errors: [],
      fixAttempts: 0,
    },
    git: {
      mainBranch: 'main',
      currentBranch: 'main',
      featureBranch: null,
      featureStartedAt: null,
      featureDescription: null,
      checkpoints: [],
      pendingMerge: false,
    },
    files: createMockFileState(),
    devServers: {},
    ...overrides,
  };
}

// ============================================================================
// Telemetry Mocks
// ============================================================================

/**
 * Creates a mock ActiveAgentEntry for telemetry testing.
 *
 * @param overrides - Optional partial ActiveAgentEntry to merge
 * @returns A complete ActiveAgentEntry object
 *
 * @example
 * const entry = createMockActiveAgentEntry({
 *   agent_type: 'test-engineer',
 *   task_description: 'Write unit tests',
 * });
 */
export function createMockActiveAgentEntry(
  overrides?: Partial<ActiveAgentEntry>
): ActiveAgentEntry {
  return {
    agent_id: 'agent-' + Math.random().toString(36).substring(2, 9),
    agent_type: 'test-engineer',
    session_id: 'session-' + Math.random().toString(36).substring(2, 9),
    cwd: '/test/project',
    project_name: 'test-project',
    started_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Creates a mock ActiveAgentsState for telemetry testing.
 *
 * @param agents - Optional record of agent entries
 * @returns A complete ActiveAgentsState object
 *
 * @example
 * const state = createMockActiveAgentsState({
 *   'agent-1': createMockActiveAgentEntry({ agent_id: 'agent-1' }),
 * });
 */
export function createMockActiveAgentsState(
  agents?: Record<string, ActiveAgentEntry>
): ActiveAgentsState {
  return {
    agents: agents ?? {},
    last_updated: new Date().toISOString(),
  };
}

/**
 * Creates a mock ParsedTranscript for telemetry testing.
 *
 * @param overrides - Optional partial ParsedTranscript to merge
 * @returns A complete ParsedTranscript object
 *
 * @example
 * const transcript = createMockParsedTranscript({
 *   tools_used: ['Write', 'Bash'],
 *   files_modified: ['/src/test.ts'],
 * });
 */
export function createMockParsedTranscript(
  overrides?: Partial<ParsedTranscript>
): ParsedTranscript {
  return {
    files_modified: [],
    tools_used: [],
    error_count: 0,
    success_indicators: [],
    ...overrides,
  };
}

/**
 * Creates a mock TelemetryRecord for testing.
 *
 * @param overrides - Optional partial TelemetryRecord to merge
 * @returns A complete TelemetryRecord object
 *
 * @example
 * const record = createMockTelemetryRecord({
 *   agent_type: 'backend-engineer',
 *   success: true,
 * });
 */
export function createMockTelemetryRecord(
  overrides?: Partial<TelemetryRecord>
): TelemetryRecord {
  const now = new Date();
  const startedAt = new Date(now.getTime() - 3600000); // 1 hour ago

  return {
    type: 'subagent_complete',
    agent_id: 'agent-' + Math.random().toString(36).substring(2, 9),
    agent_type: 'test-engineer',
    session_id: 'session-' + Math.random().toString(36).substring(2, 9),
    project_name: 'test-project',
    started_at: startedAt.toISOString(),
    ended_at: now.toISOString(),
    duration_ms: 3600000,
    cwd: '/test/project',
    files_modified: [],
    tools_used: [],
    keywords: [],
    success: true,
    ...overrides,
  };
}

// ============================================================================
// Error State Mocks
// ============================================================================

/**
 * Creates a mock ErrorState for error handling tests.
 *
 * Provides sensible defaults for all required fields while allowing
 * overrides for specific test scenarios.
 *
 * @param overrides - Optional partial ErrorState to merge
 * @returns A complete ErrorState object
 *
 * @example
 * const errorState = createErrorState({
 *   category: 'typescript_error',
 *   phase: 2,
 * });
 */
export function createErrorState(overrides?: Partial<ErrorState>): ErrorState {
  return {
    signature: 'test-error-signature',
    category: 'unknown',
    phase: 1,
    attemptsThisPhase: 0,
    totalAttempts: 0,
    officialDocsSearched: [],
    officialDocsContent: '',
    unofficialDocsSearched: [],
    unofficialDocsContent: '',
    fixStrategiesAttempted: [],
    ...overrides,
  };
}

// ============================================================================
// Hook Input Mocks
// ============================================================================

/**
 * Creates a mock HookInput for testing hook handlers.
 *
 * Provides sensible defaults for all required fields while allowing
 * overrides for specific test scenarios.
 *
 * @param overrides - Optional partial HookInput to merge
 * @returns A complete HookInput object
 *
 * @example
 * const input = createMockHookInput({
 *   tool_name: 'Bash',
 *   tool_input: { command: 'npm test' },
 * });
 */
export function createMockHookInput(overrides?: Partial<HookInput>): HookInput {
  return {
    session_id: 'test-session-id',
    transcript_path: '/test/transcript.jsonl',
    cwd: '/test/project',
    permission_mode: 'auto',
    hook_event_name: 'PostToolUse',
    ...overrides,
  };
}

/**
 * Creates a mock tool_input for Bash command testing.
 *
 * This is a typed helper for creating the tool_input object commonly
 * used in Bash tool tests, avoiding the need for \`as any\`.
 *
 * @param command - The command string
 * @param output - Optional output string
 * @returns A properly typed tool_input object
 *
 * @example
 * const input = createMockHookInput({
 *   tool_name: 'Bash',
 *   tool_input: createMockBashToolInput('npm test', 'Tests passed'),
 * });
 */
export function createMockBashToolInput(
  command: unknown,
  output?: unknown
): Record<string, unknown> {
  return output !== undefined ? { command, output } : { command };
}
