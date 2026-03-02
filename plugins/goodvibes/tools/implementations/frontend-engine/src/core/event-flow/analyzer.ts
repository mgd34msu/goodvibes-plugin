/**
 * Event Flow Analyzer
 *
 * Issue detection, event flow building, delegation target finding,
 * and summary generation for event flow analysis.
 *
 * @module core/event-flow/analyzer
 */

import ts from 'typescript';
import type { EventHandler, ComponentNode, EventFlow, EventFlowStep, EventIssue, DelegationPattern } from './types.js';
import { BUBBLING_EVENTS, NON_INTERACTIVE_ELEMENTS } from './tracer.js';

// =============================================================================
// Nested Clickables Detection
// =============================================================================

/**
 * Find nested elements that both have click handlers
 */
export function findNestedClickables(
  tree: ComponentNode
): Array<{ parent: ComponentNode; child: ComponentNode }> {
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
export function areNested(nodeA: ComponentNode, nodeB: ComponentNode): boolean {
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

/**
 * Find a component node by its line number
 */
export function findNodeByLine(tree: ComponentNode, line: number): ComponentNode | null {
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
export function detectIssues(
  handlers: EventHandler[],
  tree: ComponentNode,
  sourceFile: ts.SourceFile
): EventIssue[] {
  const issues: EventIssue[] = [];

  // Group handlers by event type
  const clickHandlers = handlers.filter((h) => h.event === 'click');
  const keyboardHandlers = handlers.filter((h) =>
    ['keydown', 'keyup', 'keypress'].includes(h.event)
  );

  // Issue 1: Check for nested clickable elements
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

// =============================================================================
// Event Flow Building
// =============================================================================

/**
 * Build event flow scenarios by simulating bubbling from leaf to root
 */
export function buildEventFlows(
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

// =============================================================================
// Delegation Pattern Detection
// =============================================================================

/**
 * Find delegation targets in handler code
 */
export function findDelegationTargets(node: ts.Node, sourceFile: ts.SourceFile): string[] {
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
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
    ) {
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
      if (text.match(/\.target\.dataset\./) ) {
        targets.push(`[data-${n.name.getText(sourceFile)}]`);
      }
    }

    ts.forEachChild(n, visit);
  }

  visit(node);
  return targets;
}

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generate a human-readable summary of the analysis
 */
export function generateSummary(
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

  parts.push(
    `Found ${handlers.length} event handler${handlers.length !== 1 ? 's' : ''} (${eventSummary}).`
  );

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
      parts.push(
        `${criticalIssues.length} potential event propagation issue${criticalIssues.length !== 1 ? 's' : ''} detected.`
      );
    }
    if (a11yIssues.length > 0) {
      parts.push(
        `${a11yIssues.length} accessibility concern${a11yIssues.length !== 1 ? 's' : ''} (missing keyboard alternatives).`
      );
    }
  } else {
    parts.push('No significant issues detected.');
  }

  // Delegation patterns
  if (delegationPatterns.length > 0) {
    parts.push(
      `${delegationPatterns.length} event delegation pattern${delegationPatterns.length !== 1 ? 's' : ''} found.`
    );
  }

  return parts.join(' ');
}
