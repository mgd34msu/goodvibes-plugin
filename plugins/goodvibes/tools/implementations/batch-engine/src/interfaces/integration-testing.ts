/**
 * End-to-End Integration Testing interfaces for Batch Engine
 * @see SPEC-v2 Phase 11.6 Integration
 */

import type { ModeConfig, ModeName } from './mode.js';
import type { Batch, BatchConfig } from './batch.js';
import type { BatchResult, OperationResult } from './result.js';
import type { AgentPoolManager, AgentSpec, CompletedAgent } from './agent-pool.js';
import type { RecoveryManager, RecoveryResult } from './recovery.js';
import type { Checkpoint } from './checkpoint.js';

// ============================================================================
// Runtime Interface
// ============================================================================

/**
 * GoodVibes Runtime - the main runtime environment for batch execution
 * Provides access to all subsystems needed for integration testing
 */
export interface GoodVibesRuntime {
  /** Current mode configuration (vibecoding or justvibes) */
  mode: ModeConfig;

  /** Agent pool manager for spawning and managing agents */
  agents: AgentPoolManager;

  /** Recovery manager for checkpoints, fix loops, and rollbacks */
  recovery: RecoveryManager;

  /**
   * Execute a batch within this runtime
   * @param batch - The batch to execute
   * @returns Result of batch execution
   */
  executeBatch(batch: Batch): Promise<BatchResult>;

  /**
   * Switch runtime mode
   * @param mode - Mode name to switch to
   */
  setMode(mode: ModeName): void;

  /**
   * Get current runtime statistics
   * @returns Runtime statistics
   */
  getStats(): RuntimeStats;

  /**
   * Reset runtime to clean state (for testing)
   */
  reset(): Promise<void>;
}

/**
 * Runtime statistics for monitoring
 */
export interface RuntimeStats {
  /** Total batches executed */
  batches_executed: number;
  /** Total operations executed */
  operations_executed: number;
  /** Total tokens consumed */
  tokens_used: number;
  /** Total agents spawned */
  agents_spawned: number;
  /** Total recoveries performed */
  recoveries_performed: number;
  /** Runtime uptime in milliseconds */
  uptime_ms: number;
}

// ============================================================================
// Test Suite Names
// ============================================================================

/**
 * Available test suite names for integration testing
 * Each suite tests a specific aspect of the batch engine
 */
export type TestSuiteName =
  | 'vibecoding_flow'
  | 'justvibes_flow'
  | 'recovery_scenarios'
  | 'agent_coordination'
  | 'batch_operations';

// ============================================================================
// Test Results
// ============================================================================

/**
 * Result of a single assertion within a test
 */
export interface AssertionResult {
  /** Human-readable description of what was asserted */
  description: string;
  /** Whether the assertion passed */
  passed: boolean;
  /** Expected value (for comparison assertions) */
  expected?: unknown;
  /** Actual value received (for comparison assertions) */
  actual?: unknown;
  /** Additional context or message */
  message?: string;
}

/**
 * Result of a single test case
 */
export interface TestResult {
  /** Unique identifier for this test */
  id: string;
  /** Human-readable test name */
  name: string;
  /** Description of what the test validates */
  description: string;

  // Execution status
  /** Final status of the test */
  status: 'passed' | 'failed' | 'skipped';
  /** Execution duration in milliseconds */
  duration_ms: number;

  // Assertion results
  /** All assertions made during the test */
  assertions: AssertionResult[];

  // Error information (if failed)
  /** Error details if the test failed */
  error?: {
    /** Error message */
    message: string;
    /** Stack trace if available */
    stack?: string;
    /** Expected value if comparison failed */
    expected?: unknown;
    /** Actual value if comparison failed */
    actual?: unknown;
  };

  // Debug information
  /** Log messages captured during test execution */
  logs?: string[];
  /** Files created during test (for cleanup) */
  created_files?: string[];
  /** Snapshot of relevant state at test completion */
  state_snapshot?: Record<string, unknown>;
}

/**
 * Result of running a test suite
 */
export interface TestSuiteResult {
  /** Suite name identifier */
  name: TestSuiteName;
  /** Human-readable description of the suite */
  description: string;

  // Test results
  /** Individual test results */
  tests: TestResult[];
  /** Number of tests that passed */
  passed: number;
  /** Number of tests that failed */
  failed: number;
  /** Number of tests that were skipped */
  skipped: number;

  // Timing
  /** Total duration in milliseconds */
  duration_ms: number;
  /** ISO timestamp when suite started */
  started_at: string;
  /** ISO timestamp when suite ended */
  ended_at: string;

  // Overall status
  /** Suite status based on test results */
  status: 'passed' | 'failed' | 'partial';

  // Setup/teardown info
  /** Any errors during suite setup */
  setup_error?: string;
  /** Any errors during suite teardown */
  teardown_error?: string;
}

/**
 * Complete integration test report
 */
export interface IntegrationTestReport {
  /** ISO timestamp when testing started */
  started_at: string;
  /** ISO timestamp when testing ended */
  ended_at: string;
  /** Total duration in milliseconds */
  duration_ms: number;

  // Summary counts
  /** Total number of tests run */
  total_tests: number;
  /** Number of tests that passed */
  passed: number;
  /** Number of tests that failed */
  failed: number;
  /** Number of tests that were skipped */
  skipped: number;

  // Suite results
  /** Results for each test suite */
  suites: TestSuiteResult[];

  // Overall status
  /** Overall test run status */
  status: 'passed' | 'failed' | 'partial';

  // Environment info
  /** Environment information for reproducibility */
  environment: {
    /** Node.js version */
    node_version: string;
    /** Platform (darwin, win32, linux) */
    platform: string;
    /** Batch engine version */
    engine_version: string;
    /** Test run identifier */
    run_id: string;
  };

  // Coverage (optional)
  /** Code coverage metrics if available */
  coverage?: {
    /** Line coverage percentage */
    lines: number;
    /** Branch coverage percentage */
    branches: number;
    /** Function coverage percentage */
    functions: number;
    /** Statement coverage percentage */
    statements: number;
  };
}

// ============================================================================
// Integration Test Runner
// ============================================================================

/**
 * Integration test runner - main entry point for running tests
 */
export interface IntegrationTestRunner {
  /** The runtime instance being tested */
  runtime: GoodVibesRuntime;

  /** Test configuration */
  config: IntegrationTestConfig;

  /** Test fixtures for setup/cleanup */
  fixtures: TestFixtures;

  /** Assertion utilities */
  assertions: TestAssertions;

  /**
   * Run all integration tests
   * @returns Complete test report
   */
  runAll(): Promise<IntegrationTestReport>;

  /**
   * Run a specific test suite
   * @param suite - Name of the suite to run
   * @returns Suite result
   */
  runSuite(suite: TestSuiteName): Promise<TestSuiteResult>;

  /**
   * Run a single test by ID
   * @param testId - Unique test identifier
   * @returns Test result
   */
  runTest(testId: string): Promise<TestResult>;

  /**
   * Run multiple test suites
   * @param suites - Array of suite names to run
   * @returns Test report for selected suites
   */
  runSuites(suites: TestSuiteName[]): Promise<IntegrationTestReport>;

  /**
   * Get list of all available tests
   * @returns Map of suite names to test IDs
   */
  listTests(): Map<TestSuiteName, string[]>;

  /**
   * Register custom test suite
   * @param name - Suite name
   * @param tests - Test implementations
   */
  registerSuite(name: string, tests: TestImplementation[]): void;
}

/**
 * Test implementation function signature
 */
export interface TestImplementation {
  /** Test ID */
  id: string;
  /** Test name */
  name: string;
  /** Test description */
  description: string;
  /** Test execution function */
  run: (context: TestContext) => Promise<void>;
  /** Skip this test if condition returns true */
  skip?: () => boolean;
  /** Test timeout override in ms */
  timeout_ms?: number;
}

/**
 * Context passed to test implementation functions
 */
export interface TestContext {
  /** Runtime being tested */
  runtime: GoodVibesRuntime;
  /** Test fixtures */
  fixtures: TestFixtures;
  /** Assertion utilities */
  assert: TestAssertions;
  /** Log a message to test output */
  log: (message: string) => void;
  /** Collected assertions for this test */
  assertions: AssertionResult[];
}

// ============================================================================
// Test Suites - Vibecoding Flow
// ============================================================================

/**
 * Vibecoding flow test suite
 * Tests the communicative, interactive mode behavior
 */
export interface VibecodingFlowTests {
  /**
   * Test that progress is reported during execution
   * Verifies: show_progress=true behavior
   */
  testProgressReporting(): Promise<TestResult>;

  /**
   * Test that decisions are explained to the user
   * Verifies: explain_decisions=true behavior
   */
  testDecisionExplanation(): Promise<TestResult>;

  /**
   * Test user interaction on ambiguity
   * Verifies: ask_on_ambiguity=true, on_ambiguity='ask' behavior
   */
  testUserInteraction(): Promise<TestResult>;

  /**
   * Test detailed result summary generation
   * Verifies: report_results='detailed' behavior
   */
  testResultSummary(): Promise<TestResult>;

  /**
   * Test checkpoint creation per phase
   * Verifies: checkpoint_frequency='per_phase' behavior
   */
  testCheckpointPerPhase(): Promise<TestResult>;

  /**
   * Test halt on error behavior
   * Verifies: on_error='halt' behavior
   */
  testHaltOnError(): Promise<TestResult>;
}

// ============================================================================
// Test Suites - JustVibes Flow
// ============================================================================

/**
 * JustVibes flow test suite
 * Tests the silent, autonomous mode behavior
 */
export interface JustVibesFlowTests {
  /**
   * Test silent execution without progress output
   * Verifies: show_progress=false behavior
   */
  testSilentExecution(): Promise<TestResult>;

  /**
   * Test that all activity is logged to files
   * Verifies: log_decisions=true, log_activity=true behavior
   */
  testFileLogging(): Promise<TestResult>;

  /**
   * Test autonomous decision making
   * Verifies: on_ambiguity='best_guess' behavior
   */
  testAutonomousDecisions(): Promise<TestResult>;

  /**
   * Test summary-only final output
   * Verifies: report_results='summary' behavior
   */
  testFinalSummaryOnly(): Promise<TestResult>;

  /**
   * Test fix-and-continue recovery
   * Verifies: on_error='fix_and_continue' behavior
   */
  testFixAndContinue(): Promise<TestResult>;

  /**
   * Test batch chaining behavior
   * Verifies: auto_chain=true, max_autonomous_batches behavior
   */
  testBatchChaining(): Promise<TestResult>;

  /**
   * Test parallel agent execution
   * Verifies: parallel_agents configuration
   */
  testParallelAgents(): Promise<TestResult>;
}

// ============================================================================
// Test Suites - Recovery Scenarios
// ============================================================================

/**
 * Recovery scenario test suite
 * Tests error handling, rollback, and fix loop behavior
 */
export interface RecoveryScenarioTests {
  /**
   * Test basic error handling and reporting
   * Verifies: errors are captured and categorized correctly
   */
  testErrorHandling(): Promise<TestResult>;

  /**
   * Test rollback on failure
   * Verifies: rollback_on_fail=true behavior
   */
  testRollbackOnFailure(): Promise<TestResult>;

  /**
   * Test fix loop execution
   * Verifies: fix_and_continue, max_fix_attempts behavior
   */
  testFixLoopExecution(): Promise<TestResult>;

  /**
   * Test checkpoint creation and restoration
   * Verifies: checkpoint system works correctly
   */
  testCheckpointRestore(): Promise<TestResult>;

  /**
   * Test partial recovery scenarios
   * Verifies: transaction mode='partial' behavior
   */
  testPartialRecovery(): Promise<TestResult>;

  /**
   * Test recovery event emission
   * Verifies: recovery events are emitted correctly
   */
  testRecoveryEvents(): Promise<TestResult>;

  /**
   * Test multi-file rollback consistency
   * Verifies: atomic rollback across multiple files
   */
  testMultiFileRollback(): Promise<TestResult>;

  /**
   * Test fix strategy selection
   * Verifies: appropriate fix strategy is chosen based on error type
   */
  testFixStrategySelection(): Promise<TestResult>;
}

// ============================================================================
// Test Suites - Agent Coordination
// ============================================================================

/**
 * Agent coordination test suite
 * Tests agent pool, spawning, and communication
 */
export interface AgentCoordinationTests {
  /**
   * Test agent spawning
   * Verifies: agents can be spawned with correct configuration
   */
  testAgentSpawning(): Promise<TestResult>;

  /**
   * Test agent pool limits
   * Verifies: max_concurrent is enforced
   */
  testAgentPoolLimits(): Promise<TestResult>;

  /**
   * Test agent chaining
   * Verifies: chain_to spawns follow-up agents
   */
  testAgentChaining(): Promise<TestResult>;

  /**
   * Test inter-agent communication
   * Verifies: agents can share context and results
   */
  testAgentCommunication(): Promise<TestResult>;

  /**
   * Test budget enforcement
   * Verifies: token and agent budget limits are enforced
   */
  testBudgetEnforcement(): Promise<TestResult>;

  /**
   * Test dependency resolution
   * Verifies: depends_on is respected
   */
  testDependencyResolution(): Promise<TestResult>;

  /**
   * Test queue priority ordering
   * Verifies: priority field affects execution order
   */
  testQueuePriority(): Promise<TestResult>;

  /**
   * Test agent timeout handling
   * Verifies: agents that exceed max_duration_ms are terminated
   */
  testAgentTimeout(): Promise<TestResult>;

  /**
   * Test agent cancellation
   * Verifies: agents can be cancelled mid-execution
   */
  testAgentCancellation(): Promise<TestResult>;
}

// ============================================================================
// Test Suites - Batch Operations
// ============================================================================

/**
 * Batch operation test suite
 * Tests read, write, exec operations and transaction modes
 */
export interface BatchOperationTests {
  /**
   * Test read operations
   * Verifies: files are read correctly with various options
   */
  testReadOperations(): Promise<TestResult>;

  /**
   * Test write operations
   * Verifies: files are written correctly with various options
   */
  testWriteOperations(): Promise<TestResult>;

  /**
   * Test exec operations
   * Verifies: commands are executed correctly
   */
  testExecOperations(): Promise<TestResult>;

  /**
   * Test atomic transaction mode
   * Verifies: all-or-nothing behavior on failure
   */
  testAtomicTransaction(): Promise<TestResult>;

  /**
   * Test partial transaction mode
   * Verifies: completed operations are kept on failure
   */
  testPartialTransaction(): Promise<TestResult>;

  /**
   * Test parallel execution mode
   * Verifies: operations run in parallel when possible
   */
  testParallelExecution(): Promise<TestResult>;

  /**
   * Test sequential execution mode
   * Verifies: operations run in order
   */
  testSequentialExecution(): Promise<TestResult>;

  /**
   * Test operation dependencies
   * Verifies: dependency ordering is respected
   */
  testOperationDependencies(): Promise<TestResult>;

  /**
   * Test fail-fast behavior
   * Verifies: fail_fast=true stops on first error
   */
  testFailFast(): Promise<TestResult>;

  /**
   * Test retry behavior
   * Verifies: failed operations are retried according to config
   */
  testRetryBehavior(): Promise<TestResult>;

  /**
   * Test dry-run preview mode
   * Verifies: preview mode shows changes without applying
   */
  testDryRunPreview(): Promise<TestResult>;

  /**
   * Test validation hooks
   * Verifies: before/after validation runs correctly
   */
  testValidationHooks(): Promise<TestResult>;
}

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Test file specification
 */
export interface TestFile {
  /** File path (relative to test directory) */
  path: string;
  /** File content */
  content: string;
  /** File permissions (optional, Unix-style octal) */
  mode?: number;
}

/**
 * Test fixtures for setup and cleanup
 */
export interface TestFixtures {
  /** Base directory for test files */
  testDir: string;

  /**
   * Create a test runtime with specified mode
   * @param mode - Mode name (defaults to 'vibecoding')
   * @returns Configured runtime instance
   */
  createTestRuntime(mode?: ModeName): Promise<GoodVibesRuntime>;

  /**
   * Create a test batch with default or custom configuration
   * @param config - Partial batch configuration to merge
   * @returns Configured batch
   */
  createTestBatch(config?: Partial<Batch>): Batch;

  /**
   * Create test files on disk
   * @param files - Array of test file specifications
   */
  createTestFiles(files: TestFile[]): Promise<void>;

  /**
   * Create a test agent specification
   * @param overrides - Partial agent spec to merge
   * @returns Complete agent spec
   */
  createTestAgentSpec(overrides?: Partial<AgentSpec>): AgentSpec;

  /**
   * Create a test checkpoint
   * @param batch - Batch to checkpoint
   * @returns Created checkpoint
   */
  createTestCheckpoint(batch: Batch): Promise<Checkpoint>;

  /**
   * Read a test file
   * @param path - File path (relative to test directory)
   * @returns File content
   */
  readTestFile(path: string): Promise<string>;

  /**
   * Check if a test file exists
   * @param path - File path (relative to test directory)
   * @returns True if file exists
   */
  testFileExists(path: string): Promise<boolean>;

  /**
   * Delete a test file
   * @param path - File path (relative to test directory)
   */
  deleteTestFile(path: string): Promise<void>;

  /**
   * Clean up all test artifacts
   * Removes test directory and resets runtime state
   */
  cleanup(): Promise<void>;

  /**
   * Set up fresh test environment
   * Creates test directory and initializes runtime
   */
  setup(): Promise<void>;
}

// ============================================================================
// Test Assertions
// ============================================================================

/**
 * Test assertion utilities
 */
export interface TestAssertions {
  /**
   * Assert two values are strictly equal
   * @param actual - Actual value
   * @param expected - Expected value
   * @param message - Optional description
   */
  assertEqual<T>(actual: T, expected: T, message?: string): AssertionResult;

  /**
   * Assert two values are deeply equal (for objects/arrays)
   * @param actual - Actual value
   * @param expected - Expected value
   * @param message - Optional description
   */
  assertDeepEqual<T>(actual: T, expected: T, message?: string): AssertionResult;

  /**
   * Assert value is truthy
   * @param value - Value to check
   * @param message - Optional description
   */
  assertTrue(value: unknown, message?: string): AssertionResult;

  /**
   * Assert value is falsy
   * @param value - Value to check
   * @param message - Optional description
   */
  assertFalse(value: unknown, message?: string): AssertionResult;

  /**
   * Assert value is null or undefined
   * @param value - Value to check
   * @param message - Optional description
   */
  assertNullish(value: unknown, message?: string): AssertionResult;

  /**
   * Assert value is not null or undefined
   * @param value - Value to check
   * @param message - Optional description
   */
  assertDefined<T>(value: T | null | undefined, message?: string): AssertionResult;

  /**
   * Assert string contains substring
   * @param haystack - String to search in
   * @param needle - Substring to find
   * @param message - Optional description
   */
  assertContains(haystack: string, needle: string, message?: string): AssertionResult;

  /**
   * Assert string matches regex
   * @param value - String to test
   * @param pattern - Regex pattern
   * @param message - Optional description
   */
  assertMatches(value: string, pattern: RegExp, message?: string): AssertionResult;

  /**
   * Assert array contains item
   * @param array - Array to search
   * @param item - Item to find
   * @param message - Optional description
   */
  assertArrayContains<T>(array: T[], item: T, message?: string): AssertionResult;

  /**
   * Assert array has expected length
   * @param array - Array to check
   * @param length - Expected length
   * @param message - Optional description
   */
  assertArrayLength<T>(array: T[], length: number, message?: string): AssertionResult;

  /**
   * Assert function throws an error
   * @param fn - Function to execute
   * @param expectedError - Optional expected error message pattern
   * @param message - Optional description
   */
  assertThrows(fn: () => void, expectedError?: string | RegExp, message?: string): AssertionResult;

  /**
   * Assert async function throws an error
   * @param fn - Async function to execute
   * @param expectedError - Optional expected error message pattern
   * @param message - Optional description
   */
  assertThrowsAsync(
    fn: () => Promise<void>,
    expectedError?: string | RegExp,
    message?: string
  ): Promise<AssertionResult>;

  /**
   * Assert batch result indicates success
   * @param result - Batch result to check
   * @param message - Optional description
   */
  assertBatchSuccess(result: BatchResult, message?: string): AssertionResult;

  /**
   * Assert batch result indicates failure
   * @param result - Batch result to check
   * @param message - Optional description
   */
  assertBatchFailed(result: BatchResult, message?: string): AssertionResult;

  /**
   * Assert batch result was rolled back
   * @param result - Batch result to check
   * @param message - Optional description
   */
  assertBatchRolledBack(result: BatchResult, message?: string): AssertionResult;

  /**
   * Assert operation result indicates success
   * @param result - Operation result to check
   * @param message - Optional description
   */
  assertOperationSuccess(result: OperationResult, message?: string): AssertionResult;

  /**
   * Assert operation result indicates failure
   * @param result - Operation result to check
   * @param message - Optional description
   */
  assertOperationFailed(result: OperationResult, message?: string): AssertionResult;

  /**
   * Assert all specified files exist
   * @param paths - Array of file paths to check
   * @param message - Optional description
   */
  assertFilesExist(paths: string[], message?: string): Promise<AssertionResult>;

  /**
   * Assert all specified files do not exist
   * @param paths - Array of file paths to check
   * @param message - Optional description
   */
  assertFilesNotExist(paths: string[], message?: string): Promise<AssertionResult>;

  /**
   * Assert files have expected contents
   * @param files - Array of path/content pairs to check
   * @param message - Optional description
   */
  assertFilesMatch(
    files: Array<{ path: string; content: string }>,
    message?: string
  ): Promise<AssertionResult>;

  /**
   * Assert agent completed successfully
   * @param agent - Completed agent record
   * @param message - Optional description
   */
  assertAgentSuccess(agent: CompletedAgent, message?: string): AssertionResult;

  /**
   * Assert agent failed
   * @param agent - Completed agent record
   * @param message - Optional description
   */
  assertAgentFailed(agent: CompletedAgent, message?: string): AssertionResult;

  /**
   * Assert recovery result indicates success
   * @param result - Recovery result to check
   * @param message - Optional description
   */
  assertRecoverySuccess(result: RecoveryResult, message?: string): AssertionResult;

  /**
   * Assert value is within range
   * @param value - Numeric value to check
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (inclusive)
   * @param message - Optional description
   */
  assertInRange(value: number, min: number, max: number, message?: string): AssertionResult;

  /**
   * Assert execution time is within limit
   * @param duration_ms - Actual duration
   * @param max_ms - Maximum allowed duration
   * @param message - Optional description
   */
  assertDuration(duration_ms: number, max_ms: number, message?: string): AssertionResult;
}

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Integration test configuration
 */
export interface IntegrationTestConfig {
  // Test selection
  /** Test suites to run */
  suites: TestSuiteName[];
  /** Specific test IDs to skip */
  skip_tests?: string[];
  /** Only run tests matching this pattern */
  filter_pattern?: string;

  // Execution settings
  /** Run suites in parallel (default: false) */
  parallel: boolean;
  /** Default test timeout in milliseconds */
  timeout_ms: number;
  /** Retry failed tests */
  retry_failed: boolean;
  /** Maximum retry attempts per test */
  max_retries: number;
  /** Stop on first failure (default: false) */
  fail_fast: boolean;

  // Reporting options
  /** Verbose output during execution */
  verbose: boolean;
  /** Save report to file */
  save_report: boolean;
  /** Path to save report */
  report_path: string;
  /** Report format */
  report_format: 'json' | 'junit' | 'html';

  // Cleanup behavior
  /** Clean up test artifacts on success */
  cleanup_on_success: boolean;
  /** Clean up test artifacts on failure (default: false for debugging) */
  cleanup_on_failure: boolean;
  /** Directory for test artifacts */
  test_artifact_dir: string;

  // Coverage options
  /** Collect code coverage */
  collect_coverage: boolean;
  /** Coverage threshold percentages */
  coverage_thresholds?: {
    lines?: number;
    branches?: number;
    functions?: number;
    statements?: number;
  };
}

/**
 * Default integration test configuration
 */
export const DEFAULT_INTEGRATION_TEST_CONFIG: IntegrationTestConfig = {
  // Test selection
  suites: [
    'vibecoding_flow',
    'justvibes_flow',
    'recovery_scenarios',
    'agent_coordination',
    'batch_operations',
  ],

  // Execution settings
  parallel: false,
  timeout_ms: 60000,
  retry_failed: true,
  max_retries: 2,
  fail_fast: false,

  // Reporting options
  verbose: true,
  save_report: true,
  report_path: '.goodvibes/test-reports/integration.json',
  report_format: 'json',

  // Cleanup behavior
  cleanup_on_success: true,
  cleanup_on_failure: false,
  test_artifact_dir: '.goodvibes/test-artifacts',

  // Coverage options
  collect_coverage: false,
};

// ============================================================================
// Test Events
// ============================================================================

/**
 * Events emitted during test execution
 */
export type TestEvent =
  | 'run_started'
  | 'run_completed'
  | 'suite_started'
  | 'suite_completed'
  | 'test_started'
  | 'test_passed'
  | 'test_failed'
  | 'test_skipped'
  | 'test_retrying';

/**
 * Test event handler function signature
 */
export interface TestEventHandler {
  (event: TestEvent, data: TestEventData): void;
}

/**
 * Data passed to test event handlers
 */
export interface TestEventData {
  /** Event type */
  event: TestEvent;
  /** ISO timestamp */
  timestamp: string;
  /** Suite name (if applicable) */
  suite?: TestSuiteName;
  /** Test ID (if applicable) */
  test_id?: string;
  /** Test name (if applicable) */
  test_name?: string;
  /** Test result (if completed) */
  result?: TestResult;
  /** Suite result (if completed) */
  suite_result?: TestSuiteResult;
  /** Full report (if run completed) */
  report?: IntegrationTestReport;
  /** Retry attempt number (if retrying) */
  retry_attempt?: number;
  /** Error message (if failed) */
  error?: string;
}

// ============================================================================
// Test Runner Factory
// ============================================================================

/**
 * Options for creating a test runner
 */
export interface CreateTestRunnerOptions {
  /** Configuration overrides */
  config?: Partial<IntegrationTestConfig>;
  /** Custom fixture implementations */
  fixtures?: Partial<TestFixtures>;
  /** Event handlers to register */
  eventHandlers?: Partial<Record<TestEvent, TestEventHandler>>;
}

/**
 * Factory function signature for creating test runners
 */
export interface TestRunnerFactory {
  /**
   * Create a new integration test runner
   * @param runtime - Runtime to test
   * @param options - Runner options
   * @returns Configured test runner
   */
  (runtime: GoodVibesRuntime, options?: CreateTestRunnerOptions): IntegrationTestRunner;
}

// ============================================================================
// Test Reporter
// ============================================================================

/**
 * Test reporter interface for custom output formatting
 */
export interface TestReporter {
  /**
   * Called when test run starts
   * @param config - Test configuration
   */
  onRunStart(config: IntegrationTestConfig): void;

  /**
   * Called when test run completes
   * @param report - Complete test report
   */
  onRunComplete(report: IntegrationTestReport): void;

  /**
   * Called when a suite starts
   * @param name - Suite name
   */
  onSuiteStart(name: TestSuiteName): void;

  /**
   * Called when a suite completes
   * @param result - Suite result
   */
  onSuiteComplete(result: TestSuiteResult): void;

  /**
   * Called when a test starts
   * @param id - Test ID
   * @param name - Test name
   */
  onTestStart(id: string, name: string): void;

  /**
   * Called when a test completes
   * @param result - Test result
   */
  onTestComplete(result: TestResult): void;

  /**
   * Write the final report
   * @param report - Complete report
   * @param path - Output path
   */
  writeReport(report: IntegrationTestReport, path: string): Promise<void>;
}

/**
 * Console reporter options
 */
export interface ConsoleReporterOptions {
  /** Use colors in output */
  colors: boolean;
  /** Show individual assertions */
  showAssertions: boolean;
  /** Show test logs */
  showLogs: boolean;
  /** Show timing for each test */
  showTiming: boolean;
  /** Collapse passed tests */
  collapsePassed: boolean;
}

/**
 * Default console reporter options
 */
export const DEFAULT_CONSOLE_REPORTER_OPTIONS: ConsoleReporterOptions = {
  colors: true,
  showAssertions: false,
  showLogs: true,
  showTiming: true,
  collapsePassed: true,
};
