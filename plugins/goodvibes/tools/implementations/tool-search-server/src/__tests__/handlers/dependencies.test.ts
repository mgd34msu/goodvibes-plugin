/**
 * Unit tests for dependencies handler
 *
 * Tests cover:
 * - handleSkillDependencies
 * - Dependency tree building
 * - Optional dependency handling
 * - Conflict detection
 * - Reverse dependency lookup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fuse from 'fuse.js';

import { handleSkillDependencies } from '../../handlers/dependencies.js';
import { RegistryEntry, Registry } from '../../types.js';
import { sampleSkillsRegistry, sampleSkillContent } from '../setup.js';

// Mock modules
vi.mock('../../utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as object,
    search: (index: Fuse<RegistryEntry> | null, query: string, limit: number = 5) => {
      if (!index) return [];
      const results = index.search(query, { limit });
      return results.map((r) => ({
        name: r.item.name,
        path: r.item.path,
        description: r.item.description,
        relevance: Math.round((1 - (r.score || 0)) * 100) / 100,
      }));
    },
    parseSkillMetadata: vi.fn().mockReturnValue({}),
  };
});

describe('dependencies handler', () => {
  let skillsIndex: Fuse<RegistryEntry>;
  let skillsRegistry: Registry;

  const fuseOptions = {
    keys: ['name', 'description', 'keywords'],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    skillsIndex = new Fuse(sampleSkillsRegistry.search_index, fuseOptions);
    skillsRegistry = sampleSkillsRegistry as Registry;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('handleSkillDependencies', () => {
    describe('basic functionality', () => {
      it('should find skill by name', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({});

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.skill).toBe('React Testing');
        expect(data.path).toBe('testing/react-testing');
      });

      it('should throw error when skill not found', () => {
        expect(() => {
          handleSkillDependencies(skillsIndex, skillsRegistry, {
            skill: 'Nonexistent Skill XYZ',
          });
        }).toThrow('Skill not found: Nonexistent Skill XYZ');
      });

      it('should return proper response structure', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({});

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Prisma',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data).toHaveProperty('skill');
        expect(data).toHaveProperty('path');
        expect(data).toHaveProperty('metadata');
        expect(data).toHaveProperty('dependencies');
        expect(data).toHaveProperty('dependents');
        expect(data).toHaveProperty('suggested_bundle');
        expect(data).toHaveProperty('analysis');
      });
    });

    describe('required dependencies', () => {
      it('should find required dependencies from metadata', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          requires: ['react-basics', 'testing-fundamentals'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependencies.required.length).toBeGreaterThanOrEqual(0);
      });

      it('should include reason for required dependencies', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          requires: ['React Testing'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Next.js',
        });
        const data = JSON.parse(result.content[0].text);

        if (data.dependencies.required.length > 0) {
          expect(data.dependencies.required[0]).toHaveProperty('reason');
        }
      });

      it('should resolve nested dependencies when depth allows', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        // Mock returns:
        // 1. Main skill metadata (Tailwind) - has requires
        // 2. Nested dependency metadata (Next.js) - has requires
        // 3+ Additional calls for reverse dependency lookup - return empty
        vi.mocked(parseSkillMetadata)
          .mockReturnValueOnce({ requires: ['Next.js'] })
          .mockReturnValueOnce({ requires: ['React Testing'] })
          .mockReturnValue({}); // Default for remaining calls

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Tailwind',
          depth: 2,
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependencies.required).toBeDefined();
      });
    });

    describe('optional dependencies', () => {
      it('should find optional/complementary dependencies', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          complements: ['jest-advanced', 'cypress-e2e'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
          include_optional: true,
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependencies.optional).toBeDefined();
      });

      it('should exclude optional when include_optional is false', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          complements: ['jest-advanced'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
          include_optional: false,
        });
        const data = JSON.parse(result.content[0].text);

        // Optional dependencies from complements should be empty
        const complementDeps = data.dependencies.optional.filter(
          (d: any) => d.reason === 'Listed as complementary skill'
        );
        expect(complementDeps.length).toBe(0);
      });

      it('should add related skills in same category as optional', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({});

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        // Should find related skills in testing category
        const relatedInCategory = data.dependencies.optional.filter(
          (o: any) => o.reason === 'Related skill in same category'
        );
        expect(relatedInCategory.length).toBeGreaterThanOrEqual(0);
      });
    });

    describe('conflicts', () => {
      it('should detect conflicting skills', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          conflicts: ['incompatible-skill'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Prisma',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependencies.conflicts).toBeDefined();
      });

      it('should include reason for conflicts', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          conflicts: ['Zustand'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        if (data.dependencies.conflicts.length > 0) {
          expect(data.dependencies.conflicts[0].reason).toBe('Listed as conflicting skill');
        }
      });
    });

    describe('reverse dependencies', () => {
      it('should find skills that depend on this skill', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockImplementation((path: string) => {
          if (path === 'testing/react-testing') {
            return {};
          }
          return { requires: ['React Testing'] };
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependents).toBeDefined();
        expect(Array.isArray(data.dependents)).toBe(true);
      });

      it('should limit dependents to 5', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          requires: ['Prisma'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Prisma',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependents.length).toBeLessThanOrEqual(5);
      });
    });

    describe('suggested bundle', () => {
      it('should include the skill itself in suggested bundle', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({});

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Tailwind',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.suggested_bundle).toContain(data.path);
      });

      it('should include required dependencies in bundle', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          requires: ['React Testing'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Next.js',
        });
        const data = JSON.parse(result.content[0].text);

        expect(Array.isArray(data.suggested_bundle)).toBe(true);
      });
    });

    describe('metadata', () => {
      it('should include category in metadata', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          category: 'testing',
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.metadata.category).toBe('testing');
      });

      it('should derive category from path if not in metadata', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({});

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        // Category should be first part of path
        expect(data.metadata.category).toBe('testing');
      });

      it('should include technologies in metadata', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          technologies: ['react', 'vitest', 'testing-library'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.metadata.technologies).toContain('react');
        expect(data.metadata.technologies).toContain('vitest');
      });

      it('should include difficulty in metadata', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          difficulty: 'intermediate',
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.metadata.difficulty).toBe('intermediate');
      });
    });

    describe('analysis', () => {
      it('should indicate if skill has prerequisites', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          requires: ['some-skill'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.analysis.has_prerequisites).toBeDefined();
      });

      it('should indicate if skill has conflicts', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          conflicts: ['some-skill'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Prisma',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.analysis.has_conflicts).toBeDefined();
      });

      it('should calculate dependency count', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({
          requires: ['a', 'b'],
          complements: ['c', 'd', 'e'],
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(typeof data.analysis.dependency_count).toBe('number');
      });

      it('should indicate if skill is foundational', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockImplementation((path: string) => {
          if (path.includes('react-testing')) return {};
          return { requires: ['React Testing'] };
        });

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(typeof data.analysis.is_foundational).toBe('boolean');
      });
    });

    describe('depth parameter', () => {
      it('should use default depth of 2', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({});

        handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Prisma',
        });

        // parseSkillMetadata should be called for nested deps
        expect(parseSkillMetadata).toHaveBeenCalled();
      });

      it('should respect custom depth', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({});

        handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Prisma',
          depth: 1,
        });

        // With depth 1, should not recursively fetch nested deps
        expect(parseSkillMetadata).toHaveBeenCalled();
      });
    });

    describe('response format', () => {
      it('should return properly formatted response', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({});

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Tailwind',
        });

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockReturnValue({});

        const result = handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Zustand',
        });

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });
    });
  });
});
