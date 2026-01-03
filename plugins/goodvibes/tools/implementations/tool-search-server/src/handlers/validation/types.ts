/**
 * Validation types and interfaces
 */

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  rule: string;
  message: string;
  suggestion: string;
}

export interface SkillPatterns {
  required_exports?: string[];
  required_imports?: string[];
  naming_conventions?: Record<string, string>;
  must_include?: string[];
  must_not_include?: string[];
}

export interface ValidationContext {
  content: string;
  lines: string[];
  file: string;
  ext: string;
  isTypeScript: boolean;
  isReact: boolean;
}

export interface ValidateImplementationArgs {
  files: string[];
  skill?: string;
  checks?: string[];
}

export interface CheckTypesArgs {
  files?: string[];
  strict?: boolean;
  include_suggestions?: boolean;
}
