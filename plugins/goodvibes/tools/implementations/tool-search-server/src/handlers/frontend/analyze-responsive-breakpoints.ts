/**
 * Analyze Responsive Breakpoints Handler
 *
 * Analyzes responsive Tailwind classes across breakpoints to identify
 * mobile-first patterns, breakpoint coverage, and potential issues
 * in responsive design implementation.
 *
 * @module handlers/frontend/analyze-responsive-breakpoints
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the analyze_responsive_breakpoints tool
 */
export interface AnalyzeResponsiveBreakpointsArgs {
  /** File path to analyze */
  file: string;
  /** Specific element to analyze, or analyze whole component */
  element?: string;
}

/**
 * Classes organized by breakpoint
 */
interface BreakpointClasses {
  base: string[];
  sm?: string[];
  md?: string[];
  lg?: string[];
  xl?: string[];
  '2xl'?: string[];
}

/**
 * Coverage status for each breakpoint
 */
interface BreakpointCoverage {
  base: boolean;
  sm: boolean;
  md: boolean;
  lg: boolean;
  xl: boolean;
  '2xl': boolean;
}

/**
 * Property transition across breakpoints
 */
interface PropertyTransition {
  breakpoint: string;
  value: string;
}

/**
 * Property change tracking
 */
interface PropertyChange {
  property: string;
  base_value: string;
  transitions: PropertyTransition[];
}

/**
 * Analyzed element information
 */
interface ElementAnalysis {
  element: string;
  classes_by_breakpoint: BreakpointClasses;
  property_changes: PropertyChange[];
}

/**
 * Warning about potential responsive design issues
 */
interface Warning {
  element: string;
  breakpoint?: string;
  issue: string;
  suggestion: string;
}

/**
 * Analysis summary
 */
interface AnalysisSummary {
  mobile_first: boolean;
  complete_coverage: boolean;
  notes: string[];
}

/**
 * Complete analysis result
 */
interface AnalyzeResponsiveBreakpointsResult {
  file: string;
  breakpoints_used: string[];
  breakpoint_coverage: BreakpointCoverage;
  elements: ElementAnalysis[];
  warnings: Warning[];
  summary: AnalysisSummary;
}

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Tailwind breakpoint prefixes in order
 */
const BREAKPOINTS = ['sm', 'md', 'lg', 'xl', '2xl'] as const;
type Breakpoint = (typeof BREAKPOINTS)[number];

/**
 * Breakpoint sizes for reference
 */
const BREAKPOINT_SIZES: Record<string, string> = {
  base: '0px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

/**
 * Mapping of Tailwind classes to CSS properties
 * This enables tracking which CSS properties change across breakpoints
 */
const CLASS_TO_PROPERTY: Record<string, string> = {
  // Display
  flex: 'display',
  grid: 'display',
  block: 'display',
  hidden: 'display',
  inline: 'display',
  'inline-block': 'display',
  'inline-flex': 'display',
  'inline-grid': 'display',
  contents: 'display',
  'flow-root': 'display',

  // Flex direction
  'flex-row': 'flex-direction',
  'flex-col': 'flex-direction',
  'flex-row-reverse': 'flex-direction',
  'flex-col-reverse': 'flex-direction',

  // Flex wrap
  'flex-wrap': 'flex-wrap',
  'flex-nowrap': 'flex-wrap',
  'flex-wrap-reverse': 'flex-wrap',

  // Justify content
  'justify-start': 'justify-content',
  'justify-end': 'justify-content',
  'justify-center': 'justify-content',
  'justify-between': 'justify-content',
  'justify-around': 'justify-content',
  'justify-evenly': 'justify-content',

  // Align items
  'items-start': 'align-items',
  'items-end': 'align-items',
  'items-center': 'align-items',
  'items-baseline': 'align-items',
  'items-stretch': 'align-items',

  // Grid columns
  'grid-cols-1': 'grid-template-columns',
  'grid-cols-2': 'grid-template-columns',
  'grid-cols-3': 'grid-template-columns',
  'grid-cols-4': 'grid-template-columns',
  'grid-cols-5': 'grid-template-columns',
  'grid-cols-6': 'grid-template-columns',
  'grid-cols-7': 'grid-template-columns',
  'grid-cols-8': 'grid-template-columns',
  'grid-cols-9': 'grid-template-columns',
  'grid-cols-10': 'grid-template-columns',
  'grid-cols-11': 'grid-template-columns',
  'grid-cols-12': 'grid-template-columns',
  'grid-cols-none': 'grid-template-columns',
  'grid-cols-subgrid': 'grid-template-columns',

  // Grid rows
  'grid-rows-1': 'grid-template-rows',
  'grid-rows-2': 'grid-template-rows',
  'grid-rows-3': 'grid-template-rows',
  'grid-rows-4': 'grid-template-rows',
  'grid-rows-5': 'grid-template-rows',
  'grid-rows-6': 'grid-template-rows',
  'grid-rows-none': 'grid-template-rows',
  'grid-rows-subgrid': 'grid-template-rows',

  // Order
  'order-first': 'order',
  'order-last': 'order',
  'order-none': 'order',

  // Position
  static: 'position',
  fixed: 'position',
  absolute: 'position',
  relative: 'position',
  sticky: 'position',

  // Visibility
  visible: 'visibility',
  invisible: 'visibility',
  collapse: 'visibility',

  // Overflow
  'overflow-auto': 'overflow',
  'overflow-hidden': 'overflow',
  'overflow-clip': 'overflow',
  'overflow-visible': 'overflow',
  'overflow-scroll': 'overflow',
  'overflow-x-auto': 'overflow-x',
  'overflow-y-auto': 'overflow-y',
  'overflow-x-hidden': 'overflow-x',
  'overflow-y-hidden': 'overflow-y',
  'overflow-x-scroll': 'overflow-x',
  'overflow-y-scroll': 'overflow-y',

  // Text alignment
  'text-left': 'text-align',
  'text-center': 'text-align',
  'text-right': 'text-align',
  'text-justify': 'text-align',
  'text-start': 'text-align',
  'text-end': 'text-align',

  // Float
  'float-start': 'float',
  'float-end': 'float',
  'float-right': 'float',
  'float-left': 'float',
  'float-none': 'float',
};

/**
 * Class prefix patterns that map to CSS properties
 */
const CLASS_PREFIX_TO_PROPERTY: Array<[RegExp, string]> = [
  // Width
  [/^w-/, 'width'],
  [/^min-w-/, 'min-width'],
  [/^max-w-/, 'max-width'],

  // Height
  [/^h-/, 'height'],
  [/^min-h-/, 'min-height'],
  [/^max-h-/, 'max-height'],

  // Sizing
  [/^size-/, 'size'],

  // Gap
  [/^gap-/, 'gap'],
  [/^gap-x-/, 'column-gap'],
  [/^gap-y-/, 'row-gap'],

  // Padding
  [/^p-/, 'padding'],
  [/^px-/, 'padding-inline'],
  [/^py-/, 'padding-block'],
  [/^pt-/, 'padding-top'],
  [/^pr-/, 'padding-right'],
  [/^pb-/, 'padding-bottom'],
  [/^pl-/, 'padding-left'],
  [/^ps-/, 'padding-inline-start'],
  [/^pe-/, 'padding-inline-end'],

  // Margin
  [/^m-/, 'margin'],
  [/^mx-/, 'margin-inline'],
  [/^my-/, 'margin-block'],
  [/^mt-/, 'margin-top'],
  [/^mr-/, 'margin-right'],
  [/^mb-/, 'margin-bottom'],
  [/^ml-/, 'margin-left'],
  [/^ms-/, 'margin-inline-start'],
  [/^me-/, 'margin-inline-end'],
  [/^-m-/, 'margin'],
  [/^-mx-/, 'margin-inline'],
  [/^-my-/, 'margin-block'],
  [/^-mt-/, 'margin-top'],
  [/^-mr-/, 'margin-right'],
  [/^-mb-/, 'margin-bottom'],
  [/^-ml-/, 'margin-left'],

  // Space between
  [/^space-x-/, 'space-x'],
  [/^space-y-/, 'space-y'],
  [/^-space-x-/, 'space-x'],
  [/^-space-y-/, 'space-y'],

  // Font size
  [/^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/, 'font-size'],

  // Font weight
  [/^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/, 'font-weight'],

  // Line height
  [/^leading-/, 'line-height'],

  // Flex
  [/^flex-1$/, 'flex'],
  [/^flex-auto$/, 'flex'],
  [/^flex-initial$/, 'flex'],
  [/^flex-none$/, 'flex'],
  [/^flex-grow/, 'flex-grow'],
  [/^flex-shrink/, 'flex-shrink'],
  [/^grow/, 'flex-grow'],
  [/^shrink/, 'flex-shrink'],
  [/^basis-/, 'flex-basis'],

  // Grid span
  [/^col-span-/, 'grid-column'],
  [/^col-start-/, 'grid-column-start'],
  [/^col-end-/, 'grid-column-end'],
  [/^row-span-/, 'grid-row'],
  [/^row-start-/, 'grid-row-start'],
  [/^row-end-/, 'grid-row-end'],

  // Positioning
  [/^inset-/, 'inset'],
  [/^top-/, 'top'],
  [/^right-/, 'right'],
  [/^bottom-/, 'bottom'],
  [/^left-/, 'left'],
  [/^start-/, 'inset-inline-start'],
  [/^end-/, 'inset-inline-end'],
  [/^-inset-/, 'inset'],
  [/^-top-/, 'top'],
  [/^-right-/, 'right'],
  [/^-bottom-/, 'bottom'],
  [/^-left-/, 'left'],

  // Z-index
  [/^z-/, 'z-index'],
  [/^-z-/, 'z-index'],

  // Order
  [/^order-\d+$/, 'order'],
  [/^-order-\d+$/, 'order'],

  // Aspect ratio
  [/^aspect-/, 'aspect-ratio'],

  // Object fit/position
  [/^object-(contain|cover|fill|none|scale-down)$/, 'object-fit'],
  [/^object-(bottom|center|left|left-bottom|left-top|right|right-bottom|right-top|top)$/, 'object-position'],

  // Container
  [/^container$/, 'container'],

  // Columns
  [/^columns-/, 'columns'],

  // Break
  [/^break-after-/, 'break-after'],
  [/^break-before-/, 'break-before'],
  [/^break-inside-/, 'break-inside'],

  // Box decoration
  [/^box-decoration-/, 'box-decoration-break'],
  [/^box-/, 'box-sizing'],

  // Isolation
  [/^isolate/, 'isolation'],
];

// =============================================================================
// Response Helpers
// =============================================================================

function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

function createErrorResponse(message: string, context?: Record<string, unknown>): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

// =============================================================================
// Path Helpers
// =============================================================================

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function makeRelativePath(absolutePath: string, projectRoot: string): string {
  return normalizeFilePath(path.relative(projectRoot, absolutePath));
}

// =============================================================================
// Class Parsing
// =============================================================================

/**
 * Parse a className string into individual classes
 */
function parseClassName(className: string): string[] {
  // Handle template literals and concatenation - extract string parts
  // Remove template literal syntax
  const cleaned = className
    .replace(/\$\{[^}]+\}/g, ' ') // Remove template expressions
    .replace(/`/g, '') // Remove backticks
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  return cleaned.split(' ').filter((c) => c.length > 0);
}

/**
 * Parse classes into breakpoint-organized structure
 */
function parseBreakpointClasses(classes: string[]): BreakpointClasses {
  const result: BreakpointClasses = { base: [] };

  for (const cls of classes) {
    // Match breakpoint prefix: sm:, md:, lg:, xl:, 2xl:
    const match = cls.match(/^(sm|md|lg|xl|2xl):(.+)$/);
    if (match) {
      const [, breakpoint, utility] = match;
      const bp = breakpoint as Breakpoint;
      if (!result[bp]) result[bp] = [];
      result[bp]!.push(utility);
    } else {
      // No breakpoint prefix = base (mobile-first)
      result.base.push(cls);
    }
  }

  return result;
}

/**
 * Get the CSS property from a Tailwind class
 */
function getPropertyFromClass(cls: string): string | null {
  // Check exact matches first
  if (CLASS_TO_PROPERTY[cls]) {
    return CLASS_TO_PROPERTY[cls];
  }

  // Check prefix patterns
  for (const [pattern, property] of CLASS_PREFIX_TO_PROPERTY) {
    if (pattern.test(cls)) {
      return property;
    }
  }

  return null;
}

/**
 * Track property changes across breakpoints
 */
function trackPropertyChanges(breakpointClasses: BreakpointClasses): PropertyChange[] {
  const properties = new Map<string, PropertyChange>();

  // Process base classes first
  for (const cls of breakpointClasses.base) {
    const property = getPropertyFromClass(cls);
    if (!property) continue;

    if (!properties.has(property)) {
      properties.set(property, {
        property,
        base_value: cls,
        transitions: [],
      });
    } else {
      // Multiple base classes for same property - use last one
      properties.get(property)!.base_value = cls;
    }
  }

  // Process breakpoint classes
  for (const bp of BREAKPOINTS) {
    const classes = breakpointClasses[bp];
    if (!classes) continue;

    for (const cls of classes) {
      const property = getPropertyFromClass(cls);
      if (!property) continue;

      if (!properties.has(property)) {
        // Property only defined at breakpoint, not base
        properties.set(property, {
          property,
          base_value: '',
          transitions: [{ breakpoint: bp, value: cls }],
        });
      } else {
        properties.get(property)!.transitions.push({ breakpoint: bp, value: cls });
      }
    }
  }

  return [...properties.values()].filter(
    (p) => p.base_value !== '' || p.transitions.length > 0
  );
}

// =============================================================================
// Issue Detection
// =============================================================================

/**
 * Detect potential responsive design issues
 */
function detectIssues(elements: ElementAnalysis[]): Warning[] {
  const warnings: Warning[] = [];

  for (const el of elements) {
    // Issue 1: Desktop-first pattern - property defined at lg: but not at base
    for (const change of el.property_changes) {
      if (change.base_value === '' && change.transitions.length > 0) {
        const firstBreakpoint = change.transitions[0].breakpoint;

        // Skip if it starts from sm (might be intentional hide-on-mobile)
        if (firstBreakpoint !== 'sm') {
          warnings.push({
            element: el.element,
            breakpoint: firstBreakpoint,
            issue: `Desktop-first pattern: "${change.property}" only defined at ${firstBreakpoint}: breakpoint with no mobile base`,
            suggestion: `Add base mobile class for ${change.property} (mobile-first approach)`,
          });
        }
      }
    }

    // Issue 2: Hidden on mobile without show class
    const hasHiddenBase = el.classes_by_breakpoint.base.includes('hidden');
    const hasBlockBreakpoint = BREAKPOINTS.some((bp) => {
      const classes = el.classes_by_breakpoint[bp];
      return classes?.some((c) => ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'inline-grid'].includes(c));
    });

    if (hasHiddenBase && !hasBlockBreakpoint) {
      warnings.push({
        element: el.element,
        issue: 'Element hidden on mobile but never shown at larger breakpoints',
        suggestion: 'Add a breakpoint display class (e.g., md:block) to show the element on larger screens',
      });
    }

    // Issue 3: Gap in breakpoint coverage (e.g., sm and xl defined, but md skipped)
    const usedBreakpoints = BREAKPOINTS.filter((bp) => {
      const classes = el.classes_by_breakpoint[bp];
      return classes && classes.length > 0;
    });

    if (usedBreakpoints.length >= 2) {
      const indices = usedBreakpoints.map((bp) => BREAKPOINTS.indexOf(bp));
      for (let i = 1; i < indices.length; i++) {
        const gap = indices[i] - indices[i - 1];
        if (gap > 1) {
          const skippedBreakpoints = BREAKPOINTS.slice(indices[i - 1] + 1, indices[i]);
          warnings.push({
            element: el.element,
            issue: `Breakpoint gap: defined at ${usedBreakpoints[i - 1]} and ${usedBreakpoints[i]}, skipping ${skippedBreakpoints.join(', ')}`,
            suggestion: `Consider if ${skippedBreakpoints.join(', ')} breakpoints need specific styling`,
          });
        }
      }
    }

    // Issue 4: Conflicting flex-direction without proper breakpoint organization
    const flexDirectionChanges = el.property_changes.find((p) => p.property === 'flex-direction');
    if (flexDirectionChanges && flexDirectionChanges.transitions.length > 0) {
      const hasBaseDirection = flexDirectionChanges.base_value !== '';
      if (!hasBaseDirection) {
        warnings.push({
          element: el.element,
          issue: 'flex-direction changes at breakpoint without base direction',
          suggestion: 'Add base flex-direction class (e.g., flex-col for mobile, then md:flex-row)',
        });
      }
    }

    // Issue 5: Multiple display property classes at same breakpoint
    for (const [bpKey, classes] of Object.entries(el.classes_by_breakpoint)) {
      if (!classes) continue;
      const displayClasses = classes.filter((c: string) => getPropertyFromClass(c) === 'display');
      if (displayClasses.length > 1) {
        warnings.push({
          element: el.element,
          breakpoint: bpKey === 'base' ? undefined : bpKey,
          issue: `Multiple display classes at ${bpKey}: ${displayClasses.join(', ')}`,
          suggestion: 'Use only one display class per breakpoint',
        });
      }
    }
  }

  return warnings;
}

// =============================================================================
// AST Analysis
// =============================================================================

interface ClassNameExtraction {
  element: string;
  className: string;
  line: number;
}

/**
 * Extract className attributes from JSX elements
 */
function extractClassNames(sourceFile: ts.SourceFile, elementFilter?: string): ClassNameExtraction[] {
  const results: ClassNameExtraction[] = [];
  let elementCounter = 0;

  function getElementName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
    return node.tagName.getText(sourceFile);
  }

  function getLineNumber(node: ts.Node): number {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return line + 1;
  }

  function extractStringValue(node: ts.Node): string {
    if (ts.isStringLiteral(node)) {
      return node.text;
    }
    if (ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (ts.isTemplateExpression(node)) {
      // Extract static parts from template literal
      let result = node.head.text;
      for (const span of node.templateSpans) {
        result += ' ' + span.literal.text;
      }
      return result;
    }
    if (ts.isJsxExpression(node) && node.expression) {
      return extractStringValue(node.expression);
    }
    if (ts.isCallExpression(node)) {
      // Handle cn(), clsx(), classNames() etc.
      let result = '';
      for (const arg of node.arguments) {
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
          result += ' ' + arg.text;
        } else if (ts.isTemplateExpression(arg)) {
          result += ' ' + extractStringValue(arg);
        } else if (ts.isArrayLiteralExpression(arg)) {
          for (const element of arg.elements) {
            result += ' ' + extractStringValue(element);
          }
        }
      }
      return result;
    }
    if (ts.isConditionalExpression(node)) {
      // Ternary: condition ? 'a' : 'b' - extract both branches
      return extractStringValue(node.whenTrue) + ' ' + extractStringValue(node.whenFalse);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      // String concatenation
      return extractStringValue(node.left) + ' ' + extractStringValue(node.right);
    }
    if (ts.isParenthesizedExpression(node)) {
      return extractStringValue(node.expression);
    }
    return '';
  }

  function processAttributes(
    attributes: ts.JsxAttributes,
    elementName: string,
    line: number
  ): void {
    for (const attr of attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.name) {
        const attrName = attr.name.getText(sourceFile);
        if (attrName === 'className' || attrName === 'class') {
          let classValue = '';

          if (attr.initializer) {
            if (ts.isStringLiteral(attr.initializer)) {
              classValue = attr.initializer.text;
            } else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
              classValue = extractStringValue(attr.initializer.expression);
            }
          }

          if (classValue.trim()) {
            elementCounter++;
            const elementId = `${elementName}#${elementCounter}`;

            // Apply filter if specified
            if (!elementFilter || elementId.includes(elementFilter) || elementName.includes(elementFilter)) {
              results.push({
                element: elementId,
                className: classValue,
                line,
              });
            }
          }
        }
      }
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node)) {
      const elementName = getElementName(node);
      const line = getLineNumber(node);
      processAttributes(node.attributes, elementName, line);
    } else if (ts.isJsxSelfClosingElement(node)) {
      const elementName = getElementName(node);
      const line = getLineNumber(node);
      processAttributes(node.attributes, elementName, line);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handles the analyze_responsive_breakpoints MCP tool call.
 *
 * Analyzes responsive Tailwind classes across breakpoints to:
 * - Identify mobile-first patterns
 * - Track breakpoint coverage
 * - Detect property changes across breakpoints
 * - Flag potential responsive design issues
 *
 * @param args - The analyze_responsive_breakpoints tool arguments
 * @returns MCP tool response with breakpoint analysis
 */
export async function handleAnalyzeResponsiveBreakpoints(
  args: AnalyzeResponsiveBreakpointsArgs
): Promise<ToolResponse> {
  const projectRoot = process.cwd();

  try {
    // Resolve file path
    const filePath = path.isAbsolute(args.file)
      ? args.file
      : path.resolve(projectRoot, args.file);

    if (!fs.existsSync(filePath)) {
      return createErrorResponse(`File not found: ${args.file}`, {
        provided_path: args.file,
        resolved_path: filePath,
      });
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!['.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) {
      return createErrorResponse(
        `Unsupported file type: ${ext}. Expected .tsx, .jsx, .vue, or .svelte`,
        { file: args.file }
      );
    }

    // Read and parse file
    const content = fs.readFileSync(filePath, 'utf-8');

    // For Vue/Svelte, extract template section
    let processableContent = content;
    if (ext === '.vue') {
      const templateMatch = content.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
      if (templateMatch) {
        // Wrap in a JSX-compatible format for parsing
        processableContent = `function Component() { return (<>${templateMatch[1]}</>) }`;
      }
    } else if (ext === '.svelte') {
      // For Svelte, treat the whole file as template (simplified)
      const scriptMatch = content.match(/<script[^>]*>[\s\S]*?<\/script>/gi);
      let templateContent = content;
      if (scriptMatch) {
        for (const script of scriptMatch) {
          templateContent = templateContent.replace(script, '');
        }
      }
      const styleMatch = templateContent.match(/<style[^>]*>[\s\S]*?<\/style>/gi);
      if (styleMatch) {
        for (const style of styleMatch) {
          templateContent = templateContent.replace(style, '');
        }
      }
      processableContent = `function Component() { return (<>${templateContent}</>) }`;
    }

    const sourceFile = ts.createSourceFile(
      filePath,
      processableContent,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
    );

    // Extract className attributes
    const classNameExtractions = extractClassNames(sourceFile, args.element);

    if (classNameExtractions.length === 0) {
      return createSuccessResponse({
        file: makeRelativePath(filePath, projectRoot),
        breakpoints_used: [],
        breakpoint_coverage: {
          base: false,
          sm: false,
          md: false,
          lg: false,
          xl: false,
          '2xl': false,
        },
        elements: [],
        warnings: [],
        summary: {
          mobile_first: true,
          complete_coverage: false,
          notes: ['No className attributes found in file'],
        },
      });
    }

    // Analyze each element
    const elements: ElementAnalysis[] = [];
    const allBreakpointsUsed = new Set<string>();
    const breakpointCoverage: BreakpointCoverage = {
      base: false,
      sm: false,
      md: false,
      lg: false,
      xl: false,
      '2xl': false,
    };

    for (const extraction of classNameExtractions) {
      const classes = parseClassName(extraction.className);
      const breakpointClasses = parseBreakpointClasses(classes);
      const propertyChanges = trackPropertyChanges(breakpointClasses);

      // Track breakpoint usage
      if (breakpointClasses.base.length > 0) {
        allBreakpointsUsed.add('base');
        breakpointCoverage.base = true;
      }
      for (const bp of BREAKPOINTS) {
        if (breakpointClasses[bp] && breakpointClasses[bp]!.length > 0) {
          allBreakpointsUsed.add(bp);
          breakpointCoverage[bp] = true;
        }
      }

      elements.push({
        element: extraction.element,
        classes_by_breakpoint: breakpointClasses,
        property_changes: propertyChanges,
      });
    }

    // Detect issues
    const warnings = detectIssues(elements);

    // Generate summary
    const breakpointsUsed = Array.from(allBreakpointsUsed).sort((a, b) => {
      const order = ['base', ...BREAKPOINTS];
      return order.indexOf(a) - order.indexOf(b);
    });

    // Determine if mobile-first pattern is being used
    let mobileFirst = true;
    let desktopFirstCount = 0;
    for (const el of elements) {
      for (const change of el.property_changes) {
        if (change.base_value === '' && change.transitions.length > 0) {
          const firstBp = change.transitions[0].breakpoint;
          // If first definition is at md or larger, might be desktop-first
          if (['md', 'lg', 'xl', '2xl'].includes(firstBp)) {
            desktopFirstCount++;
          }
        }
      }
    }
    if (desktopFirstCount > elements.length / 2) {
      mobileFirst = false;
    }

    // Check complete coverage
    const completeCoverage =
      breakpointCoverage.base &&
      (breakpointCoverage.sm || breakpointCoverage.md) &&
      (breakpointCoverage.lg || breakpointCoverage.xl);

    // Generate notes
    const notes: string[] = [];
    notes.push(
      `Analyzed ${elements.length} elements with className attributes`
    );

    if (!breakpointCoverage.base && elements.length > 0) {
      notes.push('Warning: No base (mobile) styles defined - consider mobile-first approach');
    }

    if (mobileFirst) {
      notes.push('Using mobile-first responsive pattern');
    } else {
      notes.push('Detected desktop-first patterns - consider refactoring to mobile-first');
    }

    if (warnings.length > 0) {
      notes.push(`Found ${warnings.length} potential responsive design issues`);
    }

    // Add breakpoint size reference
    const usedSizes = breakpointsUsed.map((bp) => `${bp}: ${BREAKPOINT_SIZES[bp]}`);
    if (usedSizes.length > 0) {
      notes.push(`Breakpoint sizes: ${usedSizes.join(', ')}`);
    }

    const result: AnalyzeResponsiveBreakpointsResult = {
      file: makeRelativePath(filePath, projectRoot),
      breakpoints_used: breakpointsUsed,
      breakpoint_coverage: breakpointCoverage,
      elements,
      warnings,
      summary: {
        mobile_first: mobileFirst,
        complete_coverage: completeCoverage,
        notes,
      },
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
