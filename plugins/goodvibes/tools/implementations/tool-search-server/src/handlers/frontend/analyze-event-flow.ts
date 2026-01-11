/**
 * Analyze Event Flow Handler
 *
 * Analyzes event handling and propagation in React/Vue/Svelte components.
 * Detects event handlers, propagation patterns, delegation, and common issues
 * like nested clickable elements or missing keyboard alternatives.
 *
 * @module handlers/frontend/analyze-event-flow
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the analyze_event_flow tool
 */
export interface AnalyzeEventFlowArgs {
  /** Path to the component file to analyze */
  file: string;
  /** Filter to specific event type (e.g., "click", "change") */
  event?: string;
}

/**
 * Information about an event handler
 */
interface EventHandler {
  /** Element or component name */
  element: string;
  /** Event type (click, change, etc.) */
  event: string;
  /** Handler function name or inline code */
  handler: string;
  /** Line number where handler is defined */
  line: number;
  /** Whether handler calls stopPropagation */
  stops_propagation: boolean;
  /** Whether handler calls preventDefault */
  prevents_default: boolean;
}

/**
 * Step in an event flow
 */
interface EventFlowStep {
  step: number;
  element: string;
  handler: string;
  stops_here: boolean;
}

/**
 * Event flow scenario
 */
interface EventFlow {
  scenario: string;
  steps: EventFlowStep[];
}

/**
 * Issue detected in event handling
 */
interface EventIssue {
  issue: string;
  elements: string[];
  explanation: string;
  fix: string;
}

/**
 * Event delegation pattern
 */
interface DelegationPattern {
  container: string;
  delegates_for: string[];
  event: string;
}

/**
 * Result of event flow analysis
 */
interface AnalyzeEventFlowResult {
  file: string;
  handlers: EventHandler[];
  event_flows: Record<string, EventFlow>;
  issues: EventIssue[];
  delegation_patterns: DelegationPattern[];
  summary: string;
}

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Internal node tracking for component tree
 */
interface ComponentNode {
  element: string;
  parent: ComponentNode | null;
  children: ComponentNode[];
  handlers: EventHandler[];
  line: number;
  depth: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * React event prop names mapped to DOM event types
 */
const EVENT_PROPS: Record<string, string> = {
  // Mouse events
  onClick: 'click',
  onDoubleClick: 'dblclick',
  onMouseDown: 'mousedown',
  onMouseUp: 'mouseup',
  onMouseEnter: 'mouseenter',
  onMouseLeave: 'mouseleave',
  onMouseMove: 'mousemove',
  onMouseOver: 'mouseover',
  onMouseOut: 'mouseout',
  onContextMenu: 'contextmenu',

  // Form events
  onChange: 'change',
  onInput: 'input',
  onSubmit: 'submit',
  onReset: 'reset',
  onFocus: 'focus',
  onBlur: 'blur',

  // Keyboard events
  onKeyDown: 'keydown',
  onKeyUp: 'keyup',
  onKeyPress: 'keypress',

  // Touch events
  onTouchStart: 'touchstart',
  onTouchEnd: 'touchend',
  onTouchMove: 'touchmove',
  onTouchCancel: 'touchcancel',

  // Drag events
  onDrag: 'drag',
  onDragStart: 'dragstart',
  onDragEnd: 'dragend',
  onDragEnter: 'dragenter',
  onDragLeave: 'dragleave',
  onDragOver: 'dragover',
  onDrop: 'drop',

  // Scroll/Wheel events
  onScroll: 'scroll',
  onWheel: 'wheel',

  // Pointer events
  onPointerDown: 'pointerdown',
  onPointerUp: 'pointerup',
  onPointerMove: 'pointermove',
  onPointerEnter: 'pointerenter',
  onPointerLeave: 'pointerleave',
  onPointerCancel: 'pointercancel',

  // Clipboard events
  onCopy: 'copy',
  onCut: 'cut',
  onPaste: 'paste',

  // Animation events
  onAnimationStart: 'animationstart',
  onAnimationEnd: 'animationend',
  onAnimationIteration: 'animationiteration',

  // Transition events
  onTransitionEnd: 'transitionend',
};

/**
 * Events that bubble by default
 */
const BUBBLING_EVENTS = new Set([
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseover',
  'mouseout',
  'contextmenu',
  'keydown',
  'keyup',
  'keypress',
  'change',
  'input',
  'submit',
  'reset',
  'scroll',
  'wheel',
  'touchstart',
  'touchend',
  'touchmove',
  'drag',
  'dragstart',
  'dragend',
  'dragenter',
  'dragleave',
  'dragover',
  'drop',
  'pointerdown',
  'pointerup',
  'pointermove',
  'copy',
  'cut',
  'paste',
]);

/**
 * Interactive HTML elements that should have keyboard support
 */
const INTERACTIVE_ELEMENTS = new Set([
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'summary',
]);

/**
 * Non-interactive elements that often get click handlers
 */
const NON_INTERACTIVE_ELEMENTS = new Set([
  'div',
  'span',
  'p',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'main',
  'nav',
  'li',
  'ul',
  'ol',
  'table',
  'tr',
  'td',
  'th',
  'img',
]);

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
// AST Helpers
// =============================================================================

/**
 * Get line number for a node (1-based)
 */
function getLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1;
}

/**
 * Get a clean code snippet for a node
 */
function getCodeSnippet(node: ts.Node, sourceFile: ts.SourceFile, maxLength = 60): string {
  const text = node.getText(sourceFile).replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

/**
 * Check if a handler function contains stopPropagation() call
 */
function containsStopPropagation(node: ts.Node, sourceFile: ts.SourceFile): boolean {
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
function containsPreventDefault(node: ts.Node, sourceFile: ts.SourceFile): boolean {
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
 * Check if a handler contains event delegation patterns (e.target checks)
 */
function findDelegationTargets(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const targets: string[] = [];

  function visit(n: ts.Node): void {
    // Look for patterns like:
    // - e.target.closest('button')
    // - e.target.matches('.item')
    // - e.target.tagName === 'BUTTON'
    // - e.target.dataset.action

    if (ts.isCallExpression(n)) {
      const callText = n.expression.getText(sourceFile);

      // e.target.closest('selector')
      if (callText.match(/\.target\.closest$/)) {
        const arg = n.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          targets.push(arg.text);
        }
      }

      // e.target.matches('selector')
      if (callText.match(/\.target\.matches$/)) {
        const arg = n.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          targets.push(arg.text);
        }
      }
    }

    // e.target.tagName === 'TAG'
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      const leftText = n.left.getText(sourceFile);
      if (leftText.match(/\.target\.tagName$/)) {
        if (ts.isStringLiteral(n.right)) {
          targets.push(n.right.text.toLowerCase());
        }
      }
    }

    // e.target.dataset.X checks
    if (ts.isPropertyAccessExpression(n)) {
      const text = n.getText(sourceFile);
      if (text.match(/\.target\.dataset\./)) {
        targets.push(`[data-${n.name.getText(sourceFile)}]`);
      }
    }

    ts.forEachChild(n, visit);
  }

  visit(node);
  return targets;
}

/**
 * Resolve a handler reference to its function body if possible
 */
function resolveHandlerBody(
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
      if (ts.isFunctionDeclaration(node) && node.name?.getText(sourceFile) === handlerName && node.body) {
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
// Event Handler Detection
// =============================================================================

/**
 * Extract event handlers from JSX elements
 */
function extractEventHandlers(
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
// Event Flow Simulation
// =============================================================================

/**
 * Build event flow scenarios by simulating bubbling from leaf to root
 */
function buildEventFlows(
  handlers: EventHandler[],
  tree: ComponentNode,
  eventFilter?: string
): Record<string, EventFlow> {
  const flows: Record<string, EventFlow> = {};

  // Group handlers by event type
  const handlersByEvent = new Map<string, EventHandler[]>();
  for (const handler of handlers) {
    const existing = handlersByEvent.get(handler.event) || [];
    existing.push(handler);
    handlersByEvent.set(handler.event, existing);
  }

  // For each event type that bubbles, simulate the flow
  for (const [eventType, eventHandlers] of handlersByEvent) {
    if (!BUBBLING_EVENTS.has(eventType)) continue;

    // Find the deepest handler (most nested)
    const sortedByDepth = [...eventHandlers].sort((a, b) => {
      const nodeA = findNodeByLine(tree, a.line);
      const nodeB = findNodeByLine(tree, b.line);
      return (nodeB?.depth ?? 0) - (nodeA?.depth ?? 0);
    });

    if (sortedByDepth.length === 0) continue;

    // Build flow from deepest to root
    const steps: EventFlowStep[] = [];
    let stepNum = 1;

    for (const handler of sortedByDepth) {
      const node = findNodeByLine(tree, handler.line);
      if (!node) continue;

      steps.push({
        step: stepNum,
        element: handler.element,
        handler: handler.handler,
        stops_here: handler.stops_propagation,
      });

      stepNum++;

      // If this handler stops propagation, the flow ends here
      if (handler.stops_propagation) break;
    }

    if (steps.length > 0) {
      const scenarioName = `${eventType}_from_${steps[0].element}`;
      flows[scenarioName] = {
        scenario: `${eventType} event starting at ${steps[0].element}`,
        steps,
      };
    }
  }

  return flows;
}

/**
 * Find a component node by its line number
 */
function findNodeByLine(tree: ComponentNode, line: number): ComponentNode | null {
  if (tree.line === line) return tree;

  for (const child of tree.children) {
    const found = findNodeByLine(child, line);
    if (found) return found;
  }

  return null;
}

// =============================================================================
// Issue Detection
// =============================================================================

/**
 * Detect common event handling issues
 */
function detectIssues(
  handlers: EventHandler[],
  tree: ComponentNode,
  sourceFile: ts.SourceFile
): EventIssue[] {
  const issues: EventIssue[] = [];

  // Group handlers by event type and parent chain
  const clickHandlers = handlers.filter((h) => h.event === 'click');
  const keyboardHandlers = handlers.filter((h) =>
    ['keydown', 'keyup', 'keypress'].includes(h.event)
  );

  // Issue 1: Multiple click handlers in same tree without stopPropagation
  const handlersByElement = new Map<string, EventHandler[]>();
  for (const handler of clickHandlers) {
    const key = `${handler.element}:${handler.line}`;
    const existing = handlersByElement.get(key) || [];
    existing.push(handler);
    handlersByElement.set(key, existing);
  }

  // Check for nested clickable elements
  const nestedClickables = findNestedClickables(tree);
  if (nestedClickables.length > 0) {
    for (const { parent, child } of nestedClickables) {
      const parentHandler = clickHandlers.find((h) => h.line === parent.line);
      const childHandler = clickHandlers.find((h) => h.line === child.line);

      if (parentHandler && childHandler && !childHandler.stops_propagation) {
        issues.push({
          issue: 'nested_clickable_elements',
          elements: [child.element, parent.element],
          explanation: `Clicking ${child.element} (line ${child.line}) will also trigger the click handler on ${parent.element} (line ${parent.line}) due to event bubbling`,
          fix: `Add e.stopPropagation() in the ${child.element} handler, or restructure to avoid nesting`,
        });
      }
    }
  }

  // Issue 2: Click handler on non-interactive element without keyboard alternative
  for (const handler of clickHandlers) {
    const elementLower = handler.element.toLowerCase();

    if (NON_INTERACTIVE_ELEMENTS.has(elementLower)) {
      // Check if there's a corresponding keyboard handler
      const hasKeyboardHandler = keyboardHandlers.some(
        (kh) => kh.line === handler.line || Math.abs(kh.line - handler.line) <= 2
      );

      if (!hasKeyboardHandler) {
        issues.push({
          issue: 'missing_keyboard_alternative',
          elements: [handler.element],
          explanation: `Click handler on ${handler.element} (line ${handler.line}) may not be accessible to keyboard users. Non-interactive elements like <div> don't receive keyboard events by default`,
          fix: `Use a <button> element instead, or add role="button" tabIndex={0} and an onKeyDown handler that triggers on Enter/Space`,
        });
      }
    }
  }

  // Issue 3: Multiple handlers for same event that could interfere
  const eventGroups = new Map<string, EventHandler[]>();
  for (const handler of handlers) {
    const existing = eventGroups.get(handler.event) || [];
    existing.push(handler);
    eventGroups.set(handler.event, existing);
  }

  for (const [eventType, eventHandlers] of eventGroups) {
    if (eventHandlers.length > 1 && BUBBLING_EVENTS.has(eventType)) {
      const noneStopPropagation = eventHandlers.filter((h) => !h.stops_propagation);

      if (noneStopPropagation.length > 1) {
        // Check if they're in a parent-child relationship
        let hasNesting = false;
        for (let i = 0; i < noneStopPropagation.length; i++) {
          for (let j = i + 1; j < noneStopPropagation.length; j++) {
            const nodeA = findNodeByLine(tree, noneStopPropagation[i].line);
            const nodeB = findNodeByLine(tree, noneStopPropagation[j].line);
            if (nodeA && nodeB && areNested(nodeA, nodeB)) {
              hasNesting = true;
              break;
            }
          }
          if (hasNesting) break;
        }

        if (hasNesting) {
          issues.push({
            issue: 'potential_double_firing',
            elements: noneStopPropagation.map((h) => h.element),
            explanation: `Multiple ${eventType} handlers without stopPropagation may cause double-firing when event bubbles`,
            fix: `Add e.stopPropagation() to the innermost handler if the parent handler shouldn't be triggered`,
          });
        }
      }
    }
  }

  // Issue 4: Form submit without preventDefault
  const submitHandlers = handlers.filter((h) => h.event === 'submit');
  for (const handler of submitHandlers) {
    if (!handler.prevents_default) {
      issues.push({
        issue: 'form_submit_no_prevent_default',
        elements: [handler.element],
        explanation: `Form submit handler (line ${handler.line}) doesn't call preventDefault(). This will cause a page reload in traditional form submissions`,
        fix: `Add e.preventDefault() at the start of the submit handler`,
      });
    }
  }

  return issues;
}

/**
 * Find nested elements that both have click handlers
 */
function findNestedClickables(tree: ComponentNode): Array<{ parent: ComponentNode; child: ComponentNode }> {
  const result: Array<{ parent: ComponentNode; child: ComponentNode }> = [];

  function visit(node: ComponentNode, ancestorsWithHandlers: ComponentNode[]): void {
    const hasClickHandler = node.handlers.some((h) => h.event === 'click');

    if (hasClickHandler) {
      // Check if any ancestor also has a click handler
      for (const ancestor of ancestorsWithHandlers) {
        result.push({ parent: ancestor, child: node });
      }
    }

    const newAncestors = hasClickHandler ? [...ancestorsWithHandlers, node] : ancestorsWithHandlers;

    for (const child of node.children) {
      visit(child, newAncestors);
    }
  }

  for (const child of tree.children) {
    visit(child, []);
  }

  return result;
}

/**
 * Check if two nodes are in a parent-child relationship
 */
function areNested(nodeA: ComponentNode, nodeB: ComponentNode): boolean {
  // Check if A is ancestor of B
  let current: ComponentNode | null = nodeB.parent;
  while (current) {
    if (current === nodeA) return true;
    current = current.parent;
  }

  // Check if B is ancestor of A
  current = nodeA.parent;
  while (current) {
    if (current === nodeB) return true;
    current = current.parent;
  }

  return false;
}

// =============================================================================
// Delegation Pattern Detection
// =============================================================================

/**
 * Detect event delegation patterns
 */
function detectDelegationPatterns(
  handlers: EventHandler[],
  sourceFile: ts.SourceFile
): DelegationPattern[] {
  const patterns: DelegationPattern[] = [];

  // For handlers that check e.target, this suggests delegation
  function findDelegation(handler: EventHandler): DelegationPattern | null {
    // Re-parse to find the handler body and check for target patterns
    let foundPattern: DelegationPattern | null = null;

    function visit(node: ts.Node): void {
      if (foundPattern) return;

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const line = getLineNumber(node, sourceFile);

        if (line === handler.line) {
          // Find the handler attribute
          for (const attr of node.attributes.properties) {
            if (ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer)) {
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

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generate a human-readable summary of the analysis
 */
function generateSummary(
  handlers: EventHandler[],
  issues: EventIssue[],
  delegationPatterns: DelegationPattern[]
): string {
  const parts: string[] = [];

  // Handler counts by event type
  const eventCounts = new Map<string, number>();
  for (const handler of handlers) {
    eventCounts.set(handler.event, (eventCounts.get(handler.event) || 0) + 1);
  }

  const eventSummary = Array.from(eventCounts.entries())
    .map(([event, count]) => `${count} ${event}`)
    .join(', ');

  parts.push(`Found ${handlers.length} event handler${handlers.length !== 1 ? 's' : ''} (${eventSummary}).`);

  // Propagation status
  const stopPropCount = handlers.filter((h) => h.stops_propagation).length;
  const preventDefaultCount = handlers.filter((h) => h.prevents_default).length;

  if (stopPropCount > 0 || preventDefaultCount > 0) {
    const propagationInfo: string[] = [];
    if (stopPropCount > 0) {
      propagationInfo.push(`${stopPropCount} use stopPropagation`);
    }
    if (preventDefaultCount > 0) {
      propagationInfo.push(`${preventDefaultCount} use preventDefault`);
    }
    parts.push(propagationInfo.join(', ') + '.');
  }

  // Issues
  if (issues.length > 0) {
    const criticalIssues = issues.filter((i) =>
      ['nested_clickable_elements', 'potential_double_firing'].includes(i.issue)
    );
    const a11yIssues = issues.filter((i) => i.issue === 'missing_keyboard_alternative');

    if (criticalIssues.length > 0) {
      parts.push(`${criticalIssues.length} potential event propagation issue${criticalIssues.length !== 1 ? 's' : ''} detected.`);
    }
    if (a11yIssues.length > 0) {
      parts.push(`${a11yIssues.length} accessibility concern${a11yIssues.length !== 1 ? 's' : ''} (missing keyboard alternatives).`);
    }
  } else {
    parts.push('No significant issues detected.');
  }

  // Delegation patterns
  if (delegationPatterns.length > 0) {
    parts.push(`${delegationPatterns.length} event delegation pattern${delegationPatterns.length !== 1 ? 's' : ''} found.`);
  }

  return parts.join(' ');
}

// =============================================================================
// Component Detection
// =============================================================================

/**
 * Find React component in source file
 */
function findReactComponent(sourceFile: ts.SourceFile): ts.Node | null {
  let componentNode: ts.Node | null = null;

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
              if ((callText === 'memo' || callText === 'React.memo') && decl.initializer.arguments.length > 0) {
                const arg = decl.initializer.arguments[0];
                if (containsJsxReturn(arg)) {
                  componentNode = arg;
                  return;
                }
              }
            } else if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
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
// Handler
// =============================================================================

/**
 * Handles the analyze_event_flow MCP tool call.
 *
 * Analyzes event handling and propagation in React/Vue/Svelte components:
 * - Detects all event handlers and their properties
 * - Simulates event bubbling to show flow paths
 * - Identifies issues like nested clickables and missing keyboard support
 * - Detects event delegation patterns
 *
 * @param args - The analyze_event_flow tool arguments
 * @returns MCP tool response with event flow analysis
 */
export async function handleAnalyzeEventFlow(args: AnalyzeEventFlowArgs): Promise<ToolResponse> {
  const projectRoot = process.cwd();

  // Validate file argument
  if (!args.file) {
    return createErrorResponse('file argument is required');
  }

  const filePath = path.isAbsolute(args.file) ? args.file : path.resolve(projectRoot, args.file);

  if (!fs.existsSync(filePath)) {
    return createErrorResponse(`File not found: ${args.file}`, { provided_path: args.file });
  }

  // Check file extension
  const ext = path.extname(filePath).toLowerCase();
  if (!['.tsx', '.jsx', '.ts', '.js', '.vue', '.svelte'].includes(ext)) {
    return createErrorResponse(
      'File must be a component file (.tsx, .jsx, .ts, .js, .vue, .svelte)',
      { provided_extension: ext }
    );
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ext === '.tsx' || ext === '.jsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const relativePath = makeRelativePath(filePath, projectRoot);

    // Find the component
    const componentNode = findReactComponent(sourceFile);
    if (!componentNode) {
      return createSuccessResponse({
        message: 'No React component found in file',
        file: relativePath,
        handlers: [],
        event_flows: {},
        issues: [],
        delegation_patterns: [],
        summary: 'No component found to analyze.',
      });
    }

    // Extract event handlers
    const { handlers, tree } = extractEventHandlers(
      componentNode,
      sourceFile,
      args.event
    );

    if (handlers.length === 0) {
      const eventMsg = args.event ? ` for event type "${args.event}"` : '';
      return createSuccessResponse({
        file: relativePath,
        handlers: [],
        event_flows: {},
        issues: [],
        delegation_patterns: [],
        summary: `No event handlers found${eventMsg}.`,
      });
    }

    // Build event flows
    const eventFlows = buildEventFlows(handlers, tree, args.event);

    // Detect issues
    const issues = detectIssues(handlers, tree, sourceFile);

    // Detect delegation patterns
    const delegationPatterns = detectDelegationPatterns(handlers, sourceFile);

    // Generate summary
    const summary = generateSummary(handlers, issues, delegationPatterns);

    const result: AnalyzeEventFlowResult = {
      file: relativePath,
      handlers,
      event_flows: eventFlows,
      issues,
      delegation_patterns: delegationPatterns,
      summary,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { file: args.file });
  }
}
