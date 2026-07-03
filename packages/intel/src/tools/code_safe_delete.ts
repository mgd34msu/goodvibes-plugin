/**
 * `code_safe_delete` — is the symbol at a position safe to delete?
 *
 * Ports project-engine `extensions/code-intel/safe-delete.ts` onto the shared
 * compiler host (§3.3, §4.1).
 *
 * HARD REQUIREMENT (verified during port): the reference check is the
 * TypeScript LanguageService semantic engine — `service.getReferencesAtPosition`
 * — NOT a text/regex scan. A regex approach would miss aliased imports and
 * flag string/comment coincidences; only the compiler resolves the actual
 * symbol. If this call is ever swapped for a textual scan the tool is wrong and
 * must not ship. See the reference categorization below and `host/references.ts`.
 *
 * v2 wrappers per the port row: `base_path`/`resolved_path` echo (issue 1),
 * `core/proc` budget, `core/envelope` accounting.
 *
 * @module tools/code_safe_delete
 */

import * as fs from 'node:fs/promises';

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from './types.js';
import {
  successEnvelope,
  errorEnvelope,
  toCallToolResult,
  startTimer,
} from '@goodvibes/core/envelope';
import { resolveBaseDir, resolveInputPath } from '@goodvibes/core/fsx';
import { loadConfig } from '@goodvibes/core/config';
import { withBudget } from '@goodvibes/core/proc';

import {
  getCompilerHost,
  toTsPath,
  makeRelativePath,
  toOffset,
  toLineColumn,
  getLinePreview,
  isDefinitionRef,
  isInSameDeclaration,
  validatePositionArgs,
  type ReferenceLocation,
  type SafeDeleteResult,
} from '../host/index.js';

interface CodeSafeDeleteData extends SafeDeleteResult {
  /** Absolute resolved path of the analyzed file (issue 1 fix #3). */
  resolved_path: string;
}

/** Extract the identifier token spanning `offset` in `text`, or undefined. */
function identifierAt(text: string, offset: number): string | undefined {
  if (offset < 0 || offset > text.length) {return undefined;}
  const isWord = (c: string): boolean => /[A-Za-z0-9_$]/.test(c);
  let start = offset;
  while (start > 0 && isWord(text[start - 1])) {start--;}
  let end = offset;
  while (end < text.length && isWord(text[end])) {end++;}
  const word = text.slice(start, end);
  return word.length > 0 ? word : undefined;
}

const definition: Tool = {
  name: 'code_safe_delete',
  description:
    'Use before deleting a symbol to see every reference that would break, instead of grepping and hoping. Check whether the symbol at a file position can be safely deleted. Uses the ' +
    'TypeScript LanguageService reference engine (semantic, compiler-resolved — not a ' +
    'text search) to find every usage, then splits them into blocking external ' +
    'references and non-blocking self-references. `safe: true` means no other file ' +
    'uses the symbol. Static analysis; nothing is deleted or executed.',
  inputSchema: {
    type: 'object',
    properties: {
      base_path: {
        type: 'string',
        description: 'Absolute project root. Relative paths resolve against it.',
      },
      file: {
        type: 'string',
        description: 'File containing the symbol (relative to base_path or absolute).',
      },
      line: { type: 'number', description: '1-based line of the symbol.' },
      column: { type: 'number', description: '1-based column of the symbol.' },
    },
    required: ['file', 'line', 'column'],
  },
};

/**
 * The `code_safe_delete` handler.
 * @param rawArgs - MCP tool arguments (validated here)
 */
export async function handler(rawArgs: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const cfg = loadConfig();

  const validated = validatePositionArgs(rawArgs);
  if (!validated.valid) {
    return toCallToolResult(errorEnvelope(validated.error));
  }
  const { file, line, column } = validated.value;

  const args = rawArgs as { base_path?: string };
  const baseDir = resolveBaseDir(args.base_path);
  const resolved = resolveInputPath(file, args.base_path);
  const absFile = resolved.resolved_path;

  const stat = await fs.stat(absFile).catch(() => null);
  if (!stat || !stat.isFile()) {
    return toCallToolResult(errorEnvelope(`File not found: ${absFile}`));
  }

  try {
    const outcome = await withBudget(cfg.budgets.analyzer_ms, async () => {
      const host = getCompilerHost();
      const { service, program } = host.getServiceForFile(absFile);
      const normalized = toTsPath(absFile);
      const sourceFile = program.getSourceFile(normalized);
      if (!sourceFile) {
        return { ok: false as const, error: `Could not load source file: ${absFile}` };
      }

      let position: number;
      try {
        position = toOffset(sourceFile, line, column);
      } catch {
        return { ok: false as const, error: `Position ${line}:${column} is out of range for ${absFile}` };
      }

      // Resolve the symbol name from the identifier token at the position. This
      // is precise; the v1 quick-info signature heuristic returned the leading
      // keyword (e.g. "function") for functions and is not used.
      const symbolName = identifierAt(sourceFile.text, position);

      // ── The semantic reference check (LanguageService, NOT regex) ───────────
      const references = service.getReferencesAtPosition(normalized, position);

      if (!references || references.length === 0) {
        const result: CodeSafeDeleteData = {
          safe: true,
          resolved_path: absFile,
          external_references: [],
          self_references: [],
          reason: 'No references found. The symbol may not exist or is not referenceable.',
          symbol: symbolName,
        };
        return { ok: true as const, result };
      }

      // Locate the definition (to classify self vs external references).
      let definitionFile: string | undefined;
      let definitionLine: number | undefined;
      for (const ref of references) {
        if (isDefinitionRef(ref)) {
          definitionFile = ref.fileName;
          const defSource = program.getSourceFile(ref.fileName);
          if (defSource) {definitionLine = toLineColumn(defSource, ref.textSpan.start).line;}
          break;
        }
      }
      if (!definitionFile) {
        definitionFile = normalized;
        definitionLine = line;
      }

      const externalReferences: ReferenceLocation[] = [];
      const selfReferences: ReferenceLocation[] = [];

      for (const ref of references) {
        if (isDefinitionRef(ref)) {continue;}
        const refSource = program.getSourceFile(ref.fileName);
        if (!refSource) {continue;}

        const { line: refLine, column: refColumn } = toLineColumn(refSource, ref.textSpan.start);

        // Skip a reference sitting inside the declaration itself.
        if (
          definitionFile &&
          definitionLine !== undefined &&
          isInSameDeclaration(ref.fileName, refLine, definitionFile, definitionLine)
        ) {
          continue;
        }

        const location: ReferenceLocation = {
          file: makeRelativePath(ref.fileName, baseDir),
          resolved_path: ref.fileName,
          line: refLine,
          column: refColumn,
          preview: getLinePreview(service, ref.fileName, refLine),
        };

        if (toTsPath(definitionFile) === toTsPath(ref.fileName)) {
          selfReferences.push(location);
        } else {
          externalReferences.push(location);
        }
      }

      const sortRefs = (refs: ReferenceLocation[]): void => {
        refs.sort(
          (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
        );
      };
      sortRefs(externalReferences);
      sortRefs(selfReferences);

      const safe = externalReferences.length === 0;
      const reason = safe
        ? selfReferences.length > 0
          ? `Only self-references found (${selfReferences.length} recursive usage(s)). Symbol can be safely deleted.`
          : 'No external references found. Symbol can be safely deleted.'
        : `Symbol has ${externalReferences.length} external reference(s). Deletion would break these usages.`;

      const result: CodeSafeDeleteData = {
        safe,
        resolved_path: absFile,
        external_references: externalReferences,
        self_references: selfReferences,
        reason,
        symbol: symbolName,
      };
      return { ok: true as const, result };
    });

    if (!outcome.value.ok) {
      return toCallToolResult(errorEnvelope(outcome.value.error));
    }

    let env = successEnvelope<CodeSafeDeleteData>(outcome.value.result, {
      execution_ms: elapsed(),
      ...(outcome.budget_exceeded ? { budget_exceeded: true } : {}),
    });
    if (resolved.warning) {env = { ...env, warning: resolved.warning };}
    return toCallToolResult(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorEnvelope(`Failed to check safe delete: ${message}`));
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const codeSafeDeleteTool: ToolDefinition = { definition, handler };
