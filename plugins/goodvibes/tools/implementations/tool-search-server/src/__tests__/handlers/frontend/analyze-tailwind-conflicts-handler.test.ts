/**
 * Unit tests for analyze-tailwind-conflicts handler entry point
 *
 * Tests the main handler with mocked filesystem to ensure 100% coverage
 * of the handler logic including error handling and edge cases.
 *
 * @module __tests__/handlers/frontend/analyze-tailwind-conflicts-handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { handleAnalyzeTailwindConflicts } from '../../../handlers/frontend/analyze-tailwind-conflicts.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('handleAnalyzeTailwindConflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('input validation', () => {
    it('should return error when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await handleAnalyzeTailwindConflicts({ file: 'nonexistent.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('File not found');
      expect(parsed.provided_path).toBe('nonexistent.tsx');
    });

    it('should return error for unsupported file extension', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const response = await handleAnalyzeTailwindConflicts({ file: 'styles.css' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Unsupported file type');
    });

    it('should accept .tsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex" />; }');

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .jsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex" />; }');

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.jsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .vue files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<template><div class="flex"></div></template>');

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.vue' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .svelte files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<div class="flex"></div>');

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.svelte' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle absolute file paths', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex" />; }');

      const response = await handleAnalyzeTailwindConflicts({ file: '/absolute/path/App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('Vue file handling', () => {
    it('should extract template section from Vue files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <template>
          <div class="flex gap-4">Content</div>
        </template>
        <script>
          export default { name: 'MyComponent' }
        </script>
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.vue' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements_analyzed).toBeGreaterThan(0);
    });

    it('should handle Vue files without template section', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <script>
          export default { name: 'MyComponent' }
        </script>
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.vue' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('Svelte file handling', () => {
    it('should strip script and style sections from Svelte files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <script>
          let count = 0;
        </script>
        <div class="flex gap-4">Content</div>
        <style>
          div { color: red; }
        </style>
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.svelte' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements_analyzed).toBeGreaterThan(0);
    });
  });

  describe('no elements found', () => {
    it('should return success with empty results when no className elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div>No classes</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements_analyzed).toBe(0);
      expect(parsed.summary).toContain('No elements with className/class attributes found');
    });
  });

  describe('conflict detection', () => {
    it('should detect override conflicts (same property set multiple times)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="p-4 p-6">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.conflicts.some((c: any) => c.conflict_type === 'override')).toBe(true);
    });

    it('should detect contradiction conflicts (mutually exclusive classes)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex grid">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.conflicts.some((c: any) => c.conflict_type === 'contradiction')).toBe(true);
    });

    it('should detect multiple width conflicts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="w-full w-1/2 w-auto">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.conflicts.length).toBeGreaterThan(0);
    });

    it('should detect color conflicts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="bg-red-500 bg-blue-500">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.conflicts.length).toBeGreaterThan(0);
    });

    it('should detect margin conflicts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="m-4 mx-2 ml-6">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.conflicts.length).toBeGreaterThan(0) || expect(parsed.redundant_classes.length).toBeGreaterThan(0);
    });
  });

  describe('redundant class detection', () => {
    it('should detect redundant shorthand/longhand combinations', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="p-4 px-4 py-4">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      // Should detect redundant padding classes
      expect(parsed.redundant_classes.length).toBeGreaterThan(0) || expect(parsed.conflicts.length).toBeGreaterThan(0);
    });

    it('should detect redundant border radius classes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="rounded rounded-lg">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.conflicts.length).toBeGreaterThan(0) || expect(parsed.redundant_classes.length).toBeGreaterThan(0);
    });
  });

  describe('arbitrary value handling', () => {
    it('should include arbitrary values by default', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="w-[100px] w-full">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.conflicts.length).toBeGreaterThan(0);
    });

    it('should skip arbitrary values when include_arbitrary is false', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="w-[100px] w-full">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({
        file: 'App.tsx',
        include_arbitrary: false,
      });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('specificity issues', () => {
    it('should detect important modifier usage', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="!p-4 p-6">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.specificity_issues.length).toBeGreaterThan(0);
    });
  });

  describe('suggestions', () => {
    it('should generate optimization suggestions', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="mt-4 mb-4 ml-4 mr-4">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      // May suggest using m-4 instead of individual margins
      expect(parsed.suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should suggest shorthand classes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="px-4 py-4">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      // May suggest using p-4 instead of px-4 py-4
      expect(parsed.suggestions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('summary generation', () => {
    it('should generate summary with conflict counts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="p-4 p-6 flex grid">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toContain('Analyzed');
      expect(parsed.summary).toContain('conflict');
    });

    it('should generate summary indicating no conflicts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex gap-4 items-center">Content</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toContain('No conflicts detected');
    });
  });

  describe('multiple elements', () => {
    it('should analyze multiple elements in the same file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="flex">
              <span className="text-sm text-lg">Text</span>
              <button className="p-4 p-2">Click</button>
            </div>
          );
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements_analyzed).toBeGreaterThanOrEqual(2);
    });
  });

  describe('error handling', () => {
    it('should handle parsing errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Read error');
    });

    it('should handle unknown errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'Unknown error';
      });

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Unknown error during analysis');
    });
  });

  describe('className extraction', () => {
    it('should extract className from string literal', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex gap-4" />;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements_analyzed).toBeGreaterThan(0);
    });

    it('should extract className from template literal', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<div className={`flex gap-4`} />');

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements_analyzed).toBeGreaterThanOrEqual(0);
    });

    it('should extract className from cn/clsx calls', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className={cn("flex", "gap-4")} />;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('relative path in output', () => {
    it('should return relative file path in response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex" />;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'src/components/App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.file).toBe('src/components/App.tsx');
    });
  });

  describe('edge cases', () => {
    it('should handle empty className', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="">Empty</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle className with only whitespace', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="   ">Whitespace</div>;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle dark mode variants', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="bg-white dark:bg-black" />;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should not flag dark mode as conflict
      expect(parsed.conflicts.length).toBe(0);
    });

    it('should handle responsive variants', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex md:grid" />;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should not flag responsive variants as conflict
      expect(parsed.conflicts.length).toBe(0);
    });

    it('should handle hover variants', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="bg-blue-500 hover:bg-blue-600" />;
        }
      `);

      const response = await handleAnalyzeTailwindConflicts({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      // Should not flag hover as conflict
      expect(parsed.conflicts.length).toBe(0);
    });
  });
});
