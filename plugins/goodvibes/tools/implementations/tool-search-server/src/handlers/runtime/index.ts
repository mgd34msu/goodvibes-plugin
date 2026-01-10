/**
 * Runtime handlers
 *
 * Provides MCP tools for runtime operations including:
 * - HTTP request/response verification against running servers
 * - Lighthouse performance audits
 * - Browser automation using Puppeteer
 *
 * @module handlers/runtime
 */

// Runtime behavior verification
export { handleVerifyRuntimeBehavior } from './verify-behavior.js';
export type { VerifyRuntimeBehaviorArgs } from './verify-behavior.js';

// Lighthouse performance audits
export { handleLighthouseAudit } from './lighthouse-audit.js';
export type {
  LighthouseAuditArgs,
  LighthouseCategory,
  DeviceType,
} from './lighthouse-audit.js';

// Browser automation
export { handleBrowserAutomation } from './browser-automation.js';
export type {
  BrowserAutomationArgs,
  BrowserAutomationResult,
  BrowserStep,
  BrowserAssertion,
  StepResult,
  Viewport,
  ScrollPosition,
} from './browser-automation.js';

// Visual regression testing
export { handleVisualRegression } from './visual-regression.js';
export type {
  VisualRegressionArgs,
  VisualRegressionResult,
} from './visual-regression.js';
