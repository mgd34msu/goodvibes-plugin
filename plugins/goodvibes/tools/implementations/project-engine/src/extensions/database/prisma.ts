/**
 * Prisma operations extension
 *
 * High-level handler for the get_prisma_operations MCP tool.
 * Analyzes the codebase for Prisma client usage, N+1 patterns,
 * and generates optimization recommendations.
 *
 * @module extensions/database/prisma
 */

import type { McpResponse } from '../../shared/types.js';
import { ok, failFromException } from '../../shared/response.js';
import type { PrismaOpsArgs } from '../../core/database/types.js';
import {
  analyzePrismaFile,
  findPrismaSourceFiles,
  generatePrismaRecommendations,
} from '../../core/database/index.js';

/**
 * Analyze the codebase for Prisma client usage and N+1 query patterns.
 *
 * Uses the TypeScript compiler API to:
 * - Find all prisma.model.operation() call chains
 * - Detect queries inside loop constructs (N+1 risk)
 * - Summarize model usage frequency
 * - Generate optimization recommendations
 *
 * @param args - The get_prisma_operations tool arguments
 * @returns MCP response with operations, model summary, N+1 patterns, and recommendations
 *
 * @example
 * await getPrismaOperations({ path: 'src', include_n1_detection: true })
 * // Returns analysis with N+1 detection enabled
 */
export async function getPrismaOperations(args: PrismaOpsArgs): Promise<McpResponse> {
  const projectRoot = process.cwd();
  const searchPath = args.path || 'src';
  const detectN1 = args.include_n1_detection !== false;

  try {
    const files = findPrismaSourceFiles(searchPath, projectRoot);

    if (files.length === 0) {
      return ok({
        operations: [],
        models_used: [],
        n1_patterns: [],
        recommendations: [`No source files found in ${searchPath}`],
      });
    }

    const allOperations: ReturnType<typeof analyzePrismaFile>['operations'] = [];
    const allN1Patterns: ReturnType<typeof analyzePrismaFile>['n1Patterns'] = [];

    for (const file of files) {
      const { operations, n1Patterns } = analyzePrismaFile(file, projectRoot, detectN1);
      allOperations.push(...operations);
      allN1Patterns.push(...n1Patterns);
    }

    // Summarize model usage
    const modelCounts = new Map<string, number>();
    for (const op of allOperations) {
      modelCounts.set(op.model, (modelCounts.get(op.model) || 0) + 1);
    }

    const modelsUsed = Array.from(modelCounts.entries())
      .map(([name, operations]) => ({ name, operations }))
      .sort((a, b) => b.operations - a.operations);

    const recommendations = generatePrismaRecommendations(allOperations, allN1Patterns);

    return ok({
      operations: allOperations,
      models_used: modelsUsed,
      n1_patterns: allN1Patterns,
      recommendations,
    });
  } catch (error) {
    return failFromException(error, { path: searchPath });
  }
}
