/**
 * Event Flow Core
 *
 * AST analysis, event handler extraction, and component detection
 * for event flow analysis.
 *
 * @module handlers/frontend/event-flow-core
 */

import ts from 'typescript';
import type { EventHandler, ComponentNode } from './event-flow-utils.js';
import { EVENT_PROPS } from './event-flow-utils.js';
import { findDelegationTargets, type DelegationPattern } from './event-flow-analyzers.js';

// =============================================================================
// AST Helpers
// =============================================================================

/**
 * Get line number for a node (1-based)
 */
export function getLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1;
}

/**
 * Get a clean code snippet for a node
 */
export function getCodeSnippet(node: ts.Node, sourceFile: ts.SourceFile, maxLength = 60): string {
  const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

/**
 * Check if a handler function contains stopPropagation() call
 */
export function containsStopPropagation(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let found = false;

  function visit(n: ts.Node): void {
    if (found) return;

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

/**
 * Check if a handler function contains preventDefault() call
 */
export function containsPreventDefault(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let found = false;

  function visit(n: ts.Node): void {
    if (found) return;

    if (ts.isCallExpression(n)) {
      const callText = n.expression.getText(sourceFile);
      if (callText.endsWith('.preventDefault') || callText === 'preventDefault') {
        found = true;
        return;
      }
    }

    ts.forEachChild(n, visit);
  }

  visit(node);
  return found;
}

/**
 * Resolve a handler reference to its function body if possible
 */
export function resolveHandlerBody(
  handlerExpr: ts.Expression,
  sourceFile: ts.SourceFile
): ts.Node | null {
  // Inline arrow function or function expression
  if (ts.isArrowFunction(handlerExpr) || ts.isFunctionExpression(handlerExpr)) {
    return handlerExpr.body;
  }

  // Reference to a function - try to find it in the file
  if (ts.isIdentifier(handlerExpr)) {
    const handlerName = handlerExpr.getText(sourceFile);

    // Search for the function declaration
    let foundBody: ts.Node | null = null;

    function findHandler(node: ts.Node): void {
      if (foundBody) return;

      // Function declaration: function handleClick() {}
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.getText(sourceFile) === handlerName &&
        node.body
      ) {
        foundBody = node.body;
        return;
      }

      // Variable declaration: const handleClick = () => {}
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.getText(sourceFile) === handlerName) {
            if (decl.initializer) {
              if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
                foundBody = decl.initializer.body;
                return;
              }
            }
          }
        }
      }

      ts.forEachChild(node, findHandler);
    }

    findHandler(sourceFile);
    return foundBody;
  }

  return null;
}

// =============================================================================
// Event Handler Extraction
// =============================================================================

/**
 * Extract event handlers from JSX elements
 */
export function extractEventHandlers(
  componentNode: ts.Node,
  sourceFile: ts.SourceFile,
  eventFilter?: string
): { handlers: EventHandler[]; tree: ComponentNode } {
  const handlers: EventHandler[] = [];
  const rootNode: ComponentNode = {
    element: 'root',
    parent: null,
    children: [],
    handlers: [],
    line: 0,
    depth: 0,
  };

  let currentParent: ComponentNode = rootNode;

  function visit(node: ts.Node, depth: number): void {
    // Handle JSX opening elements
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      const line = getLineNumber(node, sourceFile);

      const componentNode: ComponentNode = {
        element: tagName,
        parent: currentParent,
        children: [],
        handlers: [],
        line,
        depth,
      };
      currentParent.children.push(componentNode);

      // Extract event handlers from attributes
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr) && attr.name && attr.initializer) {
          const attrName = attr.name.getText(sourceFile);

          // Check if this is an event handler prop
          const eventType = EVENT_PROPS[attrName];
          if (eventType) {
            // Apply filter if specified
            if (eventFilter && eventType !== eventFilter.toLowerCase()) {
              continue;
            }

            let handlerName = attrName;
            let stopsPropagation = false;
            let preventsDefault = false;

            if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
              const expr = attr.initializer.expression;
              handlerName = getCodeSnippet(expr, sourceFile);

              // Try to resolve the handler body for analysis
              const handlerBody = resolveHandlerBody(expr, sourceFile);
              if (handlerBody) {
                stopsPropagation = containsStopPropagation(handlerBody, sourceFile);
                preventsDefault = containsPreventDefault(handlerBody, sourceFile);
              } else {
                // For inline handlers, check the expression directly
                stopsPropagation = containsStopPropagation(expr, sourceFile);
                preventsDefault = containsPreventDefault(expr, sourceFile);
              }
            }

            const handler: EventHandler = {
              element: tagName,
              event: eventType,
              handler: handlerName,
              line,
              stops_propagation: stopsPropagation,
              prevents_default: preventsDefault,
            };

            handlers.push(handler);
            componentNode.handlers.push(handler);
          }
        }
      }

      // For full JSX elements (not self-closing), process children with this as parent
      if (ts.isJsxOpeningElement(node)) {
        const prevParent = currentParent;
        currentParent = componentNode;

        // Find the parent JSX element to get children
        const parent = node.parent;
        if (ts.isJsxElement(parent)) {
          for (const child of parent.children) {
            visit(child, depth + 1);
          }
        }

        currentParent = prevParent;
        return; // Don't recurse further, we handled children
      }
    }

    ts.forEachChild(node, (child) => visit(child, depth));
  }

  visit(componentNode, 0);

  return { handlers, tree: rootNode };
}

// =============================================================================
// Component Detection
// =============================================================================

/**
 * Check if node contains JSX
 */
function containsJsxReturn(node: ts.Node): boolean {
  let hasJsx = false;

  function visit(n: ts.Node): void {
    if (hasJsx) return;
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      hasJsx = true;
      return;
    }
    ts.forEachChild(n, visit);
  }

  visit(node);
  return hasJsx;
}

/**
 * Find React component in source file
 */
export function findReactComponent(sourceFile: ts.SourceFile): ts.Node | null {
  let componentNode: ts.Node | null = null;

  function visit(node: ts.Node): void {
    if (componentNode) return;

    // Function declaration: function Component() {}
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      if (/^[A-Z]/.test(name) && containsJsxReturn(node)) {
        componentNode = node;
        return;
      }
    }

    // Variable statement: const Component = () => {}
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          const name = decl.name.getText(sourceFile);
          if (/^[A-Z]/.test(name)) {
            // Check for React.memo wrapper
            if (ts.isCallExpression(decl.initializer)) {
              const callText = decl.initializer.expression.getText(sourceFile);
              if (
                (callText === 'memo' || callText === 'React.memo') &&
                decl.initializer.arguments.length > 0
              ) {
                const arg = decl.initializer.arguments[0];
                if (containsJsxReturn(arg)) {
                  componentNode = arg;
                  return;
                }
              }
            } else if (
              ts.isArrowFunction(decl.initializer) ||
              ts.isFunctionExpression(decl.initializer)
            ) {
              if (containsJsxReturn(decl.initializer)) {
                componentNode = decl.initializer;
                return;
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return componentNode;
}

// =============================================================================
// Delegation Pattern Detection
// =============================================================================

/**
 * Detect event delegation patterns
 */
export function detectDelegationPatterns(
  handlers: EventHandler[],
  sourceFile: ts.SourceFile
): DelegationPattern[] {
  const patterns: DelegationPattern[] = [];

  function findDelegation(handler: EventHandler): DelegationPattern | null {
    let foundPattern: DelegationPattern | null = null;

    function visit(node: ts.Node): void {
      if (foundPattern) return;

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const line = getLineNumber(node, sourceFile);

        if (line === handler.line) {
          // Find the handler attribute
          for (const attr of node.attributes.properties) {
            if (
              ts.isJsxAttribute(attr) &&
              attr.initializer &&
              ts.isJsxExpression(attr.initializer)
            ) {
              const expr = attr.initializer.expression;
              if (expr) {
                const handlerBody = resolveHandlerBody(expr, sourceFile);
                const nodeToCheck = handlerBody || expr;

                const delegateTargets = findDelegationTargets(nodeToCheck, sourceFile);
                if (delegateTargets.length > 0) {
                  foundPattern = {
                    container: handler.element,
                    delegates_for: delegateTargets,
                    event: handler.event,
                  };
                }
              }
            }
          }
        }
      }

      if (!foundPattern) {
        ts.forEachChild(node, visit);
      }
    }

    visit(sourceFile);
    return foundPattern;
  }

  for (const handler of handlers) {
    const pattern = findDelegation(handler);
    if (pattern) {
      patterns.push(pattern);
    }
  }

  return patterns;
}
