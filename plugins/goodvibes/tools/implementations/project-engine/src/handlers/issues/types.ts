/**
 * Types for project issues handler
 */

/**
 * Arguments for the project_issues MCP tool
 */
export interface ProjectIssuesArgs {
  /** Project root path to scan (defaults to current working directory) */
  path?: string;
  /** Whether to include low-priority TODOs in results (defaults to false) */
  include_low_priority?: boolean;
}

export interface TodoItem {
  type: 'TODO' | 'FIXME' | 'HACK' | 'XXX' | 'BUG' | 'NOTE';
  text: string;
  file: string;
  line: number;
  priority: 'high' | 'medium' | 'low';
}

export interface HealthWarning {
  type: 'error' | 'warning' | 'info';
  message: string;
}

export interface EnvironmentIssue {
  type: 'missing_var' | 'sensitive_exposed';
  message: string;
}

export interface ProjectIssuesResult {
  total_issues: number;
  todos: {
    high_priority: TodoItem[];
    medium_priority: TodoItem[];
    low_priority: TodoItem[];
    total: number;
  };
  health: {
    warnings: HealthWarning[];
    suggestions: string[];
  };
  environment: {
    issues: EnvironmentIssue[];
  };
  formatted: string;
}
