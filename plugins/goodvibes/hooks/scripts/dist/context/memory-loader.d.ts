/**
 * Memory Loader
 *
 * Loads persisted context from .goodvibes/memory/ directory.
 * This includes decisions, patterns, failures, and preferences.
 */
export interface ProjectMemory {
    decisions: Decision[];
    patterns: Pattern[];
    failures: Failure[];
    preferences: Preferences;
    customContext: string[];
}
export interface Decision {
    date: string;
    description: string;
    rationale?: string;
    tags?: string[];
}
export interface Pattern {
    name: string;
    description: string;
    examples?: string[];
}
export interface Failure {
    date: string;
    error: string;
    context?: string;
    resolution?: string;
}
export interface Preferences {
    codeStyle?: Record<string, string>;
    conventions?: string[];
    avoidPatterns?: string[];
    preferredLibraries?: Record<string, string>;
}
/**
 * Load all project memory
 */
export declare function loadMemory(cwd: string): Promise<ProjectMemory>;
/**
 * Format memory for display
 */
export declare function formatMemory(memory: ProjectMemory): string | null;
