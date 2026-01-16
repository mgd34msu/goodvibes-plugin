/**
 * Unit tests for browser-automation handler
 *
 * Tests cover:
 * - handleBrowserAutomation main function
 * - All step executors (goto, click, type, wait, screenshot, assert, select, scroll)
 * - Helper functions (resolveUrl, generateScreenshotPath, ensureScreenshotsDir)
 * - Puppeteer availability checking
 * - Error handling and edge cases
 * - Console log collection
 * - Browser lifecycle management
 *
 * Target: 100% coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module before importing the handler
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('../../config.js', () => ({
  PROJECT_ROOT: '/mock/project/root',
}));

// =============================================================================
// Mock Page Factory
// =============================================================================

interface MockPage {
  setViewport: Mock;
  goto: Mock;
  click: Mock;
  type: Mock;
  waitForSelector: Mock;
  screenshot: Mock;
  select: Mock;
  evaluate: Mock;
  url: Mock;
  title: Mock;
  $: Mock;
  $$: Mock;
  on: Mock;
  _triggerConsole: (type: string, text: string) => void;
  _triggerPageError: (error: Error) => void;
}

interface MockBrowser {
  newPage: Mock;
  close: Mock;
}

function createMockPage(): MockPage {
  const consoleHandlers: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  return {
    setViewport: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    type: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('mock-screenshot')),
    select: vi.fn().mockResolvedValue(['value1']),
    evaluate: vi.fn().mockImplementation(() => {
      return Promise.resolve('mock-text-content');
    }),
    url: vi.fn().mockReturnValue('http://localhost:3000/page'),
    title: vi.fn().mockResolvedValue('Test Page Title'),
    $: vi.fn().mockResolvedValue({ mockElement: true }),
    $$: vi.fn().mockResolvedValue([{}, {}, {}]),
    on: vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
      if (!consoleHandlers.has(event)) {
        consoleHandlers.set(event, []);
      }
      consoleHandlers.get(event)!.push(handler);
    }),
    _triggerConsole: (type: string, text: string) => {
      const handlers = consoleHandlers.get('console');
      if (handlers) {
        handlers.forEach(h => h({ type: () => type, text: () => text }));
      }
    },
    _triggerPageError: (error: Error) => {
      const handlers = consoleHandlers.get('pageerror');
      if (handlers) {
        handlers.forEach(h => h(error));
      }
    },
  };
}

function createMockBrowser(mockPage: MockPage): MockBrowser {
  return {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// Dynamic Import Mocking
// =============================================================================

// Store puppeteer mock state
let puppeteerAvailable = true;
let mockPage: MockPage;
let mockBrowser: MockBrowser;
let mockPuppeteer: { launch: Mock };

// Mock the dynamic import of puppeteer
vi.mock('puppeteer', () => {
  return {
    default: {
      get launch() {
        if (!puppeteerAvailable) {
          throw new Error('Cannot find module puppeteer');
        }
        return mockPuppeteer?.launch ?? vi.fn();
      },
    },
  };
});

// Import after mocks are set up
import {
  handleBrowserAutomation,
  type BrowserAutomationArgs,
  type BrowserStep,
  type BrowserAutomationResult,
} from '../../../handlers/runtime/browser-automation.js';

// =============================================================================
// Tests
// =============================================================================

describe('browser-automation handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    puppeteerAvailable = true;
    mockPage = createMockPage();
    mockBrowser = createMockBrowser(mockPage);
    mockPuppeteer = {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    };

    // Mock fs functions
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // Argument Validation Tests
  // ===========================================================================

  describe('argument validation', () => {
    it('should return error when steps array is missing', async () => {
      const result = await handleBrowserAutomation({} as BrowserAutomationArgs);

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Missing required argument: steps');
    });

    it('should return error when steps is empty array', async () => {
      const result = await handleBrowserAutomation({ steps: [] });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('must be a non-empty array');
    });

    it('should return error when steps is not an array', async () => {
      const result = await handleBrowserAutomation({ steps: 'not-array' } as unknown as BrowserAutomationArgs);

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('must be a non-empty array');
    });

    it('should return error when steps is null', async () => {
      const result = await handleBrowserAutomation({ steps: null } as unknown as BrowserAutomationArgs);

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Missing required argument: steps');
    });

    it('should return error when steps is undefined', async () => {
      const result = await handleBrowserAutomation({ steps: undefined } as unknown as BrowserAutomationArgs);

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Missing required argument: steps');
    });
  });

  // ===========================================================================
  // Puppeteer Availability Tests
  // ===========================================================================

  describe('puppeteer availability', () => {
    it('should return error when puppeteer is not installed', async () => {
      puppeteerAvailable = false;

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://localhost:3000' }],
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Puppeteer is not installed');
      expect(data.installation).toBeDefined();
      expect(data.note).toBeDefined();
      expect(data.alternative).toBeDefined();
    });

    it('should provide npm installation command when puppeteer unavailable', async () => {
      puppeteerAvailable = false;

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://localhost:3000' }],
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.installation).toContain('npm install puppeteer');
    });
  });

  // ===========================================================================
  // Browser Launch Configuration Tests
  // ===========================================================================

  describe('browser launch configuration', () => {
    it('should launch browser in headless mode by default', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      expect(mockPuppeteer.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: 'shell',
        })
      );
    });

    it('should launch browser in headed mode when headless is false', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
        headless: false,
      });

      expect(mockPuppeteer.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: false,
        })
      );
    });

    it('should set custom viewport dimensions', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
        viewport: { width: 1920, height: 1080 },
      });

      expect(mockPuppeteer.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultViewport: { width: 1920, height: 1080 },
        })
      );
    });

    it('should use default viewport when not specified', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      expect(mockPuppeteer.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultViewport: { width: 1280, height: 720 },
        })
      );
    });

    it('should set slow_mo option when provided', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
        slow_mo: 100,
      });

      expect(mockPuppeteer.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          slowMo: 100,
        })
      );
    });

    it('should include no-sandbox args for containerized environments', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      expect(mockPuppeteer.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(['--no-sandbox', '--disable-setuid-sandbox']),
        })
      );
    });
  });

  // ===========================================================================
  // Console Log Collection Tests
  // ===========================================================================

  describe('console log collection', () => {
    it('should collect console logs from page', async () => {
      mockPage.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'console') {
          // Simulate console log after registration
          setImmediate(() => {
            handler({ type: () => 'log', text: () => 'Test log message' });
            handler({ type: () => 'info', text: () => 'Info message' });
          });
        }
      });

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      // Wait for async console events
      await new Promise(resolve => setImmediate(resolve));

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.console_logs).toBeDefined();
    });

    it('should collect console errors separately', async () => {
      mockPage.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'console') {
          setImmediate(() => {
            handler({ type: () => 'error', text: () => 'Console error message' });
          });
        }
      });

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      await new Promise(resolve => setImmediate(resolve));

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.console_errors).toBeDefined();
    });

    it('should collect page errors', async () => {
      mockPage.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'pageerror') {
          setImmediate(() => {
            handler(new Error('Uncaught page error'));
          });
        }
      });

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      await new Promise(resolve => setImmediate(resolve));

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.console_errors).toBeDefined();
    });
  });

  // ===========================================================================
  // Goto Step Tests
  // ===========================================================================

  describe('goto step', () => {
    it('should navigate to absolute URL', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'https://example.com' }],
      });

      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.steps[0].success).toBe(true);
    });

    it('should navigate to http URL', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      expect(mockPage.goto).toHaveBeenCalledWith('http://example.com', expect.any(Object));
    });

    it('should resolve relative URL with base_url', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: '/api/test' }],
        base_url: 'http://localhost:3000',
      });

      expect(mockPage.goto).toHaveBeenCalledWith('http://localhost:3000/api/test', expect.any(Object));
    });

    it('should handle base_url ending with slash', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: '/api/test' }],
        base_url: 'http://localhost:3000/',
      });

      expect(mockPage.goto).toHaveBeenCalledWith('http://localhost:3000/api/test', expect.any(Object));
    });

    it('should add slash to relative path without leading slash', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'api/test' }],
        base_url: 'http://localhost:3000',
      });

      expect(mockPage.goto).toHaveBeenCalledWith('http://localhost:3000/api/test', expect.any(Object));
    });

    it('should return error when url is missing for goto', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('URL is required');
    });

    it('should use custom timeout for goto', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com', timeout: 60000 }],
      });

      expect(mockPage.goto).toHaveBeenCalledWith('http://example.com', {
        timeout: 60000,
        waitUntil: 'networkidle2',
      });
    });

    it('should use default timeout when not specified', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      expect(mockPage.goto).toHaveBeenCalledWith('http://example.com', {
        timeout: 30000,
        waitUntil: 'networkidle2',
      });
    });

    it('should handle navigation error', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation timeout'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Navigation timeout');
    });

    it('should handle non-Error throws in goto', async () => {
      mockPage.goto.mockRejectedValue('string error');

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toBe('string error');
    });

    it('should handle empty URL with base_url', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: '' }],
        base_url: 'http://localhost:3000',
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
    });
  });

  // ===========================================================================
  // Click Step Tests
  // ===========================================================================

  describe('click step', () => {
    it('should click element by selector', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'click', selector: '#submit-button' }],
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#submit-button', {
        timeout: 30000,
        visible: true,
      });
      expect(mockPage.click).toHaveBeenCalledWith('#submit-button');

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(true);
      expect(data.steps[0].selector).toBe('#submit-button');
    });

    it('should return error when selector is missing for click', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'click' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Selector is required');
    });

    it('should use custom timeout for click', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'click', selector: '#btn', timeout: 5000 }],
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#btn', {
        timeout: 5000,
        visible: true,
      });
    });

    it('should handle click error', async () => {
      mockPage.click.mockRejectedValue(new Error('Element not clickable'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'click', selector: '#btn' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Element not clickable');
    });

    it('should handle waitForSelector timeout in click', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Timeout waiting for selector'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'click', selector: '#btn' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Timeout');
    });
  });

  // ===========================================================================
  // Type Step Tests
  // ===========================================================================

  describe('type step', () => {
    it('should type text into element', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'type', selector: '#username', text: 'testuser' }],
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#username', {
        timeout: 30000,
        visible: true,
      });
      expect(mockPage.type).toHaveBeenCalledWith('#username', 'testuser', { delay: 50 });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(true);
    });

    it('should return error when selector is missing for type', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'type', text: 'hello' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Selector is required');
    });

    it('should return error when text is missing for type', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'type', selector: '#input' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Text is required');
    });

    it('should return error when text is null for type', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'type', selector: '#input', text: null as unknown as string }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Text is required');
    });

    it('should allow empty string for text', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'type', selector: '#input', text: '' }],
      });

      expect(mockPage.type).toHaveBeenCalledWith('#input', '', { delay: 50 });
    });

    it('should use custom timeout for type', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'type', selector: '#input', text: 'test', timeout: 10000 }],
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#input', {
        timeout: 10000,
        visible: true,
      });
    });

    it('should handle type error', async () => {
      mockPage.type.mockRejectedValue(new Error('Element not typeable'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'type', selector: '#input', text: 'test' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Element not typeable');
    });
  });

  // ===========================================================================
  // Wait Step Tests
  // ===========================================================================

  describe('wait step', () => {
    it('should wait for selector', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'wait', selector: '.loading-complete' }],
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.loading-complete', {
        timeout: 30000,
        visible: true,
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(true);
      expect(data.steps[0].selector).toBe('.loading-complete');
    });

    it('should wait for specified timeout duration', async () => {
      const start = Date.now();
      const result = await handleBrowserAutomation({
        steps: [{ action: 'wait', timeout: 100 }],
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some tolerance

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(true);
    });

    it('should return error when neither selector nor timeout provided', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'wait' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Either selector or timeout is required');
    });

    it('should use custom timeout for selector wait', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'wait', selector: '.element', timeout: 5000 }],
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.element', {
        timeout: 5000,
        visible: true,
      });
    });

    it('should handle wait error', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Timeout waiting for selector'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'wait', selector: '.never-appears' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Timeout');
    });
  });

  // ===========================================================================
  // Screenshot Step Tests
  // ===========================================================================

  describe('screenshot step', () => {
    it('should take screenshot with auto-generated filename', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await handleBrowserAutomation({
        steps: [{ action: 'screenshot' }],
      });

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: expect.stringContaining('screenshot-'),
        fullPage: true,
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(true);
      expect(data.steps[0].screenshot_path).toContain('.png');
    });

    it('should take screenshot with custom filename', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'screenshot', filename: 'my-screenshot' }],
      });

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: expect.stringContaining('my-screenshot.png'),
        fullPage: true,
      });
    });

    it('should not add .png extension if already present', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'screenshot', filename: 'test-screenshot.png' }],
      });

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: expect.stringMatching(/test-screenshot\.png$/),
        fullPage: true,
      });
    });

    it('should create screenshots directory if it does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await handleBrowserAutomation({
        steps: [{ action: 'screenshot' }],
      });

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.goodvibes'),
        { recursive: true }
      );
    });

    it('should not create screenshots directory if it exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await handleBrowserAutomation({
        steps: [{ action: 'screenshot' }],
      });

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should handle screenshot error', async () => {
      mockPage.screenshot.mockRejectedValue(new Error('Screenshot failed'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'screenshot' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Screenshot failed');
    });
  });

  // ===========================================================================
  // Assert Step Tests
  // ===========================================================================

  describe('assert step', () => {
    describe('visible assertion', () => {
      it('should pass when element is visible', async () => {
        mockPage.$.mockResolvedValue({ mockElement: true });

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: '#visible-element',
            assertion: { type: 'visible' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(true);
      });

      it('should fail when element is not found', async () => {
        mockPage.$.mockResolvedValue(null);

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: '#missing-element',
            assertion: { type: 'visible' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('Element not found');
      });

      it('should fail when selector is missing for visible assertion', async () => {
        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            assertion: { type: 'visible' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('Selector is required');
      });
    });

    describe('hidden assertion', () => {
      it('should pass when element is hidden', async () => {
        mockPage.$.mockResolvedValue(null);

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: '#hidden-element',
            assertion: { type: 'hidden' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(true);
      });

      it('should fail when element is visible but should be hidden', async () => {
        mockPage.$.mockResolvedValue({ mockElement: true });

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: '#should-be-hidden',
            assertion: { type: 'hidden' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('should be hidden but is visible');
      });

      it('should fail when selector is missing for hidden assertion', async () => {
        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            assertion: { type: 'hidden' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('Selector is required');
      });
    });

    describe('text_contains assertion', () => {
      it('should pass when text is found on page', async () => {
        mockPage.evaluate.mockResolvedValue('Hello World, welcome to the page');

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: 'body',
            assertion: { type: 'text_contains', value: 'Hello World' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(true);
      });

      it('should fail when text is not found on page', async () => {
        mockPage.evaluate.mockResolvedValue('Some other content');

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: 'body',
            assertion: { type: 'text_contains', value: 'Missing Text' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('not found on page');
      });

      it('should fail when selector or value is missing for text_contains', async () => {
        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            assertion: { type: 'text_contains', value: 'test' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('Selector and value are required');
      });

      it('should fail when value is missing for text_contains', async () => {
        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: 'body',
            assertion: { type: 'text_contains' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('Selector and value are required');
      });
    });

    describe('url_contains assertion', () => {
      it('should pass when URL contains expected value', async () => {
        mockPage.url.mockReturnValue('http://localhost:3000/dashboard');

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            assertion: { type: 'url_contains', value: '/dashboard' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(true);
      });

      it('should fail when URL does not contain expected value', async () => {
        mockPage.url.mockReturnValue('http://localhost:3000/login');

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            assertion: { type: 'url_contains', value: '/dashboard' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('does not contain');
      });

      it('should fail when value is missing for url_contains', async () => {
        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            assertion: { type: 'url_contains' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('Value is required');
      });
    });

    describe('element_count assertion', () => {
      it('should pass when element count matches', async () => {
        mockPage.$$.mockResolvedValue([{}, {}, {}]);

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: '.item',
            assertion: { type: 'element_count', count: 3 },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(true);
      });

      it('should fail when element count does not match', async () => {
        mockPage.$$.mockResolvedValue([{}, {}]);

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: '.item',
            assertion: { type: 'element_count', count: 5 },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('Expected 5 elements but found 2');
      });

      it('should fail when selector or count is missing for element_count', async () => {
        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            assertion: { type: 'element_count', count: 5 },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('Selector and count are required');
      });

      it('should fail when count is undefined for element_count', async () => {
        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: '.item',
            assertion: { type: 'element_count' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('Selector and count are required');
      });

      it('should handle zero count assertion', async () => {
        mockPage.$$.mockResolvedValue([]);

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: '.item',
            assertion: { type: 'element_count', count: 0 },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(true);
      });
    });

    describe('assert error handling', () => {
      it('should return error when assertion config is missing', async () => {
        const result = await handleBrowserAutomation({
          steps: [{ action: 'assert' }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('Assertion configuration is required');
      });

      it('should handle unknown assertion type', async () => {
        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            assertion: { type: 'unknown_type' as 'visible' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('Unknown assertion type');
      });

      it('should handle assertion execution error', async () => {
        mockPage.$.mockRejectedValue(new Error('DOM query failed'));

        const result = await handleBrowserAutomation({
          steps: [{
            action: 'assert',
            selector: '#element',
            assertion: { type: 'visible' },
          }],
        });

        const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
        expect(data.steps[0].success).toBe(false);
        expect(data.steps[0].error).toContain('DOM query failed');
      });
    });
  });

  // ===========================================================================
  // Select Step Tests
  // ===========================================================================

  describe('select step', () => {
    it('should select option from dropdown', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'select', selector: '#country', value: 'us' }],
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#country', {
        timeout: 30000,
        visible: true,
      });
      expect(mockPage.select).toHaveBeenCalledWith('#country', 'us');

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(true);
    });

    it('should return error when selector is missing for select', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'select', value: 'option1' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Selector is required');
    });

    it('should return error when value is missing for select', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'select', selector: '#dropdown' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Value is required');
    });

    it('should use custom timeout for select', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'select', selector: '#dropdown', value: 'opt', timeout: 15000 }],
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#dropdown', {
        timeout: 15000,
        visible: true,
      });
    });

    it('should handle select error', async () => {
      mockPage.select.mockRejectedValue(new Error('Option not found'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'select', selector: '#dropdown', value: 'invalid' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Option not found');
    });
  });

  // ===========================================================================
  // Scroll Step Tests
  // ===========================================================================

  describe('scroll step', () => {
    it('should scroll element into view', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'scroll', selector: '#target-section' }],
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#target-section', {
        timeout: 30000,
      });
      expect(mockPage.evaluate).toHaveBeenCalled();

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(true);
    });

    it('should scroll to specific position', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'scroll', position: { x: 0, y: 500 } }],
      });

      expect(mockPage.evaluate).toHaveBeenCalled();

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(true);
    });

    it('should return error when neither selector nor position provided', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'scroll' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Either selector or position is required');
    });

    it('should use custom timeout for scroll', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'scroll', selector: '#element', timeout: 20000 }],
      });

      expect(mockPage.waitForSelector).toHaveBeenCalledWith('#element', {
        timeout: 20000,
      });
    });

    it('should handle scroll error', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Scroll failed'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'scroll', position: { x: 0, y: 100 } }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Scroll failed');
    });

    it('should handle waitForSelector error in scroll', async () => {
      mockPage.waitForSelector.mockRejectedValue(new Error('Element not found'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'scroll', selector: '#missing' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Element not found');
    });
  });

  // ===========================================================================
  // Unknown Action Tests
  // ===========================================================================

  describe('unknown action', () => {
    it('should handle unknown action type', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'unknown-action' as BrowserStep['action'] }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].success).toBe(false);
      expect(data.steps[0].error).toContain('Unknown action');
    });
  });

  // ===========================================================================
  // Multi-Step Workflow Tests
  // ===========================================================================

  describe('multi-step workflows', () => {
    it('should execute multiple steps in sequence', async () => {
      const result = await handleBrowserAutomation({
        steps: [
          { action: 'goto', url: 'http://example.com' },
          { action: 'click', selector: '#button' },
          { action: 'type', selector: '#input', text: 'hello' },
          { action: 'screenshot', filename: 'result' },
        ],
      });

      expect(mockPage.goto).toHaveBeenCalledTimes(1);
      expect(mockPage.click).toHaveBeenCalledTimes(1);
      expect(mockPage.type).toHaveBeenCalledTimes(1);
      expect(mockPage.screenshot).toHaveBeenCalledTimes(1);

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps).toHaveLength(4);
      expect(data.steps.every(s => s.success)).toBe(true);
    });

    it('should continue executing steps after a failure', async () => {
      mockPage.click.mockRejectedValue(new Error('Click failed'));

      const result = await handleBrowserAutomation({
        steps: [
          { action: 'goto', url: 'http://example.com' },
          { action: 'click', selector: '#missing' },
          { action: 'screenshot' },
        ],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.success).toBe(false);
      expect(data.steps).toHaveLength(3);
      expect(data.steps[0].success).toBe(true);
      expect(data.steps[1].success).toBe(false);
      expect(data.steps[2].success).toBe(true);
    });

    it('should apply slow_mo delay between steps', async () => {
      const start = Date.now();
      const result = await handleBrowserAutomation({
        steps: [
          { action: 'goto', url: 'http://example.com' },
          { action: 'click', selector: '#btn1' },
          { action: 'click', selector: '#btn2' },
        ],
        slow_mo: 50,
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(100); // 2 delays of 50ms each
    });

    it('should not apply slow_mo delay when not configured', async () => {
      const start = Date.now();
      const result = await handleBrowserAutomation({
        steps: [
          { action: 'goto', url: 'http://example.com' },
          { action: 'click', selector: '#btn1' },
        ],
      });

      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(200);
    });
  });

  // ===========================================================================
  // Result Format Tests
  // ===========================================================================

  describe('result format', () => {
    it('should return final URL after all steps', async () => {
      mockPage.url.mockReturnValue('http://example.com/final');

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.final_url).toBe('http://example.com/final');
    });

    it('should return page title after all steps', async () => {
      mockPage.title.mockResolvedValue('Final Page Title');

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.page_title).toBe('Final Page Title');
    });

    it('should return total duration', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.total_duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should return step durations', async () => {
      const result = await handleBrowserAutomation({
        steps: [
          { action: 'goto', url: 'http://example.com' },
          { action: 'click', selector: '#btn' },
        ],
      });

      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.steps[0].duration_ms).toBeGreaterThanOrEqual(0);
      expect(data.steps[1].duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should return properly formatted MCP response', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should return valid JSON in response', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  // ===========================================================================
  // Browser Lifecycle Tests
  // ===========================================================================

  describe('browser lifecycle', () => {
    it('should close browser after successful automation', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });

    it('should close browser after failed automation', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });

    it('should handle browser close error gracefully', async () => {
      mockBrowser.close.mockRejectedValue(new Error('Close failed'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      // Should not throw, just ignore cleanup error
      const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
    });

    it('should handle browser launch error', async () => {
      mockPuppeteer.launch.mockRejectedValue(new Error('Failed to launch browser'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Failed to launch browser');
    });

    it('should include console logs on error', async () => {
      mockPuppeteer.launch.mockRejectedValue(new Error('Launch error'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('console_logs');
      expect(data).toHaveProperty('console_errors');
    });

    it('should handle page creation error', async () => {
      mockBrowser.newPage.mockRejectedValue(new Error('Cannot create page'));

      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://example.com' }],
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('Cannot create page');
    });
  });

  // ===========================================================================
  // URL Resolution Edge Cases
  // ===========================================================================

  describe('URL resolution edge cases', () => {
    it('should handle absolute https URL ignoring base_url', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'https://other.com/page' }],
        base_url: 'http://localhost:3000',
      });

      expect(mockPage.goto).toHaveBeenCalledWith('https://other.com/page', expect.any(Object));
    });

    it('should handle absolute http URL ignoring base_url', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: 'http://other.com/page' }],
        base_url: 'https://localhost:3000',
      });

      expect(mockPage.goto).toHaveBeenCalledWith('http://other.com/page', expect.any(Object));
    });

    it('should pass through relative URL without base_url', async () => {
      const result = await handleBrowserAutomation({
        steps: [{ action: 'goto', url: '/path/to/page' }],
      });

      expect(mockPage.goto).toHaveBeenCalledWith('/path/to/page', expect.any(Object));
    });
  });
});

// ===========================================================================
// Complex Automation Workflow Tests
// ===========================================================================

describe('complex automation workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    puppeteerAvailable = true;
    mockPage = createMockPage();
    mockBrowser = createMockBrowser(mockPage);
    mockPuppeteer = {
      launch: vi.fn().mockResolvedValue(mockBrowser),
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('should handle complete login workflow', async () => {
    const result = await handleBrowserAutomation({
      steps: [
        { action: 'goto', url: 'http://localhost:3000/login' },
        { action: 'wait', selector: '.login-form' },
        { action: 'type', selector: '#email', text: 'user@example.com' },
        { action: 'type', selector: '#password', text: 'password123' },
        { action: 'click', selector: '#submit' },
        { action: 'wait', selector: '.dashboard' },
        { action: 'assert', selector: '.welcome', assertion: { type: 'visible' } },
        { action: 'screenshot', filename: 'dashboard' },
      ],
      viewport: { width: 1920, height: 1080 },
      headless: true,
      base_url: 'http://localhost:3000',
    });

    const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
    expect(data.steps).toHaveLength(8);
    expect(data.success).toBe(true);
  });

  it('should handle form submission with assertions', async () => {
    mockPage.url.mockReturnValue('http://localhost:3000/success');

    const result = await handleBrowserAutomation({
      steps: [
        { action: 'goto', url: '/form' },
        { action: 'select', selector: '#country', value: 'us' },
        { action: 'type', selector: '#name', text: 'John Doe' },
        { action: 'click', selector: 'button[type="submit"]' },
        { action: 'assert', assertion: { type: 'url_contains', value: '/success' } },
      ],
      base_url: 'http://localhost:3000',
    });

    const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);
  });

  it('should handle scroll and assertion workflow', async () => {
    mockPage.$$.mockResolvedValue([{}, {}, {}, {}, {}]);
    mockPage.evaluate.mockResolvedValue('Page content with all items loaded');

    const result = await handleBrowserAutomation({
      steps: [
        { action: 'goto', url: '/list' },
        { action: 'scroll', position: { x: 0, y: 1000 } },
        { action: 'wait', selector: '.loaded' },
        { action: 'assert', selector: '.item', assertion: { type: 'element_count', count: 5 } },
        {
          action: 'assert',
          selector: 'body',
          assertion: { type: 'text_contains', value: 'all items loaded' },
        },
      ],
      base_url: 'http://localhost:3000',
    });

    const data: BrowserAutomationResult = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);
  });
});
