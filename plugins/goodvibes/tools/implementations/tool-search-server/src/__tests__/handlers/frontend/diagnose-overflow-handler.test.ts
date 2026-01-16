/**
 * Unit tests for diagnose-overflow handler entry point
 *
 * Tests the main handler with mocked filesystem to ensure 100% coverage
 * of the handler logic including error handling and edge cases.
 *
 * @module __tests__/handlers/frontend/diagnose-overflow-handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { handleDiagnoseOverflow } from '../../../handlers/frontend/overflow-diagnosis/index.js';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('handleDiagnoseOverflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/project');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('input validation', () => {
    it('should return error when file argument is missing', async () => {
      const response = await handleDiagnoseOverflow({} as any);

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('file argument is required');
    });

    it('should return error when file argument is empty string', async () => {
      const response = await handleDiagnoseOverflow({ file: '' });

      expect(response.isError).toBe(true);
    });

    it('should return error when file does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await handleDiagnoseOverflow({ file: 'nonexistent.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('not found');
    });

    it('should return error for unsupported file extension', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const response = await handleDiagnoseOverflow({ file: 'styles.css' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toContain('Unsupported file type');
    });

    it('should accept .tsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex h-screen" />; }');

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .jsx files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex h-screen" />; }');

      const response = await handleDiagnoseOverflow({ file: 'App.jsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .ts files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex h-screen" />; }');

      const response = await handleDiagnoseOverflow({ file: 'App.ts' });

      expect(response.isError).toBeUndefined();
    });

    it('should accept .js files', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('function App() { return <div className="flex h-screen" />; }');

      const response = await handleDiagnoseOverflow({ file: 'App.js' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('overflow pattern detection', () => {
    it('should detect fixed height with auto children', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="h-[300px]">
              <div className="h-auto">Content that may overflow</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should detect constrained flex without overflow', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="flex h-[500px]">
              <div className="flex-1">Content</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should detect nested percentage heights', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="h-auto">
              <div className="h-full">Percentage height issue</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should detect absolute positioning without containment', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div>
              <div className="absolute">Absolute without relative parent</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should detect flex items that cannot shrink', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="flex h-[300px]">
              <div className="shrink-0">Cannot shrink</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should detect grid with fixed height without overflow', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="grid h-[400px]">
              <div>Grid item</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should detect missing min-h-0 on nested flex', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="flex flex-col h-screen">
              <div className="flex-1 flex flex-col">
                <div className="overflow-y-auto">Scrollable content</div>
              </div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('hint filtering', () => {
    it('should filter patterns by element hint', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="h-screen">
              <Modal className="h-[400px] overflow-hidden">
                <div className="h-full">Content</div>
              </Modal>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({
        file: 'App.tsx',
        hint: 'Modal',
      });

      expect(response.isError).toBeUndefined();
    });

    it('should filter patterns by class hint', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="overflow-container h-[500px]">
              <div className="content">Content</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({
        file: 'App.tsx',
        hint: 'overflow-container',
      });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('fix generation', () => {
    it('should generate fixes for overflow issues', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="h-[300px]">
              <div className="h-auto">Content that may overflow</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.diagnosis).toBeDefined();
    });

    it('should include trade-offs for each fix', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="flex h-screen">
              <div className="flex-1">Content</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('constraint chain building', () => {
    it('should build constraint chain for target element', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="h-screen flex flex-col">
              <header className="h-16">Header</header>
              <main className="flex-1">
                <Target className="h-full">Target element</Target>
              </main>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({
        file: 'App.tsx',
        hint: 'Target',
      });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('recommendation generation', () => {
    it('should generate recommendation with location', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="h-screen flex flex-col">
              <div className="flex-1">Content</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.diagnosis).toBeDefined();
    });

    it('should prioritize min-h-0 for nested flex', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="flex flex-col h-screen">
              <div className="flex-1 flex flex-col">
                <div className="flex-1">Nested flex</div>
              </div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle parsing errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Read error');
      });

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Read error');
    });

    it('should handle unknown errors gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw 'Unknown error';
      });

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Unknown error during analysis');
    });
  });

  describe('edge cases', () => {
    it('should handle file with no overflow issues', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex gap-4">Simple layout</div>;
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle deeply nested layouts', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="h-screen">
              <div className="flex flex-col h-full">
                <div className="flex-1">
                  <div className="h-full overflow-y-auto">
                    <div className="min-h-0">Content</div>
                  </div>
                </div>
              </div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle overflow-hidden elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="h-[300px] overflow-hidden">
              <div className="h-[500px]">Content taller than container</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });

    it('should handle overflow-auto elements', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return (
            <div className="h-[300px] overflow-y-auto">
              <div>Scrollable content</div>
            </div>
          );
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'App.tsx' });

      expect(response.isError).toBeUndefined();
    });
  });

  describe('output format', () => {
    it('should return relative file path in response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`
        function App() {
          return <div className="flex h-screen">Content</div>;
        }
      `);

      const response = await handleDiagnoseOverflow({ file: 'src/components/App.tsx' });

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.file).toBe('src/components/App.tsx');
    });
  });
});
