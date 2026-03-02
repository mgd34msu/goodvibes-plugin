/**
 * JSX Analyzer for Stacking Context
 *
 * Analyzes JSX files for stacking context patterns.
 *
 * @module core/stacking/jsx-analyzer
 */

import ts from 'typescript';
import type { ElementInfo } from './types.js';
import { createsStackingContext, extractZIndex, extractPosition } from './context-rules.js';
import { extractClassesFromAttribute } from '../jsx/class-extractor.js';
import { getLineNumberFromSourceFile } from '../../shared/utils.js';

/**
 * Analyze a JSX file for stacking contexts
 */
export function analyzeJsxFile(
  filePath: string,
  content: string,
  sourceFile: ts.SourceFile
): ElementInfo[] {
  const elements: ElementInfo[] = [];
  const elementStack: number[] = []; // Stack of parent indices

  function visit(node: ts.Node): void {
    // JSX Fragment opening (<> or <React.Fragment>) - transparent, just manage stack
    // Fragments do not create stacking contexts; treat children as belonging to parent
    if (ts.isJsxOpeningFragment(node)) {
      // Push the current parent index again so children inherit the same parent
      const parentIndex = elementStack.length > 0 ? elementStack[elementStack.length - 1] : null;
      // We push a sentinel (-1) so the closing fragment can pop correctly
      elementStack.push(parentIndex !== null ? parentIndex : -1);
      ts.forEachChild(node, visit);
      return;
    }

    if (ts.isJsxClosingFragment(node)) {
      elementStack.pop();
      ts.forEachChild(node, visit);
      return;
    }

    // JSX Opening Element or Self-Closing Element
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);

      // React.Fragment used as explicit component tag — treat as transparent
      if (tagName === 'React.Fragment' || tagName === 'Fragment') {
        if (ts.isJsxOpeningElement(node)) {
          const parentIndex = elementStack.length > 0 ? elementStack[elementStack.length - 1] : null;
          elementStack.push(parentIndex !== null ? parentIndex : -1);
        }
        // Self-closing Fragment (<React.Fragment />) has no children, nothing to push
        ts.forEachChild(node, visit);
        return;
      }

      const line = getLineNumberFromSourceFile(node.getStart(), sourceFile);
      const isComponent = /^[A-Z]/.test(tagName);

      // Extract classes from className attribute
      let classes: string[] = [];
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr)) {
          const attrName = attr.name.getText(sourceFile);
          if (attrName === 'className' || attrName === 'class') {
            classes = extractClassesFromAttribute(attr);
            break;
          }
        }
      }

      // Check if this creates a stacking context
      const { creates, reason } = createsStackingContext(classes);
      const z_index = extractZIndex(classes);
      const position = extractPosition(classes);

      // Resolve actual parent: skip sentinel -1 values from fragment proxies
      const rawParent = elementStack.length > 0 ? elementStack[elementStack.length - 1] : null;
      const resolvedParent = rawParent !== null && rawParent >= 0 ? rawParent : null;

      const elementInfo: ElementInfo = {
        element: `${tagName}:${line}`,
        line,
        classes,
        z_index,
        position,
        creates_context: creates,
        context_reason: reason,
        parent_index: resolvedParent,
        is_component: isComponent,
      };

      const currentIndex = elements.length;
      elements.push(elementInfo);

      // If this is an opening element (not self-closing), push to stack
      if (ts.isJsxOpeningElement(node)) {
        elementStack.push(currentIndex);
      }
    }

    // JSX Closing Element - pop from stack
    // Note: </> closings are JsxClosingFragment (handled above), not JsxClosingElement.
    // </React.Fragment> and </Fragment> ARE JsxClosingElement and also pop here.
    //
    // Ordering invariant: TypeScript's AST visitor visits nodes in source order
    // (opening element → children → closing element), which guarantees that every
    // push on JsxOpeningElement is matched by a pop here before any sibling node
    // is visited. This keeps elementStack balanced for both regular elements and
    // Fragment-proxied parents.
    if (ts.isJsxClosingElement(node)) {
      elementStack.pop();
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return elements;
}
