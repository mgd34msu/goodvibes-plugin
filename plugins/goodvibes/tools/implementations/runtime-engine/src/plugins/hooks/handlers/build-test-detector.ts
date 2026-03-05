/**
 * BuildTestDetector — L3 Plugin
 *
 * EventBus listener that detects build/test command results from hook:post_tool_use events
 * and emits build:failed/succeeded and test:failed/succeeded events.
 */

import { createLogger } from '../../../shared/logger.js';
import type { RuntimeEvent, EventType, EventPayload } from '../../../shared/events.js';
import { createEvent } from '../../../shared/events.js';

const logger = createLogger('build-test-detector');

export interface DetectorConfig {
  build_commands: string[];
  test_commands: string[];
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  build_commands: ['npm run build', 'npx tsc', 'node build', 'vite build', 'next build'],
  test_commands: ['npm test', 'npm run test', 'vitest', 'jest', 'playwright test', 'npx vitest'],
};

interface EventBusLike {
  on(type: string, handler: (event: RuntimeEvent) => void): void;
  emit(event: RuntimeEvent | Omit<RuntimeEvent, 'metadata'> & { metadata?: Partial<RuntimeEvent['metadata']> }): void;
}

export class BuildTestDetector {
  constructor(
    private readonly eventBus: EventBusLike,
    private readonly config: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
  ) {}

  start(): void {
    this.eventBus.on('hook:post_tool_use', (event) => {
      this.analyzeToolResult(event);
    });
    logger.info('BuildTestDetector started, listening for hook:post_tool_use');
  }

  private analyzeToolResult(event: RuntimeEvent): void {
    // Extract hook_input fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hookInput = (event as any).hook_input ?? (event.payload as any)?.data ?? {};
    const toolName = hookInput.tool_name ?? hookInput.tool ?? '';
    const exitCode = hookInput.exit_code ?? hookInput.exitCode;
    const command = hookInput.command ?? hookInput.cmd ?? hookInput.input?.command ?? '';

    // Only check exec-like tools
    if (!this.isExecTool(toolName)) return;
    if (typeof exitCode !== 'number') return;
    if (typeof command !== 'string' || command.length === 0) return;

    const isBuild = this.matchesPatterns(command, this.config.build_commands);
    const isTest = this.matchesPatterns(command, this.config.test_commands);

    if (!isBuild && !isTest) return;

    const succeeded = exitCode === 0;
    const category = isBuild ? 'build' : 'test';
    const eventType = `${category}:${succeeded ? 'succeeded' : 'failed'}` as EventType;

    const emittedEvent = createEvent({
      source: { kind: 'internal' },
      type: eventType,
      payload: {
        type: eventType,
        data: {
          command,
          exit_code: exitCode,
          tool_name: toolName,
          detected_by: 'build-test-detector',
        },
      } as EventPayload,
      priority: 45,
      metadata: { session_id: '', sequence: 0 },
    });

    this.eventBus.emit(emittedEvent);
    logger.info('Detected command result', { category, succeeded, command, eventType });
  }

  private isExecTool(toolName: string): boolean {
    const execTools = ['Bash', 'precision_exec', 'mcp__plugin_goodvibes_precision-engine__precision_exec'];
    return execTools.some(t => toolName.includes(t));
  }

  private matchesPatterns(command: string, patterns: string[]): boolean {
    const normalized = command.toLowerCase().trim();
    return patterns.some(p => normalized.startsWith(p.toLowerCase()) || normalized.includes(p.toLowerCase()));
  }
}
