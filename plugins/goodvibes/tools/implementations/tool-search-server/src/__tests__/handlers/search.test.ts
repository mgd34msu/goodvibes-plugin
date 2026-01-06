/**
 * Unit tests for search handlers
 *
 * Tests cover:
 * - handleSearchSkills
 * - handleSearchAgents
 * - handleSearchTools
 * - handleRecommendSkills
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fuse from 'fuse.js';

import {
  handleSearchSkills,
  handleSearchAgents,
  handleSearchTools,
  handleRecommendSkills,
} from '../../handlers/search.js';
import { RegistryEntry, SearchResult } from '../../types.js';
import {
  sampleSkillsRegistry,
  sampleAgentsRegistry,
  sampleToolsRegistry,
} from '../setup.js';

/** Recommendation result with skill info and reason */
interface Recommendation {
  skill: string;
  path: string;
  relevance: number;
  reason: string;
}

describe('search handlers', () => {
  let skillsIndex: Fuse<RegistryEntry>;
  let agentsIndex: Fuse<RegistryEntry>;
  let toolsIndex: Fuse<RegistryEntry>;

  const fuseOptions = {
    keys: ['name', 'description', 'keywords'],
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
  };

  beforeEach(() => {
    skillsIndex = new Fuse(sampleSkillsRegistry.search_index, fuseOptions);
    agentsIndex = new Fuse(sampleAgentsRegistry.search_index, fuseOptions);
    toolsIndex = new Fuse(sampleToolsRegistry.search_index, fuseOptions);
  });

  describe('handleSearchSkills', () => {
    it('should search skills by query', () => {
      const result = handleSearchSkills(skillsIndex, { query: 'testing' });
      const data = JSON.parse(result.content[0].text);

      expect(data.skills).toBeDefined();
      expect(data.skills.length).toBeGreaterThan(0);
      expect(data.skills.some((s: SearchResult) => s.name === 'React Testing')).toBe(true);
    });

    it('should include query in response', () => {
      const result = handleSearchSkills(skillsIndex, { query: 'prisma' });
      const data = JSON.parse(result.content[0].text);

      expect(data.query).toBe('prisma');
    });

    it('should include total_count in response', () => {
      const result = handleSearchSkills(skillsIndex, { query: 'react' });
      const data = JSON.parse(result.content[0].text);

      expect(data.total_count).toBe(data.skills.length);
    });

    it('should filter by category when provided', () => {
      const result = handleSearchSkills(skillsIndex, {
        query: 'react',
        category: 'testing',
      });
      const data = JSON.parse(result.content[0].text);

      data.skills.forEach((skill: SearchResult) => {
        expect(skill.path.startsWith('testing')).toBe(true);
      });
    });

    it('should respect limit parameter', () => {
      const result = handleSearchSkills(skillsIndex, { query: 'react', limit: 2 });
      const data = JSON.parse(result.content[0].text);

      expect(data.skills.length).toBeLessThanOrEqual(2);
    });

    it('should use default limit of 5', () => {
      const result = handleSearchSkills(skillsIndex, { query: '' });
      const data = JSON.parse(result.content[0].text);

      expect(data.skills.length).toBeLessThanOrEqual(5);
    });

    it('should return empty array for null index', () => {
      const result = handleSearchSkills(null, { query: 'test' });
      const data = JSON.parse(result.content[0].text);

      expect(data.skills).toEqual([]);
      expect(data.total_count).toBe(0);
    });

    it('should search by keywords', () => {
      const result = handleSearchSkills(skillsIndex, { query: 'orm' });
      const data = JSON.parse(result.content[0].text);

      expect(data.skills.some((s: SearchResult) => s.name === 'Prisma ORM')).toBe(true);
    });

    it('should search by description', () => {
      const result = handleSearchSkills(skillsIndex, { query: 'state management' });
      const data = JSON.parse(result.content[0].text);

      expect(data.skills.some((s: SearchResult) => s.name === 'Zustand State')).toBe(true);
    });

    it('should return skills with path and description', () => {
      const result = handleSearchSkills(skillsIndex, { query: 'tailwind' });
      const data = JSON.parse(result.content[0].text);

      expect(data.skills[0]).toHaveProperty('name');
      expect(data.skills[0]).toHaveProperty('path');
      expect(data.skills[0]).toHaveProperty('description');
      expect(data.skills[0]).toHaveProperty('relevance');
    });

    it('should handle result with undefined score', () => {
      // Create a mock index that returns results with undefined score
      const mockIndex = {
        search: vi.fn().mockReturnValue([
          {
            item: {
              name: 'Test Skill',
              path: 'test/skill',
              description: 'A test skill',
            },
            // score is intentionally undefined to test || 0 fallback
          },
        ]),
      } as unknown as Fuse<RegistryEntry>;

      const result = handleSearchSkills(mockIndex, { query: 'test' });
      const data = JSON.parse(result.content[0].text);

      // When score is undefined, relevance should be (1 - 0) * 100 / 100 = 1
      expect(data.skills[0].relevance).toBe(1);
    });
  });

  describe('handleSearchAgents', () => {
    it('should search agents by query', () => {
      const result = handleSearchAgents(agentsIndex, { query: 'review' });
      const data = JSON.parse(result.content[0].text);

      expect(data.agents).toBeDefined();
      expect(data.agents.some((a: SearchResult) => a.name === 'Code Reviewer')).toBe(true);
    });

    it('should include query in response', () => {
      const result = handleSearchAgents(agentsIndex, { query: 'testing' });
      const data = JSON.parse(result.content[0].text);

      expect(data.query).toBe('testing');
    });

    it('should respect limit parameter', () => {
      const result = handleSearchAgents(agentsIndex, { query: 'code', limit: 1 });
      const data = JSON.parse(result.content[0].text);

      expect(data.agents.length).toBeLessThanOrEqual(1);
    });

    it('should return empty array for null index', () => {
      const result = handleSearchAgents(null, { query: 'test' });
      const data = JSON.parse(result.content[0].text);

      expect(data.agents).toEqual([]);
    });

    it('should search by expertise area', () => {
      const result = handleSearchAgents(agentsIndex, { query: 'best practices' });
      const data = JSON.parse(result.content[0].text);

      expect(data.agents.some((a: SearchResult) => a.name === 'Code Reviewer')).toBe(true);
    });
  });

  describe('handleSearchTools', () => {
    it('should search tools by query', () => {
      const result = handleSearchTools(toolsIndex, { query: 'search' });
      const data = JSON.parse(result.content[0].text);

      expect(data.tools).toBeDefined();
      expect(data.tools.some((t: SearchResult) => t.name === 'search_skills')).toBe(true);
    });

    it('should include query in response', () => {
      const result = handleSearchTools(toolsIndex, { query: 'detect' });
      const data = JSON.parse(result.content[0].text);

      expect(data.query).toBe('detect');
    });

    it('should respect limit parameter', () => {
      const result = handleSearchTools(toolsIndex, { query: 'tool', limit: 1 });
      const data = JSON.parse(result.content[0].text);

      expect(data.tools.length).toBeLessThanOrEqual(1);
    });

    it('should return empty array for null index', () => {
      const result = handleSearchTools(null, { query: 'test' });
      const data = JSON.parse(result.content[0].text);

      expect(data.tools).toEqual([]);
    });

    it('should search by functionality description', () => {
      const result = handleSearchTools(toolsIndex, { query: 'stack' });
      const data = JSON.parse(result.content[0].text);

      expect(data.tools.some((t: SearchResult) => t.name === 'detect_stack')).toBe(true);
    });
  });

  describe('handleRecommendSkills', () => {
    it('should recommend skills based on task', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'I need to test React components',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.recommendations).toBeDefined();
      expect(data.recommendations.length).toBeGreaterThan(0);
    });

    it('should include task analysis', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'Build authentication with database',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.task_analysis).toBeDefined();
      expect(data.task_analysis.category).toBeDefined();
      expect(data.task_analysis.keywords).toBeDefined();
      expect(data.task_analysis.complexity).toBeDefined();
    });

    it('should respect max_results parameter', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'React testing with vitest',
        max_results: 2,
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.recommendations.length).toBeLessThanOrEqual(2);
    });

    it('should categorize auth tasks correctly', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'Add user authentication and login',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.task_analysis.category).toBe('authentication');
    });

    it('should categorize database tasks correctly', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'Set up database with Prisma',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.task_analysis.category).toBe('database');
    });

    it('should categorize API tasks correctly', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'Create API endpoints for users',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.task_analysis.category).toBe('api');
    });

    it('should categorize styling tasks correctly', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'Add Tailwind CSS styling',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.task_analysis.category).toBe('styling');
    });

    it('should categorize testing tasks correctly', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'Write unit tests for components',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.task_analysis.category).toBe('testing');
    });

    it('should categorize deployment tasks correctly', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'Deploy application and build pipeline',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.task_analysis.category).toBe('deployment');
    });

    it('should default to general category', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'Some random task',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.task_analysis.category).toBe('general');
    });

    it('should extract keywords from task', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'React testing with vitest and jest',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.task_analysis.keywords).toContain('react');
      expect(data.task_analysis.keywords).toContain('testing');
      expect(data.task_analysis.keywords).toContain('vitest');
    });

    it('should filter keywords shorter than 4 characters', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'Use CSS and API for web app',
      });
      const data = JSON.parse(result.content[0].text);

      expect(data.task_analysis.keywords).not.toContain('css');
      expect(data.task_analysis.keywords).not.toContain('api');
      expect(data.task_analysis.keywords).not.toContain('web');
      expect(data.task_analysis.keywords).not.toContain('for');
    });

    it('should determine complexity based on keyword count', () => {
      const simpleTask = handleRecommendSkills(skillsIndex, {
        task: 'Add button component',
      });
      const simpleData = JSON.parse(simpleTask.content[0].text);
      expect(simpleData.task_analysis.complexity).toBe('simple');

      const moderateTask = handleRecommendSkills(skillsIndex, {
        task: 'Build authentication system with database queries user sessions password hashing',
      });
      const moderateData = JSON.parse(moderateTask.content[0].text);
      expect(['moderate', 'complex']).toContain(moderateData.task_analysis.complexity);
    });

    it('should classify as complex when more than 10 keywords', () => {
      // Create a task with more than 10 words longer than 3 characters
      const complexTask = handleRecommendSkills(skillsIndex, {
        task: 'implement authentication system database queries user sessions password hashing caching optimization performance monitoring logging testing',
      });
      const complexData = JSON.parse(complexTask.content[0].text);
      expect(complexData.task_analysis.complexity).toBe('complex');
    });

    it('should include reason for each recommendation', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'Testing React components',
      });
      const data = JSON.parse(result.content[0].text);

      data.recommendations.forEach((rec: Recommendation) => {
        expect(rec.reason).toBeDefined();
        expect(rec.reason).toContain('Matches task keywords');
      });
    });

    it('should include skill path in recommendations', () => {
      const result = handleRecommendSkills(skillsIndex, {
        task: 'Next.js application',
      });
      const data = JSON.parse(result.content[0].text);

      data.recommendations.forEach((rec: Recommendation) => {
        expect(rec.skill).toBeDefined();
        expect(rec.path).toBeDefined();
        expect(rec.relevance).toBeDefined();
      });
    });

    it('should return empty recommendations for null index', () => {
      const result = handleRecommendSkills(null, { task: 'Any task' });
      const data = JSON.parse(result.content[0].text);

      expect(data.recommendations).toEqual([]);
    });
  });

  describe('response format', () => {
    it('should return properly structured response', () => {
      const result = handleSearchSkills(skillsIndex, { query: 'test' });

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should return valid JSON', () => {
      const result = handleSearchSkills(skillsIndex, { query: 'test' });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should format JSON with indentation', () => {
      const result = handleSearchSkills(skillsIndex, { query: 'test' });

      expect(result.content[0].text).toContain('\n');
    });
  });
});
