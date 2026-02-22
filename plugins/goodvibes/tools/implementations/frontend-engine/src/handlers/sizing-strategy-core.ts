/**
 * Sizing Strategy Core
 *
 * AST analysis, JSX parsing, and element finding
 * for sizing strategy analysis.
 *
 * @module handlers/frontend/sizing-strategy-core
 */

import ts from 'typescript';
import type { ElementNode } from './sizing-strategy-utils.js';
import { parseTailwindClasses, createElementIdentifier } from './sizing-strategy-utils.js';
import { extractClassesFromAttribute } from './jsx-class-utils.js';

// =============================================================================
// AST Analysis Helpers
// =============================================================================

/**
 * Extract className attribute from a JSX element
 */
export function extractClassName(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile
): string[] {
  const classes: string[] = [];

  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr)) {
      const attrName = attr.name.getText(sourceFile);
      if (attrName === 'className' || attrName === 'class') {
        classes.push(...extractClassesFromAttribute(attr));
      }
    }
  }

  return classes;
}

/**
 * Extract id attribute from a JSX element
 */
export function extractId(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile
): string | undefined {
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'id') {
      if (attr.initializer && ts.isStringLiteral(attr.initializer)) {
        return attr.initializer.text;
      }
    }
  }
  return undefined;
}

// =============================================================================
// Element Node Building
// =============================================================================

/**
 * Build ElementNode from JSX element
 */
export function buildElementNode(
  tagName: string,
  classes: string[],
  id: string | undefined,
  parent: ElementNode | undefined
): ElementNode {
  const props = parseTailwindClasses(classes);

  return {
    tagName,
    classes,
    id,
    parent,
    children: [],
    display: props.display || 'block',
    position: props.position || 'static',
    overflowX: props.overflowX || 'visible',
    overflowY: props.overflowY || 'visible',
    width: props.width,
    height: props.height,
    minWidth: props.minWidth,
    maxWidth: props.maxWidth,
    minHeight: props.minHeight,
    maxHeight: props.maxHeight,
    flexDirection: props.flexDirection,
    flexGrow: props.flexGrow,
    flexShrink: props.flexShrink,
    flexBasis: props.flexBasis,
    gridColumn: props.gridColumn,
    gridRow: props.gridRow,
    gridArea: props.gridArea,
    gridTemplateColumns: props.gridTemplateColumns,
    gridTemplateRows: props.gridTemplateRows,
  };
}

// =============================================================================
// Selector Matching
// =============================================================================

/**
 * Check if element matches a selector
 */
export function matchesSelector(
  tagName: string,
  classes: string[],
  id: string | undefined,
  selector: string
): boolean {
  // ID selector: #myId
  if (selector.startsWith('#')) {
    return id === selector.slice(1);
  }

  // Class selector: .myClass
  if (selector.startsWith('.')) {
    return classes.includes(selector.slice(1));
  }

  // Tag name selector
  return tagName.toLowerCase() === selector.toLowerCase();
}

// =============================================================================
// JSX Tree Parsing
// =============================================================================

/**
 * Parse JSX tree and find target element
 */
export function parseJsxTree(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  parent: ElementNode | undefined,
  selector: string
): ElementNode | null {
  // Handle JSX element with children
  if (ts.isJsxElement(node)) {
    const openingElement = node.openingElement;
    const tagName = openingElement.tagName.getText(sourceFile);
    const classes = extractClassName(openingElement, sourceFile);
    const id = extractId(openingElement, sourceFile);

    const elementNode = buildElementNode(tagName, classes, id, parent);

    // Check if this element matches
    if (matchesSelector(tagName, classes, id, selector)) {
      // Parse children to complete the node
      for (const child of node.children) {
        const childResult = parseJsxTreeForChildren(child, sourceFile, elementNode);
        if (childResult) {
          elementNode.children.push(childResult);
        }
      }
      return elementNode;
    }

    // Continue searching in children
    for (const child of node.children) {
      const result = parseJsxTree(child, sourceFile, elementNode, selector);
      if (result) {
        return result;
      }
    }

    return null;
  }

  // Handle self-closing JSX element
  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const classes = extractClassName(node, sourceFile);
    const id = extractId(node, sourceFile);

    if (matchesSelector(tagName, classes, id, selector)) {
      return buildElementNode(tagName, classes, id, parent);
    }

    return null;
  }

  // Handle JSX fragment
  if (ts.isJsxFragment(node)) {
    for (const child of node.children) {
      const result = parseJsxTree(child, sourceFile, parent, selector);
      if (result) {
        return result;
      }
    }
    return null;
  }

  // Handle JSX expression
  if (ts.isJsxExpression(node) && node.expression) {
    let result: ElementNode | null = null;
    ts.forEachChild(node.expression, (child) => {
      if (!result) {
        result = parseJsxTree(child, sourceFile, parent, selector);
      }
    });
    return result;
  }

  // Recurse into other nodes
  let result: ElementNode | null = null;
  ts.forEachChild(node, (child) => {
    if (!result) {
      result = parseJsxTree(child, sourceFile, parent, selector);
    }
  });

  return result;
}

/**
 * Parse JSX tree for building children (after finding target)
 */
function parseJsxTreeForChildren(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  parent: ElementNode
): ElementNode | null {
  // Handle JSX element with children
  if (ts.isJsxElement(node)) {
    const openingElement = node.openingElement;
    const tagName = openingElement.tagName.getText(sourceFile);
    const classes = extractClassName(openingElement, sourceFile);
    const id = extractId(openingElement, sourceFile);

    const elementNode = buildElementNode(tagName, classes, id, parent);

    // Parse children
    for (const child of node.children) {
      const childResult = parseJsxTreeForChildren(child, sourceFile, elementNode);
      if (childResult) {
        elementNode.children.push(childResult);
      }
    }

    return elementNode;
  }

  // Handle self-closing JSX element
  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const classes = extractClassName(node, sourceFile);
    const id = extractId(node, sourceFile);

    return buildElementNode(tagName, classes, id, parent);
  }

  // Handle JSX fragment
  if (ts.isJsxFragment(node)) {
    // For fragments, we create a pseudo-element
    const fragmentNode = buildElementNode('Fragment', [], undefined, parent);
    fragmentNode.display = 'contents';

    for (const child of node.children) {
      const childResult = parseJsxTreeForChildren(child, sourceFile, fragmentNode);
      if (childResult) {
        fragmentNode.children.push(childResult);
      }
    }

    return fragmentNode.children.length > 0 ? fragmentNode : null;
  }

  // Skip text nodes and expressions
  return null;
}

// =============================================================================
// Root JSX Finding
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
      if (ts.isParenthesizedExpression(node.expression)) {
        const inner = node.expression.expression;
        if (
          ts.isJsxElement(inner) ||
          ts.isJsxSelfClosingElement(inner) ||
          ts.isJsxFragment(inner)
        ) {
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
        if (
          ts.isJsxElement(inner) ||
          ts.isJsxSelfClosingElement(inner) ||
          ts.isJsxFragment(inner)
        ) {
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
        if (
          ts.isJsxElement(expr) ||
          ts.isJsxSelfClosingElement(expr) ||
          ts.isJsxFragment(expr)
        ) {
          rootJsx = expr;
          break;
        }
      }
    }
  }

  return rootJsx;
}

// =============================================================================
// Element Finding by Selector
// =============================================================================

/**
 * Find element by selector in JSX tree
 */
export function findElementBySelector(
  rootJsx: ts.Node,
  sourceFile: ts.SourceFile,
  selector: string
): ElementNode | null {
  // Build parent chain first
  return parseJsxTree(rootJsx, sourceFile, undefined, selector);
}

/**
 * Get all elements from JSX tree (for listing available elements)
 */
export function getAllElements(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  elements: Array<{ selector: string; tag: string }> = []
): Array<{ selector: string; tag: string }> {
  // Handle JSX element
  if (ts.isJsxElement(node)) {
    const openingElement = node.openingElement;
    const tagName = openingElement.tagName.getText(sourceFile);
    const classes = extractClassName(openingElement, sourceFile);
    const id = extractId(openingElement, sourceFile);

    const selector = id
      ? `#${id}`
      : classes.length > 0
        ? `.${classes[0]}`
        : tagName;

    elements.push({ selector, tag: tagName });

    for (const child of node.children) {
      getAllElements(child, sourceFile, elements);
    }
    return elements;
  }

  // Handle self-closing JSX element
  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const classes = extractClassName(node, sourceFile);
    const id = extractId(node, sourceFile);

    const selector = id
      ? `#${id}`
      : classes.length > 0
        ? `.${classes[0]}`
        : tagName;

    elements.push({ selector, tag: tagName });
    return elements;
  }

  // Handle JSX fragment
  if (ts.isJsxFragment(node)) {
    for (const child of node.children) {
      getAllElements(child, sourceFile, elements);
    }
    return elements;
  }

  // Handle JSX expression
  if (ts.isJsxExpression(node) && node.expression) {
    ts.forEachChild(node.expression, (child) => {
      getAllElements(child, sourceFile, elements);
    });
    return elements;
  }

  // Recurse into other nodes
  ts.forEachChild(node, (child) => {
    getAllElements(child, sourceFile, elements);
  });

  return elements;
}
