/**
 * `state` annotation for component_tree, Lane 4 (§4.4.1).
 *
 * Tribunal FIX: the v1 `passed_to_children` mapping added EVERY state-sourced JSX
 * prop to EVERY state variable (it only checked the passed value's category, not
 * which variable it was). Here `flows_to` is matched per state variable by the
 * base identifier of the passed expression, so each state var maps to exactly the
 * children it is actually handed to. Shape per §4.4.1:
 *   [{ name, kind, flows_to: [{ child, prop }] }]
 *
 * @module frontend/annotations/state
 */

import ts from 'typescript';

/** One state variable and where it flows into child components. */
export interface StateAnnotation {
  name: string;
  kind: 'useState' | 'useReducer' | 'useRef';
  flows_to: Array<{ child: string; prop: string }>;
}

interface StateVar {
  name: string;
  kind: 'useState' | 'useReducer' | 'useRef';
  /** setter/dispatch name, if any (also tracked as a source of this state). */
  setter?: string;
}

/** The leftmost identifier of an expression (`a` for `a`, `a.b.c`, `a?.b`). */
function baseIdentifier(expr: ts.Expression, sourceFile: ts.SourceFile): string | null {
  let cur: ts.Expression = expr;
  for (;;) {
    if (ts.isIdentifier(cur)) {return cur.getText(sourceFile);}
    if (ts.isPropertyAccessExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (ts.isElementAccessExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    return null;
  }
}

/** Collect the state variables declared inside a component node. */
function collectStateVars(componentNode: ts.Node, sourceFile: ts.SourceFile): StateVar[] {
  const vars: StateVar[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const fnName = node.expression.getText(sourceFile).replace(/^React\./, '');
      const parent = node.parent;

      if ((fnName === 'useState' || fnName === 'useReducer') && ts.isVariableDeclaration(parent) && ts.isArrayBindingPattern(parent.name)) {
        const elements = parent.name.elements;
        let name: string | undefined;
        let setter: string | undefined;
        if (elements.length >= 1 && ts.isBindingElement(elements[0]) && ts.isIdentifier(elements[0].name)) {
          name = elements[0].name.getText(sourceFile);
        }
        if (elements.length >= 2 && ts.isBindingElement(elements[1]) && ts.isIdentifier(elements[1].name)) {
          setter = elements[1].name.getText(sourceFile);
        }
        if (name) {vars.push({ name, kind: fnName === 'useState' ? 'useState' : 'useReducer', setter });}
      }

      if (fnName === 'useRef' && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        vars.push({ name: parent.name.getText(sourceFile), kind: 'useRef' });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(componentNode);
  return vars;
}

/**
 * Produce the per-state `flows_to` mapping for one component node.
 * @param componentNode - the component's defining AST node
 * @param sourceFile - the host-parsed SourceFile
 */
export function annotateState(componentNode: ts.Node, sourceFile: ts.SourceFile): StateAnnotation[] {
  const stateVars = collectStateVars(componentNode, sourceFile);
  if (stateVars.length === 0) {return [];}

  // Index by the identifiers that reference each state var's value: the state
  // name itself (value flow). Setters are tracked too so passing a setter counts
  // as flowing that state's control down.
  const byIdentifier = new Map<string, StateAnnotation>();
  const annotations: StateAnnotation[] = stateVars.map((v) => {
    const ann: StateAnnotation = { name: v.name, kind: v.kind, flows_to: [] };
    byIdentifier.set(v.name, ann);
    if (v.setter) {byIdentifier.set(v.setter, ann);}
    return ann;
  });

  function visit(node: ts.Node): void {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      // Only props passed to child COMPONENTS (Uppercase) count as flowing down.
      if (/^[A-Z]/.test(tagName)) {
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.name && attr.initializer) {
            const attrName = attr.name.getText(sourceFile);
            if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
              const base = baseIdentifier(attr.initializer.expression, sourceFile);
              if (base) {
                const ann = byIdentifier.get(base);
                if (ann && !ann.flows_to.some((f) => f.child === tagName && f.prop === attrName)) {
                  ann.flows_to.push({ child: tagName, prop: attrName });
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(componentNode);
  return annotations;
}
