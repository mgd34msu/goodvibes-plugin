/**
 * `events` annotation for component_tree — Lane 4 (§4.4.1).
 *
 * Distilled from frontend-engine `core/event-flow/*`. Per tribunal, events keep
 * ONLY the two accurate predicates:
 *  - `nested_interactive_double_fire`: a click handler whose element is nested
 *    inside an ancestor that also has a click handler, and this handler does not
 *    call stopPropagation — clicking the child fires the ancestor too.
 *  - `handler_on_non_interactive`: a click handler on a non-interactive HTML
 *    element (div/span/…), which does not receive keyboard events by default.
 * The v1 form-submit / multi-handler heuristics are dropped. Shape per §4.4.1:
 *   [{ handler, element, event, line, risks }]
 *
 * @module frontend/annotations/events
 */

import ts from 'typescript';

/** One event handler with its computed risk predicates. */
export interface EventAnnotation {
  /** The JSX prop name, e.g. "onClick". */
  handler: string;
  /** The element/tag the handler is on. */
  element: string;
  /** The DOM event type, e.g. "click". */
  event: string;
  /** 1-based line of the element. */
  line: number;
  /** Accurate risk predicates that fire for this handler. */
  risks: string[];
}

/** Non-interactive HTML elements that often get click handlers. */
const NON_INTERACTIVE_ELEMENTS = new Set([
  'div', 'span', 'p', 'section', 'article', 'aside', 'header', 'footer',
  'main', 'nav', 'li', 'ul', 'ol', 'table', 'tr', 'td', 'th', 'img',
]);

/** React event prop → DOM event (subset; others derived by lowercasing). */
const EVENT_PROPS: Record<string, string> = {
  onClick: 'click', onDoubleClick: 'dblclick', onMouseDown: 'mousedown',
  onMouseUp: 'mouseup', onChange: 'change', onInput: 'input', onSubmit: 'submit',
  onFocus: 'focus', onBlur: 'blur', onKeyDown: 'keydown', onKeyUp: 'keyup',
  onKeyPress: 'keypress',
};

function eventOf(prop: string): string {
  return EVENT_PROPS[prop] ?? prop.replace(/^on/, '').toLowerCase();
}

function isEventProp(prop: string): boolean {
  return /^on[A-Z]/.test(prop);
}

/** Resolve a handler expression to its function body (inline or named in-file). */
function resolveHandlerBody(handlerExpr: ts.Expression, sourceFile: ts.SourceFile): ts.Node | null {
  if (ts.isArrowFunction(handlerExpr) || ts.isFunctionExpression(handlerExpr)) {return handlerExpr.body;}
  if (ts.isIdentifier(handlerExpr)) {
    const handlerName = handlerExpr.getText(sourceFile);
    let foundBody: ts.Node | null = null;
    function find(node: ts.Node): void {
      if (foundBody) {return;}
      if (ts.isFunctionDeclaration(node) && node.name?.getText(sourceFile) === handlerName && node.body) {
        foundBody = node.body;
        return;
      }
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.getText(sourceFile) === handlerName && decl.initializer) {
            if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
              foundBody = decl.initializer.body;
              return;
            }
          }
        }
      }
      ts.forEachChild(node, find);
    }
    find(sourceFile);
    return foundBody;
  }
  return null;
}

function containsStopPropagation(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let found = false;
  function visit(n: ts.Node): void {
    if (found) {return;}
    if (ts.isCallExpression(n)) {
      const callText = n.expression.getText(sourceFile);
      if (
        callText.endsWith('.stopPropagation') ||
        callText.endsWith('.stopImmediatePropagation') ||
        callText === 'stopPropagation'
      ) {
        found = true;
        return;
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return found;
}

interface ElNode {
  tag: string;
  line: number;
  parent: ElNode | null;
  handlers: Array<{ prop: string; event: string; line: number; stops: boolean }>;
}

/**
 * Compute the events annotation for a component node.
 * @param componentNode - the component's defining AST node
 * @param sourceFile - the host-parsed SourceFile (for handler resolution)
 */
export function annotateEvents(componentNode: ts.Node, sourceFile: ts.SourceFile): EventAnnotation[] {
  const allElements: ElNode[] = [];

  function processAttributes(
    attrsHost: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    el: ElNode,
  ): void {
    for (const attr of attrsHost.attributes.properties) {
      if (ts.isJsxAttribute(attr) && attr.name && attr.initializer) {
        const prop = attr.name.getText(sourceFile);
        if (!isEventProp(prop)) {continue;}
        let stops = false;
        if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
          const expr = attr.initializer.expression;
          const body = resolveHandlerBody(expr, sourceFile);
          stops = containsStopPropagation(body ?? expr, sourceFile);
        }
        el.handlers.push({ prop, event: eventOf(prop), line: el.line, stops });
      }
    }
  }

  function walk(node: ts.Node, parent: ElNode | null): void {
    if (ts.isJsxElement(node)) {
      const opening = node.openingElement;
      const tag = opening.tagName.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(opening.getStart(sourceFile)).line + 1;
      const el: ElNode = { tag, line, parent, handlers: [] };
      allElements.push(el);
      processAttributes(opening, el);
      for (const child of node.children) {walk(child, el);}
      return;
    }
    if (ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const el: ElNode = { tag, line, parent, handlers: [] };
      allElements.push(el);
      processAttributes(node, el);
      return;
    }
    ts.forEachChild(node, (child) => walk(child, parent));
  }

  walk(componentNode, null);

  /** True when an ancestor of `el` has a (bubbling) click handler. */
  function ancestorHasClick(el: ElNode): boolean {
    let cur = el.parent;
    while (cur) {
      if (cur.handlers.some((h) => h.event === 'click')) {return true;}
      cur = cur.parent;
    }
    return false;
  }

  const out: EventAnnotation[] = [];
  for (const el of allElements) {
    const tagLower = el.tag.toLowerCase();
    const isHtmlElement = !/^[A-Z]/.test(el.tag);
    for (const h of el.handlers) {
      const risks: string[] = [];
      if (h.event === 'click') {
        if (isHtmlElement && NON_INTERACTIVE_ELEMENTS.has(tagLower)) {
          risks.push('handler_on_non_interactive');
        }
        if (!h.stops && ancestorHasClick(el)) {
          risks.push('nested_interactive_double_fire');
        }
      }
      out.push({ handler: h.prop, element: el.tag, event: h.event, line: h.line, risks });
    }
  }
  return out;
}
