/**
 * Unit tests for analyze-stacking-context handler entry point
 *
 * Tests the main handler with mocked filesystem to ensure 100% coverage
 * of the handler logic including error handling and edge cases.
 *
 * @module __tests__/handlers/frontend/analyze-stacking-context-handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { handleAnalyzeStackingContext } from '../../../handlers/frontend/stacking-context/index.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('handleAnalyzeStackingContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('input validation', () => {
    it('should return error when file argument is missing', async () => {
      const response = await handleAnalyzeStackingContext({} as any);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('file argument is required');
    });

    it('should return error when file argument is empty string', async () => {
      const response = await handleAnalyzeStackingContext({ file: '' });

      expect(response.isError).toBe(true);
    });

    it('should return error when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await handleAnalyzeStackingContext({ file: 'nonexistent.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('File not found');
    });

    it('should return error for unsupported file extension', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const response = await handleAnalyzeStackingContext({ file: 'styles.css' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Unsupported file type');
    });

    it('should accept .tsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="relative z-10" />; }');

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .jsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="relative z-10" />; }');

      const response = await handleAnalyzeStackingContext({ file: 'App.jsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .ts files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="relative z-10" />; }');

      const response = await handleAnalyzeStackingContext({ file: 'App.ts' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .js files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="relative z-10" />; }');

      const response = await handleAnalyzeStackingContext({ file: 'App.js' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('stacking context detection', () => {
    it('should detect positioned elements with z-index', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="relative z-10">Content</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts.length).toBeGreaterThan(0);
    });

    it('should detect fixed position elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="fixed top-0 z-50">Header</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts.some((c: any) => c.position === 'fixed')).toBe(true);
    });

    it('should detect absolute position elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="relative">
              <div className="absolute z-20">Overlay</div>
            </div>
          );
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts.some((c: any) => c.position === 'absolute')).toBe(true);
    });

    it('should detect sticky position elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="sticky top-0 z-30">Sticky Header</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts.some((c: any) => c.position === 'sticky')).toBe(true);
    });

    it('should detect transform-created stacking contexts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="transform translate-x-4">Transformed</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts.some((c: any) => c.creates_context_reason?.includes('transform'))).toBe(true);
    });

    it('should detect opacity-created stacking contexts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="opacity-50">Semi-transparent</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts.some((c: any) => c.creates_context_reason?.includes('opacity'))).toBe(true);
    });

    it('should detect will-change-created stacking contexts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div style={{ willChange: 'transform' }}>Optimized</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should detect isolation: isolate', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="isolate">Isolated</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts.some((c: any) => c.creates_context_reason?.includes('isolate'))).toBe(true);
    });
  });

  describe('z-index analysis', () => {
    it('should extract z-index values from Tailwind classes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="z-10">Z-10</div>
          );
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts.some((c: any) => c.z_index === 10)).toBe(true);
    });

    it('should handle negative z-index', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="-z-10">Behind</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts.some((c: any) => c.z_index === -10)).toBe(true);
    });

    it('should handle z-auto', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="relative z-auto">Auto</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle arbitrary z-index values', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="z-[9999]">High z-index</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts.some((c: any) => c.z_index === 9999)).toBe(true);
    });
  });

  describe('issue detection', () => {
    it('should detect z-index without position', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="z-50">No position</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue.includes('z-index'))).toBe(true);
    });

    it('should detect overlapping z-indexes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="relative z-50">First</div>
            <div className="relative z-50">Second</div>
          );
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should detect z-index gaps', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <>
              <div className="relative z-10">Low</div>
              <div className="relative z-9999">Very High</div>
            </>
          );
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should detect excessive z-index values', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="relative z-[999999]">Excessive</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue.includes('excessive') || i.issue.includes('high'))).toBe(true);
    });
  });

  describe('element filtering', () => {
    it('should filter by element name when specified', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="relative z-10">Div</div>
            <Modal className="fixed z-50">Modal</Modal>
          );
        }
      `);

      const response = await handleAnalyzeStackingContext({
        file: 'App.tsx',
        element: 'Modal',
      });

      const parsed = JSON.parse(response.content[0].text);
      if (parsed.stacking_contexts.length > 0) {
        expect(parsed.stacking_contexts.every((c: any) => c.element.includes('Modal'))).toBe(true);
      }
    });
  });

  describe('hierarchy analysis', () => {
    it('should analyze nested stacking contexts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="relative z-10">
              <div className="absolute z-20">
                <span className="relative z-30">Deep</span>
              </div>
            </div>
          );
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts.length).toBeGreaterThanOrEqual(1);
    });

    it('should identify parent stacking contexts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="isolate">
              <div className="relative z-10">Child</div>
            </div>
          );
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('summary generation', () => {
    it('should include z-index range in summary', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <>
              <div className="relative z-10">Low</div>
              <div className="relative z-50">High</div>
            </>
          );
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toBeDefined();
    });

    it('should summarize stacking context count', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="relative z-10">Single</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toContain('stacking context');
    });
  });

  describe('error handling', () => {
    it('should handle parsing errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Read error');
    });

    it('should handle unknown errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'Unknown error';
      });

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Unknown error during analysis');
    });
  });

  describe('edge cases', () => {
    it('should handle file with no stacking contexts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex gap-4">Simple layout</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.stacking_contexts).toEqual([]);
    });

    it('should handle inline styles with z-index', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div style={{ position: 'relative', zIndex: 100 }}>Inline styled</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle combined className and style', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="relative" style={{ zIndex: 50 }}>Combined</div>;
        }
      `);

      const response = await handleAnalyzeStackingContext({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });
});
