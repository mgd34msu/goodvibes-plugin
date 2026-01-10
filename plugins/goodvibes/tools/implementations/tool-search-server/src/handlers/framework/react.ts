/**
 * React Component Tree Handler
 *
 * Parses JSX/TSX files and builds a component hierarchy tree using
 * TypeScript AST analysis. Extracts component definitions, props,
 * and parent-child relationships.
 *
 * @module handlers/framework/react
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the get_react_component_tree tool
 */
export interface GetReactComponentTreeArgs {
  /** Specific component file to analyze */
  file?: string;
  /** Directory to analyze for components */
  path?: string;
  /** Start analysis from a specific component name */
  root_component?: string;
  /** Maximum depth to traverse in component tree */
  depth?: number;
}

/**
 * Component tree node structure
 */
interface ComponentTreeNode {
  name: string;
  file: string;
  props: string[];
  children: ComponentTreeNode[];
}

/**
 * Component info in flat list
 */
interface ComponentInfo {
  name: string;
  file: string;
  line: number;
  props: string[];
  used_by: string[];
  uses: string[];
}

/**
 * Result of component tree analysis
 */
interface ComponentTreeResult {
  tree: ComponentTreeNode | null;
  components: ComponentInfo[];
  count: number;
}

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

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
// AST Analysis Helpers
// =============================================================================

/**
 * Check if a node is a React component (function or class)
 */
function isReactComponent(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  // Function declaration: function Component() { return <div/> }
  if (ts.isFunctionDeclaration(node) && node.name) {
    const name = node.name.getText(sourceFile);
    // React components start with uppercase
    if (/^[A-Z]/.test(name)) {
      return containsJsxReturn(node, sourceFile);
    }
  }

  // Arrow function assigned to const: const Component = () => <div/>
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        const name = decl.name.getText(sourceFile);
        if (/^[A-Z]/.test(name) && decl.initializer) {
          if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
            return containsJsxReturn(decl.initializer, sourceFile);
          }
        }
      }
    }
  }

  // Class component: class Component extends React.Component
  if (ts.isClassDeclaration(node) && node.name) {
    const name = node.name.getText(sourceFile);
    if (/^[A-Z]/.test(name) && node.heritageClauses) {
      for (const clause of node.heritageClauses) {
        const text = clause.getText(sourceFile);
        if (text.includes('Component') || text.includes('PureComponent')) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if a function body contains JSX return
 */
function containsJsxReturn(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  let hasJsx = false;

  function visit(n: ts.Node): void {
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
 * Extract component name from a node
 */
function getComponentName(node: ts.Node, sourceFile: ts.SourceFile): string | null {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.getText(sourceFile);
  }

  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        return decl.name.getText(sourceFile);
      }
    }
  }

  if (ts.isClassDeclaration(node) && node.name) {
    return node.name.getText(sourceFile);
  }

  return null;
}

/**
 * Extract props from a component definition
 */
function extractProps(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const props: Set<string> = new Set();

  // Handle function/arrow function parameters
  let params: ts.NodeArray<ts.ParameterDeclaration> | undefined;

  if (ts.isFunctionDeclaration(node)) {
    params = node.parameters;
  } else if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
        params = decl.initializer.parameters;
        break;
      }
    }
  }

  if (params && params.length > 0) {
    const firstParam = params[0];

    // Destructured props: ({ prop1, prop2 })
    if (ts.isObjectBindingPattern(firstParam.name)) {
      for (const element of firstParam.name.elements) {
        if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
          props.add(element.name.getText(sourceFile));
        }
      }
    }

    // Type annotation: (props: Props)
    if (firstParam.type) {
      // Extract from type literal: { prop1: string, prop2: number }
      if (ts.isTypeLiteralNode(firstParam.type)) {
        for (const member of firstParam.type.members) {
          if (ts.isPropertySignature(member) && member.name) {
            props.add(member.name.getText(sourceFile));
          }
        }
      }

      // Extract from interface reference - look for the type reference
      if (ts.isTypeReferenceNode(firstParam.type)) {
        // Could resolve the interface, but for now just note it uses typed props
        const typeName = firstParam.type.typeName.getText(sourceFile);
        if (typeName.endsWith('Props')) {
          // Try to find the interface in the same file
          extractPropsFromInterface(sourceFile, typeName, props);
        }
      }
    }
  }

  // For class components, look for this.props usage
  if (ts.isClassDeclaration(node)) {
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
  }

  return Array.from(props);
}

/**
 * Extract props from an interface definition
 */
function extractPropsFromInterface(sourceFile: ts.SourceFile, interfaceName: string, props: Set<string>): void {
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
 * Find all JSX component usages in a component
 */
function findUsedComponents(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const used: Set<string> = new Set();

  function visit(n: ts.Node): void {
    // JSX element: <Component />
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tagName = n.tagName.getText(sourceFile);
      // Only uppercase (custom components), not lowercase (HTML elements)
      if (/^[A-Z]/.test(tagName)) {
        // Remove any namespace prefix (e.g., React.Fragment -> Fragment)
        const componentName = tagName.split('.').pop() || tagName;
        used.add(componentName);
      }
    }
    ts.forEachChild(n, visit);
  }

  visit(node);
  return Array.from(used);
}

/**
 * Get line number for a node
 */
function getLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1; // Convert to 1-based
}

// =============================================================================
// File Discovery
// =============================================================================

/**
 * Find all React component files in a directory
 */
function findComponentFiles(dirPath: string, projectRoot: string): string[] {
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
// Main Analysis
// =============================================================================

/**
 * Analyze a single file for React components
 */
function analyzeFile(filePath: string, projectRoot: string): ComponentInfo[] {
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

  function visit(node: ts.Node): void {
    if (isReactComponent(node, sourceFile)) {
      const name = getComponentName(node, sourceFile);
      if (name) {
        components.push({
          name,
          file: relativePath,
          line: getLineNumber(node, sourceFile),
          props: extractProps(node, sourceFile),
          used_by: [], // Will be filled later
          uses: findUsedComponents(node, sourceFile),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return components;
}

/**
 * Build used_by relationships from uses relationships
 */
function buildUsedByRelationships(components: ComponentInfo[]): void {
  const componentMap = new Map<string, ComponentInfo>();

  for (const comp of components) {
    componentMap.set(comp.name, comp);
  }

  for (const comp of components) {
    for (const usedName of comp.uses) {
      const usedComp = componentMap.get(usedName);
      if (usedComp && !usedComp.used_by.includes(comp.name)) {
        usedComp.used_by.push(comp.name);
      }
    }
  }
}

/**
 * Build component tree starting from a root
 */
function buildTree(
  rootName: string,
  components: ComponentInfo[],
  depth: number,
  visited: Set<string> = new Set()
): ComponentTreeNode | null {
  if (depth <= 0 || visited.has(rootName)) {
    return null;
  }

  const component = components.find(c => c.name === rootName);
  if (!component) {
    return null;
  }

  visited.add(rootName);

  const children: ComponentTreeNode[] = [];
  for (const childName of component.uses) {
    const childNode = buildTree(childName, components, depth - 1, new Set(visited));
    if (childNode) {
      children.push(childNode);
    }
  }

  return {
    name: component.name,
    file: component.file,
    props: component.props,
    children,
  };
}

/**
 * Find the best root component (one with no parents, or App/Main/Root)
 */
function findRootComponent(components: ComponentInfo[]): string | null {
  // Priority: App, Main, Root, or any component with no parents
  const priorityNames = ['App', 'Main', 'Root', 'Application', 'Layout'];

  for (const name of priorityNames) {
    const comp = components.find(c => c.name === name);
    if (comp) return comp.name;
  }

  // Find components with no parents
  const rootCandidates = components.filter(c => c.used_by.length === 0);
  if (rootCandidates.length > 0) {
    return rootCandidates[0].name;
  }

  // Fallback to first component
  return components.length > 0 ? components[0].name : null;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handles the get_react_component_tree MCP tool call.
 *
 * Parses JSX/TSX files to build a component hierarchy tree with:
 * - Component definitions and their props
 * - Parent-child relationships
 * - Component usage tracking
 *
 * @param args - The get_react_component_tree tool arguments
 * @returns MCP tool response with component tree
 */
export async function handleGetReactComponentTree(args: GetReactComponentTreeArgs): Promise<ToolResponse> {
  const projectRoot = process.cwd();
  const searchPath = args.path || 'src';
  const maxDepth = args.depth ?? 5;

  try {
    let allComponents: ComponentInfo[] = [];

    // If specific file provided, analyze only that file
    if (args.file) {
      const filePath = path.isAbsolute(args.file) ? args.file : path.resolve(projectRoot, args.file);

      if (!fs.existsSync(filePath)) {
        return createErrorResponse(`File not found: ${args.file}`, { provided_path: args.file });
      }

      allComponents = analyzeFile(filePath, projectRoot);
    } else {
      // Find all component files
      const files = findComponentFiles(searchPath, projectRoot);

      if (files.length === 0) {
        return createSuccessResponse({
          tree: null,
          components: [],
          count: 0,
          message: `No React component files found in ${searchPath}`,
        });
      }

      // Analyze each file
      for (const file of files) {
        const fileComponents = analyzeFile(file, projectRoot);
        allComponents.push(...fileComponents);
      }
    }

    // Build used_by relationships
    buildUsedByRelationships(allComponents);

    // Determine root component
    const rootName = args.root_component || findRootComponent(allComponents);

    // Build tree
    let tree: ComponentTreeNode | null = null;
    if (rootName) {
      tree = buildTree(rootName, allComponents, maxDepth);
    }

    const result: ComponentTreeResult = {
      tree,
      components: allComponents,
      count: allComponents.length,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during analysis';
    return createErrorResponse(message, { path: searchPath });
  }
}
