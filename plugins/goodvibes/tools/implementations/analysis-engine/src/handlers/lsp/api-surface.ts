/**
 * Get API Surface Handler
 *
 * Analyzes the public vs internal API surface of a module or package.
 * Identifies exports from entry points as public API, and other exports as internal.
 *
 * @module handlers/lsp/api-surface
 */

import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { PROJECT_ROOT } from '../../config.js';
import { languageServiceManager } from './language-service.js';
import {
  createSuccessResponse,
  createErrorResponse,
  makeRelativePath,
  type ToolResponse,
} from './utils.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the get_api_surface tool.
 */
export interface GetApiSurfaceArgs {
  /** Directory to analyze (relative to project root) */
  path?: string;
  /** Entry point files (auto-detect if not provided) */
  entry_points?: string[];
}

/**
 * A public API export.
 */
interface PublicApiExport {
  /** Name of the exported symbol */
  name: string;
  /** Symbol kind (function, class, interface, type, variable, etc.) */
  kind: string;
  /** TypeScript type signature */
  type: string;
  /** File where the symbol is defined */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** JSDoc documentation (if present) */
  jsdoc: string | null;
}

/**
 * An internal API export.
 */
interface InternalApiExport {
  /** Name of the exported symbol */
  name: string;
  /** Symbol kind */
  kind: string;
  /** TypeScript type signature */
  type: string;
  /** File where the symbol is defined */
  file: string;
  /** Line number (1-based) */
  line: number;
}

/**
 * Result of the get_api_surface tool.
 */
interface GetApiSurfaceResult {
  /** Public API exports (from entry points) */
  public_api: PublicApiExport[];
  /** Internal API exports (not re-exported from entry points) */
  internal_api: InternalApiExport[];
  /** Entry point files that were detected/used */
  entry_points: string[];
}

/**
 * Internal representation of an export with origin info.
 */
interface ExportWithOrigin {
  name: string;
  kind: string;
  type: string;
  file: string;
  line: number;
  jsdoc: string | null;
  isFromEntryPoint: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Common entry point file names */
const ENTRY_POINT_NAMES = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'index.mts',
  'index.mjs',
  'main.ts',
  'main.js',
  'mod.ts',
  'mod.js',
];

/** TypeScript/JavaScript file extensions */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a file is a TypeScript/JavaScript source file.
 */
function isSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.includes(ext);
}

/**
 * Recursively find all source files in a directory.
 */
function findSourceFiles(dirPath: string): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules, hidden directories, and build outputs
          if (
            entry.name === 'node_modules' ||
            entry.name.startsWith('.') ||
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name === 'out' ||
            entry.name === 'coverage'
          ) {
            continue;
          }
          walk(fullPath);
        } else if (entry.isFile() && isSourceFile(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Ignore directories we can't read
    }
  }

  walk(dirPath);
  return files;
}

/**
 * Auto-detect entry points for a directory.
 */
function detectEntryPoints(dirPath: string): string[] {
  const entryPoints: string[] = [];

  // Check for package.json main/module/exports
  const packageJsonPath = path.join(dirPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      // Check main field
      if (packageJson.main) {
        const mainPath = path.resolve(dirPath, packageJson.main);
        if (fs.existsSync(mainPath)) {
          entryPoints.push(mainPath);
        }
        // Also check for .ts version if main is .js
        const tsVersion = mainPath.replace(/\.js$/, '.ts');
        if (mainPath !== tsVersion && fs.existsSync(tsVersion)) {
          entryPoints.push(tsVersion);
        }
      }

      // Check module field
      if (packageJson.module) {
        const modulePath = path.resolve(dirPath, packageJson.module);
        if (fs.existsSync(modulePath)) {
          entryPoints.push(modulePath);
        }
      }

      // Check exports field
      if (packageJson.exports) {
        const addExportPath = (exportPath: string | { default?: string; import?: string; require?: string }) => {
          if (typeof exportPath === 'string') {
            const fullPath = path.resolve(dirPath, exportPath);
            if (fs.existsSync(fullPath)) {
              entryPoints.push(fullPath);
            }
          } else if (typeof exportPath === 'object') {
            for (const key of ['default', 'import', 'require']) {
              const val = exportPath[key as keyof typeof exportPath];
              if (typeof val === 'string') {
                const fullPath = path.resolve(dirPath, val);
                if (fs.existsSync(fullPath)) {
                  entryPoints.push(fullPath);
                }
              }
            }
          }
        };

        if (typeof packageJson.exports === 'string') {
          addExportPath(packageJson.exports);
        } else if (typeof packageJson.exports === 'object') {
          for (const key of Object.keys(packageJson.exports)) {
            addExportPath(packageJson.exports[key]);
          }
        }
      }
    } catch {
      // Ignore package.json parse errors
    }
  }

  // Check for common entry point files at root
  for (const name of ENTRY_POINT_NAMES) {
    const entryPath = path.join(dirPath, name);
    if (fs.existsSync(entryPath) && !entryPoints.includes(entryPath)) {
      entryPoints.push(entryPath);
    }
  }

  // Check src directory for entry points
  const srcDir = path.join(dirPath, 'src');
  if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
    for (const name of ENTRY_POINT_NAMES) {
      const entryPath = path.join(srcDir, name);
      if (fs.existsSync(entryPath) && !entryPoints.includes(entryPath)) {
        entryPoints.push(entryPath);
      }
    }
  }

  return entryPoints;
}

/**
 * Map TypeScript ScriptElementKind to a simple kind string.
 */
function getExportKind(kind: ts.ScriptElementKind): string {
  const kindMap: Record<string, string> = {
    [ts.ScriptElementKind.functionElement]: 'function',
    [ts.ScriptElementKind.classElement]: 'class',
    [ts.ScriptElementKind.interfaceElement]: 'interface',
    [ts.ScriptElementKind.typeElement]: 'type',
    [ts.ScriptElementKind.enumElement]: 'enum',
    [ts.ScriptElementKind.constElement]: 'constant',
    [ts.ScriptElementKind.letElement]: 'variable',
    [ts.ScriptElementKind.variableElement]: 'variable',
    [ts.ScriptElementKind.moduleElement]: 'namespace',
    [ts.ScriptElementKind.alias]: 'alias',
  };

  return kindMap[kind] ?? 'export';
}

/**
 * Get JSDoc comment for a node.
 */
function getJsDoc(node: ts.Node, sourceFile: ts.SourceFile): string | null {
  const jsDocs = ts.getJSDocCommentsAndTags(node);
  if (jsDocs.length === 0) return null;

  const comments: string[] = [];
  for (const doc of jsDocs) {
    if (ts.isJSDoc(doc) && doc.comment) {
      if (typeof doc.comment === 'string') {
        comments.push(doc.comment);
      } else {
        // Handle JSDocComment[]
        comments.push(
          doc.comment
            .map((c) => (typeof c === 'string' ? c : c.text))
            .join('')
        );
      }
    }
  }

  return comments.length > 0 ? comments.join('\n').trim() : null;
}

/**
 * Get type string for a symbol.
 */
function getTypeString(
  checker: ts.TypeChecker,
  node: ts.Node,
  symbol?: ts.Symbol
): string {
  try {
    if (symbol) {
      const type = checker.getTypeOfSymbolAtLocation(symbol, node);
      return checker.typeToString(
        type,
        node,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteTypeArgumentsOfSignature
      );
    }

    const type = checker.getTypeAtLocation(node);
    return checker.typeToString(
      type,
      node,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteTypeArgumentsOfSignature
    );
  } catch {
    return 'unknown';
  }
}

/**
 * Find all exports from entry point files and collect their symbols.
 */
async function collectPublicExports(
  entryPoints: string[],
  service: ts.LanguageService
): Promise<Map<string, ExportWithOrigin>> {
  const publicExports = new Map<string, ExportWithOrigin>();
  const program = service.getProgram();
  const checker = program?.getTypeChecker();

  if (!program || !checker) {
    return publicExports;
  }

  for (const entryPoint of entryPoints) {
    const normalizedPath = entryPoint.replace(/\\/g, '/');
    const sourceFile = program.getSourceFile(normalizedPath);

    if (!sourceFile) continue;

    // Get all exports from this entry point
    const symbol = checker.getSymbolAtLocation(sourceFile);
    if (!symbol) continue;

    const exports = checker.getExportsOfModule(symbol);

    for (const exportSymbol of exports) {
      const name = exportSymbol.getName();
      if (name === '__export') continue; // Skip internal symbols

      // Get the declaration
      const declarations = exportSymbol.getDeclarations();
      if (!declarations || declarations.length === 0) continue;

      const decl = declarations[0];
      const declSourceFile = decl.getSourceFile();
      const { line } = declSourceFile.getLineAndCharacterOfPosition(decl.getStart());

      // Determine kind
      let kind: ts.ScriptElementKind = ts.ScriptElementKind.unknown;
      if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl)) {
        kind = ts.ScriptElementKind.functionElement;
      } else if (ts.isClassDeclaration(decl) || ts.isClassExpression(decl)) {
        kind = ts.ScriptElementKind.classElement;
      } else if (ts.isInterfaceDeclaration(decl)) {
        kind = ts.ScriptElementKind.interfaceElement;
      } else if (ts.isTypeAliasDeclaration(decl)) {
        kind = ts.ScriptElementKind.typeElement;
      } else if (ts.isEnumDeclaration(decl)) {
        kind = ts.ScriptElementKind.enumElement;
      } else if (ts.isVariableDeclaration(decl)) {
        const varStmt = decl.parent?.parent;
        if (varStmt && ts.isVariableStatement(varStmt)) {
          kind =
            varStmt.declarationList.flags & ts.NodeFlags.Const
              ? ts.ScriptElementKind.constElement
              : ts.ScriptElementKind.variableElement;
        }
      } else if (ts.isModuleDeclaration(decl)) {
        kind = ts.ScriptElementKind.moduleElement;
      }

      // Get type and JSDoc
      const typeStr = getTypeString(checker, decl, exportSymbol);
      const jsdoc = getJsDoc(decl, declSourceFile);

      // Use a key that includes file to handle same-name exports from different files
      const key = `${name}@${declSourceFile.fileName}`;

      publicExports.set(key, {
        name,
        kind: getExportKind(kind),
        type: typeStr,
        file: declSourceFile.fileName,
        line: line + 1,
        jsdoc,
        isFromEntryPoint: true,
      });
    }
  }

  return publicExports;
}

/**
 * Collect all exports from all source files.
 */
async function collectAllExports(
  sourceFiles: string[],
  service: ts.LanguageService
): Promise<Map<string, ExportWithOrigin>> {
  const allExports = new Map<string, ExportWithOrigin>();
  const program = service.getProgram();
  const checker = program?.getTypeChecker();

  if (!program || !checker) {
    return allExports;
  }

  for (const filePath of sourceFiles) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const sourceFile = program.getSourceFile(normalizedPath);

    if (!sourceFile) continue;

    // Get module symbol
    const symbol = checker.getSymbolAtLocation(sourceFile);
    if (!symbol) continue;

    const exports = checker.getExportsOfModule(symbol);

    for (const exportSymbol of exports) {
      const name = exportSymbol.getName();
      if (name === '__export') continue;

      const declarations = exportSymbol.getDeclarations();
      if (!declarations || declarations.length === 0) continue;

      const decl = declarations[0];
      const declSourceFile = decl.getSourceFile();
      const { line } = declSourceFile.getLineAndCharacterOfPosition(decl.getStart());

      // Determine kind
      let kind: ts.ScriptElementKind = ts.ScriptElementKind.unknown;
      if (ts.isFunctionDeclaration(decl) || ts.isFunctionExpression(decl) || ts.isArrowFunction(decl)) {
        kind = ts.ScriptElementKind.functionElement;
      } else if (ts.isClassDeclaration(decl) || ts.isClassExpression(decl)) {
        kind = ts.ScriptElementKind.classElement;
      } else if (ts.isInterfaceDeclaration(decl)) {
        kind = ts.ScriptElementKind.interfaceElement;
      } else if (ts.isTypeAliasDeclaration(decl)) {
        kind = ts.ScriptElementKind.typeElement;
      } else if (ts.isEnumDeclaration(decl)) {
        kind = ts.ScriptElementKind.enumElement;
      } else if (ts.isVariableDeclaration(decl)) {
        const varStmt = decl.parent?.parent;
        if (varStmt && ts.isVariableStatement(varStmt)) {
          kind =
            varStmt.declarationList.flags & ts.NodeFlags.Const
              ? ts.ScriptElementKind.constElement
              : ts.ScriptElementKind.variableElement;
        }
      } else if (ts.isModuleDeclaration(decl)) {
        kind = ts.ScriptElementKind.moduleElement;
      }

      const typeStr = getTypeString(checker, decl, exportSymbol);
      const jsdoc = getJsDoc(decl, declSourceFile);

      const key = `${name}@${declSourceFile.fileName}`;

      if (!allExports.has(key)) {
        allExports.set(key, {
          name,
          kind: getExportKind(kind),
          type: typeStr,
          file: declSourceFile.fileName,
          line: line + 1,
          jsdoc,
          isFromEntryPoint: false,
        });
      }
    }
  }

  return allExports;
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the get_api_surface MCP tool call.
 *
 * Analyzes the public vs internal API surface of a module or package.
 *
 * @param args - The get_api_surface tool arguments
 * @returns MCP tool response with JSON-formatted API surface
 *
 * @example
 * ```typescript
 * const result = await handleGetApiSurface({
 *   path: 'packages/core'
 * });
 * // Returns public_api, internal_api, and entry_points
 * ```
 */
export async function handleGetApiSurface(args: GetApiSurfaceArgs): Promise<ToolResponse> {
  try {
    const targetPath = args.path ?? '.';

    // Resolve the path
    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.resolve(PROJECT_ROOT, targetPath);

    // Verify it's a directory
    try {
      const stat = fs.statSync(absolutePath);
      if (!stat.isDirectory()) {
        return createErrorResponse(`Path is not a directory: ${targetPath}`);
      }
    } catch {
      return createErrorResponse(`Path not found: ${targetPath}`);
    }

    // Get or detect entry points
    let entryPoints: string[];
    if (args.entry_points && args.entry_points.length > 0) {
      entryPoints = args.entry_points.map((ep) =>
        path.isAbsolute(ep) ? ep : path.resolve(absolutePath, ep)
      );
      // Filter to only existing files
      entryPoints = entryPoints.filter((ep) => fs.existsSync(ep));
    } else {
      entryPoints = detectEntryPoints(absolutePath);
    }

    if (entryPoints.length === 0) {
      return createSuccessResponse({
        public_api: [],
        internal_api: [],
        entry_points: [],
      });
    }

    // Find all source files
    const sourceFiles = findSourceFiles(absolutePath);

    if (sourceFiles.length === 0) {
      return createSuccessResponse({
        public_api: [],
        internal_api: [],
        entry_points: entryPoints.map((ep) => makeRelativePath(ep, PROJECT_ROOT)),
      });
    }

    // Get language service (use first entry point to establish context)
    const { service } = await languageServiceManager.getServiceForFile(
      entryPoints[0].replace(/\\/g, '/')
    );

    // Collect public exports from entry points
    const publicExports = await collectPublicExports(entryPoints, service);

    // Collect all exports from all files
    const allExports = await collectAllExports(sourceFiles, service);

    // Build result arrays
    const publicApi: PublicApiExport[] = [];
    const internalApi: InternalApiExport[] = [];

    // Create a set of public export keys for quick lookup
    const publicKeys = new Set(publicExports.keys());

    // Classify exports
    for (const [key, exp] of allExports) {
      if (publicKeys.has(key)) {
        const publicExp = publicExports.get(key)!;
        publicApi.push({
          name: publicExp.name,
          kind: publicExp.kind,
          type: publicExp.type,
          file: makeRelativePath(publicExp.file, PROJECT_ROOT),
          line: publicExp.line,
          jsdoc: publicExp.jsdoc,
        });
      } else {
        internalApi.push({
          name: exp.name,
          kind: exp.kind,
          type: exp.type,
          file: makeRelativePath(exp.file, PROJECT_ROOT),
          line: exp.line,
        });
      }
    }

    // Sort results
    publicApi.sort((a, b) => {
      const fileCompare = a.file.localeCompare(b.file);
      if (fileCompare !== 0) return fileCompare;
      return a.line - b.line;
    });

    internalApi.sort((a, b) => {
      const fileCompare = a.file.localeCompare(b.file);
      if (fileCompare !== 0) return fileCompare;
      return a.line - b.line;
    });

    const result: GetApiSurfaceResult = {
      public_api: publicApi,
      internal_api: internalApi,
      entry_points: entryPoints.map((ep) => makeRelativePath(ep, PROJECT_ROOT)),
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to analyze API surface: ${message}`);
  }
}
