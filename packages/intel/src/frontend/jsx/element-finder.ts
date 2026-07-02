/**
 * JSX element finder — Lane 4.
 * Ported from frontend-engine `core/jsx/element-finder.ts`. Used by the sizing
 * section to build an ElementNode chain up to a selected element.
 *
 * @module frontend/jsx/element-finder
 */

import ts from 'typescript';
import type { ElementNode } from '../tailwind/types.js';
import { parseTailwindClasses } from '../tailwind/parser.js';
import { extractClassesFromAttribute } from './class-extractor.js';

/** Extract className/class classes from a JSX element. */
export function extractClassName(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile,
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

/** Extract the id attribute from a JSX element. */
export function extractId(
  node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  sourceFile: ts.SourceFile,
): string | undefined {
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'id') {
      if (attr.initializer && ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
    }
  }
  return undefined;
}

/** Build an ElementNode from a JSX element. */
export function buildElementNode(
  tagName: string,
  classes: string[],
  id: string | undefined,
  parent: ElementNode | undefined,
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

/** Check if an element matches a `.class` / `#id` / `tag` selector. */
export function matchesSelector(
  tagName: string,
  classes: string[],
  id: string | undefined,
  selector: string,
): boolean {
  if (selector.startsWith('#')) return id === selector.slice(1);
  if (selector.startsWith('.')) return classes.includes(selector.slice(1));
  return tagName.toLowerCase() === selector.toLowerCase();
}

/** Parse a JSX tree and find the target element (with its ancestor chain). */
export function parseJsxTree(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  parent: ElementNode | undefined,
  selector: string,
): ElementNode | null {
  if (ts.isJsxElement(node)) {
    const openingElement = node.openingElement;
    const tagName = openingElement.tagName.getText(sourceFile);
    const classes = extractClassName(openingElement, sourceFile);
    const id = extractId(openingElement, sourceFile);
    const elementNode = buildElementNode(tagName, classes, id, parent);

    if (matchesSelector(tagName, classes, id, selector)) {
      for (const child of node.children) {
        const childResult = parseJsxTreeForChildren(child, sourceFile, elementNode);
        if (childResult) elementNode.children.push(childResult);
      }
      return elementNode;
    }
    for (const child of node.children) {
      const result = parseJsxTree(child, sourceFile, elementNode, selector);
      if (result) return result;
    }
    return null;
  }

  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const classes = extractClassName(node, sourceFile);
    const id = extractId(node, sourceFile);
    if (matchesSelector(tagName, classes, id, selector)) {
      return buildElementNode(tagName, classes, id, parent);
    }
    return null;
  }

  if (ts.isJsxFragment(node)) {
    for (const child of node.children) {
      const result = parseJsxTree(child, sourceFile, parent, selector);
      if (result) return result;
    }
    return null;
  }

  if (ts.isJsxExpression(node) && node.expression) {
    let result: ElementNode | null = null;
    ts.forEachChild(node.expression, (child) => {
      if (!result) result = parseJsxTree(child, sourceFile, parent, selector);
    });
    return result;
  }

  let result: ElementNode | null = null;
  ts.forEachChild(node, (child) => {
    if (!result) result = parseJsxTree(child, sourceFile, parent, selector);
  });
  return result;
}

function parseJsxTreeForChildren(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  parent: ElementNode,
): ElementNode | null {
  if (ts.isJsxElement(node)) {
    const openingElement = node.openingElement;
    const tagName = openingElement.tagName.getText(sourceFile);
    const classes = extractClassName(openingElement, sourceFile);
    const id = extractId(openingElement, sourceFile);
    const elementNode = buildElementNode(tagName, classes, id, parent);
    for (const child of node.children) {
      const childResult = parseJsxTreeForChildren(child, sourceFile, elementNode);
      if (childResult) elementNode.children.push(childResult);
    }
    return elementNode;
  }
  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const classes = extractClassName(node, sourceFile);
    const id = extractId(node, sourceFile);
    return buildElementNode(tagName, classes, id, parent);
  }
  if (ts.isJsxFragment(node)) {
    const fragmentNode = buildElementNode('Fragment', [], undefined, parent);
    fragmentNode.display = 'contents';
    for (const child of node.children) {
      const childResult = parseJsxTreeForChildren(child, sourceFile, fragmentNode);
      if (childResult) fragmentNode.children.push(childResult);
    }
    return fragmentNode.children.length > 0 ? fragmentNode : null;
  }
  return null;
}

/** Find the first returned JSX element in a file. */
export function findRootJsx(sourceFile: ts.SourceFile): ts.Node | null {
  let rootJsx: ts.Node | null = null;

  function visit(node: ts.Node): void {
    if (rootJsx) return;
    if (ts.isReturnStatement(node) && node.expression) {
      if (ts.isJsxElement(node.expression) || ts.isJsxSelfClosingElement(node.expression) || ts.isJsxFragment(node.expression)) {
        rootJsx = node.expression;
        return;
      }
      if (ts.isParenthesizedExpression(node.expression)) {
        const inner = node.expression.expression;
        if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) {
          rootJsx = inner;
          return;
        }
      }
    }
    if (ts.isArrowFunction(node) && node.body) {
      if (ts.isJsxElement(node.body) || ts.isJsxSelfClosingElement(node.body) || ts.isJsxFragment(node.body)) {
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

  visit(sourceFile);

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

/** Find an element by selector in a JSX tree (with its ancestor chain). */
export function findElementBySelector(
  rootJsx: ts.Node,
  sourceFile: ts.SourceFile,
  selector: string,
): ElementNode | null {
  return parseJsxTree(rootJsx, sourceFile, undefined, selector);
}
