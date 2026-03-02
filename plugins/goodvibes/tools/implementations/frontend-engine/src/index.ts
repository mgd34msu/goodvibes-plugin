#!/usr/bin/env node
/**
 * Frontend Engine MCP Server — Entry Point
 *
 * React/CSS analysis tools for frontend development.
 *
 * Tools (14):
 * - frontend_component_tree: Build component hierarchy from JSX/TSX
 * - frontend_stacking_context: Analyze z-index and stacking contexts
 * - frontend_responsive_breakpoints: Analyze Tailwind responsive classes
 * - frontend_component_state: Trace React state and props flow
 * - frontend_render_triggers: Identify React re-render causes
 * - frontend_layout_hierarchy: Analyze CSS layout hierarchy
 * - frontend_overflow: Diagnose CSS overflow issues
 * - frontend_accessibility_tree: Build accessibility tree and detect WCAG issues
 * - frontend_sizing_strategy: Analyze element sizing strategy
 * - frontend_event_flow: Analyze event handling and propagation
 * - frontend_tailwind_conflicts: Detect Tailwind class conflicts
 * - frontend_client_boundary: Analyze Next.js client/server boundaries
 * - frontend_hook_dependencies: Audit React hook dependency arrays
 * - frontend_error_boundaries: Analyze error boundary coverage
 *
 * Server implementation lives in plugins/server.ts (L3 Plugin Layer).
 */

import { bootstrap } from './plugins/server.js';

bootstrap().catch((error) => {
  console.error('Failed to start frontend-engine:', error);
  process.exit(1);
});
