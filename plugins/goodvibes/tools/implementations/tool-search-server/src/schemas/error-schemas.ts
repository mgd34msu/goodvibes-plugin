/**
 * Error handling tool schemas - stack parsing, type error explanation
 */

export const ERROR_SCHEMAS = [
  {
    name: 'parse_error_stack',
    description: 'Parse error stack traces and provide structured analysis. Extracts file paths, line numbers, and function names. Maps frames to project files and identifies root cause.',
    inputSchema: {
      type: 'object',
      properties: {
        error_text: { type: 'string', description: 'The full error message and stack trace' },
        project_path: { type: 'string', description: 'Project root path for mapping files (defaults to cwd)' },
      },
      required: ['error_text'],
    },
  },
  {
    name: 'explain_type_error',
    description: 'Explain TypeScript error codes in human-friendly terms with fix suggestions. Takes an error code and message, returns detailed explanation, common causes, and actionable fix suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        error_code: { type: 'integer', description: 'TypeScript error code (e.g., 2322, 2339, 7006)' },
        error_message: { type: 'string', description: 'The full error message from TypeScript' },
        context: { type: 'string', description: 'Optional code snippet where the error occurred' },
      },
      required: ['error_code', 'error_message'],
    },
  },
];
