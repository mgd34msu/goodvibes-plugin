/**
 * Mode-Aware Behavior interfaces for Batch Engine
 * @see SPEC-v2 Section 10.3
 */

import type { ModeConfig } from './mode.js';
import type { BatchResult } from './batch.js';

export type Situation =
  | 'ambiguous_requirement'
  | 'high_risk_operation'
  | 'error_occurred'
  | 'batch_complete';

export type OutputMode = 'count_only' | 'minimal' | 'standard' | 'verbose';

export interface ErrorAction {
  action: 'halt' | 'ask_user' | 'log' | 'fix_loop';
  notify?: boolean;
  options?: string[];
  continue?: boolean;
  max_attempts?: number;
}

export function shouldAskUser(mode: ModeConfig, situation: Situation): boolean {
  switch (situation) {
    case 'ambiguous_requirement':
      return mode.communication.ask_on_ambiguity;
    case 'high_risk_operation':
      return mode.recovery.on_other === 'ask_user';
    case 'error_occurred':
      return mode.recovery.on_error === 'ask_user' || mode.recovery.on_error === 'ask_user_with_options';
    case 'batch_complete':
      return !mode.execution.auto_chain;
    default:
      return false;
  }
}

export function getOutputMode(mode: ModeConfig, _operation: string): OutputMode {
  return mode.output.default_mode;
}

export function handleError(mode: ModeConfig, _error: Error): ErrorAction {
  switch (mode.recovery.on_error) {
    case 'halt':
      return { action: 'halt', notify: true };
    case 'ask_user':
      return { action: 'ask_user', options: ['retry', 'skip', 'abort'] };
    case 'ask_user_with_options':
      return { action: 'ask_user', options: ['retry', 'skip', 'abort', 'fix_and_continue'] };
    case 'log_and_continue':
      return { action: 'log', continue: true };
    case 'fix_and_continue':
      return { action: 'fix_loop', max_attempts: mode.recovery.max_fix_attempts };
    case 'fix_review_loop':
      return { action: 'fix_loop', max_attempts: mode.recovery.max_fix_attempts, notify: true };
    default:
      return { action: 'halt', notify: true };
  }
}

export type ResultFormat = 'none' | 'minimal' | 'summary' | 'detailed';

export function formatResult(mode: ModeConfig, result: BatchResult): string {
  switch (mode.communication.report_results) {
    case 'none':
      return '';
    case 'minimal':
      return `Done. ${result.summary.operations.succeeded}/${result.summary.operations.total} operations succeeded.`;
    case 'summary':
      return formatSummary(result);
    case 'detailed':
      return formatDetailed(result);
  }
}

function formatSummary(result: BatchResult): string {
  const { summary } = result;
  return [
    `Batch ${summary.status}`,
    `Operations: ${summary.operations.succeeded}/${summary.operations.total}`,
    `Duration: ${summary.duration_ms}ms`,
    `Tokens: ${summary.tokens_used}`
  ].join('\n');
}

function formatDetailed(result: BatchResult): string {
  return JSON.stringify(result, null, 2);
}
