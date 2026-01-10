/**
 * Identify Tech Debt Handler
 *
 * Aggregates multiple code quality signals to identify technical debt.
 * Combines analysis from:
 * - Dead code detection
 * - Circular dependencies
 * - Security vulnerabilities (secrets scanning)
 * - Test coverage gaps
 * - Type errors
 * - TODO/FIXME comments
 *
 * @module handlers/analysis/identify-tech-debt
 */

import * as fs from 'fs';
import * as path from 'path';

import { PROJECT_ROOT } from '../../config.js';
import {
  createSuccessResponse,
  createErrorResponse,
  type ToolResponse,
} from '../lsp/utils.js';

// Import handlers from other analysis tools
import { handleFindDeadCode, type FindDeadCodeArgs } from '../lsp/dead-code.js';
import { handleFindCircularDeps, type FindCircularDepsArgs } from '../deps/circular.js';
import { handleScanForSecrets, type ScanForSecretsArgs } from '../security/secrets-scanner.js';
import { handleGetTestCoverage, type GetTestCoverageArgs } from '../test/coverage.js';
import { handleCheckTypes, type CheckTypesArgs } from '../validation/index.js';
import { scanDirectory } from '../issues/todo-scanner.js';
import type { TodoItem } from '../issues/types.js';

// =============================================================================
// Types
// =============================================================================

/** Categories of tech debt to analyze */
export type TechDebtCategory =
  | 'dead_code'
  | 'circular_deps'
  | 'security'
  | 'coverage'
  | 'type_errors'
  | 'todos';

/** Arguments for the identify_tech_debt tool */
export interface IdentifyTechDebtArgs {
  /** Directory to analyze (default: PROJECT_ROOT) */
  path?: string;
  /** Categories to include (default: all) */
  include?: TechDebtCategory[];
  /** Minimum acceptable coverage percent (default: 80) */
  coverage_threshold?: number;
  /** Maximum number of issues to return (default: 50) */
  max_issues?: number;
}

/** Grade representing overall tech debt level */
export type TechDebtGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/** Severity of an individual issue */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Effort estimate to fix an issue */
export type EffortEstimate = 'trivial' | 'small' | 'medium' | 'large';

/** Breakdown for a single category */
interface CategoryBreakdown {
  count: number;
  score: number;
  weight: number;
}

/** Security category breakdown with severity split */
interface SecurityBreakdown extends CategoryBreakdown {
  high: number;
  medium: number;
  low: number;
}

/** Coverage category breakdown with uncovered percentage */
interface CoverageBreakdown extends CategoryBreakdown {
  uncovered_percent: number;
}

/** Full breakdown of all categories */
interface TechDebtBreakdown {
  dead_code?: CategoryBreakdown;
  circular_deps?: CategoryBreakdown;
  security_issues?: SecurityBreakdown;
  coverage_gaps?: CoverageBreakdown;
  type_errors?: CategoryBreakdown;
  todos?: CategoryBreakdown;
}

/** A single prioritized issue */
interface PrioritizedIssue {
  type: string;
  severity: IssueSeverity;
  location: string;
  description: string;
  effort: EffortEstimate;
  recommendation: string;
}

/** Trend direction for tech debt */
interface TechDebtTrends {
  direction: 'improving' | 'stable' | 'worsening';
  note: string;
}

/** Result of the identify_tech_debt tool */
interface IdentifyTechDebtResult {
  score: number;
  grade: TechDebtGrade;
  summary: string;
  breakdown: TechDebtBreakdown;
  prioritized_issues: PrioritizedIssue[];
  trends?: TechDebtTrends;
}

// =============================================================================
// Weights
// =============================================================================

/** Default weights for each category (must sum to 100) */
const WEIGHTS: Record<TechDebtCategory, number> = {
  dead_code: 10,
  circular_deps: 15,
  security: 25,
  coverage: 20,
  type_errors: 20,
  todos: 10,
};

// =============================================================================
// Scoring Functions
// =============================================================================

/**
 * Score dead code count (0-100, higher = worse).
 * 0 = 0, 1-5 = 20, 6-15 = 40, 16-30 = 60, 31-50 = 80, 50+ = 100
 */
function scoreDeadCode(count: number): number {
  if (count === 0) return 0;
  if (count <= 5) return 20;
  if (count <= 15) return 40;
  if (count <= 30) return 60;
  if (count <= 50) return 80;
  return 100;
}

/**
 * Score circular dependencies (0-100, higher = worse).
 * Each cycle adds to the score exponentially.
 */
function scoreCircularDeps(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 30;
  if (count <= 3) return 50;
  if (count <= 5) return 70;
  if (count <= 10) return 85;
  return 100;
}

/**
 * Score security issues (0-100, higher = worse).
 * High issues are serious: high * 30 + medium * 10 + low * 2
 */
function scoreSecurity(high: number, medium: number, low: number): number {
  return Math.min(100, high * 30 + medium * 10 + low * 2);
}

/**
 * Score test coverage (0-100, higher = worse).
 * 100% coverage = 0 score, threshold coverage = 50 score, 0% coverage = 100 score
 */
function scoreCoverage(coveredPercent: number, threshold: number): number {
  if (coveredPercent >= 100) return 0;
  if (coveredPercent >= threshold) {
    return Math.round(50 * (100 - coveredPercent) / (100 - threshold));
  }
  return Math.round(50 + 50 * (threshold - coveredPercent) / threshold);
}

/**
 * Score type errors (0-100, higher = worse).
 * Each error adds significantly to the score.
 */
function scoreTypeErrors(count: number): number {
  if (count === 0) return 0;
  if (count <= 3) return 30;
  if (count <= 10) return 50;
  if (count <= 25) return 70;
  if (count <= 50) return 85;
  return 100;
}

/**
 * Score TODOs (0-100, higher = worse).
 * Considers both count and priority.
 */
function scoreTodos(highPriority: number, mediumPriority: number, lowPriority: number): number {
  const weightedCount = highPriority * 3 + mediumPriority * 1.5 + lowPriority * 0.5;
  if (weightedCount === 0) return 0;
  if (weightedCount <= 5) return 15;
  if (weightedCount <= 15) return 30;
  if (weightedCount <= 30) return 50;
  if (weightedCount <= 60) return 70;
  return 100;
}

/**
 * Convert overall score to letter grade.
 */
function scoreToGrade(score: number): TechDebtGrade {
  if (score < 20) return 'A';
  if (score < 40) return 'B';
  if (score < 60) return 'C';
  if (score < 80) return 'D';
  return 'F';
}

// =============================================================================
// Issue Prioritization
// =============================================================================

/** Maps issue types to severity */
function getIssueSeverity(type: string, context: Record<string, unknown> = {}): IssueSeverity {
  const severityMap: Record<string, IssueSeverity> = {
    security_high: 'critical',
    type_error: 'high',
    circular_dep: 'high',
    security_medium: 'high',
    todo_high: 'medium',
    dead_code: 'medium',
    coverage_gap: 'medium',
    security_low: 'low',
    todo_medium: 'low',
    todo_low: 'low',
  };
  return severityMap[type] || 'medium';
}

/** Estimates effort to fix an issue */
function estimateEffort(type: string, context: Record<string, unknown> = {}): EffortEstimate {
  const effortMap: Record<string, EffortEstimate> = {
    security_high: 'medium',
    security_medium: 'small',
    security_low: 'trivial',
    type_error: 'small',
    circular_dep: 'large',
    dead_code: 'trivial',
    coverage_gap: 'medium',
    todo_high: 'medium',
    todo_medium: 'small',
    todo_low: 'trivial',
  };
  return effortMap[type] || 'medium';
}

/** Generates a recommendation for an issue */
function getRecommendation(type: string, context: Record<string, unknown> = {}): string {
  const recommendationMap: Record<string, string> = {
    security_high: 'Immediately remove or rotate exposed credentials. Use environment variables.',
    security_medium: 'Move sensitive data to environment variables or secure configuration.',
    security_low: 'Consider using environment variables for consistency.',
    type_error: 'Fix TypeScript type errors to maintain type safety and prevent runtime bugs.',
    circular_dep: 'Refactor to break circular dependency. Consider extracting shared code to a new module.',
    dead_code: 'Remove unused export to reduce bundle size and maintenance burden.',
    coverage_gap: 'Add tests to cover uncovered code paths, especially for critical functions.',
    todo_high: 'Address this high-priority TODO/FIXME promptly.',
    todo_medium: 'Plan to address this TODO in an upcoming sprint.',
    todo_low: 'Consider addressing when working in this area.',
  };
  return recommendationMap[type] || 'Review and address this technical debt.';
}

/** Sorts issues by severity and effort */
function sortIssues(issues: PrioritizedIssue[]): PrioritizedIssue[] {
  const severityOrder: Record<IssueSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const effortOrder: Record<EffortEstimate, number> = {
    trivial: 0,
    small: 1,
    medium: 2,
    large: 3,
  };

  return issues.sort((a, b) => {
    // First by severity (most severe first)
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    // Then by effort (easiest first)
    return effortOrder[a.effort] - effortOrder[b.effort];
  });
}

// =============================================================================
// Analysis Functions
// =============================================================================

/** Analyze dead code */
async function analyzeDeadCode(
  scanPath: string
): Promise<{ count: number; issues: PrioritizedIssue[] }> {
  const result = await handleFindDeadCode({ path: scanPath, include_tests: false });

  if (result.isError) {
    return { count: 0, issues: [] };
  }

  try {
    const data = JSON.parse(result.content[0].text);
    const deadExports = data.dead_exports || [];

    const issues: PrioritizedIssue[] = deadExports.slice(0, 20).map((exp: { file: string; name: string; kind: string; line: number }) => ({
      type: 'dead_code',
      severity: getIssueSeverity('dead_code'),
      location: `${exp.file}:${exp.line}`,
      description: `Unused ${exp.kind} "${exp.name}"`,
      effort: estimateEffort('dead_code'),
      recommendation: getRecommendation('dead_code'),
    }));

    return { count: data.count || 0, issues };
  } catch {
    return { count: 0, issues: [] };
  }
}

/** Analyze circular dependencies */
async function analyzeCircularDeps(
  scanPath: string
): Promise<{ count: number; issues: PrioritizedIssue[] }> {
  const result = await handleFindCircularDeps({ path: scanPath, include_node_modules: false });

  if (result.isError) {
    return { count: 0, issues: [] };
  }

  try {
    const data = JSON.parse(result.content[0].text);
    const cycles = data.cycles || [];

    const issues: PrioritizedIssue[] = cycles.slice(0, 10).map((cycle: { path: string[]; length: number }) => ({
      type: 'circular_dep',
      severity: getIssueSeverity('circular_dep'),
      location: cycle.path[0],
      description: `Circular dependency: ${cycle.path.slice(0, 3).join(' -> ')}${cycle.length > 3 ? '...' : ''}`,
      effort: estimateEffort('circular_dep'),
      recommendation: getRecommendation('circular_dep'),
    }));

    return { count: data.count || 0, issues };
  } catch {
    return { count: 0, issues: [] };
  }
}

/** Analyze security issues */
async function analyzeSecurity(
  scanPath: string
): Promise<{ high: number; medium: number; low: number; issues: PrioritizedIssue[] }> {
  const result = await handleScanForSecrets({ path: scanPath, severity_threshold: 'low' });

  if (result.isError) {
    return { high: 0, medium: 0, low: 0, issues: [] };
  }

  try {
    const data = JSON.parse(result.content[0].text);
    const findings = data.findings || [];
    const bySeverity = data.by_severity || { high: 0, medium: 0, low: 0 };

    const issues: PrioritizedIssue[] = findings.slice(0, 15).map((finding: { file: string; line: number; secret_type: string; severity: string; recommendation: string }) => {
      const issueType = `security_${finding.severity}`;
      return {
        type: issueType,
        severity: getIssueSeverity(issueType),
        location: `${finding.file}:${finding.line}`,
        description: `Potential ${finding.secret_type} detected`,
        effort: estimateEffort(issueType),
        recommendation: finding.recommendation || getRecommendation(issueType),
      };
    });

    return {
      high: bySeverity.high || 0,
      medium: bySeverity.medium || 0,
      low: bySeverity.low || 0,
      issues,
    };
  } catch {
    return { high: 0, medium: 0, low: 0, issues: [] };
  }
}

/** Analyze test coverage */
async function analyzeCoverage(
  coverageThreshold: number
): Promise<{ uncoveredPercent: number; issues: PrioritizedIssue[] }> {
  const result = await handleGetTestCoverage({});

  if (result.isError) {
    // No coverage data available - return neutral score
    return { uncoveredPercent: 0, issues: [] };
  }

  try {
    const data = JSON.parse(result.content[0].text);
    const coverage = data.coverage || { lines: 0 };
    const coveredPercent = coverage.lines || 0;
    const uncoveredPercent = 100 - coveredPercent;

    const issues: PrioritizedIssue[] = [];
    const uncoveredFunctions = data.uncovered_functions || [];

    uncoveredFunctions.slice(0, 10).forEach((fn: { file: string; name: string; line: number }) => {
      issues.push({
        type: 'coverage_gap',
        severity: getIssueSeverity('coverage_gap'),
        location: `${fn.file}:${fn.line}`,
        description: `Uncovered function "${fn.name}"`,
        effort: estimateEffort('coverage_gap'),
        recommendation: getRecommendation('coverage_gap'),
      });
    });

    return { uncoveredPercent, issues };
  } catch {
    return { uncoveredPercent: 0, issues: [] };
  }
}

/** Analyze type errors */
async function analyzeTypeErrors(): Promise<{ count: number; issues: PrioritizedIssue[] }> {
  const result = await handleCheckTypes({ strict: false, include_suggestions: false });

  if (result.isError) {
    return { count: 0, issues: [] };
  }

  try {
    const data = JSON.parse(result.content[0].text);
    const errors = data.errors || [];
    const errorCount = errors.length;

    const issues: PrioritizedIssue[] = errors.slice(0, 15).map((error: { file: string; line: number; message: string }) => ({
      type: 'type_error',
      severity: getIssueSeverity('type_error'),
      location: `${error.file}:${error.line}`,
      description: error.message.slice(0, 100),
      effort: estimateEffort('type_error'),
      recommendation: getRecommendation('type_error'),
    }));

    return { count: errorCount, issues };
  } catch {
    return { count: 0, issues: [] };
  }
}

/** Scan for TODOs */
function analyzeTodos(scanPath: string): { high: number; medium: number; low: number; issues: PrioritizedIssue[] } {
  const items: TodoItem[] = [];

  try {
    scanDirectory(scanPath, scanPath, items, 500);
  } catch {
    return { high: 0, medium: 0, low: 0, issues: [] };
  }

  let high = 0;
  let medium = 0;
  let low = 0;

  for (const item of items) {
    if (item.priority === 'high') high++;
    else if (item.priority === 'medium') medium++;
    else low++;
  }

  const issues: PrioritizedIssue[] = items
    .filter(item => item.priority === 'high' || item.priority === 'medium')
    .slice(0, 15)
    .map(item => {
      const issueType = `todo_${item.priority}`;
      return {
        type: issueType,
        severity: getIssueSeverity(issueType),
        location: `${item.file}:${item.line}`,
        description: `${item.type}: ${item.text}`,
        effort: estimateEffort(issueType),
        recommendation: getRecommendation(issueType),
      };
    });

  return { high, medium, low, issues };
}

/** Generate summary message */
function generateSummary(score: number, grade: TechDebtGrade, breakdown: TechDebtBreakdown): string {
  const parts: string[] = [];

  // Main assessment
  if (grade === 'A') {
    parts.push('Excellent code health!');
  } else if (grade === 'B') {
    parts.push('Good code health with minor debt.');
  } else if (grade === 'C') {
    parts.push('Moderate technical debt detected.');
  } else if (grade === 'D') {
    parts.push('Significant technical debt present.');
  } else {
    parts.push('Critical technical debt requires attention.');
  }

  // Add specific concerns
  const concerns: string[] = [];

  if (breakdown.security_issues && breakdown.security_issues.high > 0) {
    concerns.push(`${breakdown.security_issues.high} high-severity security issues`);
  }
  if (breakdown.type_errors && breakdown.type_errors.count > 0) {
    concerns.push(`${breakdown.type_errors.count} type errors`);
  }
  if (breakdown.circular_deps && breakdown.circular_deps.count > 0) {
    concerns.push(`${breakdown.circular_deps.count} circular dependencies`);
  }
  if (breakdown.coverage_gaps && breakdown.coverage_gaps.uncovered_percent > 30) {
    concerns.push(`${Math.round(breakdown.coverage_gaps.uncovered_percent)}% uncovered code`);
  }

  if (concerns.length > 0) {
    parts.push(`Key concerns: ${concerns.slice(0, 3).join(', ')}.`);
  }

  return parts.join(' ');
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the identify_tech_debt MCP tool call.
 *
 * Aggregates multiple code quality signals to provide a comprehensive
 * technical debt assessment with prioritized issues and recommendations.
 *
 * @param args - The identify_tech_debt tool arguments
 * @returns MCP tool response with tech debt analysis
 */
export async function handleIdentifyTechDebt(
  args: IdentifyTechDebtArgs
): Promise<ToolResponse> {
  try {
    const scanPath = args.path
      ? path.isAbsolute(args.path)
        ? args.path
        : path.resolve(PROJECT_ROOT, args.path)
      : PROJECT_ROOT;

    const categoriesToInclude = args.include || [
      'dead_code',
      'circular_deps',
      'security',
      'coverage',
      'type_errors',
      'todos',
    ];
    const coverageThreshold = args.coverage_threshold ?? 80;
    const maxIssues = args.max_issues ?? 50;

    // Verify path exists
    if (!fs.existsSync(scanPath)) {
      return createErrorResponse(`Path does not exist: ${args.path || '.'}`);
    }

    // Run analyses in parallel for performance
    const analysisPromises: Promise<unknown>[] = [];
    const analysisOrder: TechDebtCategory[] = [];

    if (categoriesToInclude.includes('dead_code')) {
      analysisPromises.push(analyzeDeadCode(scanPath));
      analysisOrder.push('dead_code');
    }
    if (categoriesToInclude.includes('circular_deps')) {
      analysisPromises.push(analyzeCircularDeps(scanPath));
      analysisOrder.push('circular_deps');
    }
    if (categoriesToInclude.includes('security')) {
      analysisPromises.push(analyzeSecurity(scanPath));
      analysisOrder.push('security');
    }
    if (categoriesToInclude.includes('coverage')) {
      analysisPromises.push(analyzeCoverage(coverageThreshold));
      analysisOrder.push('coverage');
    }
    if (categoriesToInclude.includes('type_errors')) {
      analysisPromises.push(analyzeTypeErrors());
      analysisOrder.push('type_errors');
    }
    // TODOs are synchronous, run separately
    let todosResult = { high: 0, medium: 0, low: 0, issues: [] as PrioritizedIssue[] };
    if (categoriesToInclude.includes('todos')) {
      todosResult = analyzeTodos(scanPath);
    }

    // Wait for all async analyses
    const results = await Promise.all(analysisPromises);

    // Build breakdown and collect issues
    const breakdown: TechDebtBreakdown = {};
    const allIssues: PrioritizedIssue[] = [];
    let weightedScoreSum = 0;
    let totalWeight = 0;

    for (let i = 0; i < analysisOrder.length; i++) {
      const category = analysisOrder[i];
      const result = results[i] as Record<string, unknown>;
      const weight = WEIGHTS[category];

      switch (category) {
        case 'dead_code': {
          const data = result as { count: number; issues: PrioritizedIssue[] };
          const categoryScore = scoreDeadCode(data.count);
          breakdown.dead_code = { count: data.count, score: categoryScore, weight };
          weightedScoreSum += categoryScore * weight;
          totalWeight += weight;
          allIssues.push(...data.issues);
          break;
        }
        case 'circular_deps': {
          const data = result as { count: number; issues: PrioritizedIssue[] };
          const categoryScore = scoreCircularDeps(data.count);
          breakdown.circular_deps = { count: data.count, score: categoryScore, weight };
          weightedScoreSum += categoryScore * weight;
          totalWeight += weight;
          allIssues.push(...data.issues);
          break;
        }
        case 'security': {
          const data = result as { high: number; medium: number; low: number; issues: PrioritizedIssue[] };
          const categoryScore = scoreSecurity(data.high, data.medium, data.low);
          breakdown.security_issues = {
            high: data.high,
            medium: data.medium,
            low: data.low,
            count: data.high + data.medium + data.low,
            score: categoryScore,
            weight,
          };
          weightedScoreSum += categoryScore * weight;
          totalWeight += weight;
          allIssues.push(...data.issues);
          break;
        }
        case 'coverage': {
          const data = result as { uncoveredPercent: number; issues: PrioritizedIssue[] };
          const coveredPercent = 100 - data.uncoveredPercent;
          const categoryScore = scoreCoverage(coveredPercent, coverageThreshold);
          breakdown.coverage_gaps = {
            uncovered_percent: data.uncoveredPercent,
            count: data.issues.length,
            score: categoryScore,
            weight,
          };
          weightedScoreSum += categoryScore * weight;
          totalWeight += weight;
          allIssues.push(...data.issues);
          break;
        }
        case 'type_errors': {
          const data = result as { count: number; issues: PrioritizedIssue[] };
          const categoryScore = scoreTypeErrors(data.count);
          breakdown.type_errors = { count: data.count, score: categoryScore, weight };
          weightedScoreSum += categoryScore * weight;
          totalWeight += weight;
          allIssues.push(...data.issues);
          break;
        }
      }
    }

    // Add TODOs if included
    if (categoriesToInclude.includes('todos')) {
      const weight = WEIGHTS.todos;
      const categoryScore = scoreTodos(todosResult.high, todosResult.medium, todosResult.low);
      breakdown.todos = {
        count: todosResult.high + todosResult.medium + todosResult.low,
        score: categoryScore,
        weight,
      };
      weightedScoreSum += categoryScore * weight;
      totalWeight += weight;
      allIssues.push(...todosResult.issues);
    }

    // Calculate final score
    const finalScore = totalWeight > 0 ? Math.round(weightedScoreSum / totalWeight) : 0;
    const grade = scoreToGrade(finalScore);

    // Sort and limit issues
    const prioritizedIssues = sortIssues(allIssues).slice(0, maxIssues);

    // Generate summary
    const summary = generateSummary(finalScore, grade, breakdown);

    const result: IdentifyTechDebtResult = {
      score: finalScore,
      grade,
      summary,
      breakdown,
      prioritized_issues: prioritizedIssues,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to identify tech debt: ${message}`);
  }
}
