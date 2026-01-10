/**
 * Lighthouse Audit Handler
 *
 * Runs Google Lighthouse performance audits on a URL and returns
 * structured performance metrics, opportunities, and diagnostics.
 *
 * Lighthouse is an optional dependency - the tool gracefully handles
 * its absence with clear installation instructions.
 *
 * @module handlers/runtime/lighthouse-audit
 */

import * as path from 'path';
import * as fsPromises from 'fs/promises';
import { spawn } from 'child_process';
import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';
import { fileExists } from '../../utils.js';

/**
 * Lighthouse category types
 */
export type LighthouseCategory =
  | 'performance'
  | 'accessibility'
  | 'best-practices'
  | 'seo'
  | 'pwa';

/**
 * Device emulation type
 */
export type DeviceType = 'mobile' | 'desktop';

/**
 * Arguments for the lighthouse_audit MCP tool
 */
export interface LighthouseAuditArgs {
  /** URL to audit (must be accessible) */
  url: string;
  /** Categories to audit (default: all) */
  categories?: LighthouseCategory[];
  /** Device to emulate (default: mobile) */
  device?: DeviceType;
  /** Enable network throttling (default: true for mobile) */
  throttling?: boolean;
  /** Path to save full HTML/JSON report */
  output_path?: string;
}

/**
 * Score results from Lighthouse
 */
interface LighthouseScores {
  performance?: number;
  accessibility?: number;
  best_practices?: number;
  seo?: number;
  pwa?: number;
}

/**
 * Core Web Vitals and performance metrics
 */
interface LighthouseMetrics {
  first_contentful_paint_ms: number;
  largest_contentful_paint_ms: number;
  cumulative_layout_shift: number;
  total_blocking_time_ms: number;
  speed_index_ms: number;
  time_to_interactive_ms: number;
}

/**
 * Optimization opportunity from Lighthouse
 */
interface LighthouseOpportunity {
  id: string;
  title: string;
  description: string;
  savings_ms?: number;
  savings_bytes?: number;
}

/**
 * Diagnostic information from Lighthouse
 */
interface LighthouseDiagnostic {
  id: string;
  title: string;
  description: string;
  displayValue?: string;
}

/**
 * Complete Lighthouse audit result
 */
interface LighthouseAuditResult {
  url: string;
  fetch_time: string;
  scores: LighthouseScores;
  metrics: LighthouseMetrics;
  opportunities: LighthouseOpportunity[];
  diagnostics: LighthouseDiagnostic[];
  passed_audits: number;
  failed_audits: number;
  report_path?: string;
}

/**
 * Lighthouse report structure (subset of actual report)
 */
interface LighthouseReport {
  finalUrl: string;
  fetchTime: string;
  categories: Record<
    string,
    {
      id: string;
      title: string;
      score: number | null;
    }
  >;
  audits: Record<
    string,
    {
      id: string;
      title: string;
      description: string;
      score: number | null;
      scoreDisplayMode: string;
      numericValue?: number;
      numericUnit?: string;
      displayValue?: string;
      details?: {
        type: string;
        overallSavingsMs?: number;
        overallSavingsBytes?: number;
        items?: Array<Record<string, unknown>>;
      };
    }
  >;
}

/**
 * Check if lighthouse is available
 */
async function checkLighthouseAvailable(): Promise<{
  available: boolean;
  method: 'programmatic' | 'cli' | null;
  error?: string;
}> {
  // Try programmatic import first
  try {
    // @ts-ignore - lighthouse is an optional dependency
    await import('lighthouse');
    return { available: true, method: 'programmatic' };
  } catch {
    // Programmatic not available
  }

  // Try CLI
  return new Promise((resolve) => {
    const proc = spawn('npx', ['lighthouse', '--version'], {
      shell: true,
      stdio: 'pipe',
      timeout: 10000,
    });

    let output = '';
    proc.stdout?.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && output.trim()) {
        resolve({ available: true, method: 'cli' });
      } else {
        resolve({
          available: false,
          method: null,
          error:
            'Lighthouse is not installed. Install with: npm install -g lighthouse',
        });
      }
    });

    proc.on('error', () => {
      resolve({
        available: false,
        method: null,
        error:
          'Lighthouse is not installed. Install with: npm install -g lighthouse',
      });
    });
  });
}

/**
 * Run Lighthouse via CLI (fallback method)
 */
async function runLighthouseCli(
  url: string,
  args: LighthouseAuditArgs
): Promise<LighthouseReport> {
  const categories = args.categories || [
    'performance',
    'accessibility',
    'best-practices',
    'seo',
  ];

  const cliArgs = [
    'lighthouse',
    url,
    '--output=json',
    '--quiet',
    '--chrome-flags="--headless --no-sandbox --disable-gpu"',
    `--only-categories=${categories.join(',')}`,
  ];

  if (args.device === 'desktop') {
    cliArgs.push('--preset=desktop');
  }

  if (args.throttling === false) {
    cliArgs.push('--throttling-method=provided');
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('npx', cliArgs, {
      shell: true,
      stdio: 'pipe',
      timeout: 120000, // 2 minute timeout
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          const report = JSON.parse(stdout) as LighthouseReport;
          resolve(report);
        } catch {
          reject(new Error(`Failed to parse Lighthouse output: ${stdout.slice(0, 200)}`));
        }
      } else {
        reject(new Error(`Lighthouse CLI failed (code ${code}): ${stderr || 'Unknown error'}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Lighthouse: ${err.message}`));
    });
  });
}

/**
 * Run Lighthouse programmatically
 */
async function runLighthouseProgrammatic(
  url: string,
  args: LighthouseAuditArgs
): Promise<LighthouseReport> {
  // Dynamic import lighthouse
  // @ts-ignore - lighthouse is an optional dependency
  const lighthouseModule = await import('lighthouse');
  const lighthouse = lighthouseModule.default;

  // Dynamic import chrome-launcher if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chromeLauncher: any;
  try {
    // @ts-ignore - chrome-launcher is an optional dependency
    chromeLauncher = await import('chrome-launcher');
  } catch {
    throw new Error(
      'chrome-launcher is required for programmatic Lighthouse. Install with: npm install chrome-launcher'
    );
  }

  const categories = args.categories || [
    'performance',
    'accessibility',
    'best-practices',
    'seo',
  ];

  // Launch Chrome
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
  });

  try {
    // Get lighthouse constants for throttling
    const constants = lighthouseModule.constants || lighthouseModule.default?.constants;

    // Determine throttling settings
    const useThrottling = args.throttling !== false;
    const isMobile = args.device !== 'desktop';

    let throttlingConfig;
    if (useThrottling && constants?.throttling) {
      throttlingConfig = isMobile
        ? constants.throttling.mobileSlow4G
        : constants.throttling.desktopDense4G;
    }

    const options = {
      port: chrome.port,
      logLevel: 'error' as const,
      output: 'json' as const,
      onlyCategories: categories,
      formFactor: isMobile ? 'mobile' as const : 'desktop' as const,
      screenEmulation: isMobile
        ? { mobile: true, width: 375, height: 667, deviceScaleFactor: 2 }
        : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1 },
      ...(throttlingConfig && { throttling: throttlingConfig }),
    };

    const result = await lighthouse(url, options);

    if (!result?.lhr) {
      throw new Error('Lighthouse returned no results');
    }

    return result.lhr as unknown as LighthouseReport;
  } finally {
    await chrome.kill();
  }
}

/**
 * Extract scores from Lighthouse report
 */
function extractScores(report: LighthouseReport): LighthouseScores {
  const scores: LighthouseScores = {};

  const categoryMap: Record<string, keyof LighthouseScores> = {
    'performance': 'performance',
    'accessibility': 'accessibility',
    'best-practices': 'best_practices',
    'seo': 'seo',
    'pwa': 'pwa',
  };

  for (const [id, key] of Object.entries(categoryMap)) {
    const category = report.categories[id];
    if (category?.score !== null && category?.score !== undefined) {
      scores[key] = Math.round(category.score * 100);
    }
  }

  return scores;
}

/**
 * Extract Core Web Vitals metrics from Lighthouse report
 */
function extractMetrics(report: LighthouseReport): LighthouseMetrics {
  const audits = report.audits;

  const getNumericValue = (auditId: string): number => {
    const audit = audits[auditId];
    if (audit?.numericValue !== undefined) {
      return Math.round(audit.numericValue);
    }
    return 0;
  };

  return {
    first_contentful_paint_ms: getNumericValue('first-contentful-paint'),
    largest_contentful_paint_ms: getNumericValue('largest-contentful-paint'),
    cumulative_layout_shift: parseFloat(
      (audits['cumulative-layout-shift']?.numericValue || 0).toFixed(3)
    ),
    total_blocking_time_ms: getNumericValue('total-blocking-time'),
    speed_index_ms: getNumericValue('speed-index'),
    time_to_interactive_ms: getNumericValue('interactive'),
  };
}

/**
 * Extract optimization opportunities from Lighthouse report
 */
function extractOpportunities(report: LighthouseReport): LighthouseOpportunity[] {
  const opportunities: LighthouseOpportunity[] = [];

  for (const [id, audit] of Object.entries(report.audits)) {
    // Opportunities have a score < 1 and provide savings
    if (
      audit.score !== null &&
      audit.score < 1 &&
      audit.details &&
      (audit.details.overallSavingsMs || audit.details.overallSavingsBytes)
    ) {
      opportunities.push({
        id,
        title: audit.title,
        description: audit.description,
        savings_ms: audit.details.overallSavingsMs,
        savings_bytes: audit.details.overallSavingsBytes,
      });
    }
  }

  // Sort by savings (time first, then bytes)
  opportunities.sort((a, b) => {
    const aSavings = (a.savings_ms || 0) + (a.savings_bytes || 0) / 1000;
    const bSavings = (b.savings_ms || 0) + (b.savings_bytes || 0) / 1000;
    return bSavings - aSavings;
  });

  return opportunities.slice(0, 10); // Top 10 opportunities
}

/**
 * Extract diagnostic information from Lighthouse report
 */
function extractDiagnostics(report: LighthouseReport): LighthouseDiagnostic[] {
  const diagnostics: LighthouseDiagnostic[] = [];

  // Key diagnostic audits
  const diagnosticIds = [
    'dom-size',
    'mainthread-work-breakdown',
    'bootup-time',
    'network-requests',
    'network-rtt',
    'network-server-latency',
    'total-byte-weight',
    'render-blocking-resources',
    'uses-long-cache-ttl',
    'third-party-summary',
  ];

  for (const id of diagnosticIds) {
    const audit = report.audits[id];
    if (audit && audit.score !== null) {
      diagnostics.push({
        id,
        title: audit.title,
        description: audit.description,
        displayValue: audit.displayValue,
      });
    }
  }

  return diagnostics;
}

/**
 * Count passed and failed audits
 */
function countAudits(report: LighthouseReport): {
  passed: number;
  failed: number;
} {
  let passed = 0;
  let failed = 0;

  for (const audit of Object.values(report.audits)) {
    if (audit.score === null || audit.scoreDisplayMode === 'notApplicable') {
      continue;
    }
    if (audit.score >= 0.9) {
      passed++;
    } else {
      failed++;
    }
  }

  return { passed, failed };
}

/**
 * Save report to file
 */
async function saveReport(
  report: LighthouseReport,
  outputPath: string
): Promise<string> {
  const resolvedPath = path.resolve(PROJECT_ROOT, outputPath);
  const dir = path.dirname(resolvedPath);

  // Ensure directory exists
  await fsPromises.mkdir(dir, { recursive: true });

  // Determine format from extension
  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === '.html') {
    // For HTML, we'd need the HTML report which requires re-running lighthouse
    // For simplicity, save as JSON with .html extension warning
    const jsonPath = resolvedPath.replace(/\.html$/, '.json');
    await fsPromises.writeFile(jsonPath, JSON.stringify(report, null, 2));
    return jsonPath;
  } else {
    // Default to JSON
    const jsonPath = ext === '.json' ? resolvedPath : `${resolvedPath}.json`;
    await fsPromises.writeFile(jsonPath, JSON.stringify(report, null, 2));
    return jsonPath;
  }
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Handles the lighthouse_audit MCP tool call.
 *
 * Runs a Lighthouse performance audit on the specified URL and returns
 * structured results including scores, metrics, opportunities, and diagnostics.
 *
 * @param args - The lighthouse_audit tool arguments
 * @returns MCP tool response with audit results
 */
export async function handleLighthouseAudit(
  args: LighthouseAuditArgs
): Promise<ToolResponse> {
  // Validate URL
  if (!args.url) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: 'URL is required',
              hint: 'Provide a valid HTTP/HTTPS URL to audit',
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  if (!isValidUrl(args.url)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: 'Invalid URL format',
              url: args.url,
              hint: 'URL must start with http:// or https://',
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  // Check if lighthouse is available
  const availability = await checkLighthouseAvailable();

  if (!availability.available) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: 'Lighthouse is not available',
              hint: availability.error,
              install_commands: [
                'npm install -g lighthouse',
                '# or for programmatic use:',
                'npm install lighthouse chrome-launcher',
              ],
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }

  try {
    // Run Lighthouse
    let report: LighthouseReport;

    if (availability.method === 'programmatic') {
      try {
        report = await runLighthouseProgrammatic(args.url, args);
      } catch (progError) {
        // Fall back to CLI if programmatic fails
        report = await runLighthouseCli(args.url, args);
      }
    } else {
      report = await runLighthouseCli(args.url, args);
    }

    // Extract results
    const scores = extractScores(report);
    const metrics = extractMetrics(report);
    const opportunities = extractOpportunities(report);
    const diagnostics = extractDiagnostics(report);
    const { passed, failed } = countAudits(report);

    // Build result
    const result: LighthouseAuditResult = {
      url: report.finalUrl || args.url,
      fetch_time: report.fetchTime || new Date().toISOString(),
      scores,
      metrics,
      opportunities,
      diagnostics,
      passed_audits: passed,
      failed_audits: failed,
    };

    // Save report if requested
    if (args.output_path) {
      try {
        const savedPath = await saveReport(report, args.output_path);
        result.report_path = savedPath;
      } catch (saveError) {
        // Non-fatal - include warning but still return results
        const errorMessage = saveError instanceof Error ? saveError.message : 'Unknown error';
        result.report_path = `Failed to save: ${errorMessage}`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: 'Lighthouse audit failed',
              message,
              url: args.url,
              hints: [
                'Ensure the URL is accessible',
                'Check if Chrome/Chromium is installed',
                'Try running with --no-sandbox flag',
                'Verify network connectivity',
              ],
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}
