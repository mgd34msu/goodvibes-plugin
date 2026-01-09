/**
 * Post-Tool-Use Hook (GoodVibes)
 *
 * Processes tool results and triggers automation:
 * - Track file modifications (Edit, Write tools)
 * - Check if checkpoint commit should be created
 * - Detect and monitor dev server commands (Bash tool)
 * - Optionally run tests for modified files
 * - Optionally check build status
 * - Check if feature branch should be created
 * - Process MCP tool results (detect_stack, validate_implementation, etc.)
 */
export { handleBashTool } from './bash-handler.js';
export { handleFileModification, processFileAutomation } from './file-automation.js';
export { handleDetectStack, handleRecommendSkills, handleSearch, handleValidateImplementation, handleRunSmokeTest, handleCheckTypes, } from './mcp-handlers.js';
export { createResponse, combineMessages, type AutomationMessages } from './response.js';
export { maybeRunTests, maybeRunBuild, maybeCreateCheckpoint, maybeCreateBranch, } from './automation-runners.js';
export { trackFileModification, trackFileCreation, clearCheckpointTracking, getModifiedFileCount, } from './file-tracker.js';
export { shouldCheckpoint, createCheckpointIfNeeded, type CheckpointTrigger, } from './checkpoint-manager.js';
export { shouldCreateFeatureBranch, maybeCreateFeatureBranch, shouldMergeFeature, maybeMergeFeature, } from './git-branch-manager.js';
export { isDevServerCommand, registerDevServer, unregisterDevServer, recordDevServerError, parseDevServerErrors, } from './dev-server-monitor.js';
