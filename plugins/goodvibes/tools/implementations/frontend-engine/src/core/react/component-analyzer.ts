/**
 * React Component Analyzer
 *
 * Analyzes JSX/TSX source files to extract React component definitions,
 * their props, and JSX usage patterns. Handles function components,
 * class components, and HOC-wrapped variants.
 *
 * @module core/react/component-analyzer
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { makeRelativePath } from '../../shared/utils.js';
import { isReactComponent, containsJsxReturn } from '../../shared/ast.js';
import {
  getComponentName,
  detectHocWrappedComponent,
  detectDefaultExportHoc,
} from './component-detector.js';
import { findUsedComponents } from './relationship-builder.js';
import type { ComponentInfo, UnwrapResult } from './types.js';

// =============================================================================
// Line Number Helper
// =============================================================================

/**
 * Get line number for an AST node (1-based)
 */
function getLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1; // Convert to 1-based
}

// =============================================================================
// Props Extraction
// =============================================================================

/**
 * Extract props from an interface definition
 */
export function extractPropsFromInterface(
  sourceFile: ts.SourceFile,
  interfaceName: string,
  props: Set<string>
): void {
  function visit(node: ts.Node): void {
    if (ts.isInterfaceDeclaration(node) && node.name.getText(sourceFile) === interfaceName) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && member.name) {
          props.add(member.name.getText(sourceFile));
        }
      }
    }
    if (ts.isTypeAliasDeclaration(node) && node.name.getText(sourceFile) === interfaceName) {
      if (ts.isTypeLiteralNode(node.type)) {
        for (const member of node.type.members) {
          if (ts.isPropertySignature(member) && member.name) {
            props.add(member.name.getText(sourceFile));
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

/**
 * Extract props from a function/arrow-function node directly.
 * Used for HOC-wrapped components where the inner fn is extracted.
 * Also accepts FunctionDeclaration (cast as ArrowFunction) for unified delegation.
 */
export function extractPropsFromFn(
  fn: ts.FunctionExpression | ts.ArrowFunction | ts.FunctionDeclaration,
  sourceFile: ts.SourceFile
): string[] {
  const props: Set<string> = new Set();
  const params = fn.parameters;

  if (params.length > 0) {
    const firstParam = params[0];

    // Destructured props: ({ prop1, prop2 })
    if (ts.isObjectBindingPattern(firstParam.name)) {
      for (const element of firstParam.name.elements) {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          props.add(element.name.getText(sourceFile));
        }
      }
    }

    // Type annotation
    if (firstParam.type) {
      if (ts.isTypeLiteralNode(firstParam.type)) {
        for (const member of firstParam.type.members) {
          if (ts.isPropertySignature(member) && member.name) {
            props.add(member.name.getText(sourceFile));
          }
        }
      }
      if (ts.isTypeReferenceNode(firstParam.type)) {
        const typeName = firstParam.type.typeName.getText(sourceFile);
        if (typeName.endsWith('Props')) {
          extractPropsFromInterface(sourceFile, typeName, props);
        }
      }
    }
  }

  return Array.from(props);
}

/**
 * Extract props from a component definition.
 * Accepts an optional pre-computed unwrap result to avoid redundant HOC detection.
 */
export function extractProps(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  precomputedUnwrap?: UnwrapResult | null
): string[] {
  // Function declaration: delegate directly
  if (ts.isFunctionDeclaration(node)) {
    return extractPropsFromFn(node as unknown as ts.ArrowFunction, sourceFile);
  }

  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
        return extractPropsFromFn(decl.initializer, sourceFile);
      }
      // HOC-wrapped: extract props from the inner render function
      if (decl.initializer && ts.isCallExpression(decl.initializer)) {
        const unwrapped = precomputedUnwrap ?? detectHocWrappedComponent(decl, sourceFile);
        if (unwrapped?.innerFn) {
          return extractPropsFromFn(unwrapped.innerFn, sourceFile);
        }
      }
    }
    return [];
  }

  // For class components, look for this.props usage
  if (ts.isClassDeclaration(node)) {
    const props: Set<string> = new Set();
    function findPropsUsage(n: ts.Node): void {
      if (ts.isPropertyAccessExpression(n)) {
        const text = n.getText(sourceFile);
        if (text.startsWith('this.props.')) {
          const propName = text.replace('this.props.', '').split('.')[0];
          props.add(propName);
        }
      }
      ts.forEachChild(n, findPropsUsage);
    }
    findPropsUsage(node);
    return Array.from(props);
  }

  return [];
}

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Find all React component files in a directory
 */
export function findComponentFiles(dirPath: string, projectRoot: string): string[] {
  const files: string[] = [];
  const extensions = ['.tsx', '.jsx'];

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip common non-component directories
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  const absoluteDir = path.isAbsolute(dirPath) ? dirPath : path.resolve(projectRoot, dirPath);
  walk(absoluteDir);
  return files;
}

// =============================================================================
// File Analysis
// =============================================================================

/**
 * Analyze a single file for React components
 */
export function analyzeFile(filePath: string, projectRoot: string): ComponentInfo[] {
  const components: ComponentInfo[] = [];

  if (!fs.existsSync(filePath)) {
    return components;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX
  );

  const relativePath = makeRelativePath(filePath, projectRoot);

  const detectedNames = new Set<string>();

  function visit(node: ts.Node): void {
    if (isReactComponent(node, sourceFile)) {
      const name = getComponentName(node, sourceFile);
      /* v8 ignore next */ // Defensive: isReactComponent ensures name exists
      if (name) {
        // Collect HOC wrapper metadata for variable declarations
        let lazy: boolean | undefined;
        let wrappers: string[] | undefined;
        let precomputedUnwrap: UnwrapResult | null = null;
        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (decl.initializer && ts.isCallExpression(decl.initializer)) {
              const unwrapped = detectHocWrappedComponent(decl, sourceFile);
              if (unwrapped) {
                precomputedUnwrap = unwrapped;
                wrappers = unwrapped.wrappers.length > 0 ? unwrapped.wrappers : undefined;
                lazy = unwrapped.isLazy || undefined;
              }
            }
          }
        }

        detectedNames.add(name);
        components.push({
          name,
          file: relativePath,
          line: getLineNumber(node, sourceFile),
          props: extractProps(node, sourceFile, precomputedUnwrap),
          used_by: [], // Will be filled later
          uses: findUsedComponents(node, sourceFile),
          ...(lazy !== undefined && { lazy }),
          ...(wrappers !== undefined && { wrappers }),
        });
      }
    }

    // Handle `export default memo(...)` / `export default withRouter(Comp)` etc.
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      const detected = detectDefaultExportHoc(node, sourceFile);
      if (detected) {
        const { name, unwrapped } = detected;
        // Avoid duplicate if already registered by name (O(1) Set lookup)
        if (!detectedNames.has(name)) {
          detectedNames.add(name);
          components.push({
            name,
            file: relativePath,
            line: getLineNumber(node, sourceFile),
            props: unwrapped.innerFn ? extractPropsFromFn(unwrapped.innerFn, sourceFile) : [],
            used_by: [],
            uses: unwrapped.innerFn ? findUsedComponents(unwrapped.innerFn, sourceFile) : [],
            ...(unwrapped.isLazy && { lazy: true }),
            ...(unwrapped.wrappers.length > 0 && { wrappers: unwrapped.wrappers }),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return components;
}
