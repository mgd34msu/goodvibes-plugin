/**
 * `boundaries` annotation for component_tree — Lane 4 (§4.4.1).
 *
 * Distilled from frontend-engine `core/error-boundaries/scanner.ts`. Per tribunal:
 * carry `has_fallback`/`has_reset` booleans and detect BOTH class boundaries
 * (getDerivedStateFromError / componentDidCatch) AND library wrappers
 * (react-error-boundary, Sentry, TanStack, Remix). Attaches to a component node
 * only when it is / renders a boundary. Shape per §4.4.1:
 *   { is_boundary, mechanism, has_fallback, has_reset }
 *
 * @module frontend/annotations/boundaries
 */

import ts from 'typescript';

/** Boundary annotation attached to a component node. */
export interface BoundaryAnnotation {
  is_boundary: true;
  mechanism: string;
  has_fallback: boolean;
  has_reset: boolean;
}

const ERROR_BOUNDARY_METHODS = ['getDerivedStateFromError', 'componentDidCatch'];

/** react-error-boundary + common library boundary component names → source. */
const LIBRARY_BOUNDARY_SOURCES = new Map<string, string>([
  ['@sentry/react', 'Sentry.ErrorBoundary'],
  ['@sentry/nextjs', 'Sentry.ErrorBoundary'],
  ['react-error-boundary', 'ErrorBoundary'],
  ['@tanstack/react-query', 'QueryErrorResetBoundary'],
  ['@tanstack/react-router', 'CatchBoundary'],
  ['@remix-run/react', 'ErrorBoundary'],
]);

const REACT_ERROR_BOUNDARY_COMPONENTS = new Set([
  'ErrorBoundary',
  'ErrorBoundaryPropsWithComponent',
  'withErrorBoundary',
]);

function findClass(node: ts.Node): ts.ClassDeclaration | null {
  if (ts.isClassDeclaration(node)) {return node;}
  let found: ts.ClassDeclaration | null = null;
  ts.forEachChild(node, (child) => {
    if (!found && ts.isClassDeclaration(child)) {found = child;}
  });
  return found;
}

function classMechanism(node: ts.ClassDeclaration): string | null {
  const names: string[] = [];
  for (const member of node.members) {
    if ((ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) && member.name && ts.isIdentifier(member.name)) {
      if (ERROR_BOUNDARY_METHODS.includes(member.name.text)) {names.push(member.name.text);}
    }
  }
  if (names.includes('getDerivedStateFromError')) {return 'getDerivedStateFromError';}
  if (names.length > 0) {return names[0];}
  return null;
}

function classHasFallback(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): boolean {
  for (const member of node.members) {
    if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name) && member.name.text === 'render' && member.body) {
      const renderText = member.body.getText(sourceFile);
      if (
        renderText.includes('this.state.hasError') ||
        renderText.includes('this.state.error') ||
        renderText.includes('fallback') ||
        renderText.includes('FallbackComponent')
      ) {
        return true;
      }
    }
    if (ts.isPropertyDeclaration(member) && member.name && ts.isIdentifier(member.name) && member.name.text === 'fallback') {
      return true;
    }
  }
  return false;
}

function classHasReset(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): boolean {
  for (const member of node.members) {
    // Covers both `reset() {}` methods and `reset = () => {}` class-field handlers
    // (the latter is common in real error boundaries and was missed by v1).
    if ((ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) && member.name && ts.isIdentifier(member.name)) {
      const name = member.name.text.toLowerCase();
      if (name.includes('reset') || name.includes('retry') || name.includes('recover')) {return true;}
    }
  }
  const classText = node.getText(sourceFile);
  return classText.includes('resetKeys') || classText.includes('onReset');
}

/** Map of imported name → module (namespace imports recorded as `Name.*`). */
function extractImports(sourceFile: ts.SourceFile): Map<string, string> {
  const imports = new Map<string, string>();
  ts.forEachChild(sourceFile, (node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) {return;}
    const moduleName = node.moduleSpecifier.text;
    const clause = node.importClause;
    if (!clause) {return;}
    if (clause.name) {imports.set(clause.name.text, moduleName);}
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {imports.set(el.name.text, moduleName);}
    }
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      imports.set(clause.namedBindings.name.text + '.*', moduleName);
    }
  });
  return imports;
}

/** Whether a JSX element named `componentName` under `node` carries a given prop set. */
function jsxHasProp(node: ts.Node, sourceFile: ts.SourceFile, componentName: string, props: string[]): boolean {
  let found = false;
  function visit(n: ts.Node): void {
    if (found) {return;}
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tagName = n.tagName.getText(sourceFile);
      if (tagName === componentName || tagName.endsWith('.' + componentName)) {
        for (const attr of n.attributes.properties) {
          if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name) && props.includes(attr.name.text)) {
            found = true;
            return;
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return found;
}

function collectJsxNames(node: ts.Node, sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  function visit(n: ts.Node): void {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      names.add(n.tagName.getText(sourceFile));
    }
    ts.forEachChild(n, visit);
  }
  visit(node);
  return names;
}

/**
 * Compute the boundary annotation for a component node, or null when it is not a
 * boundary.
 * @param componentNode - the component's defining AST node
 * @param sourceFile - the host-parsed SourceFile (for file-level imports)
 */
export function annotateBoundaries(componentNode: ts.Node, sourceFile: ts.SourceFile): BoundaryAnnotation | null {
  // 1. Class-based error boundary.
  const cls = findClass(componentNode);
  if (cls) {
    const mechanism = classMechanism(cls);
    if (mechanism) {
      return {
        is_boundary: true,
        mechanism,
        has_fallback: classHasFallback(cls, sourceFile),
        has_reset: classHasReset(cls, sourceFile),
      };
    }
  }

  // 2. Library wrapper rendered inside this component's JSX.
  const imports = extractImports(sourceFile);
  const jsxNames = collectJsxNames(componentNode, sourceFile);
  for (const [importedName, moduleName] of imports) {
    const localName = importedName.replace(/\..+$/, '');
    if (moduleName === 'react-error-boundary') {
      if ((REACT_ERROR_BOUNDARY_COMPONENTS.has(localName) || localName === 'ErrorBoundary') && jsxNames.has(localName)) {
        return {
          is_boundary: true,
          mechanism: localName,
          has_fallback: jsxHasProp(componentNode, sourceFile, localName, ['fallback', 'FallbackComponent', 'fallbackRender']),
          has_reset: jsxHasProp(componentNode, sourceFile, localName, ['onReset', 'resetKeys', 'onError']),
        };
      }
      continue;
    }
    if (LIBRARY_BOUNDARY_SOURCES.has(moduleName)) {
      let matched = localName;
      if (!jsxNames.has(localName)) {
        const ns = Array.from(jsxNames).find((n) => n.startsWith(localName + '.'));
        if (!ns) {continue;}
        matched = ns;
      }
      return {
        is_boundary: true,
        mechanism: LIBRARY_BOUNDARY_SOURCES.get(moduleName) ?? matched,
        has_fallback: jsxHasProp(componentNode, sourceFile, matched, ['fallback', 'FallbackComponent', 'fallbackRender']),
        has_reset: jsxHasProp(componentNode, sourceFile, matched, ['onReset', 'resetKeys', 'onError']),
      };
    }
  }

  return null;
}
