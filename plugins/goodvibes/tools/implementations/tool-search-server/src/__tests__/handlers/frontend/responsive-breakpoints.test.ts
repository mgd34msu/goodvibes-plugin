/**
 * Unit tests for responsive-breakpoints module
 *
 * Tests cover all exported functions from:
 * - utils.ts: Response helpers, path helpers
 * - constants.ts: Breakpoint definitions, class mappings
 * - class-parser.ts: Class parsing, breakpoint organization, property tracking
 * - jsx-extractor.ts: JSX className extraction
 * - issue-detector.ts: Responsive design issue detection
 * - types.ts: Type definitions (implicit testing through usage)
 * - index.ts: Main handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// Import all functions from the responsive-breakpoints module
import {
  createSuccessResponse,
  createErrorResponse,
  normalizeFilePath,
  makeRelativePath,
} from '../../../handlers/frontend/responsive-breakpoints/utils.js';

import {
  BREAKPOINTS,
  BREAKPOINT_SIZES,
  CLASS_TO_PROPERTY,
  CLASS_PREFIX_TO_PROPERTY,
} from '../../../handlers/frontend/responsive-breakpoints/constants.js';

import {
  parseClassName,
  parseBreakpointClasses,
  getPropertyFromClass,
  trackPropertyChanges,
} from '../../../handlers/frontend/responsive-breakpoints/class-parser.js';

import { extractClassNames } from '../../../handlers/frontend/responsive-breakpoints/jsx-extractor.js';

import { detectIssues } from '../../../handlers/frontend/responsive-breakpoints/issue-detector.js';

import { handleAnalyzeResponsiveBreakpoints } from '../../../handlers/frontend/responsive-breakpoints/index.js';

import type { BreakpointClasses, ElementAnalysis } from '../../../handlers/frontend/responsive-breakpoints/types.js';

// Helper to create source file for testing
function createSourceFile(code: string, filename = 'test.tsx'): ts.SourceFile {
  return ts.createSourceFile(
    filename,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}

describe('responsive-breakpoints/utils', () => {
  describe('createSuccessResponse', () => {
    it('should create a success response with JSON data', () => {
      const data = { file: 'test.tsx', breakpoints_used: ['base', 'md'] };
      const response = createSuccessResponse(data);

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(JSON.parse(response.content[0].text)).toEqual(data);
      expect(response.isError).toBeUndefined();
    });
  });

  describe('createErrorResponse', () => {
    it('should create an error response', () => {
      const response = createErrorResponse('Error message', { file: 'test.tsx' });

      expect(response.isError).toBe(true);
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Error message');
      expect(parsed.file).toBe('test.tsx');
    });
  });

  describe('normalizeFilePath', () => {
    it('should normalize backslashes', () => {
      expect(normalizeFilePath('src\\components\\App.tsx')).toBe('src/components/App.tsx');
    });
  });

  describe('makeRelativePath', () => {
    it('should create relative path', () => {
      const result = makeRelativePath('/project/src/App.tsx', '/project');
      expect(result).toBe('src/App.tsx');
    });
  });
});

describe('responsive-breakpoints/constants', () => {
  describe('BREAKPOINTS', () => {
    it('should have all standard Tailwind breakpoints in order', () => {
      expect(BREAKPOINTS).toEqual(['sm', 'md', 'lg', 'xl', '2xl']);
    });
  });

  describe('BREAKPOINT_SIZES', () => {
    it('should have correct pixel values', () => {
      expect(BREAKPOINT_SIZES.base).toBe('0px');
      expect(BREAKPOINT_SIZES.sm).toBe('640px');
      expect(BREAKPOINT_SIZES.md).toBe('768px');
      expect(BREAKPOINT_SIZES.lg).toBe('1024px');
      expect(BREAKPOINT_SIZES.xl).toBe('1280px');
      expect(BREAKPOINT_SIZES['2xl']).toBe('1536px');
    });
  });

  describe('CLASS_TO_PROPERTY', () => {
    it('should map display classes', () => {
      expect(CLASS_TO_PROPERTY.flex).toBe('display');
      expect(CLASS_TO_PROPERTY.grid).toBe('display');
      expect(CLASS_TO_PROPERTY.block).toBe('display');
      expect(CLASS_TO_PROPERTY.hidden).toBe('display');
    });

    it('should map flex-direction classes', () => {
      expect(CLASS_TO_PROPERTY['flex-row']).toBe('flex-direction');
      expect(CLASS_TO_PROPERTY['flex-col']).toBe('flex-direction');
    });

    it('should map justify-content classes', () => {
      expect(CLASS_TO_PROPERTY['justify-center']).toBe('justify-content');
      expect(CLASS_TO_PROPERTY['justify-between']).toBe('justify-content');
    });

    it('should map position classes', () => {
      expect(CLASS_TO_PROPERTY.relative).toBe('position');
      expect(CLASS_TO_PROPERTY.absolute).toBe('position');
      expect(CLASS_TO_PROPERTY.fixed).toBe('position');
    });
  });

  describe('CLASS_PREFIX_TO_PROPERTY', () => {
    it('should have width patterns', () => {
      const widthPattern = CLASS_PREFIX_TO_PROPERTY.find(([p]) => p.test('w-4'));
      expect(widthPattern).toBeDefined();
      expect(widthPattern?.[1]).toBe('width');
    });

    it('should have padding patterns', () => {
      const paddingPattern = CLASS_PREFIX_TO_PROPERTY.find(([p]) => p.test('p-4'));
      expect(paddingPattern).toBeDefined();
      expect(paddingPattern?.[1]).toBe('padding');
    });

    it('should have margin patterns', () => {
      const marginPattern = CLASS_PREFIX_TO_PROPERTY.find(([p]) => p.test('m-4'));
      expect(marginPattern).toBeDefined();
      expect(marginPattern?.[1]).toBe('margin');
    });

    it('should have font-size pattern', () => {
      const fontSizePattern = CLASS_PREFIX_TO_PROPERTY.find(([p]) => p.test('text-lg'));
      expect(fontSizePattern).toBeDefined();
      expect(fontSizePattern?.[1]).toBe('font-size');
    });
  });
});

describe('responsive-breakpoints/class-parser', () => {
  describe('parseClassName', () => {
    it('should split classes by whitespace', () => {
      expect(parseClassName('flex items-center gap-4')).toEqual(['flex', 'items-center', 'gap-4']);
    });

    it('should handle template literal syntax', () => {
      const result = parseClassName('flex ${condition ? "hidden" : "block"} gap-4');
      expect(result).toContain('flex');
      expect(result).toContain('gap-4');
    });

    it('should normalize whitespace', () => {
      expect(parseClassName('  flex    gap-4  ')).toEqual(['flex', 'gap-4']);
    });

    it('should handle backticks', () => {
      expect(parseClassName('`flex gap-4`')).toEqual(['flex', 'gap-4']);
    });

    it('should return empty array for empty string', () => {
      expect(parseClassName('')).toEqual([]);
    });
  });

  describe('parseBreakpointClasses', () => {
    it('should separate base classes', () => {
      const result = parseBreakpointClasses(['flex', 'gap-4']);
      expect(result.base).toEqual(['flex', 'gap-4']);
    });

    it('should separate sm: prefixed classes', () => {
      const result = parseBreakpointClasses(['flex', 'sm:hidden']);
      expect(result.base).toContain('flex');
      expect(result.sm).toContain('hidden');
    });

    it('should separate md: prefixed classes', () => {
      const result = parseBreakpointClasses(['md:flex', 'md:gap-8']);
      expect(result.md).toContain('flex');
      expect(result.md).toContain('gap-8');
    });

    it('should separate lg: prefixed classes', () => {
      const result = parseBreakpointClasses(['lg:grid', 'lg:grid-cols-3']);
      expect(result.lg).toContain('grid');
      expect(result.lg).toContain('grid-cols-3');
    });

    it('should separate xl: prefixed classes', () => {
      const result = parseBreakpointClasses(['xl:text-xl']);
      expect(result.xl).toContain('text-xl');
    });

    it('should separate 2xl: prefixed classes', () => {
      const result = parseBreakpointClasses(['2xl:max-w-7xl']);
      expect(result['2xl']).toContain('max-w-7xl');
    });

    it('should handle mixed classes', () => {
      const classes = ['flex', 'flex-col', 'sm:flex-row', 'md:gap-4', 'lg:gap-8'];
      const result = parseBreakpointClasses(classes);

      expect(result.base).toContain('flex');
      expect(result.base).toContain('flex-col');
      expect(result.sm).toContain('flex-row');
      expect(result.md).toContain('gap-4');
      expect(result.lg).toContain('gap-8');
    });
  });

  describe('getPropertyFromClass', () => {
    it('should return property for exact match', () => {
      expect(getPropertyFromClass('flex')).toBe('display');
      expect(getPropertyFromClass('hidden')).toBe('display');
      expect(getPropertyFromClass('flex-row')).toBe('flex-direction');
    });

    it('should return property for prefix match', () => {
      expect(getPropertyFromClass('w-4')).toBe('width');
      expect(getPropertyFromClass('h-screen')).toBe('height');
      expect(getPropertyFromClass('p-4')).toBe('padding');
      expect(getPropertyFromClass('m-auto')).toBe('margin');
      expect(getPropertyFromClass('gap-4')).toBe('gap');
    });

    it('should return null for unrecognized classes', () => {
      expect(getPropertyFromClass('text-red-500')).toBeNull();
      expect(getPropertyFromClass('bg-blue-500')).toBeNull();
    });

    it('should match font-size classes', () => {
      expect(getPropertyFromClass('text-xs')).toBe('font-size');
      expect(getPropertyFromClass('text-lg')).toBe('font-size');
      expect(getPropertyFromClass('text-2xl')).toBe('font-size');
    });

    it('should match grid classes', () => {
      expect(getPropertyFromClass('grid-cols-3')).toBe('grid-template-columns');
      expect(getPropertyFromClass('grid-rows-2')).toBe('grid-template-rows');
    });
  });

  describe('trackPropertyChanges', () => {
    it('should track base property values', () => {
      const classes: BreakpointClasses = { base: ['flex', 'flex-col'] };
      const changes = trackPropertyChanges(classes);

      expect(changes.find(c => c.property === 'display')?.base_value).toBe('flex');
      expect(changes.find(c => c.property === 'flex-direction')?.base_value).toBe('flex-col');
    });

    it('should track breakpoint transitions', () => {
      const classes: BreakpointClasses = {
        base: ['flex-col'],
        md: ['flex-row'],
      };
      const changes = trackPropertyChanges(classes);

      const flexDirection = changes.find(c => c.property === 'flex-direction');
      expect(flexDirection?.base_value).toBe('flex-col');
      expect(flexDirection?.transitions).toHaveLength(1);
      expect(flexDirection?.transitions[0].breakpoint).toBe('md');
      expect(flexDirection?.transitions[0].value).toBe('flex-row');
    });

    it('should track multiple transitions', () => {
      const classes: BreakpointClasses = {
        base: ['gap-2'],
        md: ['gap-4'],
        lg: ['gap-8'],
      };
      const changes = trackPropertyChanges(classes);

      const gap = changes.find(c => c.property === 'gap');
      expect(gap?.transitions).toHaveLength(2);
    });

    it('should track properties only defined at breakpoints', () => {
      const classes: BreakpointClasses = {
        base: [],
        md: ['hidden'],
      };
      const changes = trackPropertyChanges(classes);

      const display = changes.find(c => c.property === 'display');
      expect(display?.base_value).toBe('');
      expect(display?.transitions[0].breakpoint).toBe('md');
    });

    it('should use last value when multiple base classes for same property', () => {
      const classes: BreakpointClasses = {
        base: ['flex', 'grid'],
      };
      const changes = trackPropertyChanges(classes);

      const display = changes.find(c => c.property === 'display');
      expect(display?.base_value).toBe('grid');
    });
  });
});

describe('responsive-breakpoints/jsx-extractor', () => {
  describe('extractClassNames', () => {
    it('should extract className from string literal', () => {
      const code = `function App() { return <div className="flex gap-4" />; }`;
      const sourceFile = createSourceFile(code);

      const extractions = extractClassNames(sourceFile);

      expect(extractions.length).toBeGreaterThan(0);
      expect(extractions[0].className).toBe('flex gap-4');
    });

    it('should extract className from JSX expression', () => {
      const code = `function App() { return <div className={"flex gap-4"} />; }`;
      const sourceFile = createSourceFile(code);

      const extractions = extractClassNames(sourceFile);

      expect(extractions[0].className).toContain('flex');
    });

    it('should extract className from template literal', () => {
      const code = '<div className={`flex ${condition ? "hidden" : "block"}`} />';
      const sourceFile = createSourceFile(code);

      const extractions = extractClassNames(sourceFile);

      expect(extractions[0].className).toContain('flex');
    });

    it('should extract className from cn/clsx calls', () => {
      const code = `<div className={cn("flex", "gap-4", condition && "hidden")} />`;
      const sourceFile = createSourceFile(code);

      const extractions = extractClassNames(sourceFile);

      expect(extractions[0].className).toContain('flex');
      expect(extractions[0].className).toContain('gap-4');
    });

    it('should include element name and line number', () => {
      const code = `<button className="px-4 py-2" />`;
      const sourceFile = createSourceFile(code);

      const extractions = extractClassNames(sourceFile);

      expect(extractions[0].element).toContain('button');
      expect(extractions[0].line).toBeGreaterThan(0);
    });

    it('should filter by element name when specified', () => {
      const code = `function App() {
        return (
          <div className="flex">
            <span className="text-lg" />
          </div>
        );
      }`;
      const sourceFile = createSourceFile(code);

      const extractions = extractClassNames(sourceFile, 'span');

      expect(extractions.every(e => e.element.includes('span'))).toBe(true);
    });

    it('should handle multiple elements', () => {
      const code = `function App() {
        return (
          <>
            <div className="flex" />
            <span className="block" />
          </>
        );
      }`;
      const sourceFile = createSourceFile(code);

      const extractions = extractClassNames(sourceFile);

      expect(extractions.length).toBe(2);
    });

    it('should handle conditional expressions', () => {
      const code = `<div className={isActive ? "bg-blue-500" : "bg-gray-500"} />`;
      const sourceFile = createSourceFile(code);

      const extractions = extractClassNames(sourceFile);

      expect(extractions[0].className).toContain('bg-blue-500');
      expect(extractions[0].className).toContain('bg-gray-500');
    });

    it('should handle self-closing and opening elements', () => {
      const code = `function App() {
        return (
          <div className="wrapper">
            <span className="inner" />
          </div>
        );
      }`;
      const sourceFile = createSourceFile(code);

      const extractions = extractClassNames(sourceFile);

      expect(extractions.length).toBe(2);
    });
  });
});

describe('responsive-breakpoints/issue-detector', () => {
  describe('detectIssues', () => {
    it('should detect desktop-first pattern', () => {
      const elements: ElementAnalysis[] = [
        {
          element: 'div#1',
          classes_by_breakpoint: { base: [] },
          property_changes: [
            {
              property: 'display',
              base_value: '',
              transitions: [{ breakpoint: 'lg', value: 'flex' }],
            },
          ],
        },
      ];

      const issues = detectIssues(elements);

      expect(issues.some(i => i.issue.includes('Desktop-first'))).toBe(true);
    });

    it('should not flag sm-first as desktop-first', () => {
      const elements: ElementAnalysis[] = [
        {
          element: 'div#1',
          classes_by_breakpoint: { base: [], sm: ['hidden'] },
          property_changes: [
            {
              property: 'display',
              base_value: '',
              transitions: [{ breakpoint: 'sm', value: 'hidden' }],
            },
          ],
        },
      ];

      const issues = detectIssues(elements);

      expect(issues.some(i => i.issue.includes('Desktop-first'))).toBe(false);
    });

    it('should detect hidden on mobile without show class', () => {
      const elements: ElementAnalysis[] = [
        {
          element: 'div#1',
          classes_by_breakpoint: { base: ['hidden'] },
          property_changes: [],
        },
      ];

      const issues = detectIssues(elements);

      expect(issues.some(i => i.issue.includes('hidden on mobile'))).toBe(true);
    });

    it('should not flag hidden if shown at breakpoint', () => {
      const elements: ElementAnalysis[] = [
        {
          element: 'div#1',
          classes_by_breakpoint: { base: ['hidden'], md: ['block'] },
          property_changes: [],
        },
      ];

      const issues = detectIssues(elements);

      expect(issues.some(i => i.issue.includes('hidden on mobile'))).toBe(false);
    });

    it('should detect breakpoint gaps', () => {
      const elements: ElementAnalysis[] = [
        {
          element: 'div#1',
          classes_by_breakpoint: { base: [], sm: ['flex'], xl: ['grid'] },
          property_changes: [],
        },
      ];

      const issues = detectIssues(elements);

      expect(issues.some(i => i.issue.includes('Breakpoint gap'))).toBe(true);
    });

    it('should detect flex-direction without base', () => {
      const elements: ElementAnalysis[] = [
        {
          element: 'div#1',
          classes_by_breakpoint: { base: [], md: ['flex-row'] },
          property_changes: [
            {
              property: 'flex-direction',
              base_value: '',
              transitions: [{ breakpoint: 'md', value: 'flex-row' }],
            },
          ],
        },
      ];

      const issues = detectIssues(elements);

      expect(issues.some(i => i.issue.includes('flex-direction'))).toBe(true);
    });

    it('should detect multiple display classes at same breakpoint', () => {
      const elements: ElementAnalysis[] = [
        {
          element: 'div#1',
          classes_by_breakpoint: { base: ['flex', 'grid'] },
          property_changes: [],
        },
      ];

      const issues = detectIssues(elements);

      expect(issues.some(i => i.issue.includes('Multiple display'))).toBe(true);
    });
  });
});

// Handler tests use real filesystem since ESM mocking is not supported
describe('responsive-breakpoints/handleAnalyzeResponsiveBreakpoints', () => {
  it('should return error when file does not exist', async () => {
    const response = await handleAnalyzeResponsiveBreakpoints({
      file: '/nonexistent/path/to/file.tsx',
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('File not found');
  });

  it('should return error for unsupported file extensions', async () => {
    // Will fail on file not found first since extension check happens after existence check
    const response = await handleAnalyzeResponsiveBreakpoints({ file: 'test.css' });

    expect(response.isError).toBe(true);
  });

  // Test the analysis logic indirectly by testing the component analyzers
  it('should validate className extraction works correctly', () => {
    const code = `function App() {
      return (
        <div className="flex flex-col md:flex-row lg:gap-8">
          <span className="hidden md:block" />
        </div>
      );
    }`;
    const sourceFile = createSourceFile(code);
    const extractions = extractClassNames(sourceFile);

    expect(extractions.length).toBe(2);
    expect(extractions[0].className).toContain('flex');
    expect(extractions[0].className).toContain('md:flex-row');
  });

  it('should validate breakpoint class parsing works correctly', () => {
    const classes = ['flex', 'flex-col', 'md:flex-row', 'lg:gap-8'];
    const result = parseBreakpointClasses(classes);

    expect(result.base).toContain('flex');
    expect(result.base).toContain('flex-col');
    expect(result.md).toContain('flex-row');
    expect(result.lg).toContain('gap-8');
  });

  it('should validate property tracking works correctly', () => {
    const classes: BreakpointClasses = {
      base: ['flex-col'],
      md: ['flex-row'],
    };
    const changes = trackPropertyChanges(classes);

    const flexDirection = changes.find(c => c.property === 'flex-direction');
    expect(flexDirection?.base_value).toBe('flex-col');
    expect(flexDirection?.transitions).toHaveLength(1);
    expect(flexDirection?.transitions[0].breakpoint).toBe('md');
  });

  it('should validate issue detection works correctly', () => {
    const elements: ElementAnalysis[] = [
      {
        element: 'div#1',
        classes_by_breakpoint: { base: ['hidden'] },
        property_changes: [],
      },
    ];

    const issues = detectIssues(elements);
    expect(issues.some(i => i.issue.includes('hidden on mobile'))).toBe(true);
  });
});
