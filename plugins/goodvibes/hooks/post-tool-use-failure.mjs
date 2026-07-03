#!/usr/bin/env node
/**
 * PostToolUseFailure hook (goodvibes-intel) — plan §8 row, KEEP ("ported as-is").
 *
 * Ported from `plugins/goodvibes/hooks/scripts/src/post-tool-use-failure/**`
 * (v1, read-only quarry): a 3-phase progressive fix loop keyed by a stable
 * error signature — phase 1 relies on existing knowledge, phase 2 adds
 * official-documentation search hints, phase 3 adds community-solution hints.
 * When all phases are exhausted for an error, it's logged to project memory
 * as a documented failure (goodvibes-memory skill, `.goodvibes/v2/memory/
 * failures.json` — a JSON array, matching every other memory file's shape;
 * v1 stored this as hand-parsed markdown, which does not carry forward).
 *
 * Consolidated into one self-contained file (v1 spread this across eight
 * modules plus a shared `state/` subsystem tied to the retired registry
 * engine); the pattern library, categorization, phase-escalation math, and
 * response shape are unchanged. State moves to `.goodvibes/v2/state/retries.json`
 * (R15) instead of the v1 dual state.json+retries.json tracker.
 */

import {
  runHook,
  createHookResponse,
  v2StatePath,
  ensureDir,
  readJsonSafe,
  writeJsonSafe,
  isTestEnvironment,
} from './lib/common.mjs';

const HOOK_EVENT = 'PostToolUseFailure';
const MAX_PHASE = 3;
const DEFAULT_RETRY_LIMIT = 2;
const RETRY_MAX_AGE_HOURS = 24;

/** Retry-attempt limit per phase before escalating. Ported from types/errors.ts. */
const PHASE_RETRY_LIMITS = {
  npm_install: 2,
  typescript_error: 3,
  test_failure: 2,
  build_failure: 2,
  file_not_found: 1,
  git_conflict: 2,
  database_error: 2,
  api_error: 2,
  unknown: 2,
};

/** Ordered keyword/compound matchers. Ported from automation/fix-loop.ts. */
const ERROR_CATEGORY_MATCHERS = [
  { category: 'npm_install', keywords: ['eresolve', 'npm', 'peer dep'] },
  { category: 'typescript_error', compound: [['ts', 'error'], ['ts', 'type']] },
  { category: 'test_failure', compound: [['test', 'fail']] },
  { category: 'build_failure', keywords: ['build', 'compile'] },
  { category: 'file_not_found', keywords: ['enoent', 'not found'] },
  { category: 'git_conflict', keywords: ['conflict', 'merge'] },
  { category: 'database_error', keywords: ['database', 'prisma', 'sql'] },
  { category: 'api_error', keywords: ['api', 'fetch', 'request'] },
];

/** Recovery pattern library. Ported verbatim from post-tool-use-failure/recovery-patterns.ts. */
const RECOVERY_PATTERNS = [
  {
    category: 'typescript_type_error',
    patterns: [/TS\d+:/, /Type '.*' is not assignable to type/, /Property '.*' does not exist on type/, /Cannot find name '.*'/, /Argument of type '.*' is not assignable/, /Object is possibly 'undefined'/, /Object is possibly 'null'/],
    suggestedFix: 'Run `npx tsc --noEmit` to identify all type errors. Check that types are correctly imported and match expected signatures.',
    severity: 'high',
  },
  {
    category: 'typescript_config_error',
    patterns: [/Cannot find module '.*' or its corresponding type declarations/, /Could not find a declaration file for module/, /error TS6059:/, /tsconfig\.json/],
    suggestedFix: 'Check tsconfig.json configuration. Ensure module resolution settings match your import style. You may need to install @types/* packages.',
    severity: 'medium',
  },
  {
    category: 'missing_import',
    patterns: [/Cannot find module '.*'/, /Module not found/, /Unable to resolve path/, /import .* from '.*' failed/, /ENOENT.*node_modules/],
    suggestedFix: 'Run `npm install` to ensure all dependencies are installed. Check that the import path is correct and the package exists in package.json.',
    severity: 'high',
  },
  {
    category: 'type_mismatch',
    patterns: [/Expected \d+ arguments?, but got \d+/, /Type '.*' has no properties in common with type/, /The types of '.*' are incompatible/, /Conversion of type '.*' to type '.*' may be a mistake/],
    suggestedFix: 'Check function signatures and ensure arguments match. Review type definitions and update interface if needed.',
    severity: 'medium',
  },
  {
    category: 'undefined_reference',
    patterns: [/ReferenceError: (.*) is not defined/, /TypeError: Cannot read propert(y|ies) of undefined/, /TypeError: Cannot read propert(y|ies) of null/, /TypeError: (.*) is not a function/, /'.*' is used before being assigned/],
    suggestedFix: 'Add null checks or optional chaining (?.). Ensure variables are properly initialized before use.',
    severity: 'high',
  },
  {
    category: 'lint_error',
    patterns: [/eslint:/, /\d+ error(s)? and \d+ warning(s)?/, /Parsing error:/, /prettier.*check.*failed/i, /@typescript-eslint/, /no-unused-vars/, /prefer-const/],
    suggestedFix: 'Run `npx eslint . --fix` to auto-fix linting issues. For Prettier errors, run `npx prettier --write .`.',
    severity: 'low',
  },
  {
    category: 'test_failure',
    patterns: [/FAIL\s+.*\.test\./, /Test Suites:.*failed/, /AssertionError/, /Expected.*Received/, /expect\(.*\)\.(to|not)/, /vitest|jest|mocha/i],
    suggestedFix: 'Review the test output to understand the assertion failure. Check if the implementation matches the expected behavior or if the test needs updating.',
    severity: 'high',
  },
  {
    category: 'build_failure',
    patterns: [/Build failed/i, /Compilation failed/, /error during build/i, /vite.*error/i, /webpack.*error/i, /rollup.*error/i, /esbuild.*error/i, /next build.*failed/i],
    suggestedFix: 'Check the build output for specific errors. Common issues include missing dependencies, invalid imports, or configuration errors.',
    severity: 'critical',
  },
  {
    category: 'npm_error',
    patterns: [/npm ERR!/, /ERESOLVE/, /peer dep/i, /Could not resolve dependency/, /ENOENT.*package\.json/, /Missing script/],
    suggestedFix: 'Try `npm install --legacy-peer-deps` for peer dependency conflicts. Check package.json for missing or malformed entries.',
    severity: 'medium',
  },
  {
    category: 'file_not_found',
    patterns: [/ENOENT/, /no such file or directory/i, /File not found/i, /Cannot open file/i],
    suggestedFix: 'Verify the file path exists. Check for typos in the path and ensure the file has been created.',
    severity: 'medium',
  },
  {
    category: 'permission_error',
    patterns: [/EACCES/, /Permission denied/i, /EPERM/, /operation not permitted/i],
    suggestedFix: 'Check file permissions. You may need to run with elevated privileges or fix file ownership.',
    severity: 'high',
  },
  {
    category: 'git_error',
    patterns: [/fatal: not a git repository/, /error: failed to push/, /CONFLICT.*Merge conflict/, /git.*rejected/, /Your branch is behind/],
    suggestedFix: 'Resolve any merge conflicts manually. Pull latest changes with `git pull` before pushing.',
    severity: 'medium',
  },
  {
    category: 'database_error',
    patterns: [/ECONNREFUSED.*:\d+/, /Connection refused/i, /prisma.*error/i, /drizzle.*error/i, /migration.*failed/i, /P\d{4}:/],
    suggestedFix: 'Ensure the database server is running. Check connection string in environment variables. Run pending migrations.',
    severity: 'high',
  },
  {
    category: 'api_error',
    patterns: [/fetch.*failed/i, /ETIMEDOUT/, /ECONNRESET/, /Network Error/i, /HTTP \d{3}/, /status code (4|5)\d{2}/],
    suggestedFix: 'Check API endpoint URL and network connectivity. Verify authentication tokens are valid and not expired.',
    severity: 'medium',
  },
  {
    category: 'resource_error',
    patterns: [/JavaScript heap out of memory/, /ENOMEM/, /EMFILE.*too many open files/, /Maximum call stack size exceeded/],
    suggestedFix: 'Increase Node.js memory limit with `NODE_OPTIONS=--max-old-space-size=4096`. Check for memory leaks or infinite recursion.',
    severity: 'critical',
  },
  {
    category: 'syntax_error',
    patterns: [/SyntaxError:/, /Unexpected token/, /Unexpected identifier/, /Missing semicolon/, /Unterminated string/],
    suggestedFix: 'Check for typos, missing brackets, or incorrect syntax. Use an editor with syntax highlighting to identify issues.',
    severity: 'high',
  },
  {
    category: 'shell_escaping_error',
    patterns: [/unexpected EOF while looking for matching/, /unterminated quoted string/i, /Bad escaped character in JSON/, /syntax error near unexpected token/],
    suggestedFix: 'Shell escaping error in a tool call argument. Prefer passing the value as a JSON string argument rather than composing it in a shell command.',
    severity: 'critical',
  },
];

const ERROR_CATEGORY_MAP = {
  npm_install: ['missing_import', 'npm_error'],
  typescript_error: ['typescript_type_error', 'typescript_config_error', 'type_mismatch'],
  test_failure: ['test_failure'],
  build_failure: ['build_failure'],
  file_not_found: ['file_not_found'],
  git_conflict: ['git_error'],
  database_error: ['database_error'],
  api_error: ['api_error'],
  unknown: ['undefined_reference', 'lint_error', 'permission_error', 'resource_error', 'syntax_error', 'shell_escaping_error'],
};

const RESEARCH_HINTS = {
  typescript_type_error: { official: ['typescriptlang.org error reference', 'typescript handbook'], community: ['stackoverflow typescript', 'github typescript discussions'] },
  typescript_config_error: { official: ['typescriptlang.org/tsconfig', 'typescript module resolution'], community: ['stackoverflow tsconfig', 'github typescript issues'] },
  missing_import: { official: ['npmjs.com package documentation', 'package README'], community: ['stackoverflow module not found', 'github package issues'] },
  type_mismatch: { official: ['typescript generics documentation', 'typescript utility types'], community: ['stackoverflow typescript types'] },
  undefined_reference: { official: ['MDN JavaScript reference'], community: ['stackoverflow null undefined'] },
  lint_error: { official: ['eslint.org rules', 'prettier.io documentation'], community: ['stackoverflow eslint'] },
  test_failure: { official: ['vitest.dev/guide', 'jestjs.io/docs', 'testing-library.com'], community: ['stackoverflow testing', 'github testing framework issues'] },
  build_failure: { official: ['vite.dev/guide', 'webpack.js.org', 'next.js docs'], community: ['stackoverflow build errors', 'github build tool issues'] },
  npm_error: { official: ['npmjs.com documentation', 'package changelog'], community: ['stackoverflow npm', 'github npm issues'] },
  file_not_found: { official: [], community: [] },
  permission_error: { official: ['nodejs.org fs documentation'], community: ['stackoverflow permissions'] },
  git_error: { official: ['git-scm.com documentation'], community: ['stackoverflow git'] },
  database_error: { official: ['prisma.io/docs', 'database provider docs'], community: ['stackoverflow database errors', 'github ORM issues'] },
  api_error: { official: ['API provider documentation', 'MDN fetch API'], community: ['stackoverflow API errors'] },
  resource_error: { official: ['nodejs.org memory documentation'], community: ['stackoverflow node memory'] },
  syntax_error: { official: ['MDN JavaScript reference', 'typescriptlang.org'], community: ['stackoverflow syntax error'] },
};
const CATEGORY_TO_HINT_MAP = {
  npm_install: 'npm_error', typescript_error: 'typescript_type_error', test_failure: 'test_failure',
  build_failure: 'build_failure', file_not_found: 'file_not_found', git_conflict: 'git_error',
  database_error: 'database_error', api_error: 'api_error', unknown: 'undefined_reference',
};

function categorizeError(errorMessage) {
  const lower = errorMessage.toLowerCase();
  for (const matcher of ERROR_CATEGORY_MATCHERS) {
    if (matcher.keywords?.some((k) => lower.includes(k))) return matcher.category;
    if (matcher.compound?.some((rule) => rule.every((k) => lower.includes(k)))) return matcher.category;
  }
  return 'unknown';
}

function findMatchingPattern(category, errorMessage) {
  const patternCategories = ERROR_CATEGORY_MAP[category] || [];
  for (const pattern of RECOVERY_PATTERNS) {
    if (patternCategories.includes(pattern.category)) {
      for (const regex of pattern.patterns) if (regex.test(errorMessage)) return pattern;
    }
  }
  for (const pattern of RECOVERY_PATTERNS) {
    for (const regex of pattern.patterns) if (regex.test(errorMessage)) return pattern;
  }
  return null;
}

function getSuggestedFix(category, errorMessage, errorState) {
  const pattern = findMatchingPattern(category, errorMessage);
  if (!pattern) return 'Review the error message carefully. Check logs for more details. Try isolating the problem step by step.';
  let suggestion = pattern.suggestedFix;
  if (errorState.phase >= 2 && errorState.fixStrategiesAttempted.length > 0) {
    suggestion += '\n\nNote: Previous fix attempts failed. Try a different approach or check documentation for alternatives.';
  }
  return suggestion;
}

function getResearchHints(category, phase) {
  const patternCategory = CATEGORY_TO_HINT_MAP[category] || 'unknown';
  const hints = RESEARCH_HINTS[patternCategory] || { official: ['official documentation'], community: ['stackoverflow', 'github issues'] };
  const result = { official: [], community: [] };
  if (phase >= 2) result.official = [...hints.official];
  if (phase >= 3) result.community = [...hints.community];
  return result;
}

function buildResearchHintsMessage(hints, phase) {
  if (phase === 1) return '';
  const parts = [];
  if (phase >= 2 && hints.official.length > 0) {
    parts.push('[Phase 2] Search official documentation:');
    for (const h of hints.official) parts.push(`  - ${h}`);
  }
  if (phase >= 3 && hints.community.length > 0) {
    parts.push('[Phase 3] Search community solutions:');
    for (const h of hints.community) parts.push(`  - ${h}`);
  }
  return parts.join('\n');
}

function getPhaseDescription(phase) {
  switch (phase) {
    case 1: return 'Raw attempts with existing knowledge';
    case 2: return 'Including official documentation search';
    case 3: return 'Including community solutions search';
    default: return 'Unknown phase';
  }
}

function retryLimit(category) {
  return PHASE_RETRY_LIMITS[category] ?? DEFAULT_RETRY_LIMIT;
}

/** Stable per-(tool,error) signature: normalizes variable parts before hashing. */
function generateErrorSignature(toolName, errorMessage) {
  const normalized = errorMessage
    .replace(/[A-Z]:\\[^\s:]+/gi, '<PATH>')
    .replace(/\/[^\s:]+/g, '<PATH>')
    .replace(/:\d+:\d+/g, ':<LINE>:<COL>')
    .replace(/line \d+/gi, 'line <LINE>')
    .replace(/\d+/g, 'N')
    .replace(/(['"])[^'"]*\1/g, 'STR')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*/g, '<TIMESTAMP>')
    .replace(/0x[a-f0-9]+/gi, '<ADDR>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .toLowerCase();
  return `${toolName}:${Buffer.from(normalized).toString('base64').slice(0, 20)}`;
}

function retriesPath(cwd) {
  return v2StatePath(cwd, 'state', 'retries.json');
}

function loadRetries(cwd) {
  const all = readJsonSafe(retriesPath(cwd), {});
  const cutoff = Date.now() - RETRY_MAX_AGE_HOURS * 60 * 60 * 1000;
  let changed = false;
  for (const [sig, entry] of Object.entries(all)) {
    if (entry?.lastAttempt && new Date(entry.lastAttempt).getTime() < cutoff) {
      delete all[sig];
      changed = true;
    }
  }
  if (changed) writeJsonSafe(retriesPath(cwd), all);
  return all;
}

function saveRetries(cwd, all) {
  writeJsonSafe(retriesPath(cwd), all);
}

/** Appends to the JSON-array `failures.json` memory file (goodvibes-memory skill's shape). */
function writeFailureToMemory(cwd, failure) {
  try {
    const file = v2StatePath(cwd, 'memory', 'failures.json');
    ensureDir(v2StatePath(cwd, 'memory'));
    const failures = readJsonSafe(file, []);
    failures.push(failure);
    writeJsonSafe(file, failures);
  } catch {
    /* best-effort — a memory write failure must never break the hook */
  }
}

function buildFixLoopMessage({ errorState, pattern, category, suggestedFix, researchHints, exhausted }) {
  const parts = [];
  parts.push(`[GoodVibes Fix Loop - Phase ${errorState.phase}/${MAX_PHASE}: ${getPhaseDescription(errorState.phase)}]`);
  const remaining = Math.max(0, retryLimit(category) - errorState.attemptsThisPhase);
  parts.push(`Attempt ${errorState.attemptsThisPhase} (${remaining} remaining this phase)`);
  parts.push('');
  parts.push(pattern ? `Detected: ${pattern.category.replace(/_/g, ' ')}` : `Category: ${category}`);
  parts.push('');
  parts.push('Suggested fix:');
  parts.push(suggestedFix);
  if (researchHints) {
    parts.push('');
    parts.push(researchHints);
  }
  if (errorState.fixStrategiesAttempted.length > 0) {
    parts.push('');
    parts.push('Previously attempted (failed):');
    for (const attempt of errorState.fixStrategiesAttempted.slice(-3)) parts.push(`  - ${attempt}`);
    parts.push('Try a DIFFERENT approach.');
  }
  if (exhausted) {
    parts.push('');
    parts.push('[WARNING] All fix phases exhausted. Consider:');
    parts.push('  - Manual debugging');
    parts.push('  - Asking the user for help');
    parts.push('  - Reverting recent changes');
  }
  return parts.join('\n');
}

async function handlePostToolUseFailure(input) {
  const cwd = input.cwd || process.cwd();
  const toolName = input.tool_name || 'unknown';
  const errorMessage = typeof input.error === 'string' ? input.error : 'Unknown error';

  const signature = generateErrorSignature(toolName, errorMessage);
  const category = categorizeError(errorMessage);

  const retries = loadRetries(cwd);
  let errorState = retries[signature] ?? {
    signature,
    category,
    phase: 1,
    attemptsThisPhase: 0,
    totalAttempts: 0,
    fixStrategiesAttempted: [],
  };

  if (errorState.attemptsThisPhase >= retryLimit(category) && errorState.phase < MAX_PHASE) {
    errorState = { ...errorState, phase: errorState.phase + 1, attemptsThisPhase: 0 };
  }

  errorState = {
    ...errorState,
    attemptsThisPhase: errorState.attemptsThisPhase + 1,
    totalAttempts: errorState.totalAttempts + 1,
    lastAttempt: new Date().toISOString(),
  };

  const pattern = findMatchingPattern(category, errorMessage);
  const suggestedFix = getSuggestedFix(category, errorMessage, errorState);
  const hints = getResearchHints(pattern?.category ?? category, errorState.phase);
  const researchHints = buildResearchHintsMessage(hints, errorState.phase);

  const exhausted = errorState.phase >= MAX_PHASE && errorState.attemptsThisPhase >= retryLimit(category);

  errorState.fixStrategiesAttempted = [...errorState.fixStrategiesAttempted, suggestedFix.slice(0, 120)].slice(-10);
  retries[signature] = errorState;
  saveRetries(cwd, retries);

  if (exhausted) {
    writeFailureToMemory(cwd, {
      date: new Date().toISOString().slice(0, 10),
      tool: toolName,
      approach: `${toolName} failed: ${errorMessage.slice(0, 100)}`,
      reason: `Exhausted ${errorState.totalAttempts} attempts across ${MAX_PHASE} phases`,
      suggestion: 'Manual intervention required',
    });
  }

  const systemMessage = buildFixLoopMessage({ errorState, pattern, category, suggestedFix, researchHints, exhausted });
  return createHookResponse({ hookEventName: HOOK_EVENT, systemMessage });
}

if (!isTestEnvironment()) {
  await runHook(HOOK_EVENT, handlePostToolUseFailure);
}

export {
  categorizeError,
  findMatchingPattern,
  getSuggestedFix,
  getResearchHints,
  generateErrorSignature,
  handlePostToolUseFailure,
  RECOVERY_PATTERNS,
};
