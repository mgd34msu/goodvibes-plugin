/**
 * Platform Path Mapper
 *
 * Detects Unix-specific paths in bash commands and rewrites them to Windows equivalents
 * when running on Windows. This ensures cross-platform compatibility for shell commands.
 *
 * @module pre-tool-use/platform-path-mapper
 */
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
export function rewritePlatformPaths(command) {
    const warnings = [];
    let rewritten = false;
    let modifiedCommand = command;
    // Only apply transformations on Windows
    if (process.platform !== 'win32') {
        return { rewritten: false, command, warnings };
    }
    // Map /tmp/ or /tmp to $TEMP/
    const tmpRegex = /\/tmp(?:\/|(?=\s|"|'|$))/g;
    if (tmpRegex.test(command)) {
        modifiedCommand = modifiedCommand.replace(tmpRegex, (match) => {
            rewritten = true;
            return match === '/tmp/' ? '$TEMP/' : '$TEMP/';
        });
    }
    // Map /dev/null to NUL
    const devNullRegex = /\/dev\/null\b/g;
    if (devNullRegex.test(modifiedCommand)) {
        modifiedCommand = modifiedCommand.replace(devNullRegex, 'NUL');
        rewritten = true;
    }
    // Warn about /dev/stdin (no direct Windows equivalent)
    if (/\/dev\/stdin\b/.test(modifiedCommand)) {
        warnings.push('WARNING: /dev/stdin detected - no direct Windows equivalent. ' +
            'Consider using stdin redirection or named pipes instead.');
    }
    // Warn about other /dev/ paths
    const otherDevRegex = /\/dev\/(?!null\b|stdin\b)\w+/g;
    const otherDevMatches = modifiedCommand.match(otherDevRegex);
    if (otherDevMatches) {
        warnings.push('WARNING: Unix device paths detected (' + otherDevMatches.join(', ') + ') - ' +
            'may not work on Windows.');
    }
    return { rewritten, command: modifiedCommand, warnings };
}
