/**
 * Skill metadata loading.
 *
 * @module extensions/metadata
 */

// loadSkillMetadata has been moved to core/parsing.ts (L1) to eliminate
// the L2-to-L2 cross-import from dependencies.ts. Re-exported here for
// backward compatibility with any external consumers of this module.
export { loadSkillMetadata } from '../core/parsing.js';
