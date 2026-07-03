/**
 * structural_edit — intel tool 15, the ONE write surface on an otherwise
 * read-only server (plan §14.B; carve-out §8 addendum lane 10).
 *
 * Two-step, preview-gated contract:
 *   action "preview" — run the match engine across the batch, return a per-entry
 *     unified diff, a single-use `preview_token`, and each file's content hash.
 *     Writes NOTHING.
 *   action "apply"   — take the token, re-hash every file, and write. Any file
 *     changed since preview is refused per-entry (`refused_stale`) — never
 *     silently re-matched. In atomic mode (default) any non-applied entry rolls
 *     the whole batch back from pre-apply snapshots and returns `success:false`
 *     with the rolled-back entries reported first-class (the v1 issue-7 lesson).
 *
 * Only the three permitted modes ship: `exact`, `ast` (TypeScript-compiler node
 * matching), `ast_pattern` (ast-grep — degrades to an honest "unavailable"
 * error in this build; see engine). No fuzzy, no regex.
 *
 * Every filesystem interaction goes through `base_path` and echoes each entry's
 * absolute `resolved_path` (field issue 1); the handler runs under `withBudget`
 * (field issue 9); bytes outside an edit span are preserved exactly, including
 * CRLF (the v1 silent-conversion lesson).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createTwoFilesPatch } from 'diff';
import type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from './types.js';
import {
  successEnvelope,
  errorEnvelope,
  toCallToolResult,
  type Envelope,
} from '@goodvibes/core/envelope';
import { withBudget } from '@goodvibes/core/proc';
import { loadConfig } from '@goodvibes/core/config';
import { resolveInputPath } from '@goodvibes/core/fsx';
import { ensureArray, resolveStringOrBase64 } from '../lib/args.js';
import { resolveWorkDir } from '../lib/workdir.js';
import { computeEdit, type EditMatchMode, type Occurrence } from '../edit/engine.js';
import {
  saveToken,
  loadAndConsumeToken,
  sweepExpiredTokens,
  newTokenId,
  sha256,
  type PreviewToken,
  type PreviewEntryRecord,
  type PreviewFileRecord,
} from '../edit/tokens.js';

type Transaction = 'atomic' | 'partial';

interface EditSpec {
  id?: string;
  path?: string;
  find?: string;
  find_base64?: string;
  replace?: string;
  replace_base64?: string;
  occurrence?: Occurrence;
  language?: string;
}

interface StructuralEditInput {
  action?: 'preview' | 'apply';
  edits?: EditSpec[];
  base_path?: string;
  transaction?: Transaction;
  match?: { mode?: EditMatchMode; case_sensitive?: boolean };
  output?: { context?: number; max_tokens?: number };
  preview_token?: string;
}

const VALID_MODES: EditMatchMode[] = ['exact', 'ast', 'ast_pattern'];

/** A per-diff character cap so a huge node replacement cannot blow the response
 *  budget. Derived from `output.max_tokens` (≈3.5 chars/token) split across the
 *  batch, floored so a diff is always at least glanceable. */
function diffCharCap(maxTokens: number, entryCount: number): number {
  return Math.max(1200, Math.floor((maxTokens * 3.5) / Math.max(1, entryCount)));
}

function truncateDiff(diff: string, cap: number): { diff: string; truncated: boolean } {
  if (diff.length <= cap) {return { diff, truncated: false };}
  const head = Math.floor(cap * 0.6);
  const tail = Math.floor(cap * 0.25);
  return {
    diff: `${diff.slice(0, head)}\n... [diff truncated — full content via code_read] ...\n${diff.slice(-tail)}`,
    truncated: true,
  };
}

// ── preview ────────────────────────────────────────────────────────────────

interface PreviewEntryOut {
  id?: string;
  status: 'ready' | 'no_match' | 'error';
  resolved_path: string;
  match_count: number;
  diff?: string;
  diff_truncated?: boolean;
  error: string | null;
}

async function runPreview(input: StructuralEditInput, startedAt: number): Promise<CallToolResult> {
  const { workDir, warning: baseWarning } = await resolveWorkDir(input.base_path);

  const edits = ensureArray<EditSpec>(input.edits) ?? [];
  if (edits.length === 0) {
    return toCallToolResult(
      errorEnvelope("Missing required parameter 'edits'. Expected: array of { path, find, replace }.", {
        execution_ms: Math.round(performance.now() - startedAt),
      }),
    );
  }

  const mode = (input.match?.mode ?? 'exact') as EditMatchMode;
  if (!VALID_MODES.includes(mode)) {
    return toCallToolResult(
      errorEnvelope(
        `Invalid match.mode '${mode}'. structural_edit supports only: ${VALID_MODES.join(', ')} (no fuzzy, no regex).`,
        { execution_ms: Math.round(performance.now() - startedAt) },
      ),
    );
  }
  const caseSensitive = input.match?.case_sensitive ?? true;
  const transaction: Transaction = input.transaction === 'partial' ? 'partial' : 'atomic';
  const cfg = loadConfig();
  const maxTokens = input.output?.max_tokens ?? cfg.max_tokens_default;
  const context = input.output?.context ?? 3;
  const cap = diffCharCap(maxTokens, edits.length);

  // Read each unique file once; keep a working content map so multiple entries
  // on the same file are computed sequentially (entry N sees entry N-1's edit).
  const originalContent = new Map<string, string | null>();
  const workingContent = new Map<string, string>();

  const entriesOut: Record<string, PreviewEntryOut> = {};
  const entryRecords: PreviewEntryRecord[] = [];
  const touchedFiles = new Map<string, PreviewFileRecord>();

  let readyCount = 0;
  let noMatchCount = 0;
  let errorCount = 0;
  let anyTruncated = false;

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    const key = edit.id != null && edit.id !== '' ? String(edit.id) : String(i);

    let entryOut: PreviewEntryOut;
    let record: PreviewEntryRecord;

    try {
      if (!edit.path || typeof edit.path !== 'string') {
        throw new Error(`edits[${i}].path is required and must be a string.`);
      }
      const find = resolveStringOrBase64(edit as unknown as Record<string, unknown>, 'find');
      const replace = resolveStringOrBase64(edit as unknown as Record<string, unknown>, 'replace');
      if (find == null) {throw new Error(`edits[${i}].find is required (provide find or find_base64).`);}
      if (replace == null) {throw new Error(`edits[${i}].replace is required (provide replace or replace_base64).`);}

      const resolved = resolveInputPath(edit.path, workDir).resolved_path;

      // Read + hash the file the first time we touch it.
      if (!originalContent.has(resolved)) {
        let content: string | null;
        try {
          content = await fs.readFile(resolved, 'utf-8');
        } catch {
          content = null;
        }
        originalContent.set(resolved, content);
        if (content !== null) {workingContent.set(resolved, content);}
        touchedFiles.set(resolved, {
          resolved_path: resolved,
          hash: content !== null ? sha256(content) : '',
          existed: content !== null,
        });
      }

      if (originalContent.get(resolved) === null) {
        throw new Error(`file not found or unreadable: '${resolved}'.`);
      }

      const before = workingContent.get(resolved)!;
      const computed = await computeEdit(before, {
        filePath: resolved,
        find,
        replace,
        mode,
        occurrence: edit.occurrence ?? 'first',
        caseSensitive,
        language: edit.language,
      });

      if (computed.status === 'error') {
        entryOut = { id: edit.id, status: 'error', resolved_path: resolved, match_count: 0, error: computed.error ?? 'edit failed' };
        record = { key, id: edit.id, path: edit.path, resolved_path: resolved, status: 'error', match_count: 0, error: computed.error };
        errorCount++;
      } else if (computed.status === 'no_match') {
        entryOut = { id: edit.id, status: 'no_match', resolved_path: resolved, match_count: 0, error: null };
        record = { key, id: edit.id, path: edit.path, resolved_path: resolved, status: 'no_match', match_count: 0 };
        noMatchCount++;
      } else {
        const after = computed.newContent!;
        workingContent.set(resolved, after); // sequential edits on the same file
        const relName = path.relative(workDir, resolved) || path.basename(resolved);
        const rawDiff = createTwoFilesPatch(relName, relName, before, after, '', '', { context });
        const { diff, truncated } = truncateDiff(rawDiff, cap);
        if (truncated) {anyTruncated = true;}
        entryOut = {
          id: edit.id,
          status: 'ready',
          resolved_path: resolved,
          match_count: computed.matchCount,
          diff,
          ...(truncated ? { diff_truncated: true } : {}),
          error: null,
        };
        record = { key, id: edit.id, path: edit.path, resolved_path: resolved, status: 'ready', match_count: computed.matchCount };
        readyCount++;
      }
    } catch (err) {
      const resolvedGuess = edit.path ? resolveInputPath(edit.path, workDir).resolved_path : '';
      entryOut = { id: edit.id, status: 'error', resolved_path: resolvedGuess, match_count: 0, error: (err as Error).message };
      record = { key, id: edit.id, path: edit.path ?? '', resolved_path: resolvedGuess, status: 'error', match_count: 0, error: (err as Error).message };
      errorCount++;
    }

    entriesOut[key] = entryOut;
    entryRecords.push(record);
  }

  // Final post-edit content per file (only files that have >=1 ready edit).
  const computedContent: Record<string, string> = {};
  for (const [resolved, content] of workingContent) {
    if (content !== (originalContent.get(resolved) ?? content)) {
      computedContent[resolved] = content;
    }
  }

  const now = Date.now();
  const token: PreviewToken = {
    token: newTokenId(),
    created_at: now,
    expires_at: now + 10 * 60 * 1000,
    transaction,
    mode,
    base_path: input.base_path,
    files: Array.from(touchedFiles.values()),
    entries: entryRecords,
    computed: computedContent,
  };
  await saveToken(token);
  void sweepExpiredTokens(now); // opportunistic cleanup, never blocks

  const data = {
    action: 'preview' as const,
    preview_token: token.token,
    expires_at: token.expires_at,
    expires_in_seconds: Math.round((token.expires_at - now) / 1000),
    transaction,
    mode,
    entries: entriesOut,
    files: token.files.map((f) => ({ resolved_path: f.resolved_path, hash: f.hash, existed: f.existed })),
    summary: {
      entries: edits.length,
      ready: readyCount,
      no_match: noMatchCount,
      error: errorCount,
      files: token.files.length,
    },
    next: readyCount > 0
      ? `Call structural_edit action:"apply" with preview_token:"${token.token}" within 10 minutes to write ${readyCount} ready edit(s).`
      : 'No ready edits — nothing to apply.',
  };

  const env: Envelope<typeof data> = successEnvelope(data, {
    execution_ms: Math.round(performance.now() - startedAt),
    ...(anyTruncated ? { truncated: true, effective_caps: { max_tokens: maxTokens } } : {}),
  });
  if (baseWarning) {env.warning = baseWarning;}
  return toCallToolResult(env);
}

// ── apply ──────────────────────────────────────────────────────────────────

type ApplyStatus = 'applied' | 'refused_stale' | 'rolled_back' | 'failed';

interface ApplyEntryOut {
  id?: string;
  status: ApplyStatus;
  resolved_path: string;
  bytes_written?: number;
  error: string | null;
}

async function runApply(input: StructuralEditInput, startedAt: number): Promise<CallToolResult> {
  const token = input.preview_token;
  if (!token || typeof token !== 'string') {
    return toCallToolResult(
      errorEnvelope("Missing required parameter 'preview_token'. Run action:\"preview\" first to obtain one.", {
        execution_ms: Math.round(performance.now() - startedAt),
      }),
    );
  }

  // Single-use: this both reads and deletes the token.
  const record = await loadAndConsumeToken(token);
  if (!record) {
    return toCallToolResult(
      errorEnvelope(
        'Invalid or already-used preview token. Preview tokens are single-use; run action:"preview" again for a fresh one.',
        { execution_ms: Math.round(performance.now() - startedAt) },
      ),
    );
  }

  const now = Date.now();
  if (now > record.expires_at) {
    return toCallToolResult(
      errorEnvelope('Preview token expired (tokens are valid for 10 minutes). Run action:"preview" again.', {
        execution_ms: Math.round(performance.now() - startedAt),
      }),
    );
  }

  // Re-read + re-hash every touched file; a changed hash means the file moved
  // under us since preview → its entries are refused, never re-matched.
  const currentSnapshot = new Map<string, string | null>();
  const staleFiles = new Set<string>();
  for (const f of record.files) {
    let current: string | null;
    try {
      current = await fs.readFile(f.resolved_path, 'utf-8');
    } catch {
      current = null;
    }
    currentSnapshot.set(f.resolved_path, current);
    const currentHash = current !== null ? sha256(current) : '';
    if (currentHash !== f.hash) {staleFiles.add(f.resolved_path);}
  }

  const transaction = record.transaction;

  // Classify each entry. `pending` entries (ready + fresh file) are the ones we
  // would write; anything else is decided up front.
  interface Classified {
    key: string;
    id?: string;
    resolved_path: string;
    outcome: 'pending' | 'refused_stale' | 'failed';
    error?: string;
  }
  const classified: Classified[] = record.entries.map((e) => {
    if (e.status !== 'ready') {
      return {
        key: e.key,
        id: e.id,
        resolved_path: e.resolved_path,
        outcome: 'failed',
        error: e.error ?? `entry was '${e.status}' at preview and cannot be applied`,
      };
    }
    if (staleFiles.has(e.resolved_path)) {
      return {
        key: e.key,
        id: e.id,
        resolved_path: e.resolved_path,
        outcome: 'refused_stale',
        error: 'file changed since preview; refused (never silently re-matched)',
      };
    }
    return { key: e.key, id: e.id, resolved_path: e.resolved_path, outcome: 'pending' };
  });

  const anyBlocked = classified.some((c) => c.outcome !== 'pending');
  const freshFilesToWrite = new Set<string>();
  for (const c of classified) {
    if (c.outcome === 'pending') {freshFilesToWrite.add(c.resolved_path);}
  }

  const entriesOut: Record<string, ApplyEntryOut> = {};
  const filesWritten: string[] = [];

  const finalize = (success: boolean, errorMsg?: string): CallToolResult => {
    const summary = { applied: 0, refused_stale: 0, rolled_back: 0, failed: 0 };
    for (const out of Object.values(entriesOut)) {summary[out.status]++;}
    const data = {
      action: 'apply' as const,
      transaction,
      entries: entriesOut,
      files_written: filesWritten,
      summary,
    };
    const env: Envelope<typeof data> = {
      success,
      data,
      ...(errorMsg ? { error: errorMsg } : {}),
      meta: { token_estimate: 0, execution_ms: Math.round(performance.now() - startedAt) },
    };
    return toCallToolResult(env);
  };

  const bytesOf = (resolved: string): number =>
    Buffer.byteLength(record.computed[resolved] ?? '', 'utf-8');

  // ── ATOMIC ──────────────────────────────────────────────────────────────
  if (transaction === 'atomic') {
    if (!anyBlocked) {
      // All entries can apply: write each fresh file's final content once.
      try {
        for (const resolved of freshFilesToWrite) {
          await fs.writeFile(resolved, record.computed[resolved] ?? '', 'utf-8');
          filesWritten.push(resolved);
        }
      } catch (err) {
        // A write threw mid-batch: restore everything we wrote from snapshots.
        await restoreSnapshots(filesWritten, currentSnapshot);
        for (const c of classified) {
          entriesOut[c.key] = {
            id: c.id,
            status: 'rolled_back',
            resolved_path: c.resolved_path,
            error: 'atomic batch rolled back after a write error',
          };
        }
        // The entry whose write failed is reported as failed, not rolled_back.
        return finalize(false, `Atomic batch rolled back: write failed (${(err as Error).message}).`);
      }
      for (const c of classified) {
        entriesOut[c.key] = {
          id: c.id,
          status: 'applied',
          resolved_path: c.resolved_path,
          bytes_written: bytesOf(c.resolved_path),
          error: null,
        };
      }
      return finalize(true);
    }

    // At least one entry is blocked (stale or preview-failed). Atomicity forbids
    // a partial write: stage the fresh files, then roll them ALL back from
    // pre-apply snapshots so the tree is exactly as we found it. This genuinely
    // exercises the snapshot-restore path (the v1 issue-7 regression).
    const stagedWrites: string[] = [];
    try {
      for (const resolved of freshFilesToWrite) {
        await fs.writeFile(resolved, record.computed[resolved] ?? '', 'utf-8');
        stagedWrites.push(resolved);
      }
    } catch {
      /* fall through to restore whatever was staged */
    }
    await restoreSnapshots(stagedWrites, currentSnapshot);

    const staleCount = classified.filter((c) => c.outcome === 'refused_stale').length;
    for (const c of classified) {
      if (c.outcome === 'refused_stale') {
        entriesOut[c.key] = { id: c.id, status: 'refused_stale', resolved_path: c.resolved_path, error: c.error ?? null };
      } else if (c.outcome === 'failed') {
        entriesOut[c.key] = { id: c.id, status: 'failed', resolved_path: c.resolved_path, error: c.error ?? 'entry failed' };
      } else {
        // Would have applied, but the atomic batch aborted → rolled back.
        entriesOut[c.key] = {
          id: c.id,
          status: 'rolled_back',
          resolved_path: c.resolved_path,
          error: 'atomic batch aborted by another entry; this file was restored from its pre-apply snapshot',
        };
      }
    }
    const reason = staleCount > 0
      ? `Atomic batch rolled back: ${staleCount} file(s) changed since preview (refused_stale).`
      : 'Atomic batch rolled back: one or more entries could not be applied.';
    return finalize(false, reason);
  }

  // ── PARTIAL ──────────────────────────────────────────────────────────────
  // Independent entries: apply what we can, report the rest per-entry, no rollback.
  for (const resolved of freshFilesToWrite) {
    let ok = true;
    let writeError = '';
    try {
      await fs.writeFile(resolved, record.computed[resolved] ?? '', 'utf-8');
      filesWritten.push(resolved);
    } catch (err) {
      ok = false;
      writeError = (err as Error).message;
    }
    for (const c of classified) {
      if (c.outcome === 'pending' && c.resolved_path === resolved) {
        entriesOut[c.key] = ok
          ? { id: c.id, status: 'applied', resolved_path: resolved, bytes_written: bytesOf(resolved), error: null }
          : { id: c.id, status: 'failed', resolved_path: resolved, error: `write failed: ${writeError}` };
      }
    }
  }
  for (const c of classified) {
    if (c.outcome === 'refused_stale') {
      entriesOut[c.key] = { id: c.id, status: 'refused_stale', resolved_path: c.resolved_path, error: c.error ?? null };
    } else if (c.outcome === 'failed') {
      entriesOut[c.key] = { id: c.id, status: 'failed', resolved_path: c.resolved_path, error: c.error ?? 'entry failed' };
    }
  }
  const applied = Object.values(entriesOut).some((e) => e.status === 'applied');
  const anyFailed = Object.values(entriesOut).some((e) => e.status === 'failed');
  const success = applied && !anyFailed;
  const errMsg = success
    ? undefined
    : anyFailed
      ? 'One or more entries failed in partial mode.'
      : 'No entries applied (all refused_stale or failed).';
  return finalize(success, errMsg);
}

/** Restore each written path from its pre-apply snapshot (null = it did not exist). */
async function restoreSnapshots(written: string[], snapshots: Map<string, string | null>): Promise<void> {
  for (const resolved of written) {
    const snap = snapshots.get(resolved);
    try {
      if (snap === null || snap === undefined) {
        await fs.unlink(resolved).catch(() => {});
      } else {
        await fs.writeFile(resolved, snap, 'utf-8');
      }
    } catch {
      /* best-effort restore; the envelope already reports rolled_back */
    }
  }
}

// ── dispatch ────────────────────────────────────────────────────────────────

async function run(args: unknown): Promise<CallToolResult> {
  const start = performance.now();
  const input = (args ?? {}) as StructuralEditInput;
  const action = input.action;
  try {
    if (action === 'preview') {return await runPreview(input, start);}
    if (action === 'apply') {return await runApply(input, start);}
    return toCallToolResult(
      errorEnvelope(
        `Missing or invalid 'action'. Expected "preview" or "apply" (got ${JSON.stringify(action)}). ` +
          'structural_edit is preview-gated: preview first, then apply the returned token.',
        { execution_ms: Math.round(performance.now() - start) },
      ),
    );
  } catch (err) {
    return toCallToolResult(
      errorEnvelope((err as Error).message, { execution_ms: Math.round(performance.now() - start) }),
    );
  }
}

const definition: Tool = {
  name: 'structural_edit',
  description:
    'The ONE write tool on this read-only server — a preview-gated, AST-aware editor. Two steps: action:"preview" ' +
    'returns a per-entry unified diff, a single-use preview_token, and each file\'s content hash WITHOUT writing; ' +
    'action:"apply" takes that token, re-checks every hash, and writes. A file changed since preview is refused ' +
    '(refused_stale), never silently re-matched. Atomic mode (default) rolls the whole batch back from pre-apply ' +
    'snapshots if any entry cannot apply, returning success:false. Modes: exact (byte-exact string), ast ' +
    '(TypeScript-compiler node matching), ast_pattern (ast-grep — unavailable unless @ast-grep/napi is installed). ' +
    'No fuzzy, no regex. Newlines/CRLF outside edit spans are preserved byte-for-byte.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['preview', 'apply'],
        description: 'preview (compute diffs + token, no write) or apply (write using a preview_token).',
      },
      edits: {
        type: 'array',
        description: 'preview only: the batch of edits. Results are keyed by id (or array index), never collapsed.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Optional stable key for this entry (defaults to its array index).' },
            path: { type: 'string', description: 'File to edit, relative to base_path.' },
            find: { type: 'string', description: 'Pattern to match (exact string, or an ast/ast_pattern selector).' },
            find_base64: { type: 'string', description: 'Base64 alternate to find (mutually exclusive).' },
            replace: { type: 'string', description: 'Replacement text.' },
            replace_base64: { type: 'string', description: 'Base64 alternate to replace (mutually exclusive).' },
            occurrence: {
              description: 'Which matches to replace: "first" (default), "last", "all", or a 1-based number.',
            },
            language: { type: 'string', description: 'ast_pattern only: override the language auto-detection.' },
          },
          required: ['path'],
        },
      },
      base_path: {
        type: 'string',
        description: 'Root that edit paths resolve against; omitting it falls back to the server cwd with a warning.',
      },
      transaction: {
        type: 'string',
        enum: ['atomic', 'partial'],
        default: 'atomic',
        description: 'atomic: all-or-nothing with rollback (default). partial: apply what can apply, report the rest.',
      },
      match: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['exact', 'ast', 'ast_pattern'], default: 'exact' },
          case_sensitive: { type: 'boolean', default: true, description: 'exact mode only.' },
        },
      },
      output: {
        type: 'object',
        properties: {
          context: { type: 'number', default: 3, description: 'Unified-diff context lines (preview).' },
          max_tokens: { type: 'number', description: 'Caps preview diff size; large diffs truncate with a note.' },
        },
      },
      preview_token: {
        type: 'string',
        description: 'apply only: the single-use token returned by a prior preview call.',
      },
    },
    required: ['action'],
  },
};

/** Budget wrapper: a structural edit that overruns returns an honest error
 *  rather than hanging the client (field issue 9). The write path itself is
 *  fast; the budget mainly guards pathological AST parses on huge inputs. */
export async function handler(args: unknown): Promise<CallToolResult> {
  const start = performance.now();
  const cfg = loadConfig();
  const outcome = await withBudget(cfg.budgets.analyzer_ms, async () => run(args));
  if (outcome.budget_exceeded) {
    return toCallToolResult(
      errorEnvelope('structural_edit exceeded its time budget before completing.', {
        execution_ms: Math.round(performance.now() - start),
        budget_exceeded: true,
      }),
    );
  }
  return outcome.value;
}

/** Registration entry consumed by `src/index.ts`. */
export const structuralEditTool: ToolDefinition = { definition, handler };
