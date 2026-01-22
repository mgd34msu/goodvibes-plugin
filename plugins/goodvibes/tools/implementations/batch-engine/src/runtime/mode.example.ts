/**
 * Mode System Usage Examples
 * @see SPEC-v2 Section 10
 */

import {
  getModeManager,
  initializeModeSystem,
  shouldAskUser,
  getOutputMode,
  handleError,
  formatResult,
  applyModeOverride,
  createSessionModeTracker,
  type ModeManager,
  type ModeOverride,
} from './mode.js';
import type { BatchResult } from '../interfaces/batch.js';

/**
 * Example 1: Basic Mode System Initialization
 */
async function example1_initialization() {
  // Initialize the mode system - loads custom modes and preferences
  const modeManager = await initializeModeSystem('/path/to/project');

  console.log('Current mode:', modeManager.getCurrentModeName());
  console.log('Should show progress:', modeManager.shouldShowProgress());
  console.log('Checkpoint frequency:', modeManager.getCheckpointFrequency());
}

/**
 * Example 2: Switching Modes
 */
async function example2_switching_modes() {
  const modeManager = getModeManager();

  // Start in vibecoding mode (default)
  console.log('Mode:', modeManager.getCurrentModeName()); // 'vibecoding'

  // Switch to justvibes mode
  modeManager.setMode('justvibes');
  console.log('Mode:', modeManager.getCurrentModeName()); // 'justvibes'
  console.log('Should show progress:', modeManager.shouldShowProgress()); // false
  console.log('Should auto-chain:', modeManager.shouldAutoChain()); // true

  // Save preference for next session
  await modeManager.savePreference();
}

/**
 * Example 3: Mode-Aware Behavior - Asking User
 */
function example3_asking_user() {
  const modeManager = getModeManager();

  // Check if should ask user in different situations
  if (modeManager.shouldAskUser('ambiguous_requirement')) {
    console.log('Ask user for clarification');
  } else {
    console.log('Make best guess decision');
  }

  if (modeManager.shouldAskUser('high_risk_operation')) {
    console.log('Ask user before proceeding');
  } else {
    console.log('Proceed with checkpoint');
  }

  // Using stateless helper (uses current global mode)
  if (shouldAskUser('error_occurred')) {
    console.log('Ask user how to handle error');
  }
}

/**
 * Example 4: Mode-Aware Error Handling
 */
function example4_error_handling() {
  const modeManager = getModeManager();

  try {
    // Some operation that might fail
    throw new Error('Operation failed');
  } catch (error) {
    const action = modeManager.handleError(error as Error);

    switch (action.action) {
      case 'halt':
        console.log('Halting execution');
        break;
      case 'ask_user':
        console.log('Options:', action.options); // ['retry', 'skip', 'abort']
        break;
      case 'log':
        console.log('Logging error and continuing');
        break;
      case 'fix_loop':
        console.log('Attempting auto-fix, max attempts:', action.max_attempts);
        break;
    }
  }
}

/**
 * Example 5: Formatting Results Based on Mode
 */
function example5_formatting_results() {
  const modeManager = getModeManager();

  const result: BatchResult = {
    summary: {
      status: 'success',
      operations: {
        total: 10,
        succeeded: 8,
        failed: 2,
        skipped: 0,
      },
      duration_ms: 1500,
      tokens_used: 5000,
    },
    phases: {},
    validation: {
      before: { check: 'pre', passed: true },
      after: { check: 'post', passed: true },
    },
    recovery: {
      rollback_available: true,
      rollback_triggered: false,
    },
    execution_graph: {
      phases: ['read', 'write', 'exec'],
      parallel_groups: [['op1', 'op2'], ['op3']],
      critical_path_ms: 1200,
    },
  };

  // Format based on mode
  const formatted = modeManager.formatResult(result);
  console.log(formatted);

  // In vibecoding mode: detailed output
  // In justvibes mode: minimal output ("Done. 8/10 operations succeeded.")
}

/**
 * Example 6: Mode Overrides for Nested Batches
 */
function example6_mode_overrides() {
  const modeManager = getModeManager();
  const parentMode = modeManager.getCurrentMode();

  // Child batch inherits parent mode but overrides checkpoint frequency
  const override: ModeOverride = {
    checkpoint_frequency: 'per_operation',
    parallel_agents: 6,
  };

  const childMode = applyModeOverride(parentMode, override);

  console.log('Parent checkpoint frequency:', parentMode.execution.checkpoint_frequency);
  console.log('Child checkpoint frequency:', childMode.execution.checkpoint_frequency);
  console.log('Parent parallel agents:', parentMode.execution.parallel_agents);
  console.log('Child parallel agents:', childMode.execution.parallel_agents);
}

/**
 * Example 7: Session Mode Tracking (Mode Stack)
 */
function example7_session_tracking() {
  const modeManager = getModeManager();
  const tracker = createSessionModeTracker(modeManager);

  console.log('Initial mode:', modeManager.getCurrentModeName()); // 'vibecoding'

  // Push current mode and switch to justvibes
  tracker.pushMode('justvibes');
  console.log('Current mode:', modeManager.getCurrentModeName()); // 'justvibes'
  console.log('Stack depth:', tracker.getStackDepth()); // 1

  // Push again for nested batch
  tracker.pushMode('vibecoding');
  console.log('Current mode:', modeManager.getCurrentModeName()); // 'vibecoding'
  console.log('Stack depth:', tracker.getStackDepth()); // 2

  // Pop to restore previous mode
  tracker.popMode();
  console.log('Current mode:', modeManager.getCurrentModeName()); // 'justvibes'
  console.log('Stack depth:', tracker.getStackDepth()); // 1

  tracker.popMode();
  console.log('Current mode:', modeManager.getCurrentModeName()); // 'vibecoding'
  console.log('Stack depth:', tracker.getStackDepth()); // 0
}

/**
 * Example 8: Custom Mode Configuration File
 */
async function example8_custom_modes() {
  // Create custom mode config at .goodvibes/config/modes.json
  const customConfig = {
    default_mode: 'dev',
    modes: {
      dev: {
        name: 'dev',
        description: 'Development mode with extra logging',
        communication: {
          show_progress: true,
          explain_decisions: true,
          ask_on_ambiguity: true,
          report_results: 'detailed',
        },
        execution: {
          auto_chain: false,
          max_autonomous_batches: 1,
          checkpoint_frequency: 'per_operation',
          parallel_agents: 2,
        },
        recovery: {
          on_error: 'halt',
          on_ambiguity: 'ask_user',
          on_risk: 'halt',
          max_fix_attempts: 1,
        },
        output: {
          default_mode: 'verbose',
          show_diffs: true,
          show_telemetry: 'detailed',
        },
        logging: {
          log_decisions: true,
          log_errors: true,
          log_activity: true,
          log_path: '.goodvibes/logs/',
        },
      },
    },
  };

  // Save to .goodvibes/config/modes.json
  // Then load it
  const modeManager = getModeManager();
  await modeManager.loadCustomModes();

  // Now you can use the custom mode
  modeManager.setMode('dev');
  console.log('Custom mode loaded:', modeManager.getCurrentModeName());
}

/**
 * Example 9: Mode-Specific Configuration Queries
 */
function example9_configuration_queries() {
  const modeManager = getModeManager();

  // Communication settings
  console.log('Show progress:', modeManager.shouldShowProgress());
  console.log('Explain decisions:', modeManager.shouldExplainDecisions());
  console.log('Show diffs:', modeManager.shouldShowDiffs());
  console.log('Show telemetry:', modeManager.shouldShowTelemetry());

  // Execution settings
  console.log('Auto-chain:', modeManager.shouldAutoChain());
  console.log('Max autonomous batches:', modeManager.getMaxAutonomousBatches());
  console.log('Checkpoint frequency:', modeManager.getCheckpointFrequency());
  console.log('Parallel agents limit:', modeManager.getParallelAgentsLimit());

  // Recovery settings
  console.log('Max fix attempts:', modeManager.getMaxFixAttempts());

  // Logging settings
  console.log('Log path:', modeManager.getLogPath());
  console.log('Log decisions:', modeManager.shouldLogDecisions());
  console.log('Log errors:', modeManager.shouldLogErrors());
  console.log('Log activity:', modeManager.shouldLogActivity());

  // Output mode
  console.log('Output mode:', modeManager.getOutputMode());
}

/**
 * Example 10: Integration with Batch Execution
 */
async function example10_batch_integration() {
  const modeManager = await initializeModeSystem();

  // Before batch execution
  const shouldExplain = modeManager.shouldExplainDecisions();
  if (shouldExplain) {
    console.log('Batch strategy: parallel execution');
    console.log('Reason: operations are independent');
  }

  // During execution - show progress
  const showProgress = modeManager.shouldShowProgress();
  if (showProgress) {
    console.log('Starting batch...');
    console.log('Operation 1/10 complete');
    console.log('Operation 2/10 complete');
  }

  // On ambiguity
  if (modeManager.shouldAskUser('ambiguous_requirement')) {
    // Ask user for input
    console.log('Multiple matches found. Which should I use?');
  } else {
    // Make best guess
    console.log('[Decision logged] Used first match');
  }

  // After execution - format result
  const result: BatchResult = {
    summary: {
      status: 'success',
      operations: { total: 10, succeeded: 10, failed: 0, skipped: 0 },
      duration_ms: 2000,
      tokens_used: 8000,
    },
    phases: {},
    validation: {
      before: { check: 'pre', passed: true },
      after: { check: 'post', passed: true },
    },
    recovery: {
      rollback_available: false,
      rollback_triggered: false,
    },
    execution_graph: {
      phases: [],
      parallel_groups: [],
      critical_path_ms: 0,
    },
  };

  const output = modeManager.formatResult(result);
  if (output) {
    console.log(output);
  }

  // Save preference for next session
  await modeManager.savePreference();
}

// Export examples for documentation
export {
  example1_initialization,
  example2_switching_modes,
  example3_asking_user,
  example4_error_handling,
  example5_formatting_results,
  example6_mode_overrides,
  example7_session_tracking,
  example8_custom_modes,
  example9_configuration_queries,
  example10_batch_integration,
};
