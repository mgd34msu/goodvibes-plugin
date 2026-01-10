/**
 * Visual regression testing handler
 *
 * Provides the visual_regression MCP tool for comparing screenshots
 * to detect visual changes in web pages or components.
 *
 * Dependencies (optional):
 * - puppeteer: For taking screenshots
 * - pixelmatch: For pixel-level image comparison
 * - pngjs: For PNG encoding/decoding
 *
 * If dependencies are not installed, the tool will return an error
 * with instructions on how to install them.
 *
 * @module handlers/runtime/visual-regression
 */

import * as fs from 'fs';
import * as path from 'path';
import { ToolResponse } from '../../types.js';
import { PROJECT_ROOT } from '../../config.js';

/**
 * Arguments for the visual_regression MCP tool
 */
export interface VisualRegressionArgs {
  /** URL of the page to screenshot */
  url: string;
  /** CSS selector for specific element (full page if not provided) */
  selector?: string;
  /** Path to baseline image for comparison */
  baseline_path: string;
  /** Acceptable diff ratio 0-1 (default: 0.01 = 1%) */
  threshold?: number;
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** CSS selector to wait for before taking screenshot */
  wait_for?: string;
  /** Timeout in ms for page load (default: 30000) */
  timeout?: number;
  /** If true, save current screenshot as new baseline */
  update_baseline?: boolean;
}

/**
 * Result of visual regression comparison
 */
export interface VisualRegressionResult {
  /** Whether the images match within threshold */
  match: boolean;
  /** Ratio of different pixels (0-1) */
  diff_ratio: number;
  /** Number of pixels that differ */
  diff_pixels: number;
  /** Total pixels in image */
  total_pixels: number;
  /** Threshold used for comparison */
  threshold: number;
  /** Path to baseline image */
  baseline_path: string;
  /** Path to actual screenshot */
  actual_path: string;
  /** Path to diff image (only if mismatch) */
  diff_path?: string;
  /** Image dimensions */
  dimensions: { width: number; height: number };
  /** Whether baseline existed before this run */
  baseline_exists: boolean;
  /** Whether baseline was updated in this run */
  baseline_updated: boolean;
}

/**
 * Directory structure for visual regression files
 */
const VR_DIRS = {
  root: '.goodvibes/visual-regression',
  baselines: '.goodvibes/visual-regression/baselines',
  actual: '.goodvibes/visual-regression/actual',
  diffs: '.goodvibes/visual-regression/diffs',
};

/**
 * Ensure visual regression directories exist
 */
function ensureDirectories(projectPath: string): void {
  for (const dir of Object.values(VR_DIRS)) {
    const fullPath = path.join(projectPath, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

/**
 * Generate a safe filename from URL
 */
function urlToFilename(url: string, selector?: string): string {
  const urlPart = url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(0, 100);

  const selectorPart = selector
    ? '_' + selector.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50)
    : '';

  return `${urlPart}${selectorPart}.png`;
}

// =============================================================================
// Optional Dependency Types
// =============================================================================

/**
 * Puppeteer module interface (minimal subset we use)
 */
interface PuppeteerModule {
  launch(options?: {
    headless?: boolean | 'new';
    args?: string[];
  }): Promise<PuppeteerBrowser>;
}

interface PuppeteerBrowser {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
}

interface PuppeteerPage {
  setViewport(viewport: { width: number; height: number }): Promise<void>;
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<void>;
  $(selector: string): Promise<PuppeteerElementHandle | null>;
  screenshot(options?: { fullPage?: boolean }): Promise<Buffer | Uint8Array>;
}

interface PuppeteerElementHandle {
  screenshot(): Promise<Buffer | Uint8Array>;
}

/**
 * Pixelmatch function type
 */
type PixelmatchFn = (
  img1: Uint8Array | Uint8ClampedArray,
  img2: Uint8Array | Uint8ClampedArray,
  output: Uint8Array | Uint8ClampedArray | null,
  width: number,
  height: number,
  options?: { threshold?: number; includeAA?: boolean }
) => number;

/**
 * PNG module interface (minimal subset we use)
 */
interface PNGModule {
  PNG: {
    new (options?: { width: number; height: number }): PNGImage;
    sync: {
      read(buffer: Buffer): PNGImage;
      write(png: PNGImage): Buffer;
    };
  };
}

interface PNGImage {
  width: number;
  height: number;
  data: Uint8Array;
}

// =============================================================================
// Dynamic Imports
// =============================================================================

/**
 * Dynamically import puppeteer
 */
async function loadPuppeteer(): Promise<PuppeteerModule> {
  try {
    // @ts-expect-error - puppeteer is an optional peer dependency
    const puppeteer = await import('puppeteer');
    return puppeteer.default || puppeteer;
  } catch {
    throw new Error(
      'puppeteer is not installed. Install it with: npm install puppeteer'
    );
  }
}

/**
 * Dynamically import pixelmatch
 */
async function loadPixelmatch(): Promise<PixelmatchFn> {
  try {
    // @ts-expect-error - pixelmatch is an optional peer dependency
    const module = await import('pixelmatch');
    return module.default || module;
  } catch {
    throw new Error(
      'pixelmatch is not installed. Install it with: npm install pixelmatch'
    );
  }
}

/**
 * Dynamically import pngjs
 */
async function loadPngjs(): Promise<PNGModule> {
  try {
    // @ts-expect-error - pngjs is an optional peer dependency
    return await import('pngjs');
  } catch {
    throw new Error(
      'pngjs is not installed. Install it with: npm install pngjs'
    );
  }
}

/**
 * Take a screenshot of a URL
 */
async function takeScreenshot(
  url: string,
  options: {
    selector?: string;
    viewport?: { width: number; height: number };
    waitFor?: string;
    timeout?: number;
  }
): Promise<Buffer> {
  const puppeteer = await loadPuppeteer();

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Set viewport
    const viewport = options.viewport || { width: 1280, height: 720 };
    await page.setViewport(viewport);

    // Navigate to URL
    const timeout = options.timeout || 30000;
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    });

    // Wait for specific element if requested
    if (options.waitFor) {
      await page.waitForSelector(options.waitFor, { timeout });
    }

    // Take screenshot
    let screenshot: Buffer;
    if (options.selector) {
      const element = await page.$(options.selector);
      if (!element) {
        throw new Error(`Element not found: ${options.selector}`);
      }
      screenshot = (await element.screenshot()) as Buffer;
    } else {
      screenshot = (await page.screenshot({ fullPage: true })) as Buffer;
    }

    return screenshot;
  } finally {
    await browser.close();
  }
}

/**
 * Compare two PNG buffers and return diff information
 */
async function compareImages(
  baselineBuffer: Buffer,
  actualBuffer: Buffer,
  diffPath: string,
  threshold: number
): Promise<{
  match: boolean;
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  dimensions: { width: number; height: number };
  diffImageSaved: boolean;
}> {
  const pixelmatch = await loadPixelmatch();
  const { PNG } = await loadPngjs();

  // Decode PNG images
  const baseline = PNG.sync.read(baselineBuffer);
  const actual = PNG.sync.read(actualBuffer);

  // Check dimensions match
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    throw new Error(
      `Image dimensions mismatch: baseline is ${baseline.width}x${baseline.height}, ` +
        `actual is ${actual.width}x${actual.height}`
    );
  }

  const { width, height } = baseline;
  const totalPixels = width * height;

  // Create diff image buffer
  const diff = new PNG({ width, height });

  // Compare images
  const diffPixels = pixelmatch(
    baseline.data,
    actual.data,
    diff.data,
    width,
    height,
    {
      threshold: 0.1, // Per-pixel color threshold
      includeAA: false, // Exclude anti-aliasing differences
    }
  );

  const diffRatio = diffPixels / totalPixels;
  const match = diffRatio <= threshold;

  // Save diff image only if there's a mismatch
  let diffImageSaved = false;
  if (!match) {
    const diffBuffer = PNG.sync.write(diff);
    fs.writeFileSync(diffPath, diffBuffer);
    diffImageSaved = true;
  }

  return {
    match,
    diffPixels,
    totalPixels,
    diffRatio,
    dimensions: { width, height },
    diffImageSaved,
  };
}

/**
 * Handles the visual_regression MCP tool call.
 *
 * Takes a screenshot of a URL and compares it against a baseline image.
 * Supports element-specific screenshots via CSS selector.
 *
 * @param args - The visual_regression tool arguments
 * @returns MCP tool response with comparison results
 *
 * @example
 * // First run - creates baseline
 * await handleVisualRegression({
 *   url: 'http://localhost:3000',
 *   baseline_path: 'homepage',
 * });
 *
 * @example
 * // Subsequent runs - compares against baseline
 * await handleVisualRegression({
 *   url: 'http://localhost:3000',
 *   baseline_path: 'homepage',
 *   threshold: 0.01,
 * });
 *
 * @example
 * // Update baseline with current screenshot
 * await handleVisualRegression({
 *   url: 'http://localhost:3000',
 *   baseline_path: 'homepage',
 *   update_baseline: true,
 * });
 */
export async function handleVisualRegression(
  args: VisualRegressionArgs
): Promise<ToolResponse> {
  const projectPath = PROJECT_ROOT;
  const threshold = args.threshold ?? 0.01;

  try {
    // Ensure directories exist
    ensureDirectories(projectPath);

    // Generate filename from URL (or use provided baseline_path as-is if it looks like a filename)
    const filename = args.baseline_path.endsWith('.png')
      ? args.baseline_path
      : urlToFilename(args.url, args.selector);

    // Construct file paths
    const baselinePath = path.join(
      projectPath,
      VR_DIRS.baselines,
      args.baseline_path.endsWith('.png')
        ? args.baseline_path
        : `${args.baseline_path}.png`
    );
    const actualPath = path.join(
      projectPath,
      VR_DIRS.actual,
      filename.replace('.png', `_${Date.now()}.png`)
    );
    const diffPath = path.join(
      projectPath,
      VR_DIRS.diffs,
      filename.replace('.png', `_diff_${Date.now()}.png`)
    );

    // Check if baseline exists
    const baselineExists = fs.existsSync(baselinePath);

    // Take screenshot
    const screenshotBuffer = await takeScreenshot(args.url, {
      selector: args.selector,
      viewport: args.viewport,
      waitFor: args.wait_for,
      timeout: args.timeout,
    });

    // Save actual screenshot
    fs.writeFileSync(actualPath, screenshotBuffer);

    // If update_baseline is true, save as new baseline
    if (args.update_baseline) {
      fs.writeFileSync(baselinePath, screenshotBuffer);

      // Get image dimensions
      const { PNG } = await loadPngjs();
      const png = PNG.sync.read(screenshotBuffer);

      const result: VisualRegressionResult = {
        match: true,
        diff_ratio: 0,
        diff_pixels: 0,
        total_pixels: png.width * png.height,
        threshold,
        baseline_path: baselinePath,
        actual_path: actualPath,
        dimensions: { width: png.width, height: png.height },
        baseline_exists: baselineExists,
        baseline_updated: true,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    // If baseline doesn't exist, create it
    if (!baselineExists) {
      fs.writeFileSync(baselinePath, screenshotBuffer);

      // Get image dimensions
      const { PNG } = await loadPngjs();
      const png = PNG.sync.read(screenshotBuffer);

      const result: VisualRegressionResult = {
        match: true,
        diff_ratio: 0,
        diff_pixels: 0,
        total_pixels: png.width * png.height,
        threshold,
        baseline_path: baselinePath,
        actual_path: actualPath,
        dimensions: { width: png.width, height: png.height },
        baseline_exists: false,
        baseline_updated: true,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...result,
                message:
                  'Baseline created. Run again to compare against this baseline.',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Compare against baseline
    const baselineBuffer = fs.readFileSync(baselinePath);
    const comparison = await compareImages(
      baselineBuffer,
      screenshotBuffer,
      diffPath,
      threshold
    );

    const result: VisualRegressionResult = {
      match: comparison.match,
      diff_ratio: comparison.diffRatio,
      diff_pixels: comparison.diffPixels,
      total_pixels: comparison.totalPixels,
      threshold,
      baseline_path: baselinePath,
      actual_path: actualPath,
      diff_path: comparison.diffImageSaved ? diffPath : undefined,
      dimensions: comparison.dimensions,
      baseline_exists: true,
      baseline_updated: false,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: !comparison.match,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Check for missing dependency errors and provide helpful messages
    if (message.includes('is not installed')) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: message,
                instructions:
                  'Visual regression testing requires optional dependencies. Install them with:\n' +
                  'npm install puppeteer pixelmatch pngjs',
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: message }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
