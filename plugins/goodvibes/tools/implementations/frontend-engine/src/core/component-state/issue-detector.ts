/**
 * Issue Detector for React Components
 *
 * Detects common issues like prop drilling, callback instability, etc.
 *
 * @module core/component-state/issue-detector
 */

import ts from 'typescript';
import type { ComponentIssue, ReceivedProp, EffectInfo, AnalysisContext } from './types.js';

/**
 * Detect common React issues in the component
 */
export function detectIssues(
  componentNode: ts.Node,
  ctx: AnalysisContext,
  receivedProps: ReceivedProp[],
  effects: EffectInfo[]
): ComponentIssue[] {
  const issues: ComponentIssue[] = [];
  const { sourceFile, inlineCallbacks, jsxPassedProps, stateVariables, propNames } = ctx;

  // 1. Prop drilling detection
  for (const passedProp of jsxPassedProps) {
    if (passedProp.original_source === 'prop') {
      const receivedProp = receivedProps.find(p => p.name === passedProp.prop_name);
      if (receivedProp) {
        issues.push({
          type: 'prop_drilling',
          severity: 'warning',
          location: `${passedProp.to_component}.${passedProp.prop_name}`,
          description: `Prop "${passedProp.prop_name}" is received and passed through unchanged to ${passedProp.to_component}`,
          suggestion: 'Consider using Context or a state management library to avoid prop drilling',
        });
      }
    }
  }

  // 2. Callback instability detection
  for (const callback of inlineCallbacks) {
    issues.push({
      type: 'callback_instability',
      severity: 'warning',
      location: `line ${callback.line}: ${callback.component}.${callback.propName}`,
      description: `Inline function passed to ${callback.component} as ${callback.propName} recreates on every render`,
      suggestion: 'Use useCallback to memoize the function, or extract to a stable reference',
    });
  }

  // 3. Missing memoization detection (large objects/arrays passed as props)
  for (const passedProp of jsxPassedProps) {
    if (passedProp.original_source === 'derived') {
      // Check if it's likely an object/array literal
      issues.push({
        type: 'missing_memo',
        severity: 'info',
        location: `${passedProp.to_component}.${passedProp.prop_name}`,
        description: `Derived value passed to ${passedProp.to_component} may recreate on every render`,
        suggestion: 'Consider using useMemo if this is an expensive computation',
      });
    }
  }

  // 4. Effect dependency issues
  for (const effect of effects) {
    if (effect.type === 'useEffect' || effect.type === 'useLayoutEffect') {
      // Missing dependency array
      if (effect.dependencies.length === 0) {
        // Check if it should have deps (not an empty deps array)
        const hasStateOrPropDeps = stateVariables.size > 0 || propNames.size > 0;
        if (hasStateOrPropDeps) {
          issues.push({
            type: 'effect_deps',
            severity: 'info',
            location: effect.type,
            description: `${effect.type} has no dependencies - verify this is intentional`,
            suggestion: 'Add dependencies if the effect uses props or state, or use [] for mount-only effects',
          });
        }
      }
    }
  }

  // 5. State initialization in render (useState with function call that's not lazy)
  function checkStateInRender(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const fnText = node.expression.getText(sourceFile);
      if (fnText === 'useState' || fnText === 'React.useState') {
        const initializer = node.arguments[0];
        if (initializer && ts.isCallExpression(initializer)) {
          // It's a function call, not a lazy initializer
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: 'state_in_render',
            severity: 'error',
            location: `line ${line + 1}`,
            description: 'useState initializer calls a function on every render instead of using lazy initialization',
            suggestion: 'Use () => expensiveFunction() instead of expensiveFunction() for lazy initialization',
          });
        }
      }
    }
    ts.forEachChild(node, checkStateInRender);
  }

  checkStateInRender(componentNode);

  return issues;
}
