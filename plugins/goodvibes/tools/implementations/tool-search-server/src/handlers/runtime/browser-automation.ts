/**
 * Browser Automation Handler
 *
 * Provides browser automation capabilities using Puppeteer.
 * Puppeteer is an optional peer dependency - the tool gracefully handles
 * cases where it's not installed.
 *
 * @module handlers/runtime/browser-automation
 */

import * as path from 'path';
import * as fs from 'fs';
import { PROJECT_ROOT } from '../../config.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Assertion configuration for assert action.
 */
export interface BrowserAssertion {
  /** Type of assertion to perform */
  type: 'visible' | 'hidden' | 'text_contains' | 'url_contains' | 'element_count';
  /** Value for text/url assertions */
  value?: string;
  /** Expected count for element_count assertion */
  count?: number;
}

/**
 * Position for scroll action.
 */
export interface ScrollPosition {
  x: number;
  y: number;
}

/**
 * A single automation step.
 */
export interface BrowserStep {
  /** Action to perform */
  action: 'goto' | 'click' | 'type' | 'wait' | 'screenshot' | 'assert' | 'select' | 'scroll';
  /** CSS selector for element-based actions */
  selector?: string;
  /** URL for goto action */
  url?: string;
  /** Text for type action */
  text?: string;
  /** Value for select action */
  value?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Filename for screenshot action */
  filename?: string;
  /** Assertion configuration */
  assertion?: BrowserAssertion;
  /** Position for scroll action */
  position?: ScrollPosition;
}

/**
 * Viewport configuration.
 */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Arguments for the browser_automation tool.
 */
export interface BrowserAutomationArgs {
  /** List of automation steps to execute */
  steps: BrowserStep[];
  /** Browser viewport dimensions */
  viewport?: Viewport;
  /** Run browser in headless mode (default: true) */
  headless?: boolean;
  /** Base URL to prepend to relative URLs */
  base_url?: string;
  /** Delay between actions in milliseconds */
  slow_mo?: number;
}

/**
 * Result of a single step execution.
 */
export interface StepResult {
  /** Action that was performed */
  action: string;
  /** Selector used (if any) */
  selector?: string;
  /** Whether step succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Path to screenshot if screenshot action */
  screenshot_path?: string;
  /** Duration of step in milliseconds */
  duration_ms: number;
}

/**
 * Result from the browser_automation tool.
 */
export interface BrowserAutomationResult {
  /** Overall success status */
  success: boolean;
  /** Results from each step */
  steps: StepResult[];
  /** Console log messages from the page */
  console_logs: string[];
  /** Console error messages from the page */
  console_errors: string[];
  /** Final URL after all steps */
  final_url: string;
  /** Page title after all steps */
  page_title: string;
  /** Total execution time in milliseconds */
  total_duration_ms: number;
}

/**
 * Standard MCP tool response format.
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Puppeteer Dynamic Import
// =============================================================================

/**
 * Puppeteer types - simplified interfaces for optional dependency.
 * These match the puppeteer API surface we use.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Puppeteer module type (simplified) */
interface PuppeteerModule {
  launch: (options: PuppeteerLaunchOptions) => Promise<Browser>;
}

/** Browser instance type */
interface Browser {
  newPage: () => Promise<Page>;
  close: () => Promise<void>;
}

/** Page instance type - using 'any' for evaluate since puppeteer types are complex */
interface Page {
  setViewport: (viewport: Viewport) => Promise<void>;
  goto: (url: string, options?: { timeout?: number; waitUntil?: string }) => Promise<unknown>;
  click: (selector: string, options?: { timeout?: number }) => Promise<void>;
  type: (selector: string, text: string, options?: { delay?: number }) => Promise<void>;
  waitForSelector: (selector: string, options?: { timeout?: number; visible?: boolean; hidden?: boolean }) => Promise<unknown>;
  screenshot: (options?: { path?: string; fullPage?: boolean }) => Promise<Buffer>;
  select: (selector: string, ...values: string[]) => Promise<string[]>;
  evaluate: <T>(fn: (...args: any[]) => T, ...args: any[]) => Promise<T>;
  url: () => string;
  title: () => Promise<string>;
  $: (selector: string) => Promise<unknown | null>;
  $$: (selector: string) => Promise<unknown[]>;
  on: (event: string, handler: (...args: any[]) => void) => void;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Console message type from puppeteer (simplified) */
interface ConsoleMessage {
  type: () => string;
  text: () => string;
}

/** Puppeteer launch options */
interface PuppeteerLaunchOptions {
  headless?: boolean | 'shell';
  slowMo?: number;
  args?: string[];
  defaultViewport?: Viewport | null;
}

/**
 * Attempt to dynamically import puppeteer.
 * Returns null if puppeteer is not installed.
 */
async function getPuppeteer(): Promise<PuppeteerModule | null> {
  try {
    // Dynamic import of optional peer dependency
    // @ts-expect-error - puppeteer may not be installed
    const puppeteer = await import('puppeteer');
    return puppeteer.default || puppeteer;
  } catch {
    return null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** Default timeout for actions */
const DEFAULT_TIMEOUT = 30000;

/** Screenshots directory */
const SCREENSHOTS_DIR = path.join(PROJECT_ROOT, '.goodvibes', 'screenshots');

/**
 * Ensure screenshots directory exists.
 */
function ensureScreenshotsDir(): void {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

/**
 * Create a success response.
 */
function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create an error response.
 */
function createErrorResponse(message: string, context?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

/**
 * Resolve URL with optional base URL.
 */
function resolveUrl(url: string, baseUrl?: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (baseUrl) {
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${base}${path}`;
  }
  return url;
}

/**
 * Generate unique screenshot filename.
 */
function generateScreenshotPath(filename?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = filename || `screenshot-${timestamp}.png`;
  const finalName = name.endsWith('.png') ? name : `${name}.png`;
  return path.join(SCREENSHOTS_DIR, finalName);
}

// =============================================================================
// Step Executors
// =============================================================================

/**
 * Execute a goto step.
 */
async function executeGoto(
  page: Page,
  step: BrowserStep,
  baseUrl?: string
): Promise<StepResult> {
  const start = Date.now();
  try {
    if (!step.url) {
      return {
        action: 'goto',
        success: false,
        error: 'URL is required for goto action',
        duration_ms: Date.now() - start,
      };
    }
    const url = resolveUrl(step.url, baseUrl);
    await page.goto(url, {
      timeout: step.timeout || DEFAULT_TIMEOUT,
      waitUntil: 'networkidle2',
    });
    return {
      action: 'goto',
      success: true,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      action: 'goto',
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Execute a click step.
 */
async function executeClick(page: Page, step: BrowserStep): Promise<StepResult> {
  const start = Date.now();
  try {
    if (!step.selector) {
      return {
        action: 'click',
        success: false,
        error: 'Selector is required for click action',
        duration_ms: Date.now() - start,
      };
    }
    await page.waitForSelector(step.selector, {
      timeout: step.timeout || DEFAULT_TIMEOUT,
      visible: true,
    });
    await page.click(step.selector);
    return {
      action: 'click',
      selector: step.selector,
      success: true,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      action: 'click',
      selector: step.selector,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Execute a type step.
 */
async function executeType(page: Page, step: BrowserStep): Promise<StepResult> {
  const start = Date.now();
  try {
    if (!step.selector) {
      return {
        action: 'type',
        success: false,
        error: 'Selector is required for type action',
        duration_ms: Date.now() - start,
      };
    }
    if (step.text === undefined || step.text === null) {
      return {
        action: 'type',
        selector: step.selector,
        success: false,
        error: 'Text is required for type action',
        duration_ms: Date.now() - start,
      };
    }
    await page.waitForSelector(step.selector, {
      timeout: step.timeout || DEFAULT_TIMEOUT,
      visible: true,
    });
    await page.type(step.selector, step.text, { delay: 50 });
    return {
      action: 'type',
      selector: step.selector,
      success: true,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      action: 'type',
      selector: step.selector,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Execute a wait step.
 */
async function executeWait(page: Page, step: BrowserStep): Promise<StepResult> {
  const start = Date.now();
  try {
    if (step.selector) {
      // Wait for selector
      await page.waitForSelector(step.selector, {
        timeout: step.timeout || DEFAULT_TIMEOUT,
        visible: true,
      });
    } else if (step.timeout) {
      // Wait for specified time
      await new Promise((resolve) => setTimeout(resolve, step.timeout));
    } else {
      return {
        action: 'wait',
        success: false,
        error: 'Either selector or timeout is required for wait action',
        duration_ms: Date.now() - start,
      };
    }
    return {
      action: 'wait',
      selector: step.selector,
      success: true,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      action: 'wait',
      selector: step.selector,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Execute a screenshot step.
 */
async function executeScreenshot(page: Page, step: BrowserStep): Promise<StepResult> {
  const start = Date.now();
  try {
    ensureScreenshotsDir();
    const screenshotPath = generateScreenshotPath(step.filename);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return {
      action: 'screenshot',
      success: true,
      screenshot_path: screenshotPath,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      action: 'screenshot',
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Execute an assert step.
 */
async function executeAssert(page: Page, step: BrowserStep): Promise<StepResult> {
  const start = Date.now();
  try {
    if (!step.assertion) {
      return {
        action: 'assert',
        success: false,
        error: 'Assertion configuration is required for assert action',
        duration_ms: Date.now() - start,
      };
    }

    const { type, value, count } = step.assertion;

    switch (type) {
      case 'visible': {
        if (!step.selector) {
          return {
            action: 'assert',
            success: false,
            error: 'Selector is required for visible assertion',
            duration_ms: Date.now() - start,
          };
        }
        const element = await page.$(step.selector);
        if (!element) {
          return {
            action: 'assert',
            selector: step.selector,
            success: false,
            error: `Element not found: ${step.selector}`,
            duration_ms: Date.now() - start,
          };
        }
        return {
          action: 'assert',
          selector: step.selector,
          success: true,
          duration_ms: Date.now() - start,
        };
      }

      case 'hidden': {
        if (!step.selector) {
          return {
            action: 'assert',
            success: false,
            error: 'Selector is required for hidden assertion',
            duration_ms: Date.now() - start,
          };
        }
        const hiddenElement = await page.$(step.selector);
        if (hiddenElement) {
          return {
            action: 'assert',
            selector: step.selector,
            success: false,
            error: `Element should be hidden but is visible: ${step.selector}`,
            duration_ms: Date.now() - start,
          };
        }
        return {
          action: 'assert',
          selector: step.selector,
          success: true,
          duration_ms: Date.now() - start,
        };
      }

      case 'text_contains': {
        if (!step.selector || !value) {
          return {
            action: 'assert',
            success: false,
            error: 'Selector and value are required for text_contains assertion',
            duration_ms: Date.now() - start,
          };
        }
        const textContent = await page.evaluate(() => document.body.innerText);
        if (!textContent.includes(value)) {
          return {
            action: 'assert',
            selector: step.selector,
            success: false,
            error: `Text "${value}" not found on page`,
            duration_ms: Date.now() - start,
          };
        }
        return {
          action: 'assert',
          selector: step.selector,
          success: true,
          duration_ms: Date.now() - start,
        };
      }

      case 'url_contains': {
        if (!value) {
          return {
            action: 'assert',
            success: false,
            error: 'Value is required for url_contains assertion',
            duration_ms: Date.now() - start,
          };
        }
        const currentUrl = page.url();
        if (!currentUrl.includes(value)) {
          return {
            action: 'assert',
            success: false,
            error: `URL "${currentUrl}" does not contain "${value}"`,
            duration_ms: Date.now() - start,
          };
        }
        return {
          action: 'assert',
          success: true,
          duration_ms: Date.now() - start,
        };
      }

      case 'element_count': {
        if (!step.selector || count === undefined) {
          return {
            action: 'assert',
            success: false,
            error: 'Selector and count are required for element_count assertion',
            duration_ms: Date.now() - start,
          };
        }
        const elements = await page.$$(step.selector);
        if (elements.length !== count) {
          return {
            action: 'assert',
            selector: step.selector,
            success: false,
            error: `Expected ${count} elements but found ${elements.length}`,
            duration_ms: Date.now() - start,
          };
        }
        return {
          action: 'assert',
          selector: step.selector,
          success: true,
          duration_ms: Date.now() - start,
        };
      }

      default:
        return {
          action: 'assert',
          success: false,
          error: `Unknown assertion type: ${type}`,
          duration_ms: Date.now() - start,
        };
    }
  } catch (err) {
    return {
      action: 'assert',
      selector: step.selector,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Execute a select step.
 */
async function executeSelect(page: Page, step: BrowserStep): Promise<StepResult> {
  const start = Date.now();
  try {
    if (!step.selector) {
      return {
        action: 'select',
        success: false,
        error: 'Selector is required for select action',
        duration_ms: Date.now() - start,
      };
    }
    if (!step.value) {
      return {
        action: 'select',
        selector: step.selector,
        success: false,
        error: 'Value is required for select action',
        duration_ms: Date.now() - start,
      };
    }
    await page.waitForSelector(step.selector, {
      timeout: step.timeout || DEFAULT_TIMEOUT,
      visible: true,
    });
    await page.select(step.selector, step.value);
    return {
      action: 'select',
      selector: step.selector,
      success: true,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      action: 'select',
      selector: step.selector,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Execute a scroll step.
 */
async function executeScroll(page: Page, step: BrowserStep): Promise<StepResult> {
  const start = Date.now();
  try {
    if (step.selector) {
      // Scroll element into view
      await page.waitForSelector(step.selector, {
        timeout: step.timeout || DEFAULT_TIMEOUT,
      });
      await page.evaluate((selector: string) => {
        const element = document.querySelector(selector);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, step.selector);
    } else if (step.position) {
      // Scroll to specific position
      await page.evaluate((pos: ScrollPosition) => {
        window.scrollTo({ left: pos.x, top: pos.y, behavior: 'smooth' });
      }, step.position);
    } else {
      return {
        action: 'scroll',
        success: false,
        error: 'Either selector or position is required for scroll action',
        duration_ms: Date.now() - start,
      };
    }
    // Small delay for smooth scroll animation
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      action: 'scroll',
      selector: step.selector,
      success: true,
      duration_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      action: 'scroll',
      selector: step.selector,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - start,
    };
  }
}

/**
 * Execute a single step.
 */
async function executeStep(
  page: Page,
  step: BrowserStep,
  baseUrl?: string
): Promise<StepResult> {
  switch (step.action) {
    case 'goto':
      return executeGoto(page, step, baseUrl);
    case 'click':
      return executeClick(page, step);
    case 'type':
      return executeType(page, step);
    case 'wait':
      return executeWait(page, step);
    case 'screenshot':
      return executeScreenshot(page, step);
    case 'assert':
      return executeAssert(page, step);
    case 'select':
      return executeSelect(page, step);
    case 'scroll':
      return executeScroll(page, step);
    default:
      return {
        action: step.action,
        success: false,
        error: `Unknown action: ${step.action}`,
        duration_ms: 0,
      };
  }
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the browser_automation MCP tool call.
 *
 * Executes a sequence of browser automation steps using Puppeteer.
 * Puppeteer must be installed as an optional dependency - if not available,
 * returns an error explaining how to install it.
 *
 * @param args - The browser_automation tool arguments
 * @returns MCP tool response with automation results
 *
 * @example
 * ```typescript
 * const result = await handleBrowserAutomation({
 *   steps: [
 *     { action: 'goto', url: 'https://example.com' },
 *     { action: 'click', selector: '#login-button' },
 *     { action: 'type', selector: '#username', text: 'user@example.com' },
 *     { action: 'screenshot', filename: 'login-page' }
 *   ],
 *   headless: true
 * });
 * ```
 */
export async function handleBrowserAutomation(
  args: BrowserAutomationArgs
): Promise<ToolResponse> {
  const totalStart = Date.now();

  // Validate required arguments
  if (!args.steps || !Array.isArray(args.steps) || args.steps.length === 0) {
    return createErrorResponse('Missing required argument: steps (must be a non-empty array)');
  }

  // Try to load puppeteer
  const puppeteer = await getPuppeteer();
  if (!puppeteer) {
    return createErrorResponse(
      'Puppeteer is not installed. Browser automation requires puppeteer as an optional dependency.',
      {
        installation: 'Run: npm install puppeteer',
        note: 'Puppeteer will download a bundled Chromium browser (~170MB)',
        alternative: 'For smaller install: npm install puppeteer-core (requires separate Chrome installation)',
      }
    );
  }

  // Set up console message collectors
  const consoleLogs: string[] = [];
  const consoleErrors: string[] = [];

  // Launch browser
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    const launchOptions: PuppeteerLaunchOptions = {
      headless: args.headless !== false ? 'shell' : false,
      slowMo: args.slow_mo,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: args.viewport || { width: 1280, height: 720 },
    };

    browser = await puppeteer.launch(launchOptions);
    page = await browser.newPage();

    // Set up console listeners
    page.on('console', (msg: ConsoleMessage) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        consoleErrors.push(text);
      } else {
        consoleLogs.push(`[${type}] ${text}`);
      }
    });

    page.on('pageerror', (err: Error) => {
      consoleErrors.push(err.message);
    });

    // Execute steps
    const stepResults: StepResult[] = [];
    let allSucceeded = true;

    for (const step of args.steps) {
      const result = await executeStep(page, step, args.base_url);
      stepResults.push(result);

      if (!result.success) {
        allSucceeded = false;
        // Continue executing remaining steps or break on error
        // For now, continue to allow capturing more state
      }

      // Apply slow_mo delay between steps if configured
      if (args.slow_mo && args.slow_mo > 0) {
        await new Promise((resolve) => setTimeout(resolve, args.slow_mo));
      }
    }

    // Get final state
    const finalUrl = page.url();
    const pageTitle = await page.title();

    const result: BrowserAutomationResult = {
      success: allSucceeded,
      steps: stepResults,
      console_logs: consoleLogs,
      console_errors: consoleErrors,
      final_url: finalUrl,
      page_title: pageTitle,
      total_duration_ms: Date.now() - totalStart,
    };

    return createSuccessResponse(result);
  } catch (err) {
    return createErrorResponse(
      err instanceof Error ? err.message : String(err),
      {
        steps_completed: [],
        console_logs: consoleLogs,
        console_errors: consoleErrors,
        total_duration_ms: Date.now() - totalStart,
      }
    );
  } finally {
    // Always close browser
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
