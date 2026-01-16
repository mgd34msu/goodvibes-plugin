/**
 * Unit tests for analyze-responsive-breakpoints handler entry point
 *
 * Tests the main handler with mocked filesystem to ensure 100% coverage
 * of the handler logic including error handling and edge cases.
 *
 * @module __tests__/handlers/frontend/analyze-responsive-breakpoints-handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { handleAnalyzeResponsiveBreakpoints } from '../../../handlers/frontend/responsive-breakpoints/index.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('handleAnalyzeResponsiveBreakpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('input validation', () => {
    it('should return error when file argument is missing', async () => {
      const response = await handleAnalyzeResponsiveBreakpoints({} as any);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('file argument is required');
    });

    it('should return error when file argument is empty string', async () => {
      const response = await handleAnalyzeResponsiveBreakpoints({ file: '' });

      expect(response.isError).toBe(true);
    });

    it('should return error when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'nonexistent.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('File not found');
    });

    it('should return error for unsupported file extension', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'styles.css' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Unsupported file type');
    });

    it('should accept .tsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex" />; }');

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .jsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex" />; }');

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.jsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .ts files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex" />; }');

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.ts' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .js files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex" />; }');

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.js' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle absolute file paths', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex" />; }');

      const response = await handleAnalyzeResponsiveBreakpoints({ file: '/absolute/path/App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('breakpoint detection', () => {
    it('should detect base classes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex gap-4" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.breakpoints_used).toContain('base');
    });

    it('should detect sm breakpoint classes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex sm:hidden" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.breakpoints_used).toContain('sm');
    });

    it('should detect md breakpoint classes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex-col md:flex-row" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.breakpoints_used).toContain('md');
    });

    it('should detect lg breakpoint classes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="gap-4 lg:gap-8" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.breakpoints_used).toContain('lg');
    });

    it('should detect xl breakpoint classes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="text-lg xl:text-xl" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.breakpoints_used).toContain('xl');
    });

    it('should detect 2xl breakpoint classes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="max-w-6xl 2xl:max-w-7xl" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.breakpoints_used).toContain('2xl');
    });
  });

  describe('element filtering', () => {
    it('should filter by element name when specified', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="flex">
              <button className="md:hidden" />
              <span className="lg:block" />
            </div>
          );
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({
        file: 'App.tsx',
        element: 'button',
      });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements.every((e: any) => e.element.includes('button'))).toBe(true);
    });

    it('should return all elements when no filter specified', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="flex">
              <button className="md:hidden" />
            </div>
          );
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements.length).toBeGreaterThan(0);
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

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements.length).toBeGreaterThan(0);
    });

    it('should extract className from JSX expression', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className={"flex gap-4"} />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements.length).toBeGreaterThan(0);
    });

    it('should extract className from template literal', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('<div className={`flex ${condition ? "hidden" : "block"}`} />');

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements.length).toBeGreaterThan(0);
    });

    it('should extract className from cn/clsx calls', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className={cn("flex", "gap-4", condition && "hidden")} />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements.length).toBeGreaterThan(0);
    });

    it('should handle conditional expressions in className', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className={isActive ? "bg-blue-500" : "bg-gray-500"} />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements.length).toBeGreaterThan(0);
    });
  });

  describe('issue detection', () => {
    it('should detect desktop-first patterns', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="lg:flex" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue.includes('Desktop-first'))).toBe(true);
    });

    it('should detect hidden on mobile without show class', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="hidden" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue.includes('hidden on mobile'))).toBe(true);
    });

    it('should not flag hidden if shown at breakpoint', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="hidden md:block" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue.includes('hidden on mobile'))).toBe(false);
    });

    it('should detect breakpoint gaps', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="sm:flex xl:grid" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue.includes('Breakpoint gap'))).toBe(true);
    });

    it('should detect multiple display classes at same breakpoint', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex grid" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.issues.some((i: any) => i.issue.includes('Multiple display'))).toBe(true);
    });
  });

  describe('property tracking', () => {
    it('should track display property changes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex md:grid" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      const element = parsed.elements[0];
      expect(element.property_changes.some((c: any) => c.property === 'display')).toBe(true);
    });

    it('should track flex-direction changes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex-col md:flex-row" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      const element = parsed.elements[0];
      expect(element.property_changes.some((c: any) => c.property === 'flex-direction')).toBe(true);
    });

    it('should track gap changes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="gap-2 md:gap-4 lg:gap-8" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      const element = parsed.elements[0];
      const gapChanges = element.property_changes.find((c: any) => c.property === 'gap');
      expect(gapChanges?.transitions.length).toBe(2);
    });

    it('should track width changes', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="w-full md:w-1/2 lg:w-1/3" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      const element = parsed.elements[0];
      expect(element.property_changes.some((c: any) => c.property === 'width')).toBe(true);
    });
  });

  describe('summary generation', () => {
    it('should include breakpoints used in summary', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex md:hidden lg:block" />;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.summary).toContain('md');
      expect(parsed.summary).toContain('lg');
    });
  });

  describe('error handling', () => {
    it('should handle parsing errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Read error');
    });

    it('should handle unknown errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'Unknown error';
      });

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Unknown error during analysis');
    });
  });

  describe('empty file handling', () => {
    it('should handle file with no classNames', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div>Hello</div>;
        }
      `);

      const response = await handleAnalyzeResponsiveBreakpoints({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.elements).toEqual([]);
    });
  });
});
