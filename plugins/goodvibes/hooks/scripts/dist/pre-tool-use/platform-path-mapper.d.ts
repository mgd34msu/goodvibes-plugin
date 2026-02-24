/**
 * Platform Path Mapper
 *
 * Detects Unix-specific paths in bash commands and rewrites them to Windows equivalents
 * when running on Windows. This ensures cross-platform compatibility for shell commands.
 *
 * @module pre-tool-use/platform-path-mapper
 */
/**
 * Result of path mapping analysis and rewriting.
 */
export interface PathMappingResult {
    /** Whether the command was rewritten */
    rewritten: boolean;
    /** The potentially modified command */
    command: string;
    /** Warnings about path transformations or incompatibilities */
    warnings: string[];
}
/**
 * Detects and rewrites Unix-specific paths to Windows equivalents.
 *
 * Handles common Unix paths that don't work on Windows:
 * - /tmp/ or /tmp -> $TEMP/ (Windows temp directory)
 * - /dev/null -> NUL (Windows null device)
 * - /dev/stdin -> warns (no direct equivalent on Windows)
 *
 * @param command - The bash command to analyze
 * @returns PathMappingResult with rewritten command and any warnings
 */
export declare function rewritePlatformPaths(command: string): PathMappingResult;
