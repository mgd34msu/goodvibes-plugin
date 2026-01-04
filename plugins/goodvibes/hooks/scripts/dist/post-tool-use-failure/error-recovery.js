/**
 * Error Recovery Pattern Library
 *
 * Provides recovery patterns for common error types encountered during tool use.
 * Matches error messages to known patterns and suggests fixes.
 */
/**
 * Library of recovery patterns for common error types
 */
export const RECOVERY_PATTERNS = [
    // TypeScript errors
    {
        category: 'typescript_type_error',
        description: 'TypeScript type checking error',
        patterns: [
            /TS\d+:/,
            /Type '.*' is not assignable to type/,
            /Property '.*' does not exist on type/,
            /Cannot find name '.*'/,
            /Argument of type '.*' is not assignable/,
            /Object is possibly 'undefined'/,
            /Object is possibly 'null'/,
        ],
        suggestedFix: 'Run `npx tsc --noEmit` to identify all type errors. Check that types are correctly imported and match expected signatures.',
        severity: 'high',
    },
    {
        category: 'typescript_config_error',
        description: 'TypeScript configuration error',
        patterns: [
            /Cannot find module '.*' or its corresponding type declarations/,
            /Could not find a declaration file for module/,
            /error TS6059:/,
            /tsconfig\.json/,
        ],
        suggestedFix: 'Check tsconfig.json configuration. Ensure module resolution settings match your import style. You may need to install @types/* packages.',
        severity: 'medium',
    },
    // Missing imports
    {
        category: 'missing_import',
        description: 'Missing module or import error',
        patterns: [
            /Cannot find module '.*'/,
            /Module not found/,
            /Unable to resolve path/,
            /import .* from '.*' failed/,
            /ENOENT.*node_modules/,
        ],
        suggestedFix: 'Run `npm install` to ensure all dependencies are installed. Check that the import path is correct and the package exists in package.json.',
        severity: 'high',
    },
    // Type mismatches
    {
        category: 'type_mismatch',
        description: 'Type mismatch or incompatible types',
        patterns: [
            /Expected \d+ arguments?, but got \d+/,
            /Type '.*' has no properties in common with type/,
            /The types of '.*' are incompatible/,
            /Conversion of type '.*' to type '.*' may be a mistake/,
        ],
        suggestedFix: 'Check function signatures and ensure arguments match. Review type definitions and update interface if needed.',
        severity: 'medium',
    },
    // Undefined references
    {
        category: 'undefined_reference',
        description: 'Undefined or null reference error',
        patterns: [
            /ReferenceError: (.*) is not defined/,
            /TypeError: Cannot read propert(y|ies) of undefined/,
            /TypeError: Cannot read propert(y|ies) of null/,
            /TypeError: (.*) is not a function/,
            /'.*' is used before being assigned/,
        ],
        suggestedFix: 'Add null checks or optional chaining (?.). Ensure variables are properly initialized before use.',
        severity: 'high',
    },
    // Linting errors
    {
        category: 'lint_error',
        description: 'ESLint or Prettier linting error',
        patterns: [
            /eslint:/,
            /\d+ error(s)? and \d+ warning(s)?/,
            /Parsing error:/,
            /prettier.*check.*failed/i,
            /@typescript-eslint/,
            /no-unused-vars/,
            /prefer-const/,
        ],
        suggestedFix: 'Run `npx eslint . --fix` to auto-fix linting issues. For Prettier errors, run `npx prettier --write .`.',
        severity: 'low',
    },
    // Test failures
    {
        category: 'test_failure',
        description: 'Test suite or assertion failure',
        patterns: [
            /FAIL\s+.*\.test\./,
            /Test Suites:.*failed/,
            /AssertionError/,
            /Expected.*Received/,
            /expect\(.*\)\.(to|not)/,
            /vitest|jest|mocha/i,
        ],
        suggestedFix: 'Review the test output to understand the assertion failure. Check if the implementation matches the expected behavior or if the test needs updating.',
        severity: 'high',
    },
    // Build errors
    {
        category: 'build_failure',
        description: 'Build or compilation failure',
        patterns: [
            /Build failed/i,
            /Compilation failed/,
            /error during build/i,
            /vite.*error/i,
            /webpack.*error/i,
            /rollup.*error/i,
            /esbuild.*error/i,
            /next build.*failed/i,
        ],
        suggestedFix: 'Check the build output for specific errors. Common issues include missing dependencies, invalid imports, or configuration errors.',
        severity: 'critical',
    },
    // NPM/Package errors
    {
        category: 'npm_error',
        description: 'NPM package or dependency error',
        patterns: [
            /npm ERR!/,
            /ERESOLVE/,
            /peer dep/i,
            /Could not resolve dependency/,
            /ENOENT.*package\.json/,
            /Missing script/,
        ],
        suggestedFix: 'Try `npm install --legacy-peer-deps` for peer dependency conflicts. Check package.json for missing or malformed entries.',
        severity: 'medium',
    },
    // File system errors
    {
        category: 'file_not_found',
        description: 'File or directory not found',
        patterns: [
            /ENOENT/,
            /no such file or directory/i,
            /File not found/i,
            /Cannot open file/i,
        ],
        suggestedFix: 'Verify the file path exists. Check for typos in the path and ensure the file has been created.',
        severity: 'medium',
    },
    // Permission errors
    {
        category: 'permission_error',
        description: 'File system permission denied',
        patterns: [
            /EACCES/,
            /Permission denied/i,
            /EPERM/,
            /operation not permitted/i,
        ],
        suggestedFix: 'Check file permissions. You may need to run with elevated privileges or fix file ownership.',
        severity: 'high',
    },
    // Git errors
    {
        category: 'git_error',
        description: 'Git operation error',
        patterns: [
            /fatal: not a git repository/,
            /error: failed to push/,
            /CONFLICT.*Merge conflict/,
            /git.*rejected/,
            /Your branch is behind/,
        ],
        suggestedFix: 'Resolve any merge conflicts manually. Pull latest changes with `git pull` before pushing.',
        severity: 'medium',
    },
    // Database errors
    {
        category: 'database_error',
        description: 'Database connection or query error',
        patterns: [
            /ECONNREFUSED.*:\d+/,
            /Connection refused/i,
            /prisma.*error/i,
            /drizzle.*error/i,
            /migration.*failed/i,
            /P\d{4}:/,
        ],
        suggestedFix: 'Ensure the database server is running. Check connection string in environment variables. Run pending migrations.',
        severity: 'high',
    },
    // API errors
    {
        category: 'api_error',
        description: 'API request or network error',
        patterns: [
            /fetch.*failed/i,
            /ETIMEDOUT/,
            /ECONNRESET/,
            /Network Error/i,
            /HTTP \d{3}/,
            /status code (4|5)\d{2}/,
        ],
        suggestedFix: 'Check API endpoint URL and network connectivity. Verify authentication tokens are valid and not expired.',
        severity: 'medium',
    },
    // Memory/Resource errors
    {
        category: 'resource_error',
        description: 'Memory or resource exhaustion',
        patterns: [
            /JavaScript heap out of memory/,
            /ENOMEM/,
            /EMFILE.*too many open files/,
            /Maximum call stack size exceeded/,
        ],
        suggestedFix: 'Increase Node.js memory limit with `NODE_OPTIONS=--max-old-space-size=4096`. Check for memory leaks or infinite recursion.',
        severity: 'critical',
    },
    // Syntax errors
    {
        category: 'syntax_error',
        description: 'JavaScript or TypeScript syntax error',
        patterns: [
            /SyntaxError:/,
            /Unexpected token/,
            /Unexpected identifier/,
            /Missing semicolon/,
            /Unterminated string/,
        ],
        suggestedFix: 'Check for typos, missing brackets, or incorrect syntax. Use an editor with syntax highlighting to identify issues.',
        severity: 'high',
    },
];
/**
 * Find a matching recovery pattern for the given error category and message.
 * First attempts to match by category mapping, then falls back to pattern matching.
 * Returns the first pattern whose regex matches the error message.
 *
 * @param category - The classified error category (e.g., 'typescript_error', 'test_failure')
 * @param errorMessage - The raw error message text to match against patterns
 * @returns The matching RecoveryPattern with suggested fix, or null if no match found
 *
 * @example
 * const pattern = findMatchingPattern('typescript_error', "Type 'string' is not assignable to type 'number'");
 * if (pattern) {
 *   console.log(pattern.suggestedFix);  // 'Run `npx tsc --noEmit`...'
 * }
 */
export function findMatchingPattern(category, errorMessage) {
    // First try to match by category (map ErrorCategory to pattern categories)
    const categoryMap = {
        npm_install: ['missing_import', 'npm_error'],
        typescript_error: ['typescript_type_error', 'typescript_config_error', 'type_mismatch'],
        test_failure: ['test_failure'],
        build_failure: ['build_failure'],
        file_not_found: ['file_not_found'],
        git_conflict: ['git_error'],
        database_error: ['database_error'],
        api_error: ['api_error'],
        unknown: ['undefined_reference', 'lint_error', 'permission_error', 'resource_error', 'syntax_error'],
    };
    const patternCategories = categoryMap[category] || [];
    // First try to match by mapped category
    for (const pattern of RECOVERY_PATTERNS) {
        if (patternCategories.includes(pattern.category)) {
            for (const regex of pattern.patterns) {
                if (regex.test(errorMessage)) {
                    return pattern;
                }
            }
        }
    }
    // Fall back to matching by pattern only
    for (const pattern of RECOVERY_PATTERNS) {
        for (const regex of pattern.patterns) {
            if (regex.test(errorMessage)) {
                return pattern;
            }
        }
    }
    return null;
}
/**
 * Get suggested fix for an error message, considering error state for phase-specific advice.
 * Uses pattern matching to find relevant recovery advice and appends phase-specific
 * guidance when previous fix attempts have failed.
 *
 * @param category - The classified error category
 * @param errorMessage - The raw error message to analyze
 * @param errorState - Current error state with phase and attempted strategies
 * @returns A string containing the suggested fix approach
 *
 * @example
 * const fix = getSuggestedFix('npm_install', 'Module not found: lodash', errorState);
 * console.log(fix);  // 'Run `npm install` to ensure all dependencies...'
 */
export function getSuggestedFix(category, errorMessage, errorState) {
    const pattern = findMatchingPattern(category, errorMessage);
    if (!pattern) {
        return 'Review the error message carefully. Check logs for more details. Try isolating the problem step by step.';
    }
    // Base suggestion
    let suggestion = pattern.suggestedFix;
    // Add phase-specific advice
    if (errorState.phase >= 2 && errorState.fixStrategiesAttempted.length > 0) {
        suggestion += '\n\nNote: Previous fix attempts failed. Try a different approach or check documentation for alternatives.';
    }
    return suggestion;
}
/**
 * Get all matching patterns for an error (may match multiple categories).
 * Unlike findMatchingPattern, this returns all patterns that match,
 * useful for complex errors that span multiple categories.
 *
 * @param error - The raw error message to analyze
 * @returns Array of all RecoveryPatterns whose regex matches the error
 *
 * @example
 * const patterns = findAllMatchingPatterns('Error: Cannot find module "foo"');
 * // May return both 'missing_import' and 'npm_error' patterns
 */
export function findAllMatchingPatterns(error) {
    const matches = [];
    for (const pattern of RECOVERY_PATTERNS) {
        for (const regex of pattern.patterns) {
            if (regex.test(error)) {
                matches.push(pattern);
                break; // Only add each pattern once
            }
        }
    }
    return matches;
}
/**
 * Get the highest severity from a list of patterns.
 * Severity order from lowest to highest: low, medium, high, critical.
 *
 * @param patterns - Array of RecoveryPatterns to evaluate
 * @returns The highest ErrorSeverity found, or 'low' if array is empty
 *
 * @example
 * const patterns = findAllMatchingPatterns(errorMessage);
 * const severity = getHighestSeverity(patterns);
 * if (severity === 'critical') {
 *   console.log('Immediate attention required');
 * }
 */
export function getHighestSeverity(patterns) {
    const severityOrder = ['low', 'medium', 'high', 'critical'];
    let highest = 'low';
    for (const pattern of patterns) {
        if (severityOrder.indexOf(pattern.severity) > severityOrder.indexOf(highest)) {
            highest = pattern.severity;
        }
    }
    return highest;
}
/**
 * Research hints for different error categories
 */
const RESEARCH_HINTS = {
    typescript_type_error: {
        official: ['typescriptlang.org error reference', 'typescript handbook'],
        community: ['stackoverflow typescript', 'github typescript discussions'],
    },
    typescript_config_error: {
        official: ['typescriptlang.org/tsconfig', 'typescript module resolution'],
        community: ['stackoverflow tsconfig', 'github typescript issues'],
    },
    missing_import: {
        official: ['npmjs.com package documentation', 'package README'],
        community: ['stackoverflow module not found', 'github package issues'],
    },
    type_mismatch: {
        official: ['typescript generics documentation', 'typescript utility types'],
        community: ['stackoverflow typescript types'],
    },
    undefined_reference: {
        official: ['MDN JavaScript reference'],
        community: ['stackoverflow null undefined'],
    },
    lint_error: {
        official: ['eslint.org rules', 'prettier.io documentation'],
        community: ['stackoverflow eslint'],
    },
    test_failure: {
        official: ['vitest.dev/guide', 'jestjs.io/docs', 'testing-library.com'],
        community: ['stackoverflow testing', 'github testing framework issues'],
    },
    build_failure: {
        official: ['vite.dev/guide', 'webpack.js.org', 'next.js docs'],
        community: ['stackoverflow build errors', 'github build tool issues'],
    },
    npm_error: {
        official: ['npmjs.com documentation', 'package changelog'],
        community: ['stackoverflow npm', 'github npm issues'],
    },
    file_not_found: {
        official: [],
        community: [],
    },
    permission_error: {
        official: ['nodejs.org fs documentation'],
        community: ['stackoverflow permissions'],
    },
    git_error: {
        official: ['git-scm.com documentation'],
        community: ['stackoverflow git'],
    },
    database_error: {
        official: ['prisma.io/docs', 'database provider docs'],
        community: ['stackoverflow database errors', 'github ORM issues'],
    },
    api_error: {
        official: ['API provider documentation', 'MDN fetch API'],
        community: ['stackoverflow API errors'],
    },
    resource_error: {
        official: ['nodejs.org memory documentation'],
        community: ['stackoverflow node memory'],
    },
    syntax_error: {
        official: ['MDN JavaScript reference', 'typescriptlang.org'],
        community: ['stackoverflow syntax error'],
    },
};
/**
 * Get research hints for an error based on category, message, and phase.
 * Returns documentation sources to consult, with official docs suggested
 * in phase 2 and community resources added in phase 3.
 *
 * @param category - The classified error category
 * @param errorMessage - The raw error message (currently unused, reserved for future use)
 * @param phase - Current escalation phase (1, 2, or 3)
 * @returns Object with `official` and `community` arrays of documentation hints
 *
 * @example
 * const hints = getResearchHints('typescript_error', errorMsg, 2);
 * // Returns: { official: ['typescriptlang.org error reference', ...], community: [] }
 *
 * @example
 * const hints = getResearchHints('typescript_error', errorMsg, 3);
 * // Returns: { official: [...], community: ['stackoverflow typescript', ...] }
 */
export function getResearchHints(category, errorMessage, phase) {
    // Map ErrorCategory to pattern category for hints lookup
    const categoryMap = {
        npm_install: 'npm_error',
        typescript_error: 'typescript_type_error',
        test_failure: 'test_failure',
        build_failure: 'build_failure',
        file_not_found: 'file_not_found',
        git_conflict: 'git_error',
        database_error: 'database_error',
        api_error: 'api_error',
        unknown: 'undefined_reference',
    };
    const patternCategory = categoryMap[category] || 'unknown';
    const hints = RESEARCH_HINTS[patternCategory] || {
        official: ['official documentation'],
        community: ['stackoverflow', 'github issues'],
    };
    const result = {
        official: [],
        community: [],
    };
    // Phase 2: Include official documentation hints
    if (phase >= 2) {
        result.official = [...hints.official];
    }
    // Phase 3: Include community documentation hints
    if (phase >= 3) {
        result.community = [...hints.community];
    }
    return result;
}
