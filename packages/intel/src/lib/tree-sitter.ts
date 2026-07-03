/**
 * Tree-sitter wrapper (web-tree-sitter / WASM) for code_read (outline) and
 * code_grep (`expand_to: function|class` context expansion).
 *
 * Ported from v1 `precision-engine/src/core/tree-sitter.ts`, trimmed to the
 * surface v2 actually uses (outline + enclosing-function/class lookup — the
 * `symbols`/`ast` extraction and cross-file reference search do not port; no
 * v2 tool in this lane calls them).
 *
 * API note: v1 targeted an older `web-tree-sitter` release with a default
 * export (`import Parser from 'web-tree-sitter'`) and `Parser.SyntaxNode`.
 * The pinned v2 version (0.26.10) ships named exports only (`Parser`,
 * `Language`, `Node`, `Tree`) and `Parser.parse()` returns `Tree | null` —
 * adapted below; behavior is unchanged.
 *
 * Fix (plan §4.1 code_read row, "honest exported flags" — currently marks
 * private/nested members exported): v1's `isExported()` walked every ancestor
 * looking for an `export_statement`, so a method or property inside an
 * exported class inherited the CLASS's export status even though individual
 * class/interface members are never independently exported in JS/TS. v2 only
 * computes `exported` for entries visited at the outline's TOP LEVEL (direct
 * children of the source file); nested members (class/interface/namespace
 * children) never carry an `exported` key at all rather than a misleading
 * inherited value.
 */

// `web-tree-sitter` is an externalized WASM dependency (intel build.mjs) that
// the one-time plugin setup installs into server/intel/node_modules. It is
// loaded LAZILY on first parse — never at module load — so a fresh install (or
// a post-update install that has not run setup yet) boots and answers
// `initialize`/`tools/list` instead of crashing on a missing
// `require('web-tree-sitter')`. Only the runtime VALUE import (the `Parser` and
// `Language` classes) is deferred; the type imports are erased by the compiler
// and cost nothing at runtime.
import type { Parser as ParserClass, Language as LanguageClass, Node, Tree, Point } from 'web-tree-sitter';
import * as fs from 'fs/promises';
import * as path from 'path';

/** The `web-tree-sitter` classes this module needs at runtime, loaded lazily. */
interface TreeSitterRuntime {
  Parser: {
    init(moduleOptions?: Record<string, unknown>): Promise<void>;
    new (): ParserClass;
  };
  Language: {
    load(input: string | Uint8Array): Promise<LanguageClass>;
  };
}

let treeSitterRuntime: TreeSitterRuntime | null = null;
let treeSitterLoadFailed = false;

/**
 * Lazily load the `web-tree-sitter` runtime with a cached failure state.
 * Mirrors the `loadAstGrep()` pattern in `edit/engine.ts`: a computed specifier
 * keeps esbuild from resolving the external at build time, and a load failure
 * returns null (cached) so the honest-unavailable path fires instead of a
 * crash. Returns null when the dep is not installed yet.
 */
async function loadTreeSitterRuntime(): Promise<TreeSitterRuntime | null> {
  if (treeSitterRuntime) return treeSitterRuntime;
  if (treeSitterLoadFailed) return null;
  try {
    const spec = ['web-tree', 'sitter'].join('-');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import(spec as string)) as any;
    if (!mod || typeof mod.Parser?.init !== 'function' || typeof mod.Language?.load !== 'function') {
      treeSitterLoadFailed = true;
      return null;
    }
    treeSitterRuntime = { Parser: mod.Parser, Language: mod.Language };
    return treeSitterRuntime;
  } catch {
    treeSitterLoadFailed = true;
    return null;
  }
}

/**
 * Thrown by {@link TreeSitterCore} when `web-tree-sitter` (a native/WASM dep) is
 * not installed yet. Callers (code_read outline) translate it into the standard
 * `nativeDepMessage` error envelope instead of a raw failure string.
 */
export class TreeSitterUnavailableError extends Error {
  constructor() {
    super('web-tree-sitter native dependency is not installed');
    this.name = 'TreeSitterUnavailableError';
  }
}

// `__dirname` — NOT `import.meta.url` — for the same reason as
// lib/ripgrep.ts's `resolveRgPath`: esbuild bundles this ESM source to CJS
// (build.mjs), where `import.meta` is spec'd empty; esbuild's CJS output
// (and the vitest/vite-node dev transform) both provide a real `__dirname`.
declare const __dirname: string;

export interface Position {
  line: number;
  column: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'enum'
  | 'property'
  | 'namespace';

export interface OutlineNode {
  name: string;
  kind: SymbolKind;
  start: Position;
  end: Position;
  signature?: string;
  /** Present ONLY on top-level entries — never a misleading inherited value on members. */
  exported?: boolean;
  children?: OutlineNode[];
}

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  typescript: ['.ts', '.tsx', '.mts', '.cts'],
  python: ['.py', '.pyi'],
  rust: ['.rs'],
  go: ['.go'],
};

function getLanguageNameForFile(filePath: string): string | null {
  const ext = path.extname(filePath);
  for (const [name, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (exts.includes(ext)) return name;
  }
  return null;
}

function toPosition(point: Point): Position {
  return { line: point.row + 1, column: point.column + 1 };
}

function toRange(node: Node): Range {
  return { start: toPosition(node.startPosition), end: toPosition(node.endPosition) };
}

function extractSymbolName(node: Node): string | null {
  const nameNode = node.childForFieldName('name');
  if (nameNode) return nameNode.text;
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child?.type === 'identifier' || child?.type === 'type_identifier') return child.text;
  }
  return null;
}

/** True ONLY when `node` is directly wrapped by an `export_statement`/`export_declaration` — does not cross a class/interface/namespace body boundary (that crossing is what produced the honest-exported-flags bug in v1). */
function isDirectlyExported(node: Node): boolean {
  let current: Node | null = node;
  while (current) {
    if (current.type === 'export_statement' || current.type === 'export_declaration') return true;
    const firstChild = current.child(0);
    if (firstChild?.type === 'export') return true;
    current = current.parent;
  }
  return false;
}

function mapNodeTypeToKind(nodeType: string, language: string): SymbolKind | null {
  if (language === 'typescript' || language === 'javascript') {
    switch (nodeType) {
      case 'function_declaration':
      case 'function':
      case 'arrow_function':
      case 'function_expression':
        return 'function';
      case 'method_definition':
      case 'method_signature':
        return 'method';
      case 'class_declaration':
      case 'class':
        return 'class';
      case 'interface_declaration':
        return 'interface';
      case 'type_alias_declaration':
        return 'type';
      case 'variable_declarator':
      case 'lexical_declaration':
        return 'variable';
      case 'enum_declaration':
        return 'enum';
      case 'property_signature':
      case 'public_field_definition':
      case 'property_identifier':
        return 'property';
      case 'namespace_declaration':
      case 'module_declaration':
        return 'namespace';
      default:
        return null;
    }
  } else if (language === 'python') {
    switch (nodeType) {
      case 'function_definition':
        return 'function';
      case 'class_definition':
        return 'class';
      default:
        return null;
    }
  } else if (language === 'rust') {
    switch (nodeType) {
      case 'function_item':
        return 'function';
      case 'struct_item':
      case 'enum_item':
      case 'impl_item':
        return 'class';
      case 'trait_item':
        return 'interface';
      case 'type_item':
        return 'type';
      case 'const_item':
      case 'static_item':
        return 'constant';
      default:
        return null;
    }
  } else if (language === 'go') {
    switch (nodeType) {
      case 'function_declaration':
      case 'method_declaration':
        return 'function';
      case 'type_declaration':
        return 'type';
      case 'const_declaration':
        return 'constant';
      case 'var_declaration':
        return 'variable';
      default:
        return null;
    }
  }
  return null;
}

function extractSignature(node: Node, maxLength = 200): string {
  let text = node.text;
  const braceIndex = text.indexOf('{');
  if (braceIndex !== -1) text = text.slice(0, braceIndex).trim();
  if (text.length > maxLength) text = text.slice(0, maxLength) + '...';
  return text;
}

/** Directories to probe for the tree-sitter grammar `.wasm` assets, in order. */
function candidateWasmDirs(): string[] {
  const moduleDir = __dirname;
  return [
    // Bundled server: wasm/ sits beside index.cjs.
    path.join(moduleDir, 'wasm'),
    path.join(moduleDir, '..', 'wasm'),
    // Source tree (tests): packages/intel/wasm/ (committed grammar assets).
    path.join(moduleDir, '..', '..', 'wasm'),
    path.join(moduleDir, '..', '..', '..', 'wasm'),
    path.join(process.cwd(), 'wasm'),
  ];
}

let wasmBasePath: string | null = null;

async function findWasmBasePath(): Promise<string> {
  if (wasmBasePath) return wasmBasePath;
  const candidates = candidateWasmDirs();
  for (const dir of candidates) {
    try {
      await fs.access(path.join(dir, 'tree-sitter-typescript.wasm'));
      wasmBasePath = dir;
      return dir;
    } catch {
      // try next
    }
  }
  throw new Error(
    `Could not find tree-sitter WASM grammar files. Searched: ${candidates.join(', ')}. ` +
      `Expected packages/intel/wasm/*.wasm (source) or server/wasm/*.wasm (bundled).`,
  );
}

/** Core tree-sitter wrapper: parse + outline + enclosing-function/class lookup. */
export class TreeSitterCore {
  private parser: ParserClass | null = null;
  private languages: Map<string, LanguageClass> = new Map();
  private runtime: TreeSitterRuntime | null = null;
  private currentLanguage: string | null = null;
  private lastParsedLanguage: string | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the parser, loading `web-tree-sitter` lazily on first use.
   * @throws {TreeSitterUnavailableError} when the native/WASM dep is not
   *   installed yet — callers surface the standard setup-pointer envelope.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const runtime = await loadTreeSitterRuntime();
      if (!runtime) throw new TreeSitterUnavailableError();
      this.runtime = runtime;
      await runtime.Parser.init();
      this.parser = new runtime.Parser();
      this.initialized = true;
    })();
    try {
      await this.initPromise;
    } catch (err) {
      // Do not cache a rejected promise: reset so a later call can retry (the
      // loader itself caches the missing-dep failure cheaply).
      this.initPromise = null;
      throw err;
    }
  }

  /** The most recent grammar-load failure reason, for diagnostics (e.g. a wasm ABI/dylink-format mismatch). */
  lastLoadError: string | null = null;

  private async loadLanguage(langName: string): Promise<LanguageClass | null> {
    const cached = this.languages.get(langName);
    if (cached) return cached;
    // `parse()` calls `init()` first, which sets `this.runtime`; guard anyway.
    if (!this.runtime) return null;
    try {
      const basePath = await findWasmBasePath();
      const wasmPath = path.join(basePath, `tree-sitter-${langName}.wasm`);
      const lang = await this.runtime.Language.load(wasmPath);
      this.languages.set(langName, lang);
      return lang;
    } catch (error) {
      // web-tree-sitter's dylink-metadata parser throws with an EMPTY message
      // for one specific check (a missing-argument bug in its own failIf()
      // call) — that empty message is itself diagnostic: it means the .wasm's
      // custom section is named "dylink" (legacy) instead of "dylink.0" (the
      // format this web-tree-sitter version requires), i.e. the grammar was
      // built for an older toolchain/ABI. Surface a concrete hint either way.
      const raw = error instanceof Error ? error.message : String(error);
      this.lastLoadError = raw
        ? raw
        : `the .wasm grammar's dylink section format is incompatible with this web-tree-sitter version ` +
          `(built for an older tree-sitter ABI) — rebuild it or install a matching tree-sitter-wasms release.`;
      return null;
    }
  }

  /** Parse file content into a tree-sitter AST. Throws for unsupported languages or a parse failure. */
  async parse(content: string, filePath: string): Promise<Tree> {
    await this.init();
    const langName = getLanguageNameForFile(filePath);
    if (!langName) throw new Error(`Unsupported file type: ${filePath}`);
    if (this.currentLanguage !== langName) {
      const lang = await this.loadLanguage(langName);
      if (!lang) throw new Error(`Language not available: ${langName}. ${this.lastLoadError ?? 'WASM grammar not found.'}`);
      this.parser!.setLanguage(lang);
      this.currentLanguage = langName;
    }
    this.lastParsedLanguage = langName;
    const tree = this.parser!.parse(content);
    if (!tree) throw new Error(`Tree-sitter failed to parse: ${filePath}`);
    return tree;
  }

  /**
   * Hierarchical outline with start+end positions. `exported` is set ONLY on
   * top-level entries (direct children of the source file) — never inherited
   * onto nested class/interface/namespace members.
   */
  getOutline(tree: Tree, filePath: string): OutlineNode[] {
    const language = getLanguageNameForFile(filePath) ?? this.lastParsedLanguage ?? 'typescript';
    const rootNode = tree.rootNode;

    const buildOutline = (node: Node, topLevel: boolean): OutlineNode[] => {
      if (!node?.type) return [];
      const nodes: OutlineNode[] = [];
      const kind = mapNodeTypeToKind(node.type, language);

      if (kind) {
        const name = extractSymbolName(node);
        if (name) {
          const outlineNode: OutlineNode = {
            name,
            kind,
            start: toPosition(node.startPosition),
            end: toPosition(node.endPosition),
            signature: extractSignature(node),
          };
          // Honest exported flags: only top-level declarations carry the flag.
          if (topLevel) outlineNode.exported = isDirectlyExported(node);

          if (kind === 'class' || kind === 'interface' || kind === 'namespace') {
            const children: OutlineNode[] = [];
            for (let i = 0; i < node.childCount; i++) {
              const child = node.child(i);
              if (child) children.push(...buildOutline(child, false));
            }
            if (children.length > 0) outlineNode.children = children;
          }

          nodes.push(outlineNode);
          return nodes;
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) nodes.push(...buildOutline(child, topLevel));
      }
      return nodes;
    };

    return buildOutline(rootNode, true);
  }

  /** The innermost enclosing function/method range for a 1-indexed line, or null. */
  getEnclosingFunction(tree: Tree, line: number): Range | null {
    const targetLine = line - 1;
    let enclosingFunc: Node | null = null;
    const findEnclosing = (node: Node): void => {
      if (node.startPosition.row <= targetLine && node.endPosition.row >= targetLine) {
        if (
          node.type === 'function_declaration' ||
          node.type === 'function_expression' ||
          node.type === 'arrow_function' ||
          node.type === 'method_definition'
        ) {
          enclosingFunc = node;
        }
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) findEnclosing(child);
        }
      }
    };
    findEnclosing(tree.rootNode);
    return enclosingFunc ? toRange(enclosingFunc) : null;
  }

  /** The innermost enclosing class/interface range for a 1-indexed line, or null. */
  getEnclosingClass(tree: Tree, line: number): Range | null {
    const targetLine = line - 1;
    let enclosingClass: Node | null = null;
    const findEnclosing = (node: Node): void => {
      if (node.startPosition.row <= targetLine && node.endPosition.row >= targetLine) {
        if (
          node.type === 'class_declaration' ||
          node.type === 'class' ||
          node.type === 'interface_declaration'
        ) {
          enclosingClass = node;
        }
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child) findEnclosing(child);
        }
      }
    };
    findEnclosing(tree.rootNode);
    return enclosingClass ? toRange(enclosingClass) : null;
  }
}
