/**
 * Schema aggregator for project-engine v2.0.0.
 *
 * Combines all domain schema modules into a single export.
 * Populated in Phase 10 after all domain schemas are created.
 */

/**
 * All tool schemas provided by project-engine v2.0.0.
 * Will contain 29 schemas when fully populated.
 */
export const allSchemas: Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> = [];
