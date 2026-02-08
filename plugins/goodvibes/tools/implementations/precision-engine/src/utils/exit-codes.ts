/**
 * Exit code semantic interpretation for precision_exec.
 * Maps exit codes to human-readable meanings and actionable suggestions.
 * Zero overhead on success (exit code 0).
 */

export interface ExitInterpretation {
  meaning: string;
  suggestion: string;
}

const EXIT_CODE_SEMANTICS: Record<number, ExitInterpretation> = {
  1:   { meaning: 'General error', suggestion: 'Check stderr for details' },
  2:   { meaning: 'Misuse of shell command', suggestion: 'Check command syntax' },
  126: { meaning: 'Permission denied (not executable)', suggestion: 'Check file permissions, try chmod +x' },
  127: { meaning: 'Command not found', suggestion: 'Check if the command is installed and in PATH' },
  128: { meaning: 'Invalid exit argument', suggestion: '' },
  130: { meaning: 'Interrupted (SIGINT / Ctrl+C)', suggestion: 'Process was interrupted' },
  137: { meaning: 'Killed (SIGKILL)', suggestion: 'Process was killed — likely OOM or timeout. Check memory usage.' },
  139: { meaning: 'Segmentation fault (SIGSEGV)', suggestion: 'Memory access violation in the process' },
  143: { meaning: 'Terminated (SIGTERM)', suggestion: 'Process was terminated gracefully' },
};

/**
 * Interpret an exit code into a human-readable meaning and suggestion.
 * Returns null for exit code 0 (no interpretation needed for success).
 * For codes 129-192, interprets as signal-based exit (128 + signal number).
 */
export function interpretExitCode(code: number): ExitInterpretation | null {
  // Exit code 0 = success — return null for zero overhead (no interpretation needed)
  if (code === 0) return null;
  
  // Direct lookup
  if (EXIT_CODE_SEMANTICS[code]) {
    return EXIT_CODE_SEMANTICS[code];
  }
  
  // Signal-based exit codes: 128 + signal number
  // Standard POSIX signals: 1-31 (codes 129-159)
  // Linux real-time signals: 32-64 (codes 160-192)
  if (code > 128 && code <= 192) {
    const signal = code - 128;
    return {
      meaning: `Killed by signal ${signal}`,
      suggestion: `Process received signal ${signal}`,
    };
  }
  
  // Unknown exit code
  return {
    meaning: `Non-zero exit (${code})`,
    suggestion: 'Check stdout/stderr for error details',
  };
}
