/**
 * Exit code semantic interpretation for precision_exec.
 * Maps exit codes to human-readable meanings and actionable suggestions.
 * Zero overhead on success (exit code 0).
 */

/**
 * Semantic interpretation of a process exit code.
 * Provides human-readable meaning and actionable suggestion.
 */
export interface ExitInterpretation {
  /** Human-readable description of what the exit code means */
  meaning: string;
  /** Actionable suggestion for the user to resolve or understand the issue */
  suggestion: string;
}

/**
 * Signal-based exit code offset.
 * When a process is killed by a signal, shells typically report exit code as 128 + signal_number.
 */
const SIGNAL_EXIT_CODE_OFFSET = 128;

/**
 * Maximum exit code for signal-based termination.
 * Covers POSIX signals (1-31) and Linux real-time signals (32-64).
 * Upper bound: 128 + 64 = 192
 */
const MAX_SIGNAL_EXIT_CODE = 192;

/**
 * Semantic mapping of common exit codes to human-readable interpretations.
 * Covers standard shell exit codes, common tool-specific codes, and signal-based codes.
 * @see https://tldp.org/LDP/abs/html/exitcodes.html
 */
const EXIT_CODE_SEMANTICS: Record<number, ExitInterpretation> = {
  1:   { meaning: 'General error', suggestion: 'Check stderr for details' },
  2:   { meaning: 'Misuse of shell command', suggestion: 'Check command syntax' },
  124: { meaning: 'Timeout', suggestion: 'Command exceeded timeout limit' },
  125: { meaning: 'Exit code out of range', suggestion: 'Program returned an exit code outside the valid range (0-255)' },
  126: { meaning: 'Permission denied (not executable)', suggestion: 'Check file permissions, try chmod +x' },
  127: { meaning: 'Command not found', suggestion: 'Check if the command is installed and in PATH' },
  128: { meaning: 'Invalid exit argument', suggestion: 'Program called exit() with invalid argument' },
  129: { meaning: 'Hangup (SIGHUP)', suggestion: 'Terminal controlling the process was closed' },
  130: { meaning: 'Interrupted (SIGINT / Ctrl+C)', suggestion: 'Process was interrupted by user' },
  131: { meaning: 'Quit (SIGQUIT)', suggestion: 'Process quit and dumped core' },
  132: { meaning: 'Illegal instruction (SIGILL)', suggestion: 'Process attempted to execute illegal instruction' },
  134: { meaning: 'Abort (SIGABRT)', suggestion: 'Process aborted — check for assertion failures' },
  137: { meaning: 'Killed (SIGKILL)', suggestion: 'Process was killed — likely OOM or timeout. Check memory usage.' },
  139: { meaning: 'Segmentation fault (SIGSEGV)', suggestion: 'Memory access violation in the process' },
  141: { meaning: 'Broken pipe (SIGPIPE)', suggestion: 'Process wrote to a pipe with no reader' },
  142: { meaning: 'Alarm (SIGALRM)', suggestion: 'Process alarm timer expired' },
  143: { meaning: 'Terminated (SIGTERM)', suggestion: 'Process was terminated gracefully' },
  255: { meaning: 'Exit code out of range', suggestion: 'Exit code wrapped around (was likely negative or > 255)' },
};

/**
 * Interpret an exit code into a human-readable meaning and suggestion.
 * 
 * @param code - The process exit code to interpret
 * @returns Exit interpretation with meaning and suggestion, or null for success (code 0)
 * 
 * Exit code semantics:
 * - 0: Success (returns null for zero overhead)
 * - 1-2: General errors
 * - 124-127: Special shell codes
 * - 128: Invalid exit argument
 * - 129-192: Signal-based exits (128 + signal_number)
 *   - POSIX signals: 1-31 (exit codes 129-159)
 *   - Real-time signals: 32-64 (exit codes 160-192)
 * - 255: Out of range (wraps around)
 * - Negative: Some systems use negative codes (treated as unknown)
 * 
 * @see https://tldp.org/LDP/abs/html/exitcodes.html
 */
export function interpretExitCode(code: number): ExitInterpretation | null {
  // Exit code 0 = success — return null for zero overhead (no interpretation needed)
  if (code === 0) return null;
  
  // Handle negative exit codes (some systems use them)
  if (code < 0) {
    return {
      meaning: `Negative exit code (${code})`,
      suggestion: 'System-specific error code — check documentation for your platform',
    };
  }
  
  // Direct lookup in semantics table
  if (EXIT_CODE_SEMANTICS[code]) {
    return EXIT_CODE_SEMANTICS[code];
  }
  
  // Signal-based exit codes: 128 + signal_number
  // Standard POSIX signals: 1-31 (exit codes 129-159)
  // Linux real-time signals: 32-64 (exit codes 160-192)
  if (code > SIGNAL_EXIT_CODE_OFFSET && code <= MAX_SIGNAL_EXIT_CODE) {
    const signal = code - SIGNAL_EXIT_CODE_OFFSET;
    return {
      meaning: `Killed by signal ${signal}`,
      suggestion: `Process received signal ${signal}. Check process status and system logs.`,
    };
  }
  
  // Unknown exit code
  return {
    meaning: `Non-zero exit (${code})`,
    suggestion: 'Check stdout/stderr for error details',
  };
}
