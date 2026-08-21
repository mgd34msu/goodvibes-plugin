/**
 * Stacking JSX analyzer, Lane 4.
 * Ported from frontend-engine `core/stacking/jsx-analyzer.ts`, scoped to a
 * component/JSX node and rewired to the shared class-extractor + composite element
 * ids (so stacking `node`s cross-reference the hierarchy backbone). Emits ALL
 * context-creation triggers per element (§4.4.2 enhancement).
 *
 * @module frontend/stacking/jsx-analyzer
 */

import ts from 'typescript';
import { allStackingTriggers, extractZIndex, extractPosition } from './context-rules.js';
import { extractClassesFromAttribute } from '../jsx/class-extractor.js';
import { createElementIdentifier } from '../tailwind/identifier.js';

/** One element's stacking context info. */
export interface StackingElement {
  /** Composite element id (matches the hierarchy backbone). */
  node: string;
  tag: string;
  line: number;
  classes: string[];
  z_index: number | 'auto';
  position: 'relative' | 'absolute' | 'fixed' | 'sticky' | 'static';
  creates_context: boolean;
  /** ALL context-creation triggers on this element. */
  created_by: string[];
}

/** Analyze a JSX (component) node for stacking context elements. */
export function analyzeStackingElements(node: ts.Node, sourceFile: ts.SourceFile): StackingElement[] {
  const elements: StackingElement[] = [];

  function extractId(el: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string | undefined {
    for (const attr of el.attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.name.getText(sourceFile) === 'id' && attr.initializer && ts.isStringLiteral(attr.initializer)) {
        return attr.initializer.text;
      }
    }
    return undefined;
  }

  function visit(n: ts.Node): void {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sourceFile);
      if (tag !== 'React.Fragment' && tag !== 'Fragment') {
        const line = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile)).line + 1;
        let classes: string[] = [];
        for (const attr of n.attributes.properties) {
          if (ts.isJsxAttribute(attr)) {
            const attrName = attr.name.getText(sourceFile);
            if (attrName === 'className' || attrName === 'class') {
              classes = extractClassesFromAttribute(attr);
              break;
            }
          }
        }
        const triggers = allStackingTriggers(classes);
        elements.push({
          node: createElementIdentifier(tag, classes, extractId(n)),
          tag,
          line,
          classes,
          z_index: extractZIndex(classes),
          position: extractPosition(classes),
          creates_context: triggers.length > 0,
          created_by: triggers,
        });
      }
    }
    ts.forEachChild(n, visit);
  }

  visit(node);
  return elements;
}
