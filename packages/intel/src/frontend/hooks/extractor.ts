/**
 * Hook extractor for dependency auditing — Lane 4.
 * Ported verbatim from frontend-engine `core/hooks/extractor.ts`.
 *
 * @module frontend/hooks/extractor
 */

import ts from 'typescript';
import type { HookInfo, ComponentScope } from './types.js';

/** Hooks that have dependency arrays. */
const HOOKS_WITH_DEPS = new Set([
  'useEffect',
  'useMemo',
  'useCallback',
  'useLayoutEffect',
  'useInsertionEffect',
]);

/** Subscription/timer patterns that require cleanup. */
const SUBSCRIPTION_PATTERNS = [
  'addEventListener',
  'removeEventListener',
  'subscribe',
  'unsubscribe',
  'setInterval',
  'setTimeout',
  'clearInterval',
  'clearTimeout',
  '.on(',
  '.off(',
  'addListener',
  'removeListener',
  'observe',
  'disconnect',
];

/** Global identifiers excluded from body-ref collection (shared with issue-detector). */
export const GLOBAL_IDENTIFIERS = new Set([
  'undefined', 'null', 'true', 'false', 'this',
  'console', 'window', 'document', 'Math', 'JSON',
  'Object', 'Array', 'Promise', 'Error', 'String', 'Number', 'Boolean',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'addEventListener', 'removeEventListener',
  'navigator', 'location', 'performance',
  'localStorage', 'sessionStorage',
  'fetch', 'AbortController', 'URL', 'URLSearchParams',
  'React',
]);

function extractBodyRefs(node: ts.Node, sourceFile: ts.SourceFile): Set<string> {
  const refs = new Set<string>();
  const localDecls = new Set<string>();

  function collectLocals(n: ts.Node): void {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      localDecls.add(n.name.getText(sourceFile));
    }
    if (ts.isParameter(n) && ts.isIdentifier(n.name)) {
      localDecls.add(n.name.getText(sourceFile));
    }
    if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n !== node) {
      for (const param of n.parameters) {
        if (ts.isIdentifier(param.name)) {
          localDecls.add(param.name.getText(sourceFile));
        }
      }
    }
    ts.forEachChild(n, collectLocals);
  }
  collectLocals(node);

  function collectRefs(n: ts.Node): void {
    if (ts.isIdentifier(n)) {
      const text = n.getText(sourceFile);
      const isPropertyName =
        n.parent && ts.isPropertyAccessExpression(n.parent) && n.parent.name === n;
      if (!isPropertyName && !localDecls.has(text) && !GLOBAL_IDENTIFIERS.has(text)) {
        refs.add(text);
      }
    }
    ts.forEachChild(n, collectRefs);
  }
  collectRefs(node);

  return refs;
}

function hasCleanupReturn(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let hasCleanup = false;
  function visit(n: ts.Node): void {
    if (ts.isReturnStatement(n) && n.expression) {
      if (ts.isArrowFunction(n.expression) || ts.isFunctionExpression(n.expression)) {
        hasCleanup = true;
      }
    }
    if (!hasCleanup) ts.forEachChild(n, visit);
  }
  visit(node);
  return hasCleanup;
}

function detectSubscriptions(bodyText: string): boolean {
  return SUBSCRIPTION_PATTERNS.some((pattern) => bodyText.includes(pattern));
}

function getAssignedVariableName(
  callNode: ts.CallExpression,
  sourceFile: ts.SourceFile,
): string | undefined {
  const parent = callNode.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.getText(sourceFile);
  }
  return undefined;
}

/** Extract all hooks with dependency arrays from a component/function node. */
export function extractHooksWithDeps(
  componentNode: ts.Node,
  sourceFile: ts.SourceFile,
  scope: ComponentScope,
): HookInfo[] {
  const hooks: HookInfo[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const fnText = node.expression.getText(sourceFile);
      const fnName = fnText.replace(/^React\./, '');

      if (HOOKS_WITH_DEPS.has(fnName)) {
        const callbackArg = node.arguments[0];
        const depsArg = node.arguments[1];

        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        const hookLine = line + 1;

        let rawDeps: string[] = [];
        let hasEmptyDeps = false;
        let hasNoDeps = false;

        if (!depsArg) {
          hasNoDeps = true;
        } else if (ts.isArrayLiteralExpression(depsArg)) {
          rawDeps = depsArg.elements.map((el) => el.getText(sourceFile));
          hasEmptyDeps = rawDeps.length === 0;
        }

        let body = '';
        let bodyRefs: string[] = [];
        let hasCleanup = false;
        let hasSubscriptions = false;

        if (callbackArg) {
          body = callbackArg.getText(sourceFile);
          const refsSet = extractBodyRefs(callbackArg, sourceFile);
          bodyRefs = Array.from(refsSet);
          hasCleanup = hasCleanupReturn(callbackArg, sourceFile);
          hasSubscriptions = detectSubscriptions(body);
        }

        const variableName = getAssignedVariableName(node, sourceFile);

        if (variableName) {
          if (fnName === 'useCallback') {
            scope.useCallbackVars.add(variableName);
          } else if (fnName === 'useMemo') {
            scope.useMemoVars.add(variableName);
          }
        }

        hooks.push({
          name: fnName,
          line: hookLine,
          variableName,
          deps: [],
          rawDeps,
          hasEmptyDeps,
          hasNoDeps,
          body,
          bodyRefs,
          hasCleanup,
          hasSubscriptions,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(componentNode);
  return hooks;
}

/** Build a ComponentScope by scanning imports, module-scope decls, and state hooks. */
export function buildComponentScope(
  componentNode: ts.Node,
  sourceFile: ts.SourceFile,
): ComponentScope {
  const scope: ComponentScope = {
    stateVars: new Set(),
    setterVars: new Set(),
    dispatchVars: new Set(),
    refVars: new Set(),
    importedIdentifiers: new Set(),
    moduleScopeIdentifiers: new Set(),
    useCallbackVars: new Set(),
    useMemoVars: new Set(),
    useIdVars: new Set(),
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause) {
      const clause = statement.importClause;
      if (clause.name) {
        scope.importedIdentifiers.add(clause.name.getText(sourceFile));
      }
      if (clause.namedBindings) {
        if (ts.isNamedImports(clause.namedBindings)) {
          for (const spec of clause.namedBindings.elements) {
            scope.importedIdentifiers.add(spec.name.getText(sourceFile));
          }
        } else if (ts.isNamespaceImport(clause.namedBindings)) {
          scope.importedIdentifiers.add(clause.namedBindings.name.getText(sourceFile));
        }
      }
    }

    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          scope.moduleScopeIdentifiers.add(decl.name.getText(sourceFile));
        }
      }
    } else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) {
        scope.moduleScopeIdentifiers.add(statement.name.getText(sourceFile));
      }
    }
  }

  function visitComponent(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const fnText = node.expression.getText(sourceFile);
      const fnName = fnText.replace(/^React\./, '');

      if (fnName === 'useState') {
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) && ts.isArrayBindingPattern(parent.name)) {
          const elements = parent.name.elements;
          if (elements.length >= 1 && ts.isBindingElement(elements[0])) {
            const valName = elements[0].name;
            if (ts.isIdentifier(valName)) scope.stateVars.add(valName.getText(sourceFile));
          }
          if (elements.length >= 2 && ts.isBindingElement(elements[1])) {
            const setterName = elements[1].name;
            if (ts.isIdentifier(setterName)) scope.setterVars.add(setterName.getText(sourceFile));
          }
        }
      }

      if (fnName === 'useReducer') {
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) && ts.isArrayBindingPattern(parent.name)) {
          const elements = parent.name.elements;
          if (elements.length >= 1 && ts.isBindingElement(elements[0])) {
            const stateName = elements[0].name;
            if (ts.isIdentifier(stateName)) scope.stateVars.add(stateName.getText(sourceFile));
          }
          if (elements.length >= 2 && ts.isBindingElement(elements[1])) {
            const dispatchName = elements[1].name;
            if (ts.isIdentifier(dispatchName))
              scope.dispatchVars.add(dispatchName.getText(sourceFile));
          }
        }
      }

      if (fnName === 'useRef') {
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
          scope.refVars.add(parent.name.getText(sourceFile));
        }
      }

      if (fnName === 'useId') {
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
          scope.useIdVars.add(parent.name.getText(sourceFile));
        }
      }

      if (fnName === 'useCallback') {
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
          scope.useCallbackVars.add(parent.name.getText(sourceFile));
        }
      }

      if (fnName === 'useMemo') {
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
          scope.useMemoVars.add(parent.name.getText(sourceFile));
        }
      }
    }

    ts.forEachChild(node, visitComponent);
  }

  visitComponent(componentNode);
  return scope;
}
