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
export const RECOVERY_PATTERNS: RecoveryPattern[] = [
  {
    category: 'typescript_type_error',
    description: 'TypeScript type checking error',
    patterns: [/TS\d+:/, /Type '.*' is not assignable to type/, /Property '.*' does not exist on type/,
      /Cannot find name '.*'/, /Argument of type '.*' is not assignable/,
      /Object is possibly 'undefined'/, /Object is possibly 'null'/],
    suggestedFix: 'Run `npx tsc --noEmit` to identify all type errors. Check that types are correctly imported and match expected signatures.',
    severity: 'high',
  },
  {
    category: 'typescript_config_error',
    description: 'TypeScript configuration error',
    patterns: [/Cannot find module '.*' or its corresponding type declarations/,
      /Could not find a declaration file for module/, /error TS6059:/, /tsconfig\.json/],
    suggestedFix: 'Check tsconfig.json configuration. Ensure module resolution settings match your import style. You may need to install @types/* packages.',
    severity: 'medium',
  },
  {
    category: 'missing_import',
    description: 'Missing module or import error',
    patterns: [/Cannot find module '.*'/, /Module not found/, /Unable to resolve path/,
      /import .* from '.*' failed/, /ENOENT.*node_modules/],
    suggestedFix: 'Run `npm install` to ensure all dependencies are installed. Check that the import path is correct and the package exists in package.json.',
    severity: 'high',
  },
  {
    category: 'type_mismatch',
    description: 'Type mismatch or incompatible types',
    patterns: [/Expected \d+ arguments?, but got \d+/, /Type '.*' has no properties in common with type/,
      /The types of '.*' are incompatible/, /Conversion of type '.*' to type '.*' may be a mistake/],
    suggestedFix: 'Check function signatures and ensure arguments match. Review type definitions and update interface if needed.',
    severity: 'medium',
  },
  {
    category: 'undefined_reference',
    description: 'Undefined or null reference error',
    patterns: [/ReferenceError: (.*) is not defined/, /TypeError: Cannot read propert(y|ies) of undefined/,
      /TypeError: Cannot read propert(y|ies) of null/, /TypeError: (.*) is not a function/,
      /'.*' is used before being assigned/],
    suggestedFix: 'Add null checks or optional chaining (?.). Ensure variables are properly initialized before use.',
    severity: 'high',
  },
  {
    category: 'lint_error',
    description: 'ESLint or Prettier linting error',
    patterns: [/eslint:/, /\d+ error(s)? and \d+ warning(s)?/, /Parsing error:/,
      /prettier.*check.*failed/i, /@typescript-eslint/, /no-unused-vars/, /prefer-const/],
    suggestedFix: 'Run `npx eslint . --fix` to auto-fix linting issues. For Prettier errors, run `npx prettier --write .`.',
    severity: 'low',
  },
  {
    category: 'test_failure',
    description: 'Test suite or assertion failure',
    patterns: [/FAIL\s+.*\.test\./, /Test Suites:.*failed/, /AssertionError/,
      /Expected.*Received/, /expect\(.*\)\.(to|not)/, /vitest|jest|mocha/i],
    suggestedFix: 'Review the test output to understand the assertion failure. Check if the implementation matches the expected behavior or if the test needs updating.',
    severity: 'high',
  },
  {
    category: 'build_failure',
    description: 'Build or compilation failure',
    patterns: [/Build failed/i, /Compilation failed/, /error during build/i, /vite.*error/i,
      /webpack.*error/i, /rollup.*error/i, /esbuild.*error/i, /next build.*failed/i],
    suggestedFix: 'Check the build output for specific errors. Common issues include missing dependencies, invalid imports, or configuration errors.',
    severity: 'critical',
  },
  {
    category: 'npm_error',
    description: 'NPM package or dependency error',
    patterns: [/npm ERR!/, /ERESOLVE/, /peer dep/i, /Could not resolve dependency/,
      /ENOENT.*package\.json/, /Missing script/],
    suggestedFix: 'Try `npm install --legacy-peer-deps` for peer dependency conflicts. Check package.json for missing or malformed entries.',
    severity: 'medium',
  },
  {
    category: 'file_not_found',
    description: 'File or directory not found',
    patterns: [/ENOENT/, /no such file or directory/i, /File not found/i, /Cannot open file/i],
    suggestedFix: 'Verify the file path exists. Check for typos in the path and ensure the file has been created.',
    severity: 'medium',
  },
  {
    category: 'permission_error',
    description: 'File system permission denied',
    patterns: [/EACCES/, /Permission denied/i, /EPERM/, /operation not permitted/i],
    suggestedFix: 'Check file permissions. You may need to run with elevated privileges or fix file ownership.',
    severity: 'high',
  },
  {
    category: 'git_error',
    description: 'Git operation error',
    patterns: [/fatal: not a git repository/, /error: failed to push/, /CONFLICT.*Merge conflict/,
      /git.*rejected/, /Your branch is behind/],
    suggestedFix: 'Resolve any merge conflicts manually. Pull latest changes with `git pull` before pushing.',
    severity: 'medium',
  },
  {
    category: 'database_error',
    description: 'Database connection or query error',
    patterns: [/ECONNREFUSED.*:\d+/, /Connection refused/i, /prisma.*error/i,
      /drizzle.*error/i, /migration.*failed/i, /P\d{4}:/],
    suggestedFix: 'Ensure the database server is running. Check connection string in environment variables. Run pending migrations.',
    severity: 'high',
  },
  {
    category: 'api_error',
    description: 'API request or network error',
    patterns: [/fetch.*failed/i, /ETIMEDOUT/, /ECONNRESET/, /Network Error/i,
      /HTTP \d{3}/, /status code (4|5)\d{2}/],
    suggestedFix: 'Check API endpoint URL and network connectivity. Verify authentication tokens are valid and not expired.',
    severity: 'medium',
  },
  {
    category: 'resource_error',
    description: 'Memory or resource exhaustion',
    patterns: [/JavaScript heap out of memory/, /ENOMEM/, /EMFILE.*too many open files/,
      /Maximum call stack size exceeded/],
    suggestedFix: 'Increase Node.js memory limit with `NODE_OPTIONS=--max-old-space-size=4096`. Check for memory leaks or infinite recursion.',
    severity: 'critical',
  },
  {
    category: 'syntax_error',
    description: 'JavaScript or TypeScript syntax error',
    patterns: [/SyntaxError:/, /Unexpected token/, /Unexpected identifier/,
      /Missing semicolon/, /Unterminated string/],
    suggestedFix: 'Check for typos, missing brackets, or incorrect syntax. Use an editor with syntax highlighting to identify issues.',
    severity: 'high',
  },
];
