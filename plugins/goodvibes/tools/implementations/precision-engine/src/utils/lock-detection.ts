/**
 * Stderr pattern analysis for precision_exec.
 * Detects known error patterns (lock files, port conflicts, disk issues, permissions)
 * and provides actionable suggestions. Only runs on non-zero exit codes.
 */

/**
 * Known error patterns detected in stderr/stdout output.
 * Each type represents a specific failure category with associated remediation.
 * 
 * @remarks
 * - `git_index_lock`: Git index.lock file exists (another git process or crash)
 * - `npm_lock_conflict`: npm package-lock.json conflict (corrupt cache)
 * - `port_in_use`: TCP port already bound (EADDRINUSE)
 * - `disk_full`: Insufficient disk space (ENOSPC)
 * - `out_of_memory`: Process exhausted available memory (ENOMEM)
 * - `permission_denied`: Insufficient file/directory permissions (EACCES/EPERM)
 * - `resource_busy`: Temporary resource unavailability (EBUSY)
 * - `connection_refused`: Target service not accepting connections (ECONNREFUSED)
 * - `network_timeout`: Network request exceeded time limit (ETIMEDOUT/ESOCKETTIMEDOUT)
 * - `dns_failure`: DNS hostname resolution failed (ENOTFOUND)
 */
export type IssueType =
  | 'git_index_lock'
  | 'npm_lock_conflict'
  | 'port_in_use'
  | 'disk_full'
  | 'out_of_memory'
  | 'permission_denied'
  | 'resource_busy'
  | 'connection_refused'
  | 'network_timeout'
  | 'dns_failure';

/**
 * Structured representation of a detected error pattern.
 * Returned by detectIssue() when stderr/stdout matches a known error pattern.
 */
export interface DetectedIssue {
  /** The category of detected issue (from IssueType union) */
  type: IssueType;
  /** Human-readable error message describing what went wrong */
  message: string;
  /** Actionable remediation advice for resolving the issue */
  suggestion: string;
  /** The exact text fragment that matched the detection pattern (for debugging) */
  matched_pattern?: string;
}

/**
 * Internal pattern definition for stderr/stdout matching.
 * Maps regex patterns to issue metadata and remediation guidance.
 */
interface LockPattern {
  /** Regular expression to match in combined stderr+stdout */
  pattern: RegExp;
  /** Issue category when this pattern matches */
  type: IssueType;
  /** Human-readable error message */
  message: string;
  /** Actionable remediation advice (may include capture group substitution) */
  suggestion: string;
}

const LOCK_PATTERNS: LockPattern[] = [
  {
    pattern: /Unable to create '.*\.git\/index\.lock'/,
    type: 'git_index_lock',
    message: 'Git index is locked',
    suggestion: 'Another git process may be running. Wait for it to finish, or remove .git/index.lock if the process crashed.',
  },
  {
    pattern: /EEXIST.*package-lock\.json/,
    type: 'npm_lock_conflict',
    message: 'npm lock file conflict',
    suggestion: 'Delete node_modules and package-lock.json, then retry npm install.',
  },
  {
    pattern: /EADDRINUSE(?:.*:(\d+))?/,
    type: 'port_in_use',
    message: 'Port already in use',
    suggestion: 'Port is occupied. Kill the existing process or use a different port.',
  },
  {
    pattern: /ENOSPC/,
    type: 'disk_full',
    message: 'No space left on device',
    suggestion: 'Disk is full. Free up space and retry.',
  },
  {
    pattern: /ENOMEM/,
    type: 'out_of_memory',
    message: 'Out of memory',
    suggestion: 'Process ran out of memory. Consider increasing available memory or reducing workload.',
  },
  {
    pattern: /EACCES|EPERM/,
    type: 'permission_denied',
    message: 'Permission denied',
    suggestion: 'Insufficient permissions. Check file ownership and permissions.',
  },
  {
    pattern: /EBUSY/,
    type: 'resource_busy',
    message: 'Resource busy',
    suggestion: 'A resource is temporarily unavailable. Wait and retry.',
  },
  {
    pattern: /ECONNREFUSED/,
    type: 'connection_refused',
    message: 'Connection refused',
    suggestion: 'The target service is not running or not accepting connections.',
  },
  {
    pattern: /ETIMEDOUT|ESOCKETTIMEDOUT/,
    type: 'network_timeout',
    message: 'Network timeout',
    suggestion: 'Network request timed out. Check network connectivity and try again.',
  },
  {
    pattern: /getaddrinfo ENOTFOUND/,
    type: 'dns_failure',
    message: 'DNS resolution failed',
    suggestion: 'Could not resolve hostname. Check network connectivity and DNS settings.',
  },
];

/**
 * Analyze stderr (and optionally stdout) for known error patterns.
 * Returns the first matching issue, or null if no patterns match.
 * Only call on non-zero exit codes.
 * 
 * @param stderr - The stderr output from the failed command
 * @param stdout - Optional stdout output (checked in addition to stderr)
 * @returns DetectedIssue object with type, message, and suggestion, or null if no pattern matches
 * 
 * @remarks
 * - Searches combined stderr+stdout against LOCK_PATTERNS array
 * - Returns on first match (order matters)
 * - For port_in_use, extracts port number from EADDRINUSE and substitutes into suggestion
 */
export function detectIssue(stderr: string, stdout?: string): DetectedIssue | null {
  const combined = stderr + (stdout ? '\n' + stdout : '');
  
  for (const lock of LOCK_PATTERNS) {
    const match = combined.match(lock.pattern);
    if (match) {
      // Substitute capture groups into suggestion if available
      let suggestion = lock.suggestion;
      if (match[1] && lock.type === 'port_in_use') {
        suggestion = `Port ${match[1]} is occupied. Kill the existing process or use a different port.`;
      }
      
      return {
        type: lock.type,
        message: lock.message,
        suggestion,
        matched_pattern: match[0],
      };
    }
  }
  
  return null;
}

const RETRYABLE_TYPES = new Set<IssueType>([
  'git_index_lock',
  'npm_lock_conflict',
  'resource_busy',
  'connection_refused',
  'network_timeout',
  'dns_failure',
]);

/**
 * Check if a detected issue is retryable (for smart retry feature).
 * Returns true for transient failures that may succeed on retry.
 * 
 * @param issue - The detected issue to evaluate (or null if no issue detected)
 * @returns True if the issue type is in RETRYABLE_TYPES set, false otherwise
 * 
 * @remarks
 * - Handles null/undefined input gracefully (returns false)
 * - Retryable types: git_index_lock, npm_lock_conflict, resource_busy, connection_refused, network_timeout, dns_failure
 * - Non-retryable types: port_in_use, disk_full, out_of_memory, permission_denied (require manual intervention)
 * 
 * @deprecated This is a legacy helper. For category-based retry decisions,
 * use retry-engine.ts shouldRetry() which consults RETRY_CATEGORY_MAP.
 */
export function isRetryable(issue: DetectedIssue | null): boolean {
  if (!issue) return false;
  return RETRYABLE_TYPES.has(issue.type);
}
