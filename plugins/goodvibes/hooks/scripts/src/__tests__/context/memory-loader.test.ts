/**
 * Unit tests for memory-loader module.
 * Tests for 100% code coverage of all functions and branches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { loadMemory, formatMemory, ProjectMemory, Decision, Pattern, Failure, Preferences } from '../../context/memory-loader.js';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../../shared/logging.js', () => ({
  debug: vi.fn(),
}));
vi.mock('../../shared/file-utils.js', () => ({
  fileExists: vi.fn(),
}));

const mockedFsPromises = vi.mocked(fs);
const mockedFileExists = vi.mocked((await import('../../shared/file-utils.js')).fileExists);

describe('memory-loader', () => {
  const testCwd = '/test/project';
  const memoryPath = path.join(testCwd, '.goodvibes/memory');

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no files exist
    mockedFileExists.mockResolvedValue(false);
    mockedFsPromises.readFile.mockRejectedValue(new Error('ENOENT'));
    mockedFsPromises.readdir.mockResolvedValue([]);
    mockedFsPromises.stat.mockRejectedValue(new Error('ENOENT'));
  });

  describe('loadMemory', () => {
    it('should return empty memory when .goodvibes/memory directory does not exist', async () => {
      mockedFileExists.mockResolvedValue(false);

      const result = await loadMemory(testCwd);

      expect(result).toEqual({
        decisions: [],
        patterns: [],
        failures: [],
        preferences: {},
        customContext: [],
      });
      expect(mockedFileExists).toHaveBeenCalledWith(memoryPath);
    });

    it('should load all memory files when they exist', async () => {
      const decisions: Decision[] = [
        { date: '2024-01-01', description: 'Use TypeScript', rationale: 'Type safety' },
      ];
      const patterns: Pattern[] = [
        { name: 'Factory', description: 'Use factory pattern', examples: ['createUser()'] },
      ];
      const failures: Failure[] = [
        { date: '2024-01-02', error: 'npm install failed', resolution: 'Cleared cache' },
      ];
      const preferences: Preferences = {
        codeStyle: { indent: '2 spaces' },
        conventions: ['camelCase'],
      };

      // Mock memory directory exists
      mockedFileExists.mockImplementation(async (filePath: string) => {
        if (filePath === memoryPath) return true;
        if (filePath.endsWith('decisions.json')) return true;
        if (filePath.endsWith('patterns.json')) return true;
        if (filePath.endsWith('failures.json')) return true;
        if (filePath.endsWith('preferences.json')) return true;
        if (filePath.endsWith('context')) return true;
        return false;
      });

      // Mock reading JSON files
      mockedFsPromises.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('decisions.json')) return JSON.stringify(decisions);
        if (filePath.endsWith('patterns.json')) return JSON.stringify(patterns);
        if (filePath.endsWith('failures.json')) return JSON.stringify(failures);
        if (filePath.endsWith('preferences.json')) return JSON.stringify(preferences);
        throw new Error('File not found');
      });

      // Mock context directory
      mockedFsPromises.stat.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('context')) {
          return { isDirectory: () => true } as any;
        }
        throw new Error('ENOENT');
      });

      mockedFsPromises.readdir.mockImplementation(async (dirPath: any) => {
        if (dirPath.endsWith('context')) {
          return ['note1.md', 'note2.txt'] as any;
        }
        return [] as any;
      });

      mockedFsPromises.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('decisions.json')) return JSON.stringify(decisions);
        if (filePath.endsWith('patterns.json')) return JSON.stringify(patterns);
        if (filePath.endsWith('failures.json')) return JSON.stringify(failures);
        if (filePath.endsWith('preferences.json')) return JSON.stringify(preferences);
        if (filePath.endsWith('note1.md')) return 'Custom context 1';
        if (filePath.endsWith('note2.txt')) return 'Custom context 2';
        throw new Error('File not found');
      });

      const result = await loadMemory(testCwd);

      expect(result.decisions).toEqual(decisions);
      expect(result.patterns).toEqual(patterns);
      expect(result.failures).toEqual(failures);
      expect(result.preferences).toEqual(preferences);
      expect(result.customContext).toContain('Custom context 1');
      expect(result.customContext).toContain('Custom context 2');
    });

    it('should handle missing JSON files gracefully', async () => {
      // Memory directory exists but files don't
      mockedFileExists.mockImplementation(async (filePath: string) => {
        if (filePath === memoryPath) return true;
        if (filePath.endsWith('context')) return true;
        return false;
      });

      // Mock context directory
      mockedFsPromises.stat.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('context')) {
          return { isDirectory: () => true } as any;
        }
        throw new Error('ENOENT');
      });

      mockedFsPromises.readdir.mockResolvedValue([] as any);

      const result = await loadMemory(testCwd);

      expect(result).toEqual({
        decisions: [],
        patterns: [],
        failures: [],
        preferences: {},
        customContext: [],
      });
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockedFileExists.mockImplementation(async (filePath: string) => {
        if (filePath === memoryPath) return true;
        if (filePath.endsWith('decisions.json')) return true;
        return false;
      });

      // Mock invalid JSON
      mockedFsPromises.readFile.mockResolvedValue('{ invalid json' as any);

      const result = await loadMemory(testCwd);

      expect(result.decisions).toEqual([]);
    });

    it('should handle file read errors gracefully', async () => {
      mockedFileExists.mockImplementation(async (filePath: string) => {
        if (filePath === memoryPath) return true;
        if (filePath.endsWith('patterns.json')) return true;
        return false;
      });

      // Mock read error
      mockedFsPromises.readFile.mockRejectedValue(new Error('Permission denied'));

      const result = await loadMemory(testCwd);

      expect(result.patterns).toEqual([]);
    });

    it('should filter out empty custom context files', async () => {
      mockedFileExists.mockImplementation(async (filePath: string) => {
        if (filePath === memoryPath) return true;
        if (filePath.endsWith('context')) return true;
        return false;
      });

      mockedFsPromises.stat.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('context')) {
          return { isDirectory: () => true } as any;
        }
        throw new Error('ENOENT');
      });

      mockedFsPromises.readdir.mockResolvedValue(['empty.md', 'content.txt'] as any);
      mockedFsPromises.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('empty.md')) return '   \n  \t  ' as any; // Whitespace only
        if (filePath.endsWith('content.txt')) return 'Real content' as any;
        throw new Error('File not found');
      });

      const result = await loadMemory(testCwd);

      expect(result.customContext).toEqual(['Real content']);
      expect(result.customContext).not.toContain('   \n  \t  ');
    });

    it('should only load .md and .txt files from context directory', async () => {
      mockedFileExists.mockImplementation(async (filePath: string) => {
        if (filePath === memoryPath) return true;
        if (filePath.endsWith('context')) return true;
        return false;
      });

      mockedFsPromises.stat.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('context')) {
          return { isDirectory: () => true } as any;
        }
        throw new Error('ENOENT');
      });

      mockedFsPromises.readdir.mockResolvedValue([
        'note.md',
        'readme.txt',
        'script.js',
        'config.json',
        'image.png',
      ] as any);

      mockedFsPromises.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('note.md')) return 'Markdown content' as any;
        if (filePath.endsWith('readme.txt')) return 'Text content' as any;
        throw new Error('Should not read this file');
      });

      const result = await loadMemory(testCwd);

      expect(result.customContext).toHaveLength(2);
      expect(result.customContext).toContain('Markdown content');
      expect(result.customContext).toContain('Text content');
    });

    it('should handle context directory not being a directory', async () => {
      mockedFileExists.mockImplementation(async (filePath: string) => {
        if (filePath === memoryPath) return true;
        if (filePath.endsWith('context')) return true; // Exists but is a file
        return false;
      });

      mockedFsPromises.stat.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('context')) {
          return { isDirectory: () => false } as any; // Not a directory
        }
        throw new Error('ENOENT');
      });

      const result = await loadMemory(testCwd);

      expect(result.customContext).toEqual([]);
    });

    it('should handle errors when reading context directory', async () => {
      mockedFileExists.mockImplementation(async (filePath: string) => {
        if (filePath === memoryPath) return true;
        if (filePath.endsWith('context')) return true;
        return false;
      });

      mockedFsPromises.stat.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('context')) {
          return { isDirectory: () => true } as any;
        }
        throw new Error('ENOENT');
      });

      // Mock readdir error
      mockedFsPromises.readdir.mockRejectedValue(new Error('Permission denied'));

      const result = await loadMemory(testCwd);

      expect(result.customContext).toEqual([]);
    });

    it('should handle errors when checking if path is directory', async () => {
      mockedFileExists.mockImplementation(async (filePath: string) => {
        if (filePath === memoryPath) return true;
        if (filePath.endsWith('context')) return true;
        return false;
      });

      // Mock stat error
      mockedFsPromises.stat.mockRejectedValue(new Error('Permission denied'));

      const result = await loadMemory(testCwd);

      expect(result.customContext).toEqual([]);
    });

    it('should handle errors when reading individual context files', async () => {
      mockedFileExists.mockImplementation(async (filePath: string) => {
        if (filePath === memoryPath) return true;
        if (filePath.endsWith('context')) return true;
        return false;
      });

      mockedFsPromises.stat.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('context')) {
          return { isDirectory: () => true } as any;
        }
        throw new Error('ENOENT');
      });

      mockedFsPromises.readdir.mockResolvedValue(['good.md', 'bad.md'] as any);
      mockedFsPromises.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.endsWith('good.md')) return 'Good content' as any;
        if (filePath.endsWith('bad.md')) throw new Error('Read error');
        throw new Error('Unexpected file');
      });

      const result = await loadMemory(testCwd);

      // Should still include the file that read successfully
      expect(result.customContext).toContain('Good content');
    });
  });

  describe('formatMemory', () => {
    it('should return null when memory is completely empty', () => {
      const emptyMemory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: {},
        customContext: [],
      };

      const result = formatMemory(emptyMemory);

      expect(result).toBeNull();
    });

    it('should format decisions correctly', () => {
      const memory: ProjectMemory = {
        decisions: [
          { date: '2024-01-01', description: 'Use TypeScript' },
          { date: '2024-01-02', description: 'Use React', rationale: 'Component reusability' },
          { date: '2024-01-03', description: 'Use Vite', rationale: 'Fast builds' },
          { date: '2024-01-04', description: 'Old decision (should not appear)' },
        ],
        patterns: [],
        failures: [],
        preferences: {},
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toContain('**Recent Decisions:**');
      expect(result).toContain('- Use React (Component reusability)');
      expect(result).toContain('- Use Vite (Fast builds)');
      // Should only show last 3 decisions
      expect(result).not.toContain('Old decision');
    });

    it('should format decisions without rationale', () => {
      const memory: ProjectMemory = {
        decisions: [{ date: '2024-01-01', description: 'Use TypeScript' }],
        patterns: [],
        failures: [],
        preferences: {},
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toContain('- Use TypeScript');
      expect(result).not.toContain('()');
    });

    it('should format patterns correctly', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [
          { name: 'Factory', description: 'Use factory pattern' },
          { name: 'Singleton', description: 'Use singleton pattern' },
          { name: 'Observer', description: 'Use observer pattern' },
          { name: 'Strategy', description: 'Use strategy pattern' },
          { name: 'Decorator', description: 'Use decorator pattern' },
          { name: 'Adapter', description: 'Should not appear (6th pattern)' },
        ],
        failures: [],
        preferences: {},
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toContain('**Project Patterns:**');
      expect(result).toContain('- **Factory:** Use factory pattern');
      expect(result).toContain('- **Decorator:** Use decorator pattern');
      // Should only show first 5 patterns
      expect(result).not.toContain('Adapter');
    });

    it('should format failures correctly', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [
          { date: '2024-01-01', error: 'Build failed' },
          { date: '2024-01-02', error: 'Test failed', resolution: 'Fixed type error' },
          { date: '2024-01-03', error: 'Deploy failed', resolution: 'Updated config' },
        ],
        preferences: {},
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toContain('**Recent Issues:**');
      expect(result).toContain('- Test failed -> Resolved: Fixed type error');
      expect(result).toContain('- Deploy failed -> Resolved: Updated config');
      // Should only show last 2 failures
      expect(result).not.toContain('Build failed');
    });

    it('should format failures without resolution', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [{ date: '2024-01-01', error: 'Build failed' }],
        preferences: {},
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toContain('- Build failed');
      expect(result).not.toContain('Resolved');
    });

    it('should format preferences with conventions', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: {
          conventions: ['camelCase', 'use async/await', 'prefer const'],
        },
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toContain('**Preferences:**');
      expect(result).toContain('- Conventions: camelCase, use async/await, prefer const');
    });

    it('should format preferences with avoidPatterns', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: {
          avoidPatterns: ['var keyword', 'callback hell', 'any type'],
        },
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toContain('**Preferences:**');
      expect(result).toContain('- Avoid: var keyword, callback hell, any type');
    });

    it('should format preferences with preferredLibraries', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: {
          preferredLibraries: {
            testing: 'vitest',
            'state-management': 'zustand',
            styling: 'tailwind',
          },
        },
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toContain('**Preferences:**');
      expect(result).toContain('- Preferred:');
      expect(result).toContain('testing: vitest');
      expect(result).toContain('state-management: zustand');
      expect(result).toContain('styling: tailwind');
    });

    it('should format preferences with all fields', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: {
          conventions: ['camelCase'],
          avoidPatterns: ['var keyword'],
          preferredLibraries: { testing: 'vitest' },
        },
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toContain('**Preferences:**');
      expect(result).toContain('- Conventions: camelCase');
      expect(result).toContain('- Avoid: var keyword');
      expect(result).toContain('- Preferred: testing: vitest');
    });

    it('should not show preferences section when all arrays are empty', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: {
          conventions: [],
          avoidPatterns: [],
          preferredLibraries: {},
        },
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toBeNull();
    });

    it('should handle preferences with empty preferredLibraries object', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: {
          conventions: ['camelCase'],
          preferredLibraries: {},
        },
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toContain('- Conventions: camelCase');
      expect(result).not.toContain('- Preferred:');
    });

    it('should format custom context correctly', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: {},
        customContext: ['Important note 1', 'Important note 2', 'Important note 3'],
      };

      const result = formatMemory(memory);

      expect(result).toContain('**Custom Context:**');
      expect(result).toContain('Important note 1');
      expect(result).toContain('Important note 2');
      expect(result).toContain('Important note 3');
      // Should separate with double newlines
      expect(result).toContain('Important note 1\n\nImportant note 2');
    });

    it('should format all sections together', () => {
      const memory: ProjectMemory = {
        decisions: [{ date: '2024-01-01', description: 'Use TypeScript' }],
        patterns: [{ name: 'Factory', description: 'Use factory pattern' }],
        failures: [{ date: '2024-01-02', error: 'Test failed' }],
        preferences: {
          conventions: ['camelCase'],
        },
        customContext: ['Custom note'],
      };

      const result = formatMemory(memory);

      expect(result).toContain('**Recent Decisions:**');
      expect(result).toContain('**Project Patterns:**');
      expect(result).toContain('**Recent Issues:**');
      expect(result).toContain('**Preferences:**');
      expect(result).toContain('**Custom Context:**');
      // Sections should be separated by double newlines
      expect(result?.split('\n\n').length).toBeGreaterThan(4);
    });

    it('should handle preferences with only codeStyle (which is not displayed)', () => {
      const memory: ProjectMemory = {
        decisions: [],
        patterns: [],
        failures: [],
        preferences: {
          codeStyle: { indent: '2 spaces' },
        },
        customContext: [],
      };

      const result = formatMemory(memory);

      expect(result).toBeNull();
    });
  });
});
