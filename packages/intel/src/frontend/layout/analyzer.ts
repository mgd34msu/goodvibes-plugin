/**
 * Layout hierarchy analyzer (backbone) — Lane 4.
 *
 * Ported from frontend-engine `core/layout/analyzer.ts`, trimmed to the tree
 * backbone the merged `layout_analysis` needs (§4.4.2): JSX → LayoutNode tree via
 * the shared corrected Tailwind class dictionary. The v1 generic issue-detector /
 * constraint-notes / summary do NOT port — overflow/sizing/stacking are their own
 * sections in the merged shape.
 *
 * @module frontend/layout/analyzer
 */

import ts from 'typescript';
import { parseTailwindClassesLayout } from '../tailwind/parser.js';
import { createElementIdentifier } from '../tailwind/identifier.js';
import { extractClassesFromAttribute } from '../jsx/class-extractor.js';
import type {
  DisplayType,
  PositionType,
  ParsedCssProperties,
  Sizing,
  FlexProps,
  GridProps,
  Overflow,
  LayoutNode,
} from './types.js';

export { findRootJsx } from '../jsx/element-finder.js';
export { createElementIdentifier };

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

/** Build a LayoutNode from parsed CSS properties. */
export function buildLayoutNode(
  tagName: string,
  classes: string[],
  id: string | undefined,
  props: ParsedCssProperties,
  children: LayoutNode[],
): LayoutNode {
  const element = createElementIdentifier(tagName, classes, id);

  const sizing: Sizing = {
    width: props.width || { strategy: 'auto' },
    height: props.height || { strategy: 'auto' },
  };
  const display: DisplayType = props.display || 'block';

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

  const overflow: Overflow = {
    x: props.overflowX || props.overflow || 'visible',
    y: props.overflowY || props.overflow || 'visible',
  };
  const position: PositionType = props.position || 'static';

  return { element, tag: tagName, classes, sizing, display, flex_props, grid_props, overflow, position, children };
}

/** Check if an element matches a `.class` / `#id` / `tag` selector. */
export function matchesSelector(tagName: string, classes: string[], id: string | undefined, selector: string): boolean {
  if (selector.startsWith('#')) return id === selector.slice(1);
  if (selector.startsWith('.')) return classes.includes(selector.slice(1));
  return tagName.toLowerCase() === selector.toLowerCase();
}

/** Recursively parse a JSX tree into LayoutNodes (optional selector focus). */
export function parseJsxElement(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  selector?: string,
  foundSelector = false,
): LayoutNode | null {
  if (ts.isJsxElement(node)) {
    const openingElement = node.openingElement;
    const tagName = openingElement.tagName.getText(sourceFile);
    const classes = extractClassName(openingElement, sourceFile);
    const id = extractId(openingElement, sourceFile);
    const props = parseTailwindClassesLayout(classes);

    const elementMatches = selector ? matchesSelector(tagName, classes, id, selector) : false;
    const shouldInclude = !selector || foundSelector || elementMatches;

    const children: LayoutNode[] = [];
    for (const child of node.children) {
      const childNode = parseJsxElement(child, sourceFile, selector, foundSelector || elementMatches);
      if (childNode) children.push(childNode);
    }

    if (selector && !foundSelector && !elementMatches) {
      if (children.length > 0) {
        return children.length === 1 ? children[0] : buildLayoutNode(tagName, classes, id, props, children);
      }
      return null;
    }

    if (shouldInclude) return buildLayoutNode(tagName, classes, id, props, children);
    return null;
  }

  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = node.tagName.getText(sourceFile);
    const classes = extractClassName(node, sourceFile);
    const id = extractId(node, sourceFile);
    const props = parseTailwindClassesLayout(classes);

    const elementMatches = selector ? matchesSelector(tagName, classes, id, selector) : true;
    if (!selector || foundSelector || elementMatches) {
      return buildLayoutNode(tagName, classes, id, props, []);
    }
    return null;
  }

  if (ts.isJsxFragment(node)) {
    const children: LayoutNode[] = [];
    for (const child of node.children) {
      const childNode = parseJsxElement(child, sourceFile, selector, foundSelector);
      if (childNode) children.push(childNode);
    }
    if (children.length === 1) return children[0];
    if (children.length > 0) {
      return {
        element: 'Fragment', tag: 'Fragment', classes: [],
        sizing: { width: { strategy: 'auto' }, height: { strategy: 'auto' } },
        display: 'contents', overflow: { x: 'visible', y: 'visible' }, position: 'static', children,
      };
    }
    return null;
  }

  if (ts.isJsxExpression(node) && node.expression) {
    let result: LayoutNode | null = null;
    ts.forEachChild(node.expression, (child) => {
      if (!result) result = parseJsxElement(child, sourceFile, selector, foundSelector);
    });
    return result;
  }

  return null;
}
