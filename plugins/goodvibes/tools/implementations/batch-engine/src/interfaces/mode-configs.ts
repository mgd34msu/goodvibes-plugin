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
      parallel_agents: 3
    },

    recovery: {
      on_error: 'ask_user',
      on_ambiguity: 'ask_user',
      on_risk: 'ask_user',
      max_fix_attempts: 2
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
      parallel_agents: 6
    },

    recovery: {
      on_error: 'fix_and_continue',
      on_ambiguity: 'best_guess',
      on_risk: 'proceed_with_checkpoint',
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
