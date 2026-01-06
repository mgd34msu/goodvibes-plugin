/**
 * Error Recovery Pattern Definitions
 * Contains RECOVERY_PATTERNS constant and related types for pattern matching.
 */
/** Error severity level for categorizing error impact */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
/** Recovery pattern definition for error matching and fix suggestions */
export interface RecoveryPattern {
    category: string;
    description: string;
    patterns: RegExp[];
    suggestedFix: string;
    severity: ErrorSeverity;
}
/** Library of recovery patterns for common error types */
export declare const RECOVERY_PATTERNS: RecoveryPattern[];
