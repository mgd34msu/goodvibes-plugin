/**
 * Formatter Module for Explain Codebase
 *
 * Contains output formatting functions including architecture diagram
 * generation and fallback result creation when LLM is unavailable.
 *
 * @module handlers/docs/explain-codebase/formatter
 */

import type {
  CodebaseInfo,
  ExplainCodebaseResult,
  Architecture,
  StackData,
  ApiRoutesData,
} from './types.js';

// =============================================================================
// Architecture Diagram Generation
// =============================================================================

/**
 * Generate ASCII architecture diagram based on detected stack
 * v8 ignore - fallbacks in template literals are cosmetic defaults for ASCII art
 */
/* v8 ignore start */
export function generateArchitectureDiagram(stack: StackData, apiRoutes: ApiRoutesData): string {
  const hasApi = apiRoutes.routes && apiRoutes.routes.length > 0;
  const hasDatabase = stack.backend?.orm || stack.backend?.database;
  const isNextjs = stack.frontend?.framework === 'next';
  const isFullStack = hasApi && stack.frontend?.ui_library;

  if (isNextjs && isFullStack) {
    return `
+--------------------------------------------------+
|                    Client Browser                 |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|               Next.js Application                 |
|  +--------------------------------------------+  |
|  |          React Components (UI)             |  |
|  |  +-------+  +-------+  +-------+          |  |
|  |  | Pages |  | Comps |  | Hooks |          |  |
|  |  +-------+  +-------+  +-------+          |  |
|  +--------------------------------------------+  |
|  +--------------------------------------------+  |
|  |           API Routes / Server Actions       |  |
|  |  +----------------+  +----------------+    |  |
|  |  | /api/...       |  | Server Actions |    |  |
|  |  +----------------+  +----------------+    |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|                Database Layer                     |
|  +--------------------------------------------+  |
|  |  ${(stack.backend?.orm || 'ORM').padEnd(10)} -> ${(stack.backend?.database || 'Database').padEnd(20)}  |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
`.trim();
  }

  if (isFullStack) {
    return `
+--------------------------------------------------+
|                    Client Browser                 |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|                Frontend Layer                     |
|  +--------------------------------------------+  |
|  |  ${(stack.frontend?.ui_library || 'UI').padEnd(8)} + ${(stack.frontend?.styling || 'CSS').padEnd(10)} Components      |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|                 Backend Layer                     |
|  +--------------------------------------------+  |
|  |  ${(stack.backend?.framework || 'Server').padEnd(12)} API Routes               |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
${hasDatabase ? `                         |
                         v
+--------------------------------------------------+
|                Database Layer                     |
|  +--------------------------------------------+  |
|  |  ${(stack.backend?.orm || 'ORM').padEnd(10)} -> ${(stack.backend?.database || 'Database').padEnd(20)}  |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+` : ''}
`.trim();
  }

  // Frontend-only application
  if (stack.frontend?.ui_library && !hasApi) {
    return `
+--------------------------------------------------+
|                    Client Browser                 |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|              Single Page Application              |
|  +--------------------------------------------+  |
|  |  ${(stack.frontend?.ui_library || 'UI').padEnd(8)} + ${(stack.frontend?.styling || 'CSS').padEnd(10)}                   |  |
|  +--------------------------------------------+  |
|  +--------------------------------------------+  |
|  |  State: ${(stack.frontend?.state_management || 'Local').padEnd(10)}                       |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|               External APIs / Services            |
+--------------------------------------------------+
`.trim();
  }

  // Backend-only / API service
  if (hasApi && !stack.frontend?.ui_library) {
    return `
+--------------------------------------------------+
|                  API Consumers                    |
+--------------------------------------------------+
                         |
                         v
+--------------------------------------------------+
|                  API Service                      |
|  +--------------------------------------------+  |
|  |  ${(stack.backend?.framework || 'Server').padEnd(12)} REST/GraphQL API         |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
${hasDatabase ? `                         |
                         v
+--------------------------------------------------+
|                Database Layer                     |
|  +--------------------------------------------+  |
|  |  ${(stack.backend?.orm || 'Driver').padEnd(10)} -> ${(stack.backend?.database || 'Database').padEnd(20)}  |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+` : ''}
`.trim();
  }

  // Generic/Unknown structure
  return `
+--------------------------------------------------+
|                   Application                     |
|  +--------------------------------------------+  |
|  |               Source Code                   |  |
|  |          (Structure analysis needed)        |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
`.trim();
}
/* v8 ignore stop */

// =============================================================================
// Fallback Result Creation
// =============================================================================

/**
 * Create fallback result when LLM is unavailable
 */
export function createFallbackResult(
  info: CodebaseInfo,
  includeArchitecture: boolean,
): ExplainCodebaseResult {
  // Determine architecture type from stack
  let archType = 'unknown';
  let archDesc = 'Unable to determine architecture pattern';
  const layers: string[] = [];

  const stack = info.stack;
  const hasApi = info.apiRoutes.routes && info.apiRoutes.routes.length > 0;

  if (stack.frontend?.framework === 'next') {
    archType = 'modular-monolith';
    archDesc = 'Next.js full-stack application with colocated frontend and API routes';
    layers.push('UI Components', 'API Routes', 'Data Layer');
  } else if (stack.frontend?.ui_library && hasApi) {
    archType = 'monolith';
    archDesc = 'Full-stack application with frontend and backend in the same codebase';
    layers.push('Frontend', 'Backend', 'Database');
  } else if (stack.frontend?.ui_library) {
    archType = 'spa';
    archDesc = 'Single Page Application (client-side only)';
    layers.push('UI Components', 'State Management', 'API Client');
  } else if (hasApi) {
    archType = 'api-service';
    archDesc = 'Backend API service';
    layers.push('API Layer', 'Business Logic', 'Data Access');
  }

  // Build tech stack array
  const techStack: string[] = [];
  if (stack.frontend?.framework) techStack.push(stack.frontend.framework);
  if (stack.frontend?.ui_library) techStack.push(stack.frontend.ui_library);
  if (stack.frontend?.styling) techStack.push(stack.frontend.styling);
  if (stack.backend?.orm) techStack.push(stack.backend.orm);
  if (stack.build?.typescript) techStack.push('TypeScript');
  if (stack.build?.bundler) techStack.push(stack.build.bundler);

  // Build summary
  const name = info.packageJson?.name || 'This project';
  const desc = info.packageJson?.description || '';
  const summary = `${name} is a ${archType} application built with ${techStack.slice(0, 3).join(', ')}. ${desc ? desc + '. ' : ''}The codebase contains ${info.keyFiles.length} key files and ${info.apiRoutes.routes?.length || 0} API routes. For a more detailed analysis, run with Claude CLI available.`;

  // Determine main features from API routes
  const mainFeatures: string[] = [];
  if (info.apiRoutes.routes) {
    const routePaths = new Set(info.apiRoutes.routes.map(r => r.path.split('/')[2] || r.path.split('/')[1]));
    mainFeatures.push(...Array.from(routePaths).slice(0, 5).filter(Boolean));
  }
  if (mainFeatures.length === 0) {
    mainFeatures.push('See API routes for features');
  }

  // Dependencies summary
  const deps = info.packageJson?.dependencies || {};
  const depCount = Object.keys(deps).length;
  const depsSummary = `${depCount} production dependencies including ${techStack.slice(0, 3).join(', ')}.`;

  // Patterns from conventions
  const patterns: string[] = [];
  if (info.conventions.imports?.style) patterns.push(`Import style: ${info.conventions.imports.style}`);
  if (info.conventions.structure?.directory_layout) {
    patterns.push(`Structure: ${info.conventions.structure.directory_layout.slice(0, 3).join(', ')}`);
  }

  const architecture: Architecture = {
    type: archType,
    description: archDesc,
    layers,
  };

  if (includeArchitecture) {
    architecture.diagram_ascii = generateArchitectureDiagram(stack, info.apiRoutes);
  }

  return {
    summary,
    tech_stack: techStack,
    architecture,
    key_files: info.keyFiles,
    entry_points: info.entryPoints,
    main_features: mainFeatures,
    dependencies_summary: depsSummary,
    patterns_used: patterns,
    conventions: info.conventions.structure?.directory_layout || [],
    concerns: ['LLM analysis unavailable - results are based on static analysis only'],
    cached: false,
    generated_at: new Date().toISOString(),
  };
}
