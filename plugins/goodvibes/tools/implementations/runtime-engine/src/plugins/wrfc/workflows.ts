/**
 * WRFC Plugin Workflow Definitions — Layer 3
 *
 * Returns the WRFC workflow definitions this plugin provides.
 * These reference the L2 workflow definitions and wrap them as PluginWorkflowDefinition
 * metadata for plugin system registration.
 *
 * Note: The full WorkflowDefinition objects live in extensions/workflow/definitions/.
 * This module provides the plugin-level metadata summary used by the RuntimePlugin
 * interface, while the actual engine registrations happen in wrfc-plugin.ts via
 * the WorkflowEngine.registerDefinition() call during bootstrap.
 */

import type { PluginWorkflowDefinition } from '../../shared/plugin.js';

/**
 * Returns WRFC workflow definition metadata for plugin registration.
 *
 * The actual WorkflowDefinition objects are registered with WorkflowEngine
 * in bootstrap.ts via createWorkflowSubsystem. This function provides
 * the plugin-level summary consumed by RuntimePlugin.getWorkflowDefinitions().
 */
export function getWRFCWorkflowDefinitions(): PluginWorkflowDefinition[] {
  return [
    {
      id: 'wrfc_loop',
      name: 'WRFC Loop',
      description: 'Write-Review-Fix-Confirm quality loop: agents write code, reviewers score it, fixers address issues until the score threshold is met.',
      states: ['idle', 'writing', 'reviewing', 'fixing', 'completed', 'failed', 'escalated'],
      initial_state: 'idle',
      transitions: [
        { from: 'idle', to: 'writing', event_type: 'workflow:created' },
        { from: 'writing', to: 'reviewing', event_type: 'agent:completed' },
        { from: 'reviewing', to: 'completed', event_type: 'wrfc:review_completed', conditions: [{ type: 'expression', expression: 'context.review_score >= context.min_review_score' }] },
        { from: 'reviewing', to: 'fixing', event_type: 'wrfc:review_completed', conditions: [{ type: 'expression', expression: 'context.review_score < context.min_review_score' }] },
        { from: 'fixing', to: 'reviewing', event_type: 'agent:completed' },
        { from: 'fixing', to: 'escalated', event_type: 'wrfc:max_attempts_reached' },
        { from: 'reviewing', to: 'escalated', event_type: 'wrfc:max_attempts_reached' },
      ],
    },
    {
      id: 'fix_loop',
      name: 'Fix Loop',
      description: 'Diagnose-fix-verify loop: identifies issues, applies fixes, and verifies resolution.',
      states: ['idle', 'diagnosing', 'fixing', 'verifying', 'completed', 'failed'],
      initial_state: 'idle',
      transitions: [
        { from: 'idle', to: 'diagnosing', event_type: 'workflow:created' },
        { from: 'diagnosing', to: 'fixing', event_type: 'agent:completed' },
        { from: 'fixing', to: 'verifying', event_type: 'agent:completed' },
        { from: 'verifying', to: 'completed', event_type: 'agent:completed', conditions: [{ type: 'expression', expression: 'context.verification_result.passed === true' }] },
        { from: 'verifying', to: 'fixing', event_type: 'agent:completed', conditions: [{ type: 'expression', expression: 'context.verification_result.passed === false' }] },
      ],
    },
    {
      id: 'test_then_fix',
      name: 'Test Then Fix',
      description: 'Run tests and automatically fix failures.',
      states: ['idle', 'testing', 'fixing', 'completed', 'failed'],
      initial_state: 'idle',
      transitions: [
        { from: 'idle', to: 'testing', event_type: 'workflow:created' },
        { from: 'testing', to: 'completed', event_type: 'agent:completed', conditions: [{ type: 'expression', expression: 'context.tests_passed === true' }] },
        { from: 'testing', to: 'fixing', event_type: 'agent:completed', conditions: [{ type: 'expression', expression: 'context.tests_passed === false' }] },
        { from: 'fixing', to: 'testing', event_type: 'agent:completed' },
      ],
    },
    {
      id: 'review_only',
      name: 'Review Only',
      description: 'Single-pass review without a fix loop.',
      states: ['idle', 'reviewing', 'completed', 'failed'],
      initial_state: 'idle',
      transitions: [
        { from: 'idle', to: 'reviewing', event_type: 'workflow:created' },
        { from: 'reviewing', to: 'completed', event_type: 'wrfc:review_completed' },
      ],
    },
  ];
}
