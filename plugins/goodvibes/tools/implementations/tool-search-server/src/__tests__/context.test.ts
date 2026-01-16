/**
 * Unit tests for context module
 *
 * Tests cover:
 * - ServerContext interface
 * - createContext function
 * - Context initialization state
 */

import { describe, it, expect } from 'vitest';
import { createContext, type ServerContext } from '../context.js';

describe('context', () => {
  describe('createContext', () => {
    it('should return a ServerContext object', () => {
      const ctx = createContext();

      expect(ctx).toBeDefined();
      expect(typeof ctx).toBe('object');
    });

    it('should initialize skillsIndex as null', () => {
      const ctx = createContext();

      expect(ctx.skillsIndex).toBeNull();
    });

    it('should initialize agentsIndex as null', () => {
      const ctx = createContext();

      expect(ctx.agentsIndex).toBeNull();
    });

    it('should initialize toolsIndex as null', () => {
      const ctx = createContext();

      expect(ctx.toolsIndex).toBeNull();
    });

    it('should initialize skillsRegistry as null', () => {
      const ctx = createContext();

      expect(ctx.skillsRegistry).toBeNull();
    });

    it('should have all required ServerContext properties', () => {
      const ctx = createContext();

      expect('skillsIndex' in ctx).toBe(true);
      expect('agentsIndex' in ctx).toBe(true);
      expect('toolsIndex' in ctx).toBe(true);
      expect('skillsRegistry' in ctx).toBe(true);
    });

    it('should return a new object each time', () => {
      const ctx1 = createContext();
      const ctx2 = createContext();

      expect(ctx1).not.toBe(ctx2);
      expect(ctx1).toEqual(ctx2);
    });

    it('should be assignable to ServerContext type', () => {
      const ctx: ServerContext = createContext();

      // This test primarily validates TypeScript compilation
      expect(ctx.skillsIndex).toBeNull();
      expect(ctx.agentsIndex).toBeNull();
      expect(ctx.toolsIndex).toBeNull();
      expect(ctx.skillsRegistry).toBeNull();
    });
  });

  describe('ServerContext interface', () => {
    it('should allow setting skillsIndex after creation', () => {
      const ctx = createContext();
      // Create a mock Fuse instance
      const mockFuse = { search: () => [] } as unknown as typeof ctx.skillsIndex;

      ctx.skillsIndex = mockFuse;

      expect(ctx.skillsIndex).toBe(mockFuse);
    });

    it('should allow setting agentsIndex after creation', () => {
      const ctx = createContext();
      const mockFuse = { search: () => [] } as unknown as typeof ctx.agentsIndex;

      ctx.agentsIndex = mockFuse;

      expect(ctx.agentsIndex).toBe(mockFuse);
    });

    it('should allow setting toolsIndex after creation', () => {
      const ctx = createContext();
      const mockFuse = { search: () => [] } as unknown as typeof ctx.toolsIndex;

      ctx.toolsIndex = mockFuse;

      expect(ctx.toolsIndex).toBe(mockFuse);
    });

    it('should allow setting skillsRegistry after creation', () => {
      const ctx = createContext();
      const mockRegistry = {
        version: '1.0.0',
        search_index: [],
      } as unknown as typeof ctx.skillsRegistry;

      ctx.skillsRegistry = mockRegistry;

      expect(ctx.skillsRegistry).toBe(mockRegistry);
    });

    it('should support partial initialization pattern', () => {
      const ctx = createContext();

      // Simulate lazy loading - only set what's needed
      ctx.skillsIndex = {
        search: () => [],
      } as unknown as typeof ctx.skillsIndex;

      // Other indexes remain null
      expect(ctx.skillsIndex).not.toBeNull();
      expect(ctx.agentsIndex).toBeNull();
      expect(ctx.toolsIndex).toBeNull();
    });
  });

  describe('context immutability', () => {
    it('should allow property modification', () => {
      const ctx = createContext();

      // Context is mutable by design for lazy loading
      expect(() => {
        ctx.skillsIndex = null;
      }).not.toThrow();
    });

    it('should not share state between contexts', () => {
      const ctx1 = createContext();
      const ctx2 = createContext();

      ctx1.skillsRegistry = {
        version: '1.0.0',
        search_index: [],
      };

      // Modifying ctx1 should not affect ctx2
      expect(ctx1.skillsRegistry).not.toBeNull();
      expect(ctx2.skillsRegistry).toBeNull();
    });
  });
});
