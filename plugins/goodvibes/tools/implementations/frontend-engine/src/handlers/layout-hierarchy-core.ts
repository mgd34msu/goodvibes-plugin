/**
 * Layout Hierarchy Core
 *
 * AST analysis, JSX parsing, and tree building for layout hierarchy analysis.
 *
 * @module handlers/frontend/layout-hierarchy-core
 */

import ts from 'typescript';
import {
  type DisplayType,
  type PositionType,
  type ParsedCssProperties,
  parseTailwindClasses,
} from './layout-hierarchy-utils.js';
import type {
  Sizing,
  FlexProps,
  GridProps,
  Overflow,
  LayoutNode,
} from './layout-hierarchy-analyzers.js';

// =============================================================================
// AST Analysis Helpers
// =============================================================================

/**
 * Extract CSS classes from a single AST node (string, logical AND, ternary, object, array)
 * Mutates the `out` array in place for efficiency.
 */
function extractClassesFromNode(node: ts.Node, out: string[]): void {
  // 'flex p-4'
  if (ts.isStringLiteral(node)) {
    out.push(...node.text.split(/\s+/).filter(Boolean));
    return;
  }

  // isActive && 'bg-blue-500'
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
  ) {
    if (ts.isStringLiteral(node.right)) {
      out.push(...node.right.text.split(/\s+/).filter(Boolean));
    }
    return;
  }

  // condition ? 'a' : 'b'
  if (ts.isConditionalExpression(node)) {
    extractClassesFromNode(node.whenTrue, out);
    extractClassesFromNode(node.whenFalse, out);
    return;
  }

  // { 'bg-blue-500': isActive, 'bg-gray-200': !isActive }
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        if (ts.isStringLiteral(prop.name)) {
          out.push(...prop.name.text.split(/\s+/).filter(Boolean));
        } else if (ts.isIdentifier(prop.name)) {
          out.push(prop.name.text);
        }
      }
      if (ts.isShorthandPropertyAssignment(prop)) {
        out.push(prop.name.text);
      }
    }
    return;
  }

  // ['flex', isActive && 'bg-blue-500']
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) {
      extractClassesFromNode(element, out);
    }
    return;
  }
}

/**
 * Extract className attribute from a JSX element
 */
export function extractClassName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sourceFile: ts.SourceFile): string[] {
  const classes: string[] = [];

  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'className') {
      if (attr.initializer) {
        if (ts.isStringLiteral(attr.initializer)) {
          // className="flex items-center"
          classes.push(...attr.initializer.text.split(/\s+/).filter(Boolean));
        } else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
          const expr = attr.initializer.expression;
          if (ts.isTemplateExpression(expr)) {
            // Extract head text
            const headText = expr.head.text;
            classes.push(...headText.split(/\s+/).filter(Boolean));

            // Extract literal spans
            for (const span of expr.templateSpans) {
              if (span.literal.text) {
                classes.push(...span.literal.text.split(/\s+/).filter(Boolean));
              }
            }
          } else if (ts.isNoSubstitutionTemplateLiteral(expr)) {
            classes.push(...expr.text.split(/\s+/).filter(Boolean));
          } else if (ts.isCallExpression(expr)) {
            // Handle cn(), clsx(), classNames() calls with full pattern support
            for (const arg of expr.arguments) {
              extractClassesFromNode(arg, classes);
            }
          } else if (
            ts.isBinaryExpression(expr) &&
            expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
          ) {
            // className={isActive && 'bg-blue-500'}
            if (ts.isStringLiteral(expr.right)) {
              classes.push(...expr.right.text.split(/\s+/).filter(Boolean));
            }
          }
        }
      }
    }

    // Also handle 'class' attribute for completeness
    if (ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'class') {
      if (attr.initializer && ts.isStringLiteral(attr.initializer)) {
        classes.push(...attr.initializer.text.split(/\s+/).filter(Boolean));
      }
    }
  }

  return classes;
}

/**
 * Extract id attribute from a JSX element
 */
export function extractId(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement, sourceFile: ts.SourceFile): string | undefined {
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'id') {
      if (attr.initializer && ts.isStringLiteral(attr.initializer)) {
        return attr.initializer.text;
      }
    }
  }
  return undefined;
}

/**
 * Create element identifier string
 */
export function createElementIdentifier(tagName: string, classes: string[], id?: string): string {
  if (id) {
    return `${tagName}#${id}`;
  }
  if (classes.length > 0) {
    // Use first few layout-relevant classes
    const layoutClasses = classes.filter(
      (c) =>
        c.startsWith('flex') ||
        c.startsWith('grid') ||
        c.startsWith('w-') ||
        c.startsWith('h-') ||
        c.startsWith('overflow') ||
        c === 'block' ||
        c === 'inline' ||
        c === 'hidden'
    );
    const identifierClasses = layoutClasses.length > 0 ? layoutClasses.slice(0, 3) : classes.slice(0, 2);
    return `${tagName}.${identifierClasses.join('.')}`;
  }
  return tagName;
}

// =============================================================================
// Layout Node Building
// =============================================================================

/**
 * Build LayoutNode from parsed CSS properties
 */
export function buildLayoutNode(
  tagName: string,
  classes: string[],
  id: string | undefined,
  props: ParsedCssProperties,
  children: LayoutNode[]
): LayoutNode {
  const element = createElementIdentifier(tagName, classes, id);

  // Determine sizing
  const sizing: Sizing = {
    width: props.width || { strategy: 'auto' },
    height: props.height || { strategy: 'auto' },
  };

  // Determine display
  const display: DisplayType = props.display || 'block';

  // Build flex props if flex container
  let flex_props: FlexProps | undefined;
  if (display === 'flex' || display === 'inline-flex') {
    flex_props = {
      direction: props.flexDirection || 'row',
      grow: props.flexGrow ?? 0,
      shrink: props.flexShrink ?? 1,
      basis: props.flexBasis || 'auto',
    };
    if (props.flexWrap) flex_props.wrap = props.flexWrap;
    if (props.alignItems) flex_props.align = props.alignItems;
    if (props.justifyContent) flex_props.justify = props.justifyContent;
    if (props.gap) flex_props.gap = props.gap;
  }

  // Build grid props if grid container
  let grid_props: GridProps | undefined;
  if (display === 'grid' || display === 'inline-grid' || props.gridColumn || props.gridRow || props.gridArea) {
    grid_props = {};
    if (props.gridTemplateColumns) grid_props.template_columns = props.gridTemplateColumns;
    if (props.gridTemplateRows) grid_props.template_rows = props.gridTemplateRows;
    if (props.gap) grid_props.gap = props.gap;
    if (props.gridColumn) grid_props.column = props.gridColumn;
    if (props.gridRow) grid_props.row = props.gridRow;
    if (props.gridArea) grid_props.area = props.gridArea;
  }

  // Determine overflow
  const overflow: Overflow = {
    x: props.overflowX || props.overflow || 'visible',
    y: props.overflowY || props.overflow || 'visible',
  };

  // Determine position
  const position: PositionType = props.position || 'static';

  return {
    element,
    tag: tagName,
    classes,
    sizing,
    display,
    flex_props,
    grid_props,
    overflow,
    position,
    children,
  };
}

/**
 * Check if element matches selector
 */
export function matchesSelector(tagName: string, classes: string[], id: string | undefined, selector: string): boolean {
  if (selector.startsWith('#')) {
    return id === selector.slice(1);
  }
  if (selector.startsWith('.')) {
    return classes.includes(selector.slice(1));
  }
  // Match by tag name
  return tagName.toLowerCase() === selector.toLowerCase();
}

// =============================================================================
// JSX Tree Parsing
// =============================================================================

/**
 * Recursively parse JSX tree into layout nodes
 */
export function parseJsxElement(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  selector?: string,
  foundSelector = false
): LayoutNode | null {
  // Handle JSX element with children
  if (ts.isJsxElement(node)) {
    const openingElement = node.openingElement;
    const tagName = openingElement.tagName.getText(sourceFile);
    const classes = extractClassName(openingElement, sourceFile);
    const id = extractId(openingElement, sourceFile);
    const props = parseTailwindClasses(classes);

    // Check if this element matches the selector
    const elementMatches = selector ? matchesSelector(tagName, classes, id, selector) : false;
    const shouldInclude = !selector || foundSelector || elementMatches;

    // Parse children
    const children: LayoutNode[] = [];
    for (const child of node.children) {
      const childNode = parseJsxElement(
        child,
        sourceFile,
        selector,
        foundSelector || elementMatches
      );
      if (childNode) {
        children.push(childNode);
      }
    }

    // If we have a selector and haven't found it yet, only return matching subtree
    if (selector && !foundSelector && !elementMatches) {
      // Check if any children matched
      if (children.length > 0) {
        return children.length === 1 ? children[0] : buildLayoutNode(tagName, classes, id, props, children);
      }
      return null;
    }

    if (shouldInclude) {
      return buildLayoutNode(tagName, classes, id, props, children);
    }

    /* v8 ignore next -- defensive: shouldInclude is true when selector is undefined */
    return null;
  }

  // Handle self-closing JSX element
  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const classes = extractClassName(node, sourceFile);
    const id = extractId(node, sourceFile);
    const props = parseTailwindClasses(classes);

    // Check if this element matches the selector
    const elementMatches = selector ? matchesSelector(tagName, classes, id, selector) : true;

    if (!selector || foundSelector || elementMatches) {
      return buildLayoutNode(tagName, classes, id, props, []);
    }

    return null;
  }

  // Handle JSX fragment
  if (ts.isJsxFragment(node)) {
    const children: LayoutNode[] = [];
    for (const child of node.children) {
      const childNode = parseJsxElement(child, sourceFile, selector, foundSelector);
      if (childNode) {
        children.push(childNode);
      }
    }

    // If fragment has only one child, return that child
    if (children.length === 1) {
      return children[0];
    }

    // If fragment has multiple children, wrap in a pseudo-fragment node
    if (children.length > 0) {
      return {
        element: 'Fragment',
        tag: 'Fragment',
        classes: [],
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
        display: 'contents',
        overflow: { x: 'visible', y: 'visible' },
        position: 'static',
        children,
      };
    }

    /* v8 ignore next -- defensive: empty fragment with no children after filtering */
    return null;
  }

  // Handle JSX expression (e.g., {children}, {condition && <Element />})
  if (ts.isJsxExpression(node) && node.expression) {
    // Try to find JSX elements within expressions
    let result: LayoutNode | null = null;
    ts.forEachChild(node.expression, (child) => {
      if (!result) {
        result = parseJsxElement(child, sourceFile, selector, foundSelector);
      }
    });
    return result;
  }

  return null;
}

// =============================================================================
// File Parsing
// =============================================================================

/**
 * Find the first returned JSX element in a file
 */
export function findRootJsx(sourceFile: ts.SourceFile): ts.Node | null {
  let rootJsx: ts.Node | null = null;

  function visit(node: ts.Node): void {
    if (rootJsx) return;

    // Look for return statements with JSX
    if (ts.isReturnStatement(node) && node.expression) {
      if (
        ts.isJsxElement(node.expression) ||
        ts.isJsxSelfClosingElement(node.expression) ||
        ts.isJsxFragment(node.expression)
      ) {
        rootJsx = node.expression;
        return;
      }
      // Handle parenthesized expressions: return (<div>...</div>)
      if (ts.isParenthesizedExpression(node.expression)) {
        const inner = node.expression.expression;
        if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) {
          rootJsx = inner;
          return;
        }
      }
    }

    // Look for arrow function implicit returns
    if (ts.isArrowFunction(node) && node.body) {
      if (
        ts.isJsxElement(node.body) ||
        ts.isJsxSelfClosingElement(node.body) ||
        ts.isJsxFragment(node.body)
      ) {
        rootJsx = node.body;
        return;
      }
      if (ts.isParenthesizedExpression(node.body)) {
        const inner = node.body.expression;
        if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) {
          rootJsx = inner;
          return;
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  // First pass: look for returns and arrow functions
  visit(sourceFile);

  // Second pass: if not found, look for top-level JSX expressions
  if (!rootJsx) {
    for (const statement of sourceFile.statements) {
      if (ts.isExpressionStatement(statement)) {
        const expr = statement.expression;
        if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) {
          rootJsx = expr;
          break;
        }
      }
    }
  }

  return rootJsx;
}
