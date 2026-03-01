/**
 * Testing Domain — L1 Core Barrel
 *
 * @module core/testing
 */

export type {
  TestCoverageArgs,
  CoverageMetrics,
  UncoveredLines,
  UncoveredFunction,
  CoverageReportType,
  CoverageResult,
  LcovFileCoverage,
  IstanbulFileCoverage,
  FindTestsArgs,
  TestType,
  TestFile,
  FindTestsResult,
} from './types.js';

export { COVERAGE_PATHS, TEST_PATTERNS } from './constants.js';

export {
  findCoverageReport,
  detectCoverageType,
  parseLcov,
  parseIstanbul,
  calculateCoverageMetrics,
  extractUncoveredLines,
  extractUncoveredFunctions,
} from './coverage-parser.js';

export {
  findTestFiles,
  determineTestType,
  parseTestImports,
  checkImportRelationship,
  calculatePatternConfidence,
  scoreTestFiles,
} from './test-finder.js';
