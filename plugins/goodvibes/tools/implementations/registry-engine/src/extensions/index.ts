/**
 * L2 extensions/ barrel export.
 *
 * Re-exports all extension layer functions for consumption by L3 plugins/.
 * Import specific functions rather than using this barrel to maintain
 * clear dependency tracing.
 *
 * @module extensions
 */

export { RegistryIndexCache } from './loader.js';
export { searchSkills, searchAgents, searchTools } from './search.js';
export { recommendSkills } from './recommendations.js';
export { getSkillContent, getAgentContent } from './content.js';
export { loadSkillMetadata } from './metadata.js';
export {
  analyzeDependencies,
  resolveRequired,
  resolveOptional,
  resolveConflicts,
  findDependents,
  findRelated,
  buildBundle,
} from './dependencies.js';
