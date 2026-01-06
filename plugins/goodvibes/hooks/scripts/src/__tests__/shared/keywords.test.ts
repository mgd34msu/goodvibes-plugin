/**
 * Comprehensive unit tests for keywords.ts
 *
 * Tests cover:
 * - STACK_KEYWORD_CATEGORIES: tech stack detection keywords
 * - TRANSCRIPT_KEYWORD_CATEGORIES: transcript classification keywords
 * - KEYWORD_CATEGORIES: default export (alias for STACK_KEYWORD_CATEGORIES)
 * - ALL_STACK_KEYWORDS: flattened stack keywords array
 * - ALL_TRANSCRIPT_KEYWORDS: flattened transcript keywords array
 * - ALL_KEYWORDS: combined unique keywords
 * - extractStackKeywords(): extract keywords from text
 * - extractTranscriptKeywords(): extract keywords with category metadata
 *
 * Target: 100% line and branch coverage
 */

import { describe, it, expect } from 'vitest';
import {
  STACK_KEYWORD_CATEGORIES,
  TRANSCRIPT_KEYWORD_CATEGORIES,
  KEYWORD_CATEGORIES,
  ALL_STACK_KEYWORDS,
  ALL_TRANSCRIPT_KEYWORDS,
  ALL_KEYWORDS,
  extractStackKeywords,
  extractTranscriptKeywords,
} from '../../shared/keywords.js';

describe('keywords', () => {
  describe('STACK_KEYWORD_CATEGORIES', () => {
    it('should be a non-empty object', () => {
      expect(STACK_KEYWORD_CATEGORIES).toBeDefined();
      expect(typeof STACK_KEYWORD_CATEGORIES).toBe('object');
      expect(Object.keys(STACK_KEYWORD_CATEGORIES).length).toBeGreaterThan(0);
    });

    it('should contain expected category keys', () => {
      const expectedCategories = [
        'frameworks_frontend',
        'frameworks_backend',
        'languages',
        'databases',
        'orms',
        'api',
        'auth',
        'ui',
        'state',
        'testing',
        'build',
        'devops',
        'ai',
      ];

      for (const category of expectedCategories) {
        expect(STACK_KEYWORD_CATEGORIES).toHaveProperty(category);
        expect(Array.isArray(STACK_KEYWORD_CATEGORIES[category])).toBe(true);
        expect(STACK_KEYWORD_CATEGORIES[category].length).toBeGreaterThan(0);
      }
    });

    it('should contain expected frontend frameworks', () => {
      const frontendFrameworks = STACK_KEYWORD_CATEGORIES.frameworks_frontend;
      expect(frontendFrameworks).toContain('react');
      expect(frontendFrameworks).toContain('nextjs');
      expect(frontendFrameworks).toContain('vue');
      expect(frontendFrameworks).toContain('svelte');
    });

    it('should contain expected backend frameworks', () => {
      const backendFrameworks = STACK_KEYWORD_CATEGORIES.frameworks_backend;
      expect(backendFrameworks).toContain('express');
      expect(backendFrameworks).toContain('fastify');
      expect(backendFrameworks).toContain('nestjs');
    });

    it('should contain expected languages', () => {
      const languages = STACK_KEYWORD_CATEGORIES.languages;
      expect(languages).toContain('typescript');
      expect(languages).toContain('javascript');
      expect(languages).toContain('python');
    });

    it('should contain expected databases', () => {
      const databases = STACK_KEYWORD_CATEGORIES.databases;
      expect(databases).toContain('postgresql');
      expect(databases).toContain('mongodb');
      expect(databases).toContain('redis');
    });

    it('should contain keywords with special regex characters', () => {
      // Keywords like 'next.js', 'socket.io', 'auth.js' have dots
      const frontendFrameworks = STACK_KEYWORD_CATEGORIES.frameworks_frontend;
      expect(frontendFrameworks).toContain('next.js');

      const apiKeywords = STACK_KEYWORD_CATEGORIES.api;
      expect(apiKeywords).toContain('socket.io');

      const authKeywords = STACK_KEYWORD_CATEGORIES.auth;
      expect(authKeywords).toContain('auth.js');
    });
  });

  describe('TRANSCRIPT_KEYWORD_CATEGORIES', () => {
    it('should be a non-empty object', () => {
      expect(TRANSCRIPT_KEYWORD_CATEGORIES).toBeDefined();
      expect(typeof TRANSCRIPT_KEYWORD_CATEGORIES).toBe('object');
      expect(Object.keys(TRANSCRIPT_KEYWORD_CATEGORIES).length).toBeGreaterThan(0);
    });

    it('should contain expected category keys', () => {
      const expectedCategories = [
        'frameworks',
        'databases',
        'auth',
        'testing',
        'api',
        'devops',
        'frontend',
        'state',
        'typescript',
        'performance',
        'security',
        'files',
      ];

      for (const category of expectedCategories) {
        expect(TRANSCRIPT_KEYWORD_CATEGORIES).toHaveProperty(category);
        expect(Array.isArray(TRANSCRIPT_KEYWORD_CATEGORIES[category])).toBe(true);
        expect(TRANSCRIPT_KEYWORD_CATEGORIES[category].length).toBeGreaterThan(0);
      }
    });

    it('should contain expected testing keywords', () => {
      const testing = TRANSCRIPT_KEYWORD_CATEGORIES.testing;
      expect(testing).toContain('jest');
      expect(testing).toContain('vitest');
      expect(testing).toContain('playwright');
    });

    it('should contain expected security keywords', () => {
      const security = TRANSCRIPT_KEYWORD_CATEGORIES.security;
      expect(security).toContain('xss');
      expect(security).toContain('csrf');
      expect(security).toContain('sql injection');
    });
  });

  describe('KEYWORD_CATEGORIES', () => {
    it('should be an alias for STACK_KEYWORD_CATEGORIES', () => {
      expect(KEYWORD_CATEGORIES).toBe(STACK_KEYWORD_CATEGORIES);
    });

    it('should have the same keys as STACK_KEYWORD_CATEGORIES', () => {
      expect(Object.keys(KEYWORD_CATEGORIES)).toEqual(Object.keys(STACK_KEYWORD_CATEGORIES));
    });
  });

  describe('ALL_STACK_KEYWORDS', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(ALL_STACK_KEYWORDS)).toBe(true);
      expect(ALL_STACK_KEYWORDS.length).toBeGreaterThan(0);
    });

    it('should be a flattened array of all stack keywords', () => {
      // Check that it contains keywords from multiple categories
      expect(ALL_STACK_KEYWORDS).toContain('react'); // frameworks_frontend
      expect(ALL_STACK_KEYWORDS).toContain('express'); // frameworks_backend
      expect(ALL_STACK_KEYWORDS).toContain('typescript'); // languages
      expect(ALL_STACK_KEYWORDS).toContain('postgresql'); // databases
      expect(ALL_STACK_KEYWORDS).toContain('prisma'); // orms
    });

    it('should have the correct total length', () => {
      const expectedLength = Object.values(STACK_KEYWORD_CATEGORIES).flat().length;
      expect(ALL_STACK_KEYWORDS.length).toBe(expectedLength);
    });
  });

  describe('ALL_TRANSCRIPT_KEYWORDS', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(ALL_TRANSCRIPT_KEYWORDS)).toBe(true);
      expect(ALL_TRANSCRIPT_KEYWORDS.length).toBeGreaterThan(0);
    });

    it('should be a flattened array of all transcript keywords', () => {
      // Check that it contains keywords from multiple categories
      expect(ALL_TRANSCRIPT_KEYWORDS).toContain('react'); // frameworks
      expect(ALL_TRANSCRIPT_KEYWORDS).toContain('postgres'); // databases
      expect(ALL_TRANSCRIPT_KEYWORDS).toContain('jest'); // testing
      expect(ALL_TRANSCRIPT_KEYWORDS).toContain('xss'); // security
    });

    it('should have the correct total length', () => {
      const expectedLength = Object.values(TRANSCRIPT_KEYWORD_CATEGORIES).flat().length;
      expect(ALL_TRANSCRIPT_KEYWORDS.length).toBe(expectedLength);
    });
  });

  describe('ALL_KEYWORDS', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(ALL_KEYWORDS)).toBe(true);
      expect(ALL_KEYWORDS.length).toBeGreaterThan(0);
    });

    it('should contain unique keywords from both stack and transcript categories', () => {
      // Keywords unique to stack categories
      expect(ALL_KEYWORDS).toContain('nextjs'); // stack: frameworks_frontend
      expect(ALL_KEYWORDS).toContain('solidjs'); // stack: frameworks_frontend

      // Keywords unique to transcript categories
      expect(ALL_KEYWORDS).toContain('sql injection'); // transcript: security
      expect(ALL_KEYWORDS).toContain('github actions'); // transcript: devops
    });

    it('should not have duplicates', () => {
      const uniqueSet = new Set(ALL_KEYWORDS);
      expect(ALL_KEYWORDS.length).toBe(uniqueSet.size);
    });

    it('should have fewer or equal keywords than the sum of both arrays due to deduplication', () => {
      const combined = [...ALL_STACK_KEYWORDS, ...ALL_TRANSCRIPT_KEYWORDS];
      expect(ALL_KEYWORDS.length).toBeLessThanOrEqual(combined.length);
    });
  });

  describe('extractStackKeywords', () => {
    it('should return an empty array for empty text', () => {
      const result = extractStackKeywords('');
      expect(result).toEqual([]);
    });

    it('should return an empty array for text with no keywords', () => {
      const result = extractStackKeywords('This is just some random text without any tech words');
      expect(result).toEqual([]);
    });

    it('should extract a single keyword', () => {
      const result = extractStackKeywords('I am using React for my project');
      expect(result).toContain('react');
    });

    it('should extract multiple keywords', () => {
      const result = extractStackKeywords('Using React with TypeScript and Prisma');
      expect(result).toContain('react');
      expect(result).toContain('typescript');
      expect(result).toContain('prisma');
    });

    it('should be case insensitive', () => {
      const result = extractStackKeywords('REACT with TYPESCRIPT');
      expect(result).toContain('react');
      expect(result).toContain('typescript');
    });

    it('should match keywords with word boundaries', () => {
      // "react" should match but not "preact" or "reactive"
      const result1 = extractStackKeywords('I use react for frontend');
      expect(result1).toContain('react');

      // Should not match partial words
      const result2 = extractStackKeywords('This is preactive code');
      expect(result2).not.toContain('react');
    });

    it('should handle keywords with special regex characters', () => {
      // Keywords like "next.js", "socket.io", "auth.js" contain dots
      const result = extractStackKeywords('Using next.js with socket.io');
      expect(result).toContain('next.js');
      expect(result).toContain('socket.io');
    });

    it('should return unique keywords (no duplicates)', () => {
      const result = extractStackKeywords('React react REACT React');
      const reactCount = result.filter((k) => k === 'react').length;
      expect(reactCount).toBe(1);
    });

    it('should limit results to maximum 50 keywords', () => {
      // Create text with many keywords (more than 50)
      const allKeywords = Object.values(STACK_KEYWORD_CATEGORIES).flat();
      const text = allKeywords.join(' ');
      const result = extractStackKeywords(text);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should return array from Set (testing Set to Array conversion)', () => {
      const result = extractStackKeywords('react vue angular');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);
    });

    it('should handle text with mixed content and keywords', () => {
      const text = `
        Building a modern web app with React and Next.js using nextjs patterns.
        Using PostgreSQL for data storage with Prisma ORM.
        Deployed on Vercel with Docker containers.
      `;
      const result = extractStackKeywords(text);

      expect(result).toContain('react');
      expect(result).toContain('nextjs');
      expect(result).toContain('next.js');
      expect(result).toContain('postgresql');
      expect(result).toContain('prisma');
      expect(result).toContain('vercel');
      expect(result).toContain('docker');
    });

    it('should handle keywords at text boundaries', () => {
      const result1 = extractStackKeywords('react');
      expect(result1).toContain('react');

      const result2 = extractStackKeywords('react ');
      expect(result2).toContain('react');

      const result3 = extractStackKeywords(' react');
      expect(result3).toContain('react');
    });
  });

  describe('extractTranscriptKeywords', () => {
    it('should return an empty array when all params are undefined', () => {
      const result = extractTranscriptKeywords();
      expect(result).toEqual([]);
    });

    it('should return an empty array when all params are empty strings', () => {
      const result = extractTranscriptKeywords('', '', '');
      expect(result).toEqual([]);
    });

    it('should extract keywords from taskDescription only', () => {
      const result = extractTranscriptKeywords('Fix the React component', undefined, undefined);
      expect(result).toContain('react');
      expect(result).toContain('category:frameworks');
    });

    it('should extract keywords from transcriptContent only', () => {
      const result = extractTranscriptKeywords(undefined, 'Using Jest for testing', undefined);
      expect(result).toContain('jest');
      expect(result).toContain('category:testing');
    });

    it('should extract keywords from agentType only', () => {
      const result = extractTranscriptKeywords(undefined, undefined, 'goodvibes:test-runner');
      expect(result).toContain('agent:test runner');
    });

    it('should combine keywords from all three sources', () => {
      const result = extractTranscriptKeywords(
        'Fix React bug',
        'Running Jest tests',
        'goodvibes:frontend-dev'
      );
      expect(result).toContain('react');
      expect(result).toContain('jest');
      expect(result).toContain('agent:frontend dev');
    });

    it('should add category meta-keywords for each matched keyword', () => {
      const result = extractTranscriptKeywords('Using Jest and Playwright for testing');
      expect(result).toContain('jest');
      expect(result).toContain('playwright');
      expect(result).toContain('category:testing');
    });

    it('should add multiple category meta-keywords for keywords from different categories', () => {
      const result = extractTranscriptKeywords('React component with Redux state and Jest tests');
      expect(result).toContain('react');
      expect(result).toContain('redux');
      expect(result).toContain('jest');
      expect(result).toContain('category:frameworks');
      expect(result).toContain('category:state');
      expect(result).toContain('category:testing');
    });

    it('should handle agentType with goodvibes: prefix', () => {
      const result = extractTranscriptKeywords(undefined, undefined, 'goodvibes:test-engineer');
      expect(result).toContain('agent:test engineer');
      // Should not contain the "goodvibes:" prefix
      expect(result.some((k) => k.includes('goodvibes'))).toBe(false);
    });

    it('should handle agentType without prefix', () => {
      const result = extractTranscriptKeywords(undefined, undefined, 'test-engineer');
      expect(result).toContain('agent:test engineer');
    });

    it('should replace hyphens with spaces in agentType', () => {
      const result = extractTranscriptKeywords(undefined, undefined, 'my-custom-agent-type');
      expect(result).toContain('agent:my custom agent type');
    });

    it('should return sorted results', () => {
      const result = extractTranscriptKeywords('React Redux Jest', '', '');
      const sortedResult = [...result].sort();
      expect(result).toEqual(sortedResult);
    });

    it('should be case insensitive', () => {
      const result = extractTranscriptKeywords('REACT with JEST');
      expect(result).toContain('react');
      expect(result).toContain('jest');
    });

    it('should use word boundary matching', () => {
      // "test" is a keyword but should match as whole word
      const result = extractTranscriptKeywords('test the component');
      expect(result).toContain('test');

      // "contest" should not match "test"
      const result2 = extractTranscriptKeywords('contest the decision');
      expect(result2).not.toContain('test');
    });

    it('should handle keywords with special characters', () => {
      // Keywords like "sql injection" with space, "styled-components" with hyphen
      const result = extractTranscriptKeywords('Prevent sql injection attacks');
      expect(result).toContain('sql injection');
      expect(result).toContain('category:security');
    });

    it('should handle multi-word keywords', () => {
      const result = extractTranscriptKeywords('Run integration test with unit test coverage');
      expect(result).toContain('integration test');
      expect(result).toContain('unit test');
    });

    it('should not add duplicate keywords', () => {
      const result = extractTranscriptKeywords('jest jest jest test testing', 'jest vitest', '');
      const jestCount = result.filter((k) => k === 'jest').length;
      expect(jestCount).toBe(1);
    });

    it('should not add duplicate category meta-keywords', () => {
      const result = extractTranscriptKeywords('jest vitest playwright cypress');
      const testingCategoryCount = result.filter((k) => k === 'category:testing').length;
      expect(testingCategoryCount).toBe(1);
    });

    it('should handle empty agentType string (falsy check)', () => {
      const result = extractTranscriptKeywords('React code', '', '');
      expect(result).toContain('react');
      // Should not have any agent: keyword when agentType is empty
      expect(result.some((k) => k.startsWith('agent:'))).toBe(false);
    });

    it('should handle undefined agentType (falsy check)', () => {
      const result = extractTranscriptKeywords('React code', 'some content', undefined);
      expect(result).toContain('react');
      // Should not have any agent: keyword when agentType is undefined
      expect(result.some((k) => k.startsWith('agent:'))).toBe(false);
    });

    it('should handle complex combined text', () => {
      const taskDescription = 'Add auth and authentication with Clerk';
      const transcriptContent = 'Using prisma for database access with postgres';
      const agentType = 'goodvibes:backend-engineer';

      const result = extractTranscriptKeywords(taskDescription, transcriptContent, agentType);

      expect(result).toContain('auth');
      expect(result).toContain('authentication');
      expect(result).toContain('clerk');
      expect(result).toContain('prisma');
      expect(result).toContain('postgres');
      expect(result).toContain('category:auth');
      expect(result).toContain('category:databases');
      expect(result).toContain('agent:backend engineer');
    });
  });
});
