/**
 * Runtime verification tool schemas - browser automation, lighthouse, visual regression
 */

export const RUNTIME_SCHEMAS = [
  {
    name: 'browser_automation',
    description: 'Automate browser interactions using Puppeteer. Execute sequences of actions (navigate, click, type, scroll, screenshot) and assertions (element exists, text contains, attribute matches). Returns step-by-step results with screenshots. Requires puppeteer to be installed.',
    inputSchema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['navigate', 'click', 'type', 'scroll', 'screenshot', 'wait', 'select', 'hover'] },
              selector: { type: 'string' },
              value: { type: 'string' },
              timeout: { type: 'integer' },
            },
          },
          description: 'Sequence of browser actions to perform',
        },
        assertions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['exists', 'not_exists', 'text_contains', 'text_equals', 'attribute_equals', 'visible', 'enabled'] },
              selector: { type: 'string' },
              expected: { type: 'string' },
              attribute: { type: 'string' },
            },
          },
          description: 'Assertions to verify after steps complete',
        },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'integer' },
            height: { type: 'integer' },
          },
          description: 'Browser viewport size (default: 1280x720)',
        },
        headless: {
          type: 'boolean',
          description: 'Run in headless mode (default: true)',
          default: true,
        },
        base_url: {
          type: 'string',
          description: 'Base URL for relative navigation',
        },
      },
      required: ['steps'],
    },
  },
  {
    name: 'verify_runtime_behavior',
    description: 'Verify runtime behavior by executing code and checking results. Runs JavaScript/TypeScript code in a Node.js environment and verifies the output matches expectations. Useful for testing functions, API responses, and data transformations.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript/TypeScript code to execute',
        },
        file: {
          type: 'string',
          description: 'File path to execute (alternative to inline code)',
        },
        expected: {
          type: 'object',
          description: 'Expected result to verify against',
        },
        timeout: {
          type: 'integer',
          description: 'Execution timeout in ms (default: 10000)',
          default: 10000,
        },
        setup: {
          type: 'string',
          description: 'Setup code to run before main code',
        },
      },
    },
  },
  {
    name: 'lighthouse_audit',
    description: 'Run Lighthouse audits on a URL. Returns scores for performance, accessibility, best practices, SEO, and PWA. Includes detailed metrics and improvement suggestions. Requires lighthouse and chrome-launcher packages.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to audit',
        },
        categories: {
          type: 'array',
          items: { type: 'string', enum: ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'] },
          description: 'Categories to audit (default: all)',
        },
        device: {
          type: 'string',
          enum: ['mobile', 'desktop'],
          description: 'Device to emulate (default: mobile)',
          default: 'mobile',
        },
        throttling: {
          type: 'boolean',
          description: 'Apply network/CPU throttling (default: true)',
          default: true,
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'visual_regression',
    description: 'Visual regression testing by comparing screenshots. Takes a screenshot of a URL or element and compares against a baseline image using pixel-by-pixel comparison. Returns match status, diff percentage, and diff image path. Requires puppeteer, pixelmatch, and pngjs packages.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to screenshot',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for element screenshot (optional, full page if omitted)',
        },
        baseline_path: {
          type: 'string',
          description: 'Path to baseline image for comparison',
        },
        threshold: {
          type: 'number',
          description: 'Acceptable diff ratio 0-1 (default: 0.01 = 1%)',
          default: 0.01,
        },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'integer' },
            height: { type: 'integer' },
          },
          description: 'Viewport size for screenshot',
        },
        wait_for: {
          type: 'string',
          description: 'CSS selector to wait for before screenshot',
        },
        update_baseline: {
          type: 'boolean',
          description: 'Save current as new baseline instead of comparing',
          default: false,
        },
      },
      required: ['url', 'baseline_path'],
    },
  },
];
