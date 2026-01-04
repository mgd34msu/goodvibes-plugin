/**
 * Research Hints for Error Recovery
 *
 * Provides documentation sources to consult when recovering from errors.
 * Returns different hints based on the current escalation phase.
 */
/**
 * Research hints organized by pattern category.
 * Each category has official (documentation) and community (forums/issues) sources.
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
 * Maps ErrorCategory to pattern category for hints lookup.
 */
const CATEGORY_TO_HINT_MAP = {
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
    const patternCategory = CATEGORY_TO_HINT_MAP[category] || 'unknown';
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
