/**
 * Runtime domain handlers.
 *
 * Provides 3 tools for runtime analysis (promoted from unregistered):
 * - project_runtime_memory: Detect potential memory leaks in code patterns
 * - project_runtime_profile: Profile function performance characteristics
 * - project_runtime_logs: Analyze log files for patterns and anomalies
 */

export { handleDetectMemoryLeaks } from './memory.js';
export { handleProfileFunction } from './profile.js';
export { handleLogAnalyzer } from './logs.js';
