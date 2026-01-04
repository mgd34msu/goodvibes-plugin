/**
 * Type Definitions for Error Recovery
 *
 * Shared types used across the error recovery system.
 */

/**
 * Severity level of an error, used to prioritize recovery actions.
 * - low: Minor issues like linting warnings
 * - medium: Moderate issues that may block progress
 * - high: Significant issues requiring immediate attention
 * - critical: Severe issues that halt all progress
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * A recovery pattern matches error messages to provide actionable fix suggestions.
 */
export interface RecoveryPattern {
  /** Internal category identifier for the error type */
  category: string;
  /** Human-readable description of the error type */
  description: string;
  /** Regular expressions to match against error messages */
  patterns: RegExp[];
  /** Suggested fix or approach for resolving the error */
  suggestedFix: string;
  /** Severity level of this error type */
  severity: ErrorSeverity;
}
