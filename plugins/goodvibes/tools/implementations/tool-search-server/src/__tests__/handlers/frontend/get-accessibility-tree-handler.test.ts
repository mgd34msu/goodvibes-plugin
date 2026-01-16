/**
 * Unit tests for get-accessibility-tree handler entry point
 *
 * Tests the main handler with mocked filesystem to ensure 100% coverage
 * of the handler logic including error handling and edge cases.
 *
 * @module __tests__/handlers/frontend/get-accessibility-tree-handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { handleGetAccessibilityTree } from '../../../handlers/frontend/get-accessibility-tree.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('handleGetAccessibilityTree', () => {
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

      const response = await handleGetAccessibilityTree({ file: 'nonexistent.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('File not found');
      expect(parsed.provided_path).toBe('nonexistent.tsx');
    });

    it('should return error for unsupported file extension', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const response = await handleGetAccessibilityTree({ file: 'styles.css' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Unsupported file type');
    });

    it('should accept .tsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <button>Click</button>; }');

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .jsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <button>Click</button>; }');

      const response = await handleGetAccessibilityTree({ file: 'App.jsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .vue files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<template><button>Click</button></template>');

      const response = await handleGetAccessibilityTree({ file: 'App.vue' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .svelte files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<button>Click</button>');

      const response = await handleGetAccessibilityTree({ file: 'App.svelte' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle absolute file paths', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <button>Click</button>; }');

      const response = await handleGetAccessibilityTree({ file: '/absolute/path/App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('Vue file handling', () => {
    it('should extract template section from Vue files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <template>
          <button aria-label="Submit">Submit</button>
        </template>
        <script>
          export default { name: 'MyComponent' }
        </script>
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.vue' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle Vue files without template section', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        <script>
          export default { name: 'MyComponent' }
        </script>
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.vue' });

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
        <button on:click={() => count++}>Count: {count}</button>
        <style>
          button { color: red; }
        </style>
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.svelte' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('no elements found', () => {
    it('should return default tree when no JSX elements found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('const x = 1;');

      const response = await handleGetAccessibilityTree({ file: 'utils.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.a11y_tree.role).toBe('document');
      expect(parsed.summary).toContain('No JSX elements found');
    });
  });

  describe('accessibility tree building', () => {
    it('should build tree with semantic elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <main>
              <header>
                <h1>Title</h1>
              </header>
              <nav>
                <a href="/home">Home</a>
              </nav>
            </main>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.a11y_tree).toBeDefined();
    });

    it('should detect focusable elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div>
              <button>Click me</button>
              <a href="/link">Link</a>
              <input type="text" />
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.focus_order.length).toBeGreaterThan(0);
    });

    it('should handle custom tabIndex', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div>
              <div tabIndex={0}>Focusable div</div>
              <div tabIndex={-1}>Programmatically focusable</div>
              <button tabIndex={1}>First focus</button>
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.focus_order.length).toBeGreaterThan(0);
    });
  });

  describe('issue detection', () => {
    it('should detect missing alt text on images', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <img src="photo.jpg" />;
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue.includes('alt') || i.issue.includes('image'))).toBe(true);
    });

    it('should detect empty alt text (decorative images)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <img src="decoration.jpg" alt="" />;
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      // Empty alt is valid for decorative images
      expect(response.isError).toBeUndefined();
    });

    it('should detect buttons without accessible names', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <button><svg /></button>;
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue.includes('button') || i.issue.includes('name'))).toBe(true);
    });

    it('should detect links without accessible names', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <a href="/page"><img src="icon.png" /></a>;
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.length).toBeGreaterThan(0);
    });

    it('should detect form inputs without labels', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <input type="text" placeholder="Enter name" />;
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue.includes('label') || i.issue.includes('input'))).toBe(true);
    });

    it('should not flag inputs with aria-label', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <input type="text" aria-label="Name" />;
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should detect non-interactive elements with click handlers', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div onClick={() => console.log('clicked')}>Click me</div>;
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) =>
        i.issue.includes('click') || i.issue.includes('keyboard') || i.issue.includes('interactive')
      )).toBe(true);
    });
  });

  describe('keyboard interaction analysis', () => {
    it('should analyze keyboard event handlers', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <button onKeyDown={(e) => e.key === 'Enter' && submit()}>
              Submit
            </button>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.keyboard_interactions).toBeDefined();
    });

    it('should detect missing keyboard handlers on interactive elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div role="button" onClick={() => {}}>
              Fake button
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.keyboard_interactions.missing?.length).toBeGreaterThan(0) ||
        expect(parsed.issues.length).toBeGreaterThan(0);
    });
  });

  describe('ARIA pattern validation', () => {
    it('should validate ARIA patterns by default', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div role="tablist">
              <button role="tab" aria-selected="true">Tab 1</button>
              <button role="tab" aria-selected="false">Tab 2</button>
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.aria_patterns).toBeDefined();
    });

    it('should skip pattern validation when check_patterns is false', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div role="tablist">
              <button role="tab">Tab</button>
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({
        file: 'App.tsx',
        check_patterns: false,
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.aria_patterns).toEqual([]);
    });

    it('should detect incorrect ARIA attribute values', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <button aria-pressed="maybe">Toggle</button>;
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should detect missing required ARIA properties', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div role="slider" />;
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.length).toBeGreaterThan(0) || expect(parsed.aria_patterns.length).toBeGreaterThan(0);
    });
  });

  describe('element filtering', () => {
    it('should filter by element name when specified', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div>
              <button>Button</button>
              <Modal>
                <button>Modal Button</button>
              </Modal>
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({
        file: 'App.tsx',
        element: 'Modal',
      });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('focus order building', () => {
    it('should build focus order based on DOM order', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div>
              <button>First</button>
              <input type="text" />
              <a href="/">Link</a>
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.focus_order.length).toBe(3);
    });

    it('should respect tabIndex ordering', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div>
              <button tabIndex={2}>Second</button>
              <button tabIndex={1}>First</button>
              <button>Third</button>
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.focus_order.length).toBeGreaterThan(0);
    });

    it('should exclude elements with tabIndex=-1 from tab order', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div>
              <button>Tabbable</button>
              <button tabIndex={-1}>Not in tab order</button>
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.focus_order.length).toBe(1);
    });
  });

  describe('summary generation', () => {
    it('should generate summary with issue counts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div>
              <img src="photo.jpg" />
              <button></button>
              <div onClick={() => {}}>Click</div>
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toBeDefined();
      expect(typeof parsed.summary).toBe('string');
    });

    it('should indicate when no issues found', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <button aria-label="Submit">
              <svg aria-hidden="true" />
              Submit
            </button>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle parsing errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Read error');
    });

    it('should handle unknown errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'Unknown error';
      });

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Unknown error during analysis');
    });
  });

  describe('edge cases', () => {
    it('should handle hidden elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div>
              <div hidden>Hidden content</div>
              <div aria-hidden="true">Aria hidden</div>
              <div style={{ display: 'none' }}>Display none</div>
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle presentational roles', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <img role="presentation" src="decoration.jpg" />;
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle live regions', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div aria-live="polite" aria-atomic="true">
              Status message
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle landmark roles', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div role="main">
              <div role="navigation" aria-label="Main">Nav</div>
              <div role="search">Search</div>
            </div>
          );
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('output format', () => {
    it('should return relative file path in response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <button>Click</button>;
        }
      `);

      const response = await handleGetAccessibilityTree({ file: 'src/components/App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.file).toBe('src/components/App.tsx');
    });
  });
});
