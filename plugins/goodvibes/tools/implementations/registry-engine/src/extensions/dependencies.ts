/**
 * Skill dependency analysis.
 *
 * L2 orchestration layer — decomposes dependency analysis into
 * 6 focused functions + 1 top-level orchestrator:
 *
 *   resolveRequired  — iterate required deps, search, recurse
 *   resolveOptional  — iterate complementary deps, search
 *   resolveConflicts — iterate conflict deps, search
 *   findDependents   — reverse scan: which skills require this one
 *   findRelated      — same-category skills by category prefix
 *   buildBundle      — assemble suggested load order
 *   analyzeDependencies — orchestrates all above + formats response
 *
 * @module extensions/dependencies
 */

import type Fuse from 'fuse.js';
import type {
  RegistryEntry,
  Registry,
  DependencyAnalysisArgs,
  DependencyLink,
  DependentRef,
  SkillMetadata,
} from '../core/types.js';
import { query, findOne } from '../core/search.js';
import { ok } from '../shared/response.js';
import type { McpResponse } from '../shared/types.js';
import { loadSkillMetadata } from '../core/parsing.js';

/**
 * Resolve required dependencies for a skill.
 * Recursively loads nested dependencies up to the specified depth.
 */
export async function resolveRequired(
  metadata: SkillMetadata,
  index: Fuse<RegistryEntry> | null,
  depth: number
): Promise<DependencyLink[]> {
  const required: DependencyLink[] = [];
  if (!metadata.requires) return required;

  for (const req of metadata.requires) {
    const result = findOne(index, req);
    if (result && !required.find(r => r.path === result.path)) {
      required.push({
        skill: result.name,
        path: result.path,
        reason: 'Listed as required dependency',
      });

      if (depth > 1) {
        const nestedMeta = await loadSkillMetadata(result.path);
        if (nestedMeta.requires) {
          for (const nested of nestedMeta.requires.slice(0, 3)) {
            const nestedResult = findOne(index, nested);
            if (nestedResult && !required.find(r => r.path === nestedResult.path)) {
              required.push({
                skill: nestedResult.name,
                path: nestedResult.path,
                reason: `Required by ${result.name}`,
              });
            }
          }
        }
      }
    }
  }
  return required;
}

/**
 * Resolve optional (complementary) dependencies for a skill.
 */
export async function resolveOptional(
  metadata: SkillMetadata,
  index: Fuse<RegistryEntry> | null
): Promise<DependencyLink[]> {
  const optional: DependencyLink[] = [];
  if (!metadata.complements) return optional;

  for (const comp of metadata.complements) {
    const result = findOne(index, comp);
    if (result) {
      optional.push({
        skill: result.name,
        path: result.path,
        reason: 'Listed as complementary skill',
      });
    }
  }
  return optional;
}

/**
 * Resolve conflicting skills for a skill.
 */
export async function resolveConflicts(
  metadata: SkillMetadata,
  index: Fuse<RegistryEntry> | null
): Promise<DependencyLink[]> {
  const conflicts: DependencyLink[] = [];
  if (!metadata.conflicts) return conflicts;

  for (const conf of metadata.conflicts) {
    const result = findOne(index, conf);
    if (result) {
      conflicts.push({
        skill: result.name,
        path: result.path,
        reason: 'Listed as conflicting skill',
      });
    }
  }
  return conflicts;
}

/**
 * Find all skills in the registry that depend on the target skill.
 * O(n) reverse scan — future: build reverse index in RegistryIndexCache.
 */
export async function findDependents(
  registry: Registry | null,
  target: { name: string; path: string }
): Promise<DependentRef[]> {
  if (!registry?.search_index) return [];

  const candidates = registry.search_index.filter(e => e.path !== target.path);
  const metaResults = await Promise.all(
    candidates.map(entry => loadSkillMetadata(entry.path).then(meta => ({ entry, meta })))
  );

  return metaResults
    .filter(({ meta }) => meta.requires?.some(r =>
      r.toLowerCase().includes(target.name.toLowerCase()) ||
      target.path.includes(r)
    ))
    .map(({ entry }) => ({ skill: entry.name, path: entry.path }));
}

/**
 * Find related skills in the same category, excluding specified paths.
 */
export function findRelated(
  index: Fuse<RegistryEntry> | null,
  skillPath: string,
  exclude: string[],
  max: number
): DependencyLink[] {
  const category = skillPath.split('/')[0];
  return query(index, category, 10)
    .filter(r => r.path !== skillPath && !exclude.includes(r.path))
    .slice(0, max)
    .map(r => ({
      skill: r.name,
      path: r.path,
      reason: 'Related skill in same category',
    }));
}

/**
 * Build a suggested bundle of skill paths to load together.
 * Orders: target skill + top required deps + top optional deps.
 */
export function buildBundle(
  skill: { path: string },
  required: DependencyLink[],
  optional: DependencyLink[]
): string[] {
  const bundle = [skill.path];
  for (const req of required.slice(0, 3)) {
    bundle.push(req.path);
  }
  for (const opt of optional.slice(0, 2)) {
    if (!bundle.includes(opt.path)) {
      bundle.push(opt.path);
    }
  }
  return bundle;
}

/**
 * Analyze all dependencies for a skill.
 *
 * Orchestrates: findOne → loadSkillMetadata → resolveRequired → resolveOptional
 * → resolveConflicts → findDependents → findRelated → buildBundle → ok()
 */
export async function analyzeDependencies(
  skillsIndex: Fuse<RegistryEntry> | null,
  skillsRegistry: Registry | null,
  args: DependencyAnalysisArgs
): Promise<McpResponse> {
  const skill = findOne(skillsIndex, args.skill);
  if (!skill) {
    throw new Error(`Skill not found: ${args.skill}`);
  }

  const depth = args.depth || 2;
  const includeOptional = args.include_optional !== false;

  const metadata = await loadSkillMetadata(skill.path);

  const required = await resolveRequired(metadata, skillsIndex, depth);

  const optional: DependencyLink[] = [];
  if (includeOptional) {
    const opts = await resolveOptional(metadata, skillsIndex);
    optional.push(...opts);
  }

  const conflicts = await resolveConflicts(metadata, skillsIndex);
  const dependents = await findDependents(skillsRegistry, skill);

  // Fill related if not enough optional
  if (optional.length < 3) {
    const existingPaths = optional.map(o => o.path);
    const related = findRelated(skillsIndex, skill.path, existingPaths, 5 - optional.length);
    optional.push(...related);
  }

  const suggestedBundle = buildBundle(skill, required, optional);
  const category = skill.path.split('/')[0];

  return ok({
    skill: skill.name,
    path: skill.path,
    metadata: {
      category: metadata.category || category,
      technologies: metadata.technologies || [],
      difficulty: metadata.difficulty,
    },
    dependencies: {
      required,
      optional: optional.slice(0, 5),
      conflicts,
    },
    dependents: dependents.slice(0, 5),
    suggested_bundle: suggestedBundle,
    analysis: {
      has_prerequisites: required.length > 0,
      has_conflicts: conflicts.length > 0,
      dependency_count: required.length + optional.length,
      is_foundational: dependents.length > 2,
    },
  });
}
