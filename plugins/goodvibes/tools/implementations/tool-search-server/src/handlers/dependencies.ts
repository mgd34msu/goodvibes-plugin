/**
 * Skill dependencies handler
 */

import Fuse from 'fuse.js';
import { RegistryEntry, Registry, ToolResponse } from '../types.js';
import { search, parseSkillMetadata } from '../utils.js';

export interface SkillDependenciesArgs {
  skill: string;
  depth?: number;
  include_optional?: boolean;
}

interface DependencyInfo {
  skill: string;
  path: string;
  reason: string;
}

interface DependentInfo {
  skill: string;
  path: string;
}

/**
 * Handle skill_dependencies tool call
 */
export function handleSkillDependencies(
  skillsIndex: Fuse<RegistryEntry> | null,
  skillsRegistry: Registry | null,
  args: SkillDependenciesArgs
): ToolResponse {
  // Search for the skill
  const results = search(skillsIndex, args.skill, 1);
  if (results.length === 0) {
    throw new Error(`Skill not found: ${args.skill}`);
  }

  const skill = results[0];
  const depth = args.depth || 2;
  const includeOptional = args.include_optional !== false;

  // Load and parse the skill file to get actual dependencies
  const skillMetadata = parseSkillMetadata(skill.path);

  // Build dependency tree
  const required: DependencyInfo[] = [];
  const optional: DependencyInfo[] = [];
  const conflicts: DependencyInfo[] = [];
  const dependents: DependentInfo[] = [];

  // Parse dependencies from skill metadata
  if (skillMetadata.requires) {
    for (const req of skillMetadata.requires) {
      const reqResult = search(skillsIndex, req, 1);
      if (reqResult.length > 0) {
        required.push({
          skill: reqResult[0].name,
          path: reqResult[0].path,
          reason: 'Listed as required dependency',
        });

        // Recursively get nested dependencies if depth allows
        if (depth > 1) {
          const nestedMeta = parseSkillMetadata(reqResult[0].path);
          if (nestedMeta.requires) {
            for (const nested of nestedMeta.requires.slice(0, 3)) {
              const nestedResult = search(skillsIndex, nested, 1);
              if (nestedResult.length > 0 && !required.find(r => r.path === nestedResult[0].path)) {
                required.push({
                  skill: nestedResult[0].name,
                  path: nestedResult[0].path,
                  reason: `Required by ${reqResult[0].name}`,
                });
              }
            }
          }
        }
      }
    }
  }

  // Parse optional/complementary skills
  if (includeOptional && skillMetadata.complements) {
    for (const comp of skillMetadata.complements) {
      const compResult = search(skillsIndex, comp, 1);
      if (compResult.length > 0) {
        optional.push({
          skill: compResult[0].name,
          path: compResult[0].path,
          reason: 'Listed as complementary skill',
        });
      }
    }
  }

  // Parse conflicts
  if (skillMetadata.conflicts) {
    for (const conf of skillMetadata.conflicts) {
      const confResult = search(skillsIndex, conf, 1);
      if (confResult.length > 0) {
        conflicts.push({
          skill: confResult[0].name,
          path: confResult[0].path,
          reason: 'Listed as conflicting skill',
        });
      }
    }
  }

  // Find skills that depend on this one (reverse lookup)
  if (skillsRegistry?.search_index) {
    for (const entry of skillsRegistry.search_index) {
      if (entry.path === skill.path) continue;
      const entryMeta = parseSkillMetadata(entry.path);
      if (entryMeta.requires?.some(r =>
        r.toLowerCase().includes(skill.name.toLowerCase()) ||
        skill.path.includes(r)
      )) {
        dependents.push({ skill: entry.name, path: entry.path });
      }
    }
  }

  // Find related skills by category and technology overlap
  const skillPath = skill.path;
  const category = skillPath.split('/')[0];

  // Search for complementary skills in same category if we don't have enough optional
  if (optional.length < 3) {
    const related = search(skillsIndex, category, 10)
      .filter(r => r.path !== skillPath && !optional.find(o => o.path === r.path))
      .slice(0, 5 - optional.length);

    for (const r of related) {
      optional.push({
        skill: r.name,
        path: r.path,
        reason: 'Related skill in same category',
      });
    }
  }

  // Build suggested bundle
  const suggestedBundle = [skill.path];
  for (const req of required.slice(0, 3)) {
    suggestedBundle.push(req.path);
  }
  for (const opt of optional.slice(0, 2)) {
    if (!suggestedBundle.includes(opt.path)) {
      suggestedBundle.push(opt.path);
    }
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        skill: skill.name,
        path: skill.path,
        metadata: {
          category: skillMetadata.category || category,
          technologies: skillMetadata.technologies || [],
          difficulty: skillMetadata.difficulty,
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
      }, null, 2),
    }],
  };
}
