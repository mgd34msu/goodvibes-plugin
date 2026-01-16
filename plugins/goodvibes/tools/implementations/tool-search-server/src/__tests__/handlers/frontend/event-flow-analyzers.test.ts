/**
 * Unit tests for event-flow-analyzers
 *
 * Tests cover:
 * - findNestedClickables: nested click handler detection
 * - areNested: parent-child relationship check
 * - findNodeByLine: node lookup by line
 * - detectIssues: issue detection
 * - buildEventFlows: event flow building
 * - findDelegationTargets: delegation target detection
 * - generateSummary: summary generation
 */

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import {
  findNestedClickables,
  areNested,
  findNodeByLine,
  detectIssues,
  buildEventFlows,
  findDelegationTargets,
  generateSummary,
} from '../../../handlers/frontend/event-flow-analyzers.js';
import type { EventHandler, ComponentNode } from '../../../handlers/frontend/event-flow-utils.js';

/**
 * Create TypeScript source file from code
 */
function createSourceFile(code: string): ts.SourceFile {
  return ts.createSourceFile('test.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * Helper to create ComponentNode for testing
 */
function createNode(overrides: Partial<ComponentNode> = {}): ComponentNode {
  return {
    element: 'div',
    parent: null,
    children: [],
    handlers: [],
    line: 1,
    depth: 0,
    ...overrides,
  };
}

/**
 * Helper to create EventHandler for testing
 */
function createHandler(overrides: Partial<EventHandler> = {}): EventHandler {
  return {
    element: 'div',
    event: 'click',
    handler: 'handleClick',
    line: 1,
    stops_propagation: false,
    prevents_default: false,
    ...overrides,
  };
}

describe('event-flow-analyzers', () => {
  describe('findNestedClickables', () => {
    it('should find nested elements with click handlers', () => {
      const parentClickHandler = createHandler({ line: 1 });
      const childClickHandler = createHandler({ line: 3 });

      const child = createNode({
        element: 'button',
        line: 3,
        handlers: [childClickHandler],
        depth: 2,
      });

      const parent = createNode({
        element: 'div',
        line: 1,
        handlers: [parentClickHandler],
        depth: 1,
        children: [child],
      });
      child.parent = parent;

      const root = createNode({
        element: 'root',
        children: [parent],
      });
      parent.parent = root;

      const result = findNestedClickables(root);

      expect(result.length).toBe(1);
      expect(result[0].parent).toBe(parent);
      expect(result[0].child).toBe(child);
    });

    it('should return empty for no nesting', () => {
      const handler1 = createHandler({ line: 1 });
      const handler2 = createHandler({ line: 3 });

      const node1 = createNode({
        element: 'button',
        line: 1,
        handlers: [handler1],
      });

      const node2 = createNode({
        element: 'button',
        line: 3,
        handlers: [handler2],
      });

      const root = createNode({
        element: 'root',
        children: [node1, node2],
      });
      node1.parent = root;
      node2.parent = root;

      const result = findNestedClickables(root);

      expect(result.length).toBe(0);
    });

    it('should find multiple nested clickables', () => {
      const rootHandler = createHandler({ line: 1 });
      const midHandler = createHandler({ line: 2 });
      const leafHandler = createHandler({ line: 3 });

      const leaf = createNode({
        element: 'span',
        line: 3,
        handlers: [leafHandler],
        depth: 3,
      });

      const mid = createNode({
        element: 'div',
        line: 2,
        handlers: [midHandler],
        depth: 2,
        children: [leaf],
      });
      leaf.parent = mid;

      const parent = createNode({
        element: 'section',
        line: 1,
        handlers: [rootHandler],
        depth: 1,
        children: [mid],
      });
      mid.parent = parent;

      const root = createNode({
        element: 'root',
        children: [parent],
      });
      parent.parent = root;

      const result = findNestedClickables(root);

      // leaf nested in both mid and parent
      // mid nested in parent
      expect(result.length).toBe(3);
    });
  });

  describe('areNested', () => {
    it('should return true when A is ancestor of B', () => {
      const parent = createNode({ element: 'div', line: 1 });
      const child = createNode({ element: 'span', line: 2, parent });
      parent.children.push(child);

      expect(areNested(parent, child)).toBe(true);
    });

    it('should return true when B is ancestor of A', () => {
      const parent = createNode({ element: 'div', line: 1 });
      const child = createNode({ element: 'span', line: 2, parent });
      parent.children.push(child);

      expect(areNested(child, parent)).toBe(true);
    });

    it('should return false for siblings', () => {
      const parent = createNode({ element: 'div', line: 1 });
      const child1 = createNode({ element: 'span', line: 2, parent });
      const child2 = createNode({ element: 'span', line: 3, parent });
      parent.children.push(child1, child2);

      expect(areNested(child1, child2)).toBe(false);
    });

    it('should return false for unrelated nodes', () => {
      const node1 = createNode({ element: 'div', line: 1 });
      const node2 = createNode({ element: 'span', line: 2 });

      expect(areNested(node1, node2)).toBe(false);
    });

    it('should handle deep nesting', () => {
      const grandparent = createNode({ element: 'main', line: 1 });
      const parent = createNode({ element: 'div', line: 2, parent: grandparent });
      const child = createNode({ element: 'span', line: 3, parent });

      expect(areNested(grandparent, child)).toBe(true);
      expect(areNested(child, grandparent)).toBe(true);
    });
  });

  describe('findNodeByLine', () => {
    it('should find node at root level', () => {
      const node = createNode({ element: 'div', line: 5 });

      expect(findNodeByLine(node, 5)).toBe(node);
    });

    it('should find node in children', () => {
      const child = createNode({ element: 'span', line: 10 });
      const root = createNode({
        element: 'div',
        line: 5,
        children: [child],
      });

      expect(findNodeByLine(root, 10)).toBe(child);
    });

    it('should find node in deep children', () => {
      const grandchild = createNode({ element: 'button', line: 15 });
      const child = createNode({ element: 'span', line: 10, children: [grandchild] });
      const root = createNode({ element: 'div', line: 5, children: [child] });

      expect(findNodeByLine(root, 15)).toBe(grandchild);
    });

    it('should return null for non-existent line', () => {
      const node = createNode({ element: 'div', line: 5 });

      expect(findNodeByLine(node, 99)).toBeNull();
    });
  });

  describe('detectIssues', () => {
    it('should detect nested clickable without stopPropagation', () => {
      const parentHandler = createHandler({ element: 'div', line: 1, event: 'click' });
      const childHandler = createHandler({
        element: 'button',
        line: 3,
        event: 'click',
        stops_propagation: false,
      });

      const child = createNode({
        element: 'button',
        line: 3,
        handlers: [childHandler],
        depth: 2,
      });

      const parent = createNode({
        element: 'div',
        line: 1,
        handlers: [parentHandler],
        depth: 1,
        children: [child],
      });
      child.parent = parent;

      const root = createNode({ element: 'root', children: [parent] });
      parent.parent = root;

      const handlers = [parentHandler, childHandler];
      const sourceFile = createSourceFile('<div />');

      const issues = detectIssues(handlers, root, sourceFile);

      expect(issues.some((i) => i.issue === 'nested_clickable_elements')).toBe(true);
    });

    it('should not flag nested clickable with stopPropagation', () => {
      const parentHandler = createHandler({ element: 'div', line: 1, event: 'click' });
      const childHandler = createHandler({
        element: 'button',
        line: 3,
        event: 'click',
        stops_propagation: true,
      });

      const child = createNode({
        element: 'button',
        line: 3,
        handlers: [childHandler],
        depth: 2,
      });

      const parent = createNode({
        element: 'div',
        line: 1,
        handlers: [parentHandler],
        depth: 1,
        children: [child],
      });
      child.parent = parent;

      const root = createNode({ element: 'root', children: [parent] });
      parent.parent = root;

      const handlers = [parentHandler, childHandler];
      const sourceFile = createSourceFile('<div />');

      const issues = detectIssues(handlers, root, sourceFile);

      expect(issues.some((i) => i.issue === 'nested_clickable_elements')).toBe(false);
    });

    it('should detect click on non-interactive element', () => {
      const handler = createHandler({
        element: 'div',
        event: 'click',
        line: 1,
      });

      const node = createNode({ element: 'div', line: 1, handlers: [handler] });
      const root = createNode({ element: 'root', children: [node] });
      node.parent = root;

      const sourceFile = createSourceFile('<div />');

      const issues = detectIssues([handler], root, sourceFile);

      expect(issues.some((i) => i.issue === 'missing_keyboard_alternative')).toBe(true);
    });

    it('should not flag click with keyboard handler nearby', () => {
      const clickHandler = createHandler({
        element: 'div',
        event: 'click',
        line: 5,
      });

      const keyHandler = createHandler({
        element: 'div',
        event: 'keydown',
        line: 5,
      });

      const node = createNode({ element: 'div', line: 5, handlers: [clickHandler, keyHandler] });
      const root = createNode({ element: 'root', children: [node] });
      node.parent = root;

      const sourceFile = createSourceFile('<div />');

      const issues = detectIssues([clickHandler, keyHandler], root, sourceFile);

      expect(issues.some((i) => i.issue === 'missing_keyboard_alternative')).toBe(false);
    });

    it('should not flag click on button element', () => {
      const handler = createHandler({
        element: 'button',
        event: 'click',
        line: 1,
      });

      const node = createNode({ element: 'button', line: 1, handlers: [handler] });
      const root = createNode({ element: 'root', children: [node] });
      node.parent = root;

      const sourceFile = createSourceFile('<button />');

      const issues = detectIssues([handler], root, sourceFile);

      expect(issues.some((i) => i.issue === 'missing_keyboard_alternative')).toBe(false);
    });

    it('should detect form submit without preventDefault', () => {
      const handler = createHandler({
        element: 'form',
        event: 'submit',
        line: 1,
        prevents_default: false,
      });

      const node = createNode({ element: 'form', line: 1, handlers: [handler] });
      const root = createNode({ element: 'root', children: [node] });
      node.parent = root;

      const sourceFile = createSourceFile('<form />');

      const issues = detectIssues([handler], root, sourceFile);

      expect(issues.some((i) => i.issue === 'form_submit_no_prevent_default')).toBe(true);
    });

    it('should not flag form submit with preventDefault', () => {
      const handler = createHandler({
        element: 'form',
        event: 'submit',
        line: 1,
        prevents_default: true,
      });

      const node = createNode({ element: 'form', line: 1, handlers: [handler] });
      const root = createNode({ element: 'root', children: [node] });
      node.parent = root;

      const sourceFile = createSourceFile('<form />');

      const issues = detectIssues([handler], root, sourceFile);

      expect(issues.some((i) => i.issue === 'form_submit_no_prevent_default')).toBe(false);
    });
  });

  describe('buildEventFlows', () => {
    it('should build flow for click event', () => {
      const handler = createHandler({
        element: 'button',
        event: 'click',
        line: 5,
        handler: 'handleClick',
      });

      const node = createNode({
        element: 'button',
        line: 5,
        depth: 1,
        handlers: [handler],
      });

      const root = createNode({ element: 'root', children: [node] });
      node.parent = root;

      const flows = buildEventFlows([handler], root);

      expect(Object.keys(flows).length).toBe(1);
      expect(Object.values(flows)[0].steps.length).toBe(1);
      expect(Object.values(flows)[0].steps[0].element).toBe('button');
    });

    it('should order flow by depth (deepest first)', () => {
      const parentHandler = createHandler({
        element: 'div',
        event: 'click',
        line: 1,
      });

      const childHandler = createHandler({
        element: 'button',
        event: 'click',
        line: 3,
      });

      const child = createNode({
        element: 'button',
        line: 3,
        depth: 2,
        handlers: [childHandler],
      });

      const parent = createNode({
        element: 'div',
        line: 1,
        depth: 1,
        handlers: [parentHandler],
        children: [child],
      });
      child.parent = parent;

      const root = createNode({ element: 'root', children: [parent] });
      parent.parent = root;

      const flows = buildEventFlows([parentHandler, childHandler], root);
      const flow = Object.values(flows)[0];

      expect(flow.steps[0].element).toBe('button');
      expect(flow.steps[1].element).toBe('div');
    });

    it('should stop flow at stopPropagation', () => {
      const parentHandler = createHandler({
        element: 'div',
        event: 'click',
        line: 1,
      });

      const childHandler = createHandler({
        element: 'button',
        event: 'click',
        line: 3,
        stops_propagation: true,
      });

      const child = createNode({
        element: 'button',
        line: 3,
        depth: 2,
        handlers: [childHandler],
      });

      const parent = createNode({
        element: 'div',
        line: 1,
        depth: 1,
        handlers: [parentHandler],
        children: [child],
      });
      child.parent = parent;

      const root = createNode({ element: 'root', children: [parent] });
      parent.parent = root;

      const flows = buildEventFlows([parentHandler, childHandler], root);
      const flow = Object.values(flows)[0];

      expect(flow.steps.length).toBe(1);
      expect(flow.steps[0].stops_here).toBe(true);
    });

    it('should skip non-bubbling events', () => {
      const handler = createHandler({
        element: 'input',
        event: 'focus',
        line: 1,
      });

      const node = createNode({
        element: 'input',
        line: 1,
        handlers: [handler],
      });

      const root = createNode({ element: 'root', children: [node] });

      const flows = buildEventFlows([handler], root);

      expect(Object.keys(flows).length).toBe(0);
    });
  });

  describe('findDelegationTargets', () => {
    it('should find closest selector', () => {
      const code = `e.target.closest('button')`;
      const sourceFile = createSourceFile(code);

      const targets = findDelegationTargets(sourceFile, sourceFile);

      expect(targets).toContain('button');
    });

    it('should find matches selector', () => {
      const code = `e.target.matches('.item')`;
      const sourceFile = createSourceFile(code);

      const targets = findDelegationTargets(sourceFile, sourceFile);

      expect(targets).toContain('.item');
    });

    it('should find tagName comparison', () => {
      const code = `e.target.tagName === 'BUTTON'`;
      const sourceFile = createSourceFile(code);

      const targets = findDelegationTargets(sourceFile, sourceFile);

      expect(targets).toContain('button');
    });

    it('should find dataset access', () => {
      const code = `e.target.dataset.action`;
      const sourceFile = createSourceFile(code);

      const targets = findDelegationTargets(sourceFile, sourceFile);

      expect(targets).toContain('[data-action]');
    });

    it('should return empty for no delegation', () => {
      const code = `console.log('hello')`;
      const sourceFile = createSourceFile(code);

      const targets = findDelegationTargets(sourceFile, sourceFile);

      expect(targets.length).toBe(0);
    });
  });

  describe('generateSummary', () => {
    it('should count handlers', () => {
      const handlers = [
        createHandler({ event: 'click' }),
        createHandler({ event: 'click' }),
        createHandler({ event: 'change' }),
      ];

      const summary = generateSummary(handlers, [], []);

      expect(summary).toContain('3 event handlers');
      expect(summary).toContain('2 click');
      expect(summary).toContain('1 change');
    });

    it('should use singular for one handler', () => {
      const handlers = [createHandler({ event: 'click' })];

      const summary = generateSummary(handlers, [], []);

      expect(summary).toContain('1 event handler');
    });

    it('should report stopPropagation count', () => {
      const handlers = [
        createHandler({ stops_propagation: true }),
        createHandler({ stops_propagation: false }),
      ];

      const summary = generateSummary(handlers, [], []);

      expect(summary).toContain('1 use stopPropagation');
    });

    it('should report preventDefault count', () => {
      const handlers = [
        createHandler({ prevents_default: true }),
        createHandler({ prevents_default: true }),
      ];

      const summary = generateSummary(handlers, [], []);

      expect(summary).toContain('2 use preventDefault');
    });

    it('should report critical issues', () => {
      const issues = [
        { issue: 'nested_clickable_elements', elements: ['button', 'div'], explanation: '', fix: '' },
        { issue: 'potential_double_firing', elements: ['span'], explanation: '', fix: '' },
      ];

      const summary = generateSummary([], issues, []);

      expect(summary).toContain('2 potential event propagation issues');
    });

    it('should report accessibility concerns', () => {
      const issues = [
        { issue: 'missing_keyboard_alternative', elements: ['div'], explanation: '', fix: '' },
        { issue: 'missing_keyboard_alternative', elements: ['span'], explanation: '', fix: '' },
      ];

      const summary = generateSummary([], issues, []);

      expect(summary).toContain('2 accessibility concerns');
    });

    it('should report no issues', () => {
      const summary = generateSummary([createHandler()], [], []);

      expect(summary).toContain('No significant issues');
    });

    it('should report delegation patterns', () => {
      const delegationPatterns = [
        { container: 'ul', delegates_for: ['li'], event: 'click' },
        { container: 'table', delegates_for: ['tr'], event: 'click' },
      ];

      const summary = generateSummary([], [], delegationPatterns);

      expect(summary).toContain('2 event delegation patterns');
    });
  });
});
