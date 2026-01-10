/**
 * Framework-specific analysis handlers
 *
 * Provides tools for analyzing framework-specific code patterns:
 * - React component tree analysis
 * - Prisma operations and N+1 detection
 *
 * @module handlers/framework
 */

// React Component Tree
export { handleGetReactComponentTree } from './react.js';
export type { GetReactComponentTreeArgs } from './react.js';

// Prisma Operations
export { handleGetPrismaOperations } from './prisma.js';
export type { GetPrismaOperationsArgs } from './prisma.js';
