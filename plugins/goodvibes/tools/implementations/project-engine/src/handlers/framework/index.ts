/**
 * Framework-specific analysis handlers
 *
 * Provides tools for analyzing framework-specific code patterns:
 * - Prisma operations and N+1 detection
 *
 * Note: React component tree analysis has been moved to frontend-engine MCP server.
 *
 * @module handlers/framework
 */

// Prisma Operations
export { handleGetPrismaOperations } from './prisma.js';
export type { GetPrismaOperationsArgs } from './prisma.js';
