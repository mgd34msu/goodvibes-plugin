/**
 * Explain Codebase Handler
 *
 * LLM-powered tool that generates a high-level explanation of a codebase.
 * Gathers information from multiple sources (stack detection, API routes,
 * conventions, directory structure) and uses Claude to synthesize into
 * a comprehensive overview with architecture diagrams.
 *
 * @module handlers/docs/explain-codebase
 */

import * as fs from 'fs';
import * as path from 'path';

import { success, error } from '../../../utils.js';
import { PROJECT_ROOT } from '../../../config.js';
import { logError } from '../../../logging.js';

import type { ExplainCodebaseArgs, ExplainCodebaseResult } from './types.js';

import {
  getCachedExplanation,
  cacheExplanation,
  spawnClaude,
  buildAnalysisPrompt,
  gatherCodebaseInfo,
} from './analyzer.js';

import {
  generateArchitectureDiagram,
  createFallbackResult,
} from './formatter.js';

// =============================================================================
// Re-exports
// =============================================================================

// Export types for external use
export type { ExplainCodebaseArgs } from './types.js';

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handles the explain_codebase MCP tool call.
 *
 * Generates a high-level explanation of a codebase using LLM analysis.
 * Gathers information from multiple sources including stack detection,
 * API routes, conventions, and directory structure, then synthesizes
 * into a comprehensive overview.
 *
 * @param args - The explain_codebase tool arguments
 * @param args.path - Directory to analyze (defaults to PROJECT_ROOT)
 * @param args.depth - Analysis depth: shallow, medium (default), deep
 * @param args.focus - Specific areas to focus on
 * @param args.refresh - Force regeneration even if cached
 * @param args.include_architecture - Include ASCII architecture diagram
 * @returns MCP tool response with codebase explanation
 *
 * @example
 * handleExplainCodebase({});
 * // Returns comprehensive codebase explanation
 *
 * @example
 * handleExplainCodebase({ depth: 'deep', focus: ['auth', 'api'] });
 * // Returns detailed analysis focusing on auth and API
 */
export async function handleExplainCodebase(args: ExplainCodebaseArgs) {
  const projectPath = path.resolve(PROJECT_ROOT, args.path || '.');
  const depth = args.depth || 'medium';
  const focus = args.focus || [];
  const refresh = args.refresh || false;
  const includeArchitecture = args.include_architecture !== false;

  // Validate path exists
  if (!fs.existsSync(projectPath)) {
    return error(`Path does not exist: ${projectPath}`);
  }

  // Check cache (unless refresh requested)
  if (!refresh) {
    const cached = await getCachedExplanation(projectPath);
    if (cached) {
      // Return cached result with cache flag
      const result: ExplainCodebaseResult = {
        summary: cached.summary,
        tech_stack: cached.tech_stack,
        architecture: cached.architecture,
        key_files: cached.key_files,
        entry_points: cached.entry_points,
        main_features: cached.main_features,
        dependencies_summary: cached.dependencies_summary,
        patterns_used: cached.patterns_used,
        conventions: cached.conventions,
        concerns: cached.concerns,
        cached: true,
        generated_at: cached.generated_at,
      };
      return success(result);
    }
  }

  // Gather codebase information
  const info = await gatherCodebaseInfo(projectPath, depth);

  // Build prompt for Claude
  const prompt = buildAnalysisPrompt(info, focus, depth);

  try {
    // Call Claude for analysis
    const timeout = depth === 'deep' ? 120000 : depth === 'shallow' ? 60000 : 90000;
    const llmResult = await spawnClaude(prompt, timeout) as Partial<ExplainCodebaseResult>;

    // Build final result
    const result: ExplainCodebaseResult = {
      summary: llmResult.summary || 'Analysis incomplete',
      tech_stack: info.stack.recommended_skills?.map(s => s.split('/').pop() || s) || [],
      architecture: {
        type: llmResult.architecture?.type || 'unknown',
        description: llmResult.architecture?.description || 'Unable to determine',
        layers: llmResult.architecture?.layers || [],
        ...(includeArchitecture && {
          diagram_ascii: generateArchitectureDiagram(info.stack, info.apiRoutes),
        }),
      },
      key_files: info.keyFiles,
      entry_points: info.entryPoints,
      main_features: llmResult.main_features || [],
      dependencies_summary: llmResult.dependencies_summary || 'Not analyzed',
      patterns_used: llmResult.patterns_used || [],
      conventions: llmResult.conventions || [],
      concerns: llmResult.concerns,
      cached: false,
      generated_at: new Date().toISOString(),
    };

    // Enhance tech_stack from actual stack detection
    const techStack: string[] = [];
    if (info.stack.frontend?.framework) techStack.push(info.stack.frontend.framework);
    if (info.stack.frontend?.ui_library) techStack.push(info.stack.frontend.ui_library);
    if (info.stack.frontend?.styling) techStack.push(info.stack.frontend.styling);
    if (info.stack.frontend?.state_management) techStack.push(info.stack.frontend.state_management);
    if (info.stack.backend?.framework) techStack.push(info.stack.backend.framework);
    if (info.stack.backend?.orm) techStack.push(info.stack.backend.orm);
    if (info.stack.build?.typescript) techStack.push('TypeScript');
    if (info.stack.build?.bundler) techStack.push(info.stack.build.bundler);
    result.tech_stack = Array.from(new Set(techStack));

    // Cache the result
    await cacheExplanation(projectPath, result);

    return success(result);
  } catch (err) {
    // Fallback to static analysis if Claude is unavailable
    logError('[explain-codebase] LLM analysis failed, using fallback', err);

    const fallbackResult = createFallbackResult(info, includeArchitecture);

    // Cache even the fallback (to avoid repeated failures)
    await cacheExplanation(projectPath, fallbackResult);

    return success(fallbackResult);
  }
}
