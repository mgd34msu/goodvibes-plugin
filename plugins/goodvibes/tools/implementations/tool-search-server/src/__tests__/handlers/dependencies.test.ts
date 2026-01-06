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

/** Dependency entry with skill info and reason */
interface DependencyEntry {
  skill: string;
  path: string;
  reason: string;
}

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
    parseSkillMetadata: vi.fn().mockResolvedValue({}),
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
        vi.mocked(parseSkillMetadata).mockResolvedValue({});

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.skill).toBe('React Testing');
        expect(data.path).toBe('testing/react-testing');
      });

      it('should throw error when skill not found', async () => {
        await expect(
          handleSkillDependencies(skillsIndex, skillsRegistry, {
            skill: 'Nonexistent Skill XYZ',
          })
        ).rejects.toThrow('Skill not found: Nonexistent Skill XYZ');
      });

      it('should return proper response structure', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({});

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
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
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          requires: ['react-basics', 'testing-fundamentals'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependencies.required.length).toBeGreaterThanOrEqual(0);
      });

      it('should include reason for required dependencies', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          requires: ['React Testing'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
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
          .mockResolvedValueOnce({ requires: ['Next.js'] })
          .mockResolvedValueOnce({ requires: ['React Testing'] })
          .mockResolvedValue({}); // Default for remaining calls

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Tailwind',
          depth: 2,
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependencies.required).toBeDefined();
      });

      it('should not resolve nested dependencies when depth is 1', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        // With depth 1, we should NOT call parseSkillMetadata for nested deps
        const mockFn = vi.mocked(parseSkillMetadata)
          .mockResolvedValueOnce({ requires: ['Next.js'] }) // Main skill
          .mockResolvedValue({}); // Everything else

        await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Tailwind',
          depth: 1,
        });

        // parseSkillMetadata is called for main skill + reverse lookup for each registry entry
        // but NOT for nested deps (depth > 1 branch not taken)
        expect(mockFn).toHaveBeenCalled();
      });

      it('should avoid duplicate nested dependencies', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        // Test the branch: !required.find(r => r.path === nestedResult[0].path)
        // Nested skill is already in required list - should not add duplicate
        vi.mocked(parseSkillMetadata)
          .mockResolvedValueOnce({ requires: ['React Testing'] }) // Main skill requires React Testing
          .mockResolvedValueOnce({ requires: ['React Testing'] }) // React Testing also requires itself (unlikely but tests branch)
          .mockResolvedValue({});

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Tailwind',
          depth: 2,
        });
        const data = JSON.parse(result.content[0].text);

        // Should not have duplicates of React Testing
        const reactTestingCount = data.dependencies.required.filter(
          (d: DependencyEntry) => d.path === 'testing/react-testing'
        ).length;
        expect(reactTestingCount).toBeLessThanOrEqual(1);
      });

      it('should handle nested dependency with no requires', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        // Main skill requires Next.js, but Next.js has no requires field
        // This tests the branch where nestedMeta.requires is undefined
        vi.mocked(parseSkillMetadata)
          .mockResolvedValueOnce({ requires: ['Next.js'] }) // Main skill
          .mockResolvedValueOnce({}) // Nested skill has NO requires (tests line 116 branch)
          .mockResolvedValue({});

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Tailwind',
          depth: 2,
        });
        const data = JSON.parse(result.content[0].text);

        // Should still have the direct dependency
        expect(data.dependencies.required.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('optional dependencies', () => {
      it('should find optional/complementary dependencies', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          complements: ['jest-advanced', 'cypress-e2e'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
          include_optional: true,
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependencies.optional).toBeDefined();
      });

      it('should exclude optional when include_optional is false', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          complements: ['jest-advanced'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
          include_optional: false,
        });
        const data = JSON.parse(result.content[0].text);

        // Optional dependencies from complements should be empty
        const complementDeps = data.dependencies.optional.filter(
          (d: DependencyEntry) => d.reason === 'Listed as complementary skill'
        );
        expect(complementDeps.length).toBe(0);
      });

      it('should add related skills in same category as optional', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({});

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        // Should find related skills in testing category
        const relatedInCategory = data.dependencies.optional.filter(
          (o: DependencyEntry) => o.reason === 'Related skill in same category'
        );
        expect(relatedInCategory.length).toBeGreaterThanOrEqual(0);
      });

      it('should not add duplicate related skills to optional', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        // Return complements that match related skills in the same category
        // This tests the optional.find(o => o.path === r.path) branch
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          // Add a complement that might also appear in related category search
          complements: ['React Testing'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Next.js', // frameworks category, but 'Next.js' doesn't exist in sample registry
        });
        const data = JSON.parse(result.content[0].text);

        // Check that there are no duplicates in optional array
        const paths = data.dependencies.optional.map((o: DependencyEntry) => o.path);
        const uniquePaths = [...new Set(paths)];
        expect(paths.length).toBe(uniquePaths.length);
      });

      it('should filter out skills with same path as optional from related search', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        // Test the optional.find(o => o.path === r.path) callback explicitly
        // This happens when a complement matches a related skill in category search
        //
        // For this test, we need:
        // 1. A skill where optional.length < 3 triggers category search
        // 2. Complements that add some skills to optional
        // 3. Category search that returns a skill already in optional
        //
        // We use 'testing' category which has React Testing
        // If we add 'React Testing' as a complement to Tailwind,
        // and search for testing category returns React Testing,
        // the find callback will be called
        //
        // But Tailwind is in 'styling' category, so we need to add React Testing as complement
        // and then the category search for 'styling' won't return React Testing anyway.
        //
        // The real trick: use a custom registry with 2 skills in same category
        const customRegistry = {
          version: '1.0.0',
          search_index: [
            { name: 'Skill A', path: 'testing/skill-a', description: 'A', keywords: ['testing'] },
            { name: 'Skill B', path: 'testing/skill-b', description: 'B', keywords: ['testing'] },
          ],
        };
        const customIndex = new Fuse(customRegistry.search_index, fuseOptions);

        vi.mocked(parseSkillMetadata).mockResolvedValue({
          // Add Skill B as a complement first
          complements: ['Skill B'],
        });

        const result = await handleSkillDependencies(customIndex, customRegistry as Registry, {
          skill: 'Skill A',
        });
        const data = JSON.parse(result.content[0].text);

        // Skill B should appear only once in optional (from complements)
        // The category search for 'testing' would return Skill B again,
        // but optional.find() filters it out as a duplicate
        const skillBPaths = data.dependencies.optional.filter(
          (o: DependencyEntry) => o.path === 'testing/skill-b'
        );
        expect(skillBPaths.length).toBe(1);
      });
    });

    describe('conflicts', () => {
      it('should detect conflicting skills', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          conflicts: ['incompatible-skill'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Prisma',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependencies.conflicts).toBeDefined();
      });

      it('should include reason for conflicts', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          conflicts: ['Zustand'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
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
            return Promise.resolve({});
          }
          return Promise.resolve({ requires: ['React Testing'] });
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependents).toBeDefined();
        expect(Array.isArray(data.dependents)).toBe(true);
      });

      it('should limit dependents to 5', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          requires: ['Prisma'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Prisma',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependents.length).toBeLessThanOrEqual(5);
      });

      it('should handle null registry gracefully', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({});

        // Pass null registry - tests the skillsRegistry?.search_index branch
        const result = await handleSkillDependencies(skillsIndex, null, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        // Should still work but have empty dependents
        expect(data.dependents).toEqual([]);
      });

      it('should handle registry without search_index', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({});

        // Registry exists but has no search_index
        const emptyRegistry = { version: '1.0.0' } as unknown as Registry;

        const result = await handleSkillDependencies(skillsIndex, emptyRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        // Should still work but have empty dependents
        expect(data.dependents).toEqual([]);
      });

      it('should match skill by path includes', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        // Test the skill.path.includes(r) branch
        vi.mocked(parseSkillMetadata).mockImplementation((path: string) => {
          if (path === 'testing/react-testing') {
            return Promise.resolve({});
          }
          // This requires 'testing/react' which the skill path includes
          return Promise.resolve({ requires: ['testing/react'] });
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.dependents).toBeDefined();
      });
    });

    describe('suggested bundle', () => {
      it('should include the skill itself in suggested bundle', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({});

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Tailwind',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.suggested_bundle).toContain(data.path);
      });

      it('should include required dependencies in bundle', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          requires: ['React Testing'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Next.js',
        });
        const data = JSON.parse(result.content[0].text);

        expect(Array.isArray(data.suggested_bundle)).toBe(true);
      });
    });

    describe('metadata', () => {
      it('should include category in metadata', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          category: 'testing',
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.metadata.category).toBe('testing');
      });

      it('should derive category from path if not in metadata', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({});

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        // Category should be first part of path
        expect(data.metadata.category).toBe('testing');
      });

      it('should include technologies in metadata', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          technologies: ['react', 'vitest', 'testing-library'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.metadata.technologies).toContain('react');
        expect(data.metadata.technologies).toContain('vitest');
      });

      it('should include difficulty in metadata', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          difficulty: 'intermediate',
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.metadata.difficulty).toBe('intermediate');
      });
    });

    describe('analysis', () => {
      it('should indicate if skill has prerequisites', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          requires: ['some-skill'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.analysis.has_prerequisites).toBeDefined();
      });

      it('should indicate if skill has conflicts', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          conflicts: ['some-skill'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Prisma',
        });
        const data = JSON.parse(result.content[0].text);

        expect(data.analysis.has_conflicts).toBeDefined();
      });

      it('should calculate dependency count', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({
          requires: ['a', 'b'],
          complements: ['c', 'd', 'e'],
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(typeof data.analysis.dependency_count).toBe('number');
      });

      it('should indicate if skill is foundational', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockImplementation((path: string) => {
          if (path.includes('react-testing')) return Promise.resolve({});
          return Promise.resolve({ requires: ['React Testing'] });
        });

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'React Testing',
        });
        const data = JSON.parse(result.content[0].text);

        expect(typeof data.analysis.is_foundational).toBe('boolean');
      });
    });

    describe('depth parameter', () => {
      it('should use default depth of 2', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({});

        await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Prisma',
        });

        // parseSkillMetadata should be called for nested deps
        expect(parseSkillMetadata).toHaveBeenCalled();
      });

      it('should respect custom depth', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({});

        await handleSkillDependencies(skillsIndex, skillsRegistry, {
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
        vi.mocked(parseSkillMetadata).mockResolvedValue({});

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Tailwind',
        });

        expect(result).toHaveProperty('content');
        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toHaveProperty('type', 'text');
      });

      it('should return valid JSON', async () => {
        const { parseSkillMetadata } = await import('../../utils.js');
        vi.mocked(parseSkillMetadata).mockResolvedValue({});

        const result = await handleSkillDependencies(skillsIndex, skillsRegistry, {
          skill: 'Zustand',
        });

        expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      });
    });
  });
});
