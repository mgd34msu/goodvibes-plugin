/**
 * L3 Plugin Layer — Tool Schema Registry
 *
 * Re-exports TOOL_SCHEMAS from the canonical schemas module.
 * The actual schema definitions live in src/schemas/index.ts.
 *
 * @module plugins/schemas
 */

export { allSchemas as TOOL_SCHEMAS } from '../schemas/index.js';
