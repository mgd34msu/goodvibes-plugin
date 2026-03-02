/**
 * L3 Plugin Layer — Tool Schema Registry
 *
 * Re-exports TOOL_SCHEMAS from the canonical schemas module.
 * The actual schema definitions live in src/schemas/index.ts.
 *
 * @module plugins/schemas
 */

export { FRONTEND_SCHEMAS as TOOL_SCHEMAS, FRONTEND_SCHEMAS } from '../schemas/index.js';
