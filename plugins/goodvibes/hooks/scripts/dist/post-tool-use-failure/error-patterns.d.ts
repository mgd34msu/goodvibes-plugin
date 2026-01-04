/**
 * Error Recovery Pattern Definitions
 * Contains RECOVERY_PATTERNS constant and related types for pattern matching.
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export interface RecoveryPattern {
    category: string;
    description: string;
    patterns: RegExp[];
    suggestedFix: string;
    severity: ErrorSeverity;
}
/** Library of recovery patterns for common error types */
export declare const RECOVERY_PATTERNS: RecoveryPattern[];
