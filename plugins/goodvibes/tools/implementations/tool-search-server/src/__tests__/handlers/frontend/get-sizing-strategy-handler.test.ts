/**
 * Unit tests for get-sizing-strategy handler entry point
 *
 * Tests the main handler with mocked filesystem to ensure 100% coverage
 * of the handler logic including error handling and edge cases.
 *
 * @module __tests__/handlers/frontend/get-sizing-strategy-handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { handleGetSizingStrategy } from '../../../handlers/frontend/get-sizing-strategy.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('handleGetSizingStrategy', () => {
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

      const response = await handleGetSizingStrategy({
        file: 'nonexistent.tsx',
        element: 'div',
      });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('File not found');
      expect(parsed.provided_path).toBe('nonexistent.tsx');
    });

    it('should return error for unsupported file extension', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const response = await handleGetSizingStrategy({
        file: 'styles.css',
        element: 'div',
      });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Unsupported file type');
    });

    it('should accept .tsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex">Content</div>; }');

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .jsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex">Content</div>; }');

      const response = await handleGetSizingStrategy({
        file: 'App.jsx',
        element: 'div',
      });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .vue files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<template><div class="flex">Content</div></template>');

      const response = await handleGetSizingStrategy({
        file: 'App.vue',
        element: 'div',
      });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .svelte files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<div class="flex">Content</div>');

      const response = await handleGetSizingStrategy({
        file: 'App.svelte',
        element: 'div',
      });

      expect(response.isError).toBeUndefined();
    });

    it('should handle absolute file paths', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex">Content</div>; }');

      const response = await handleGetSizingStrategy({
        file: '/absolute/path/App.tsx',
        element: 'div',
      });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('Vue file handling', () => {
    it('should extract template and convert class attributes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <template>
          <div class="w-full h-screen">Content</div>
        </template>
        <script>
          export default { name: 'MyComponent' }
        </script>
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.vue',
        element: 'div',
      });

      expect(response.isError).toBeUndefined();
    });

    it('should handle v-bind:class', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <template>
          <div v-bind:class="'w-full'">Content</div>
        </template>
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.vue',
        element: 'div',
      });

      expect(response.isError).toBeUndefined();
    });

    it('should handle :class shorthand', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <template>
          <div :class="'flex-1'">Content</div>
        </template>
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.vue',
        element: 'div',
      });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('Svelte file handling', () => {
    it('should convert class to className', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <script>
          let count = 0;
        </script>
        <div class="w-full h-auto">Content</div>
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.svelte',
        element: 'div',
      });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('no JSX found', () => {
    it('should return error when no JSX elements found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

      const response = await handleGetSizingStrategy({
        file: 'utils.tsx',
        element: 'div',
      });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('No JSX element found');
    });
  });

  describe('element not found', () => {
    it('should return error with suggestions when element not found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="container">
              <span className="text">Hello</span>
            </div>
          );
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'button',
      });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('not found');
      expect(parsed.available_selectors).toBeDefined();
    });
  });

  describe('element selectors', () => {
    it('should find element by tag name', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <button className="w-full">Click</button>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'button',
      });

      expect(response.isError).toBeUndefined();
    });

    it('should find element by id (#id)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div id="main" className="flex">Content</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: '#main',
      });

      expect(response.isError).toBeUndefined();
    });

    it('should find element by class (.class)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="container flex">Content</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: '.container',
      });

      expect(response.isError).toBeUndefined();
    });

    it('should find nested elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="outer">
              <div className="inner w-1/2">
                <span className="text">Hello</span>
              </div>
            </div>
          );
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: '.inner',
      });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('width analysis', () => {
    it('should analyze fixed width', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="w-64">Fixed width</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.width.strategy).toBe('fixed');
    });

    it('should analyze percentage width', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="w-1/2">Half width</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.width.strategy).toBe('percentage');
    });

    it('should analyze full width', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="w-full">Full width</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.width.strategy).toBe('percentage');
    });

    it('should analyze auto width', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="w-auto">Auto width</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.width.strategy).toBe('auto');
    });

    it('should analyze min/max width', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="min-w-0 max-w-xl">Constrained width</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.width).toBeDefined();
    });
  });

  describe('height analysis', () => {
    it('should analyze fixed height', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="h-64">Fixed height</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.height.strategy).toBe('fixed');
    });

    it('should analyze screen height', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="h-screen">Full height</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.height.strategy).toBe('viewport');
    });

    it('should analyze percentage height', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="h-full">Full height</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.height.strategy).toBe('percentage');
    });

    it('should analyze auto height', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="h-auto">Auto height</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.height.strategy).toBe('auto');
    });
  });

  describe('flex behavior analysis', () => {
    it('should analyze flex container', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex flex-col">Flex container</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.flex_behavior).toBeDefined();
    });

    it('should analyze flex item with grow', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex-1">Flex grow</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.flex_behavior?.grow).toBe(1);
    });

    it('should analyze flex item with shrink-0', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="shrink-0">No shrink</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.flex_behavior?.shrink).toBe(0);
    });

    it('should analyze flex basis', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="basis-1/2">Half basis</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.flex_behavior?.basis).toBeDefined();
    });
  });

  describe('grid behavior analysis', () => {
    it('should analyze grid container', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="grid grid-cols-3 gap-4">Grid container</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.grid_behavior).toBeDefined();
    });

    it('should analyze grid item span', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="col-span-2">Span 2 columns</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.grid_behavior?.column_span).toBe(2);
    });

    it('should analyze grid row span', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="row-span-2">Span 2 rows</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.grid_behavior?.row_span).toBe(2);
    });
  });

  describe('position context', () => {
    it('should detect static position', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="static">Static</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.position_context).toContain('static');
    });

    it('should detect relative position', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="relative">Relative</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.position_context).toContain('relative');
    });

    it('should detect absolute position', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="absolute top-0 left-0">Absolute</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.position_context).toContain('absolute');
    });

    it('should detect fixed position', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="fixed inset-0">Fixed</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.position_context).toContain('fixed');
    });

    it('should detect sticky position', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="sticky top-0">Sticky</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.position_context).toContain('sticky');
    });
  });

  describe('ancestor chain', () => {
    it('should build ancestor chain', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="h-screen flex flex-col">
              <div className="flex-1">
                <div className="h-full overflow-y-auto">Target</div>
              </div>
            </div>
          );
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: '.overflow-y-auto',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.ancestor_chain.length).toBeGreaterThan(0);
    });
  });

  describe('summary generation', () => {
    it('should generate human-readable summary', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="w-full h-auto flex-1">Content</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toBeDefined();
      expect(typeof parsed.summary).toBe('string');
    });
  });

  describe('error handling', () => {
    it('should handle parsing errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Read error');
    });

    it('should handle unknown errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'Unknown error';
      });

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Unknown error during analysis');
    });
  });

  describe('output format', () => {
    it('should return relative file path in response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex">Content</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'src/components/App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.file).toBe('src/components/App.tsx');
    });

    it('should include classes in response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex gap-4 items-center">Content</div>;
        }
      `);

      const response = await handleGetSizingStrategy({
        file: 'App.tsx',
        element: 'div',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.classes).toContain('flex');
      expect(parsed.classes).toContain('gap-4');
    });
  });
});
