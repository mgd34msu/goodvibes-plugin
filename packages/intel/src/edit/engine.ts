/**
 * structural_edit match/apply engine (lane 10, intel tool 15).
 *
 * Ported from v1 `precision-engine/src/handlers/precision-edit.ts`, carrying
 * ONLY the three modes the plan §14.B allows — and nothing else:
 *  - `exact`       — exact-string matching (the only text mode; no fuzzy, no
 *                    regex, no plain find/replace beyond byte-exact).
 *  - `ast`         — TypeScript-compiler node matching (function / variable /
 *                    method / class / import / type / interface / enum), the
 *                    v1 `astMatch` predicates verbatim.
 *  - `ast_pattern` — ast-grep structural pattern matching. `@ast-grep/napi` is
 *                    NOT installed in this build (nor declared), so this mode
 *                    degrades to an honest "unavailable" error via a lazy,
 *                    non-static import (see `loadAstGrep`); the matching code is
 *                    kept faithful so the mode lights up unchanged if the native
 *                    dep is ever added.
 *
 * CRLF PRESERVATION (the v1 silent-conversion defect, inverted into a
 * regression fixture): v1 normalized the WHOLE file to `\n` and wrote the
 * normalized content back, silently converting CRLF files to LF. This engine
 * never rewrites bytes outside an edit span. Matching runs against a normalized
 * view with an index map back to the ORIGINAL string, so a match span is spliced
 * out of the exact original bytes; the replacement's own newlines are rendered
 * in the file's detected EOL. Everything outside the replaced span is preserved
 * byte-for-byte.
 */

import * as ts from 'typescript';
import * as path from 'path';
import { nativeDepMessage } from '@goodvibes/core/envelope';

/** The three permitted match modes (no fuzzy / no regex, per plan §14.B). */
export type EditMatchMode = 'exact' | 'ast' | 'ast_pattern';

/** Which matched occurrences an entry replaces. */
export type Occurrence = 'first' | 'last' | 'all' | number;

/** A half-open character span `[start, end)` in the ORIGINAL file content.
 *  `replacement`, when present, overrides the entry-level replace template —
 *  ast_pattern uses it to carry per-match metavariable substitutions. */
interface Span {
  start: number;
  end: number;
  replacement?: string;
}

/** The result of computing one entry's edit against a file's current content. */
export interface ComputedEdit {
  /** `ready` when at least one match was replaced; `no_match` when the pattern
   *  matched nothing; `error` when the mode could not run (e.g. ast_pattern
   *  unavailable, or a non-JS/TS file in ast mode). */
  status: 'ready' | 'no_match' | 'error';
  /** Full new file content after this entry (present only when `ready`). */
  newContent?: string;
  /** How many occurrences were replaced. */
  matchCount: number;
  /** Human-readable reason when `status` is `error`. */
  error?: string;
}

function isJavaScriptFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'].includes(ext);
}

function getScriptKind(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.ts':
    case '.mts':
    case '.cts':
      return ts.ScriptKind.TS;
    default:
      return ts.ScriptKind.JS;
  }
}

/** Normalize CRLF/CR to LF (used only for pattern comparison, never for output). */
function toLf(str: string): string {
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** The file's dominant end-of-line marker, used to render replacement text. */
function detectEol(content: string): '\r\n' | '\n' {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

/**
 * Build an LF-normalized view of `original` plus a map from each normalized
 * character index to its index in `original` (with a trailing sentinel equal to
 * `original.length`). A match found at normalized `[ns, ne)` maps to original
 * `[map[ns], map[ne])` — so we splice the exact original bytes and never touch
 * the `\r` characters outside the span.
 */
function normalizeWithMap(original: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let i = 0;
  const len = original.length;
  while (i < len) {
    const code = original.charCodeAt(i);
    if (code === 13 /* \r */) {
      map.push(i);
      norm += '\n';
      i += original.charCodeAt(i + 1) === 10 /* \n */ ? 2 : 1;
    } else {
      map.push(i);
      norm += original[i];
      i += 1;
    }
  }
  map.push(len);
  return { norm, map };
}

/** Exact-string match spans in ORIGINAL coordinates (CRLF-tolerant). */
function exactMatchSpans(original: string, find: string, caseSensitive: boolean): Span[] {
  const { norm, map } = normalizeWithMap(original);
  const needleRaw = toLf(find);
  if (needleRaw.length === 0) return [];
  const hay = caseSensitive ? norm : norm.toLowerCase();
  const needle = caseSensitive ? needleRaw : needleRaw.toLowerCase();
  const spans: Span[] = [];
  let pos = 0;
  for (;;) {
    const found = hay.indexOf(needle, pos);
    if (found === -1) break;
    spans.push({ start: map[found], end: map[found + needle.length] });
    pos = found + needle.length; // non-overlapping
  }
  return spans;
}

/**
 * AST (TypeScript-compiler) match spans in ORIGINAL coordinates. The source is
 * parsed AS-IS (CRLF and all): `node.getStart`/`node.getEnd` are offsets into
 * the exact text we passed, so the spans are already original-accurate with no
 * mapping. Predicates ported verbatim from v1 `astMatch`.
 */
function astMatchSpans(filePath: string, original: string, find: string): Span[] {
  if (!isJavaScriptFile(filePath)) return [];
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      original,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(filePath),
    );
  } catch {
    return [];
  }

  const pattern = toLf(find).trim();
  const spans: Span[] = [];

  const matchesPattern = (node: ts.Node): boolean => {
    const nodeText = node.getText(sourceFile).trim();

    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      return pattern === `function ${name}` || pattern === `async function ${name}` || pattern === name;
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const name = node.name.getText(sourceFile);
      return (
        pattern === `const ${name}` ||
        pattern === `let ${name}` ||
        pattern === `var ${name}` ||
        pattern === name
      );
    }
    if (ts.isMethodDeclaration(node)) {
      const name = node.name.getText(sourceFile);
      return pattern === name || pattern === `async ${name}`;
    }
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      return pattern === `class ${name}` || pattern === `export class ${name}` || pattern === name;
    }
    if (ts.isImportDeclaration(node)) {
      return nodeText.includes(pattern);
    }
    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.getText(sourceFile);
      return pattern === `type ${name}` || pattern === `export type ${name}` || pattern === name;
    }
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.getText(sourceFile);
      return (
        pattern === `interface ${name}` || pattern === `export interface ${name}` || pattern === name
      );
    }
    if (ts.isEnumDeclaration(node)) {
      const name = node.name.getText(sourceFile);
      return pattern === `enum ${name}` || pattern === `export enum ${name}` || pattern === name;
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (matchesPattern(node)) {
      spans.push({ start: node.getStart(sourceFile), end: node.getEnd() });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return spans;
}

/**
 * Lazily load `@ast-grep/napi` without letting TypeScript or esbuild resolve the
 * specifier statically (it is neither declared nor installed in this build). A
 * computed specifier keeps `import()` dynamic; a load failure returns null so
 * `ast_pattern` degrades to an honest error instead of crashing the server.
 */
interface SgPos {
  line: number;
  column: number;
}
interface SgNodeLike {
  range: () => { start: SgPos; end: SgPos };
  text: () => string;
  getMatch: (mvar: string) => SgNodeLike | null;
  getMultipleMatches: (mvar: string) => SgNodeLike[];
}

async function loadAstGrep(): Promise<{
  parse: (lang: unknown, src: string) => { root: () => { findAll: (p: string) => SgNodeLike[] } };
  Lang: Record<string, unknown>;
} | null> {
  try {
    const spec = ['@ast-grep', 'napi'].join('/');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import(spec as string)) as any;
    return mod;
  } catch {
    return null;
  }
}

const AST_GREP_LANG: Record<string, string> = {
  typescript: 'TypeScript',
  tsx: 'Tsx',
  javascript: 'JavaScript',
  jsx: 'JavaScript',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
};

function astGrepLangFor(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  const byExt: Record<string, string> = {
    '.ts': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'jsx',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
  };
  const key = byExt[ext];
  return key ? AST_GREP_LANG[key] ?? null : null;
}

/** ast-grep structural pattern spans (in ORIGINAL coordinates). */
async function astPatternSpans(
  filePath: string,
  original: string,
  pattern: string,
  replaceTemplate: string,
  languageOverride?: string,
): Promise<{ spans: Span[]; available: boolean; reason?: string }> {
  const napi = await loadAstGrep();
  if (!napi) {
    return {
      spans: [],
      available: false,
      reason:
        nativeDepMessage('structural_edit ast_pattern mode') +
        ' Meanwhile, use mode "ast" (TypeScript-compiler node matching) or "exact" — neither needs a native dependency.',
    };
  }
  const langName = languageOverride
    ? AST_GREP_LANG[languageOverride.toLowerCase()] ?? languageOverride
    : astGrepLangFor(filePath);
  if (!langName) {
    return { spans: [], available: true, reason: `ast_pattern: unsupported language for '${filePath}'.` };
  }
  try {
    const langEnum = (napi.Lang as Record<string, unknown>)[langName] ?? langName;
    // ast-grep parses the content as-is; map its line/column ranges through the
    // normalization index map so spans land on original (CRLF-safe) offsets.
    const { norm, map } = normalizeWithMap(original);
    const normLineStarts: number[] = [0];
    for (let i = 0; i < norm.length; i++) {
      if (norm[i] === '\n') normLineStarts.push(i + 1);
    }
    const root = napi.parse(langEnum, norm);
    const matches = root.root().findAll(toLf(pattern));
    const offsetOf = (p: SgPos): number => (normLineStarts[p.line] ?? 0) + p.column;

    // Substitute $NAME / $$$NAME metavariables in the replacement template with
    // each match's captured source text. Multi captures slice the normalized
    // source between the first and last captured node, preserving the original
    // separators. Unresolved tokens are left verbatim.
    const substitute = (m: SgNodeLike): string =>
      toLf(replaceTemplate).replace(
        /\$\$\$([A-Za-z_][A-Za-z0-9_]*)|\$([A-Za-z_][A-Za-z0-9_]*)/g,
        (raw, multi: string | undefined, single: string | undefined) => {
          if (multi !== undefined) {
            const nodes = m.getMultipleMatches(multi);
            if (nodes.length === 0) return '';
            const start = offsetOf(nodes[0].range().start);
            const end = offsetOf(nodes[nodes.length - 1].range().end);
            return norm.slice(start, end);
          }
          const node = single !== undefined ? m.getMatch(single) : null;
          return node ? node.text() : raw;
        },
      );

    const spans: Span[] = [];
    for (const m of matches) {
      const r = m.range().start;
      const normStart = (normLineStarts[r.line] ?? 0) + r.column;
      const normEnd = normStart + toLf(m.text()).length;
      spans.push({
        start: map[normStart] ?? normStart,
        end: map[normEnd] ?? normEnd,
        replacement: substitute(m),
      });
    }
    return { spans, available: true };
  } catch (err) {
    return { spans: [], available: true, reason: `ast_pattern matching failed: ${(err as Error).message}` };
  }
}

/** Select which matched spans an `occurrence` setting replaces, sorted by start. */
function selectSpans(spans: Span[], occurrence: Occurrence): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  if (sorted.length === 0) return [];
  if (occurrence === 'all') return sorted;
  if (occurrence === 'first') return [sorted[0]];
  if (occurrence === 'last') return [sorted[sorted.length - 1]];
  if (typeof occurrence === 'number' && occurrence >= 1 && occurrence <= sorted.length) {
    return [sorted[occurrence - 1]];
  }
  return [];
}

/** Splice replacement text into the original content, preserving every byte
 *  outside the replaced spans. Spans are applied back-to-front so earlier
 *  offsets stay valid. The replacement's newlines are rendered in the file's EOL. */
function applySpans(original: string, spans: Span[], replace: string): string {
  const eol = detectEol(original);
  const render = (text: string): string => toLf(text).replace(/\n/g, eol);
  const defaultReplacement = render(replace);
  let out = original;
  for (const span of [...spans].sort((a, b) => b.start - a.start)) {
    const replacement = span.replacement !== undefined ? render(span.replacement) : defaultReplacement;
    out = out.slice(0, span.start) + replacement + out.slice(span.end);
  }
  return out;
}

/** One entry's edit request, resolved and ready for the engine. */
export interface EditRequest {
  filePath: string;
  find: string;
  replace: string;
  mode: EditMatchMode;
  occurrence: Occurrence;
  caseSensitive: boolean;
  language?: string;
}

/**
 * Compute one entry's edit against `content` (the file's CURRENT content for
 * this entry — later entries on the same file see earlier entries' output).
 * Never writes; returns the full post-edit content and a status.
 */
export async function computeEdit(content: string, req: EditRequest): Promise<ComputedEdit> {
  let spans: Span[];

  if (req.mode === 'ast') {
    if (!isJavaScriptFile(req.filePath)) {
      return {
        status: 'error',
        matchCount: 0,
        error: `ast mode applies only to .ts/.tsx/.js/.jsx files; '${req.filePath}' is not one. Use mode "exact".`,
      };
    }
    spans = astMatchSpans(req.filePath, content, req.find);
  } else if (req.mode === 'ast_pattern') {
    const result = await astPatternSpans(req.filePath, content, req.find, req.replace, req.language);
    if (!result.available) {
      return { status: 'error', matchCount: 0, error: result.reason };
    }
    if (result.reason && result.spans.length === 0) {
      return { status: 'error', matchCount: 0, error: result.reason };
    }
    spans = result.spans;
  } else {
    spans = exactMatchSpans(content, req.find, req.caseSensitive);
  }

  const selected = selectSpans(spans, req.occurrence);
  if (selected.length === 0) {
    return { status: 'no_match', matchCount: 0 };
  }

  const newContent = applySpans(content, selected, req.replace);
  return { status: 'ready', matchCount: selected.length, newContent };
}
