/**
 * Validation types and interfaces
 */

/**
 * Represents a single validation issue found during code analysis.
 * @property severity - Issue severity: 'error' (must fix), 'warning' (should fix), 'info' (consider)
 * @property file - Absolute path to the file containing the issue
 * @property line - 1-based line number where the issue occurs
 * @property rule - Unique identifier for the validation rule (e.g., 'security/no-eval')
 * @property message - Human-readable description of the issue
 * @property suggestion - Recommended fix or action to resolve the issue
 */
export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number;
  rule: string;
  message: string;
  suggestion: string;
}

/**
 * Defines patterns and conventions that a skill expects in implementations.
 * Used by skill-pattern-checks to validate code against skill requirements.
 * @property required_exports - Export statements that must be present
 * @property required_imports - Import statements that must be present
 * @property naming_conventions - Map of identifier types to naming pattern regex
 * @property must_include - Code patterns/strings that must appear in the file
 * @property must_not_include - Code patterns/strings that should not appear
 */
export interface SkillPatterns {
  required_exports?: string[];
  required_imports?: string[];
  naming_conventions?: Record<string, string>;
  must_include?: string[];
  must_not_include?: string[];
}

/**
 * Context object passed to all validation check functions.
 * Contains parsed file information for efficient rule checking.
 * @property content - Full file content as a single string
 * @property lines - File content split into individual lines (for line-by-line checks)
 * @property file - Absolute path to the file being validated
 * @property ext - File extension including dot (e.g., '.ts', '.tsx')
 * @property isTypeScript - True if file is .ts or .tsx
 * @property isReact - True if file is .jsx or .tsx
 */
export interface ValidationContext {
  content: string;
  lines: string[];
  file: string;
  ext: string;
  isTypeScript: boolean;
  isReact: boolean;
}

/**
 * Arguments for the validate_implementation MCP tool.
 * @property files - Array of file paths to validate
 * @property skill - Optional skill name to load skill-specific validation patterns
 * @property checks - Optional array of check categories to run (e.g., ['security', 'typescript'])
 */
export interface ValidateImplementationArgs {
  files: string[];
  skill?: string;
  checks?: string[];
}

/**
 * Arguments for the check_types MCP tool.
 * @property files - Optional array of specific files to type-check (defaults to all)
 * @property strict - Enable strict mode for additional type checking rules
 * @property include_suggestions - Include fix suggestions in the output
 */
export interface CheckTypesArgs {
  files?: string[];
  strict?: boolean;
  include_suggestions?: boolean;
}
