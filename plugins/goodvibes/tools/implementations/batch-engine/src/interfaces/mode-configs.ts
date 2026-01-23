/**
 * Mode Configurations for Batch Engine
 * @see SPEC-v2 Section 10.2
 */

import type { ModeConfig, ModeName } from './mode.js';

export const MODES: Record<ModeName, ModeConfig> = {
  vibecoding: {
    name: 'vibecoding',
    description: 'Autonomous coding with communication',

    communication: {
      show_progress: true,
      explain_decisions: true,
      ask_on_ambiguity: true,
      report_results: 'detailed'
    },

    execution: {
      auto_chain: false,
      max_autonomous_batches: 1,
      checkpoint_frequency: 'per_batch',
      parallel_agents: 6,
      auto_recovery_on_blocker: true
    },

    blockers: {
      issues: [
        'major_issue',
        'minor_issue',
        'nitpick_issue'
      ],
      errors: [
        'tool_failure',
        'agent_failure',
        'general_error'
      ],
      other: [
        'workflow_ambiguity',
        'workflow_question',
        'other_undefined'
      ]
    },

    recovery: {
      on_issue: 'ask_user_with_options',
      on_error: 'ask_user_with_options',
      on_other: 'ask_user',
      max_fix_attempts: 3
    },

    output: {
      default_mode: 'standard',
      show_diffs: true,
      show_telemetry: 'summary'
    },

    logging: {
      log_decisions: true,
      log_errors: true,
      log_activity: false,
      log_path: '.goodvibes/logs/'
    }
  },

  justvibes: {
    name: 'justvibes',
    description: 'Fully autonomous silent execution',

    communication: {
      show_progress: false,
      explain_decisions: false,
      ask_on_ambiguity: false,
      report_results: 'minimal'
    },

    execution: {
      auto_chain: true,
      max_autonomous_batches: 'unlimited',
      checkpoint_frequency: 'per_phase',
      parallel_agents: 6,
      auto_recovery_on_blocker: true
    },

    blockers: {
      issues: [
        'major_issue',
        'minor_issue',
        'nitpick_issue'
      ],
      errors: [
        'tool_failure',
        'agent_failure',
        'general_error'
      ],
      other: [
        'workflow_ambiguity',
        'workflow_question',
        'other_undefined'
      ]
    },

    recovery: {
      on_issue: 'fix_review_loop',
      on_error: 'fix_review_loop',
      on_other: 'choose_best_option_silent',
      max_fix_attempts: 3
    },

    output: {
      default_mode: 'minimal',
      show_diffs: false,
      show_telemetry: 'none'
    },

    logging: {
      log_decisions: true,
      log_errors: true,
      log_activity: true,
      log_path: '.goodvibes/logs/'
    }
  }
};

export function getMode(name: ModeName): ModeConfig {
  return MODES[name];
}

export function getModeNames(): ModeName[] {
  return Object.keys(MODES) as ModeName[];
}
