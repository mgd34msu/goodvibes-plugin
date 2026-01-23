/**
 * Mode Definitions interfaces for Batch Engine
 * @see SPEC-v2 Section 10.1
 */

export type ModeName = 'vibecoding' | 'justvibes';

export interface ModeConfig {
  name: ModeName;
  description: string;

  communication: {
    show_progress: boolean;
    explain_decisions: boolean;
    ask_on_ambiguity: boolean;
    report_results: 'none' | 'minimal' | 'summary' | 'detailed';
  };

  execution: {
    auto_chain: boolean;
    max_autonomous_batches: number | 'unlimited';
    checkpoint_frequency: 'never' | 'per_batch' | 'per_phase' | 'per_operation';
    parallel_agents: number;
    auto_recovery_on_blocker: boolean;
  };

  blockers: {
    issues: string[];
    errors: string[];
    other: string[];
  };

  recovery: {
    on_issue: 'halt' | 'ask_user' | 'ask_user_with_options' | 'fix_review_loop' | 'log_and_continue';
    on_error: 'halt' | 'ask_user' | 'ask_user_with_options' | 'fix_review_loop' | 'log_and_continue' | 'fix_and_continue';
    on_other: 'halt' | 'ask_user' | 'choose_best_option_silent';
    max_fix_attempts: number;
  };

  output: {
    default_mode: 'count_only' | 'minimal' | 'standard' | 'verbose';
    show_diffs: boolean;
    show_telemetry: 'none' | 'summary' | 'detailed';
  };

  logging: {
    log_decisions: boolean;
    log_errors: boolean;
    log_activity: boolean;
    log_path: string;
  };
}
