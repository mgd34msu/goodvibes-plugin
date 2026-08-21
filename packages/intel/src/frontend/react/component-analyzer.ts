/**
 * React component analyzer, Lane 4.
 *
 * Ported from frontend-engine `core/react/component-analyzer.ts`, rewired off the
 * v1 per-file `ts.createSourceFile` onto the shared compiler host (§3.3): the
 * caller hands `analyzeFile` a host-parsed SourceFile plus its relative + absolute
 * paths. As a side effect it records each component's defining AST node in a
 * `nodeIndex` so the annotation passes can scope to one component.
 *
 * @module frontend/react/component-analyzer
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { isReactComponent } from '../ast.js';
import {
  getComponentName,
  detectHocWrappedComponent,
  detectDefaultExportHoc,
} from './component-detector.js';
import { findUsedComponents } from './relationship-builder.js';
import type { ComponentInfo, ComponentNodeRef, UnwrapResult } from './types.js';

/** 1-based line for a position. */
function lineOf(pos: number, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

/** Extract prop names from an interface / type-alias literal by name. */
export function extractPropsFromInterface(
  sourceFile: ts.SourceFile,
  interfaceName: string,
  props: Set<string>,
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

/** Extract prop names from a function/arrow node's first parameter. */
export function extractPropsFromFn(
  fn: ts.FunctionExpression | ts.ArrowFunction | ts.FunctionDeclaration,
  sourceFile: ts.SourceFile,
): string[] {
  const props = new Set<string>();
  const params = fn.parameters;
  if (params.length > 0) {
    const firstParam = params[0];
    if (ts.isObjectBindingPattern(firstParam.name)) {
      for (const element of firstParam.name.elements) {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          props.add(element.name.getText(sourceFile));
        }
      }
    }
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

/** Extract prop names from a component definition node. */
export function extractProps(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  precomputedUnwrap?: UnwrapResult | null,
): string[] {
  if (ts.isFunctionDeclaration(node)) {
    return extractPropsFromFn(node as unknown as ts.ArrowFunction, sourceFile);
  }
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
        return extractPropsFromFn(decl.initializer, sourceFile);
      }
      if (decl.initializer && ts.isCallExpression(decl.initializer)) {
        const unwrapped = precomputedUnwrap ?? detectHocWrappedComponent(decl, sourceFile);
        if (unwrapped?.innerFn) {
          return extractPropsFromFn(unwrapped.innerFn, sourceFile);
        }
      }
    }
    return [];
  }
  if (ts.isClassDeclaration(node)) {
    const props = new Set<string>();
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

/** Recursively find React component files (.tsx/.jsx) under a directory. */
export function findComponentFiles(absoluteDir: string): string[] {
  const files: string[] = [];
  const extensions = ['.tsx', '.jsx'];
  function walk(dir: string): void {
    if (!fs.existsSync(dir)) {return;}
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {continue;}
        walk(fullPath);
      } else if (entry.isFile()) {
        if (extensions.includes(path.extname(entry.name))) {files.push(fullPath);}
      }
    }
  }
  walk(absoluteDir);
  return files;
}

/**
 * Analyze a single (host-parsed) source file for React components.
 * @param sourceFile - the host-parsed SourceFile
 * @param relativePath - base-relative path (for `file`)
 * @param resolvedPath - absolute path (for `resolved_path`, issue 1 fix #3)
 * @param nodeIndex - optional map populated with each component's defining node
 */
export function analyzeFile(
  sourceFile: ts.SourceFile,
  relativePath: string,
  resolvedPath: string,
  nodeIndex?: Map<string, ComponentNodeRef>,
): ComponentInfo[] {
  const components: ComponentInfo[] = [];
  const detectedNames = new Set<string>();

  function visit(node: ts.Node): void {
    if (isReactComponent(node, sourceFile)) {
      const name = getComponentName(node, sourceFile);
      if (name) {
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
        if (nodeIndex && !nodeIndex.has(name)) {nodeIndex.set(name, { sourceFile, node });}
        components.push({
          name,
          file: relativePath,
          resolved_path: resolvedPath,
          line: lineOf(node.getStart(sourceFile), sourceFile),
          props: extractProps(node, sourceFile, precomputedUnwrap),
          used_by: [],
          uses: findUsedComponents(node, sourceFile),
          ...(lazy !== undefined && { lazy }),
          ...(wrappers !== undefined && { wrappers }),
        });
      }
    }

    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      const detected = detectDefaultExportHoc(node, sourceFile);
      if (detected) {
        const { name, unwrapped } = detected;
        if (!detectedNames.has(name)) {
          detectedNames.add(name);
          if (nodeIndex && !nodeIndex.has(name)) {nodeIndex.set(name, { sourceFile, node });}
          components.push({
            name,
            file: relativePath,
            resolved_path: resolvedPath,
            line: lineOf(node.getStart(sourceFile), sourceFile),
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
