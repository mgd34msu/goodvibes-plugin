/**
 * tag.ts — Handler for the `analytics_tag` MCP tool.
 *
 * Provides multi-tag management backed by the global SQLite database via
 * TagStore. All tag state is persisted across process restarts.
 *
 * Actions:
 *   - `add`    — Add a tag to the current session.
 *   - `remove` — Remove a tag from the current session.
 *   - `list`   — List tags for the current session, or all tags across sessions.
 *   - `auto`   — Suggest tags from JSONL analysis (does not apply them).
 *
 * No module-level state is maintained. All persistence is via GlobalDB.
 */

import type { Aggregator } from '../daemon/aggregator.js';
import type { AnalyticsTagInput } from '../schemas/tools.js';
import { type HandlerResponse, text } from './types.js';
import { TagStore, resolveJsonlPath } from '../data/tag-store.js';
import { initializeGlobalDb } from '../data/db-init.js';
import type { GlobalDB } from '../data/global-db.js';

// ─────────────────────────────────────────────────────────────────────────────
// Module-level DB singleton (lazy-initialized, shared across calls)
// ─────────────────────────────────────────────────────────────────────────────

/** Lazy-loaded GlobalDB instance, shared across all tag handler invocations. */
let _globalDb: GlobalDB | null = null;

/** Pending initialization promise to avoid duplicate concurrent initializations. */
let _initPromise: Promise<GlobalDB> | null = null;

/**
 * Return the shared GlobalDB instance, initializing it on first call.
 *
 * @returns Initialized GlobalDB ready for tag operations.
 */
async function getGlobalDb(): Promise<GlobalDB> {
  if (_globalDb) return _globalDb;
  if (_initPromise) return _initPromise;
  _initPromise = initializeGlobalDb().then((db) => {
    _globalDb = db;
    _initPromise = null;
    return db;
  });
  return _initPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle the `analytics_tag` MCP tool.
 *
 * Dispatches to the appropriate action handler based on `input.action`.
 * All persistence is via {@link TagStore} backed by the global SQLite DB.
 *
 * @param aggregator   - The running Aggregator instance (provides session ID).
 * @param input        - Validated AnalyticsTagInput from the MCP tool call.
 * @param goodvibesDir - Path to the .goodvibes directory (used for config).
 * @returns MCP tool response with confirmation or result text.
 */
export async function handleTag(
  aggregator: Aggregator,
  input: AnalyticsTagInput,
  _goodvibesDir: string,
): Promise<HandlerResponse> {
  try {
    const db = await getGlobalDb();
    const store = new TagStore(db);
    const state = aggregator.getState();
    const sessionId = state.session_id;

    switch (input.action) {
      case 'add':    return handleAdd(store, sessionId, input.value!);
      case 'remove': return handleRemove(store, sessionId, input.value!);
      case 'list':   return handleList(store, sessionId, input.scope ?? 'session');
      case 'auto':   return handleAuto(store, sessionId);
      default: {
        // TypeScript exhaustiveness — should never reach here
        const _exhaustive: never = input.action;
        return text(`analytics_tag: unknown action "${String(_exhaustive)}"`);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return text(`analytics_tag error: ${message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a tag to the current session and confirm with the updated tag list.
 *
 * @param store     - TagStore instance.
 * @param sessionId - Current session ID.
 * @param tagValue  - Tag string to add.
 */
function handleAdd(
  store: TagStore,
  sessionId: string,
  tagValue: string,
): HandlerResponse {
  store.addTag(sessionId, tagValue, 'manual');
  const currentTags = store.getTagsForSession(sessionId);
  const tagList = currentTags.length > 0
    ? currentTags.map((t) => `  - ${t.tag}`).join('\n')
    : '  (none)';
  return text(
    `Tag added: "${tagValue.trim().toLowerCase()}"\n\n` +
    `Current tags for session ${sessionId}:\n${tagList}`,
  );
}

/**
 * Remove a tag from the current session and confirm with the remaining tag list.
 *
 * @param store     - TagStore instance.
 * @param sessionId - Current session ID.
 * @param tagValue  - Tag string to remove.
 */
function handleRemove(
  store: TagStore,
  sessionId: string,
  tagValue: string,
): HandlerResponse {
  store.removeTag(sessionId, tagValue);
  const remaining = store.getTagsForSession(sessionId);
  const tagList = remaining.length > 0
    ? remaining.map((t) => `  - ${t.tag}`).join('\n')
    : '  (none)';
  return text(
    `Tag removed: "${tagValue.trim().toLowerCase()}"\n\n` +
    `Remaining tags for session ${sessionId}:\n${tagList}`,
  );
}

/**
 * List tags for the current session or all tags across all sessions.
 *
 * @param store     - TagStore instance.
 * @param sessionId - Current session ID.
 * @param scope     - 'session' for current session only, 'all' for global tag list.
 */
function handleList(
  store: TagStore,
  sessionId: string,
  scope: 'session' | 'all',
): HandlerResponse {
  if (scope === 'all') {
    const allTags = store.getAllTags();
    if (allTags.length === 0) {
      return text('No tags found across any sessions.');
    }
    const lines = allTags.map(
      (t) => `  ${t.tag.padEnd(24)} (${t.count} session${t.count === 1 ? '' : 's'})`,
    );
    return text(`All tags (${allTags.length} unique):\n${lines.join('\n')}`);
  }

  // scope === 'session'
  const tags = store.getTagsForSession(sessionId);
  if (tags.length === 0) {
    return text(
      `No tags on session ${sessionId}.\n\n` +
      `Add tags with: analytics_tag { action: "add", value: "<tag>" }`,
    );
  }
  const lines = tags.map((t) => `  - ${t.tag}  [${t.source}]`);
  return text(
    `Tags for session ${sessionId} (${tags.length}):\n${lines.join('\n')}`,
  );
}

/**
 * Analyze the current session JSONL and return heuristic tag suggestions.
 *
 * Suggestions are NOT automatically applied. The user must confirm each
 * tag with an explicit `add` action.
 *
 * @param store     - TagStore instance.
 * @param sessionId - Current session ID.
 */
async function handleAuto(
  store: TagStore,
  sessionId: string,
): Promise<HandlerResponse> {
  // Resolve JSONL path from the session ID
  const jsonlPath = resolveJsonlPath(sessionId);

  if (!jsonlPath) {
    return text(
      `Could not locate JSONL file for session ${sessionId}.\n\n` +
      `Expected location: ~/.claude/projects/<project-hash>/${sessionId}.jsonl\n` +
      `Ensure the session file exists before using auto-tagging.`,
    );
  }

  const suggestions = await store.suggestTags(sessionId, jsonlPath);

  if (suggestions.length === 0) {
    return text(
      `No tag suggestions found for session ${sessionId}.\n\n` +
      `The session may be too short, or its content may not match known patterns.\n` +
      `For higher-quality inference on complex sessions, precision_agent LLM analysis\n` +
      `can provide better suggestions (not implemented in this heuristic layer).`,
    );
  }

  const lines = suggestions.map(
    (s) => `  - ${s.tag.padEnd(24)} (${s.confidence} confidence: ${s.reason})`,
  );

  const applyHints = suggestions
    .map((s) => `analytics_tag { action: "add", value: "${s.tag}" }`)
    .join('\n');

  return text(
    `Suggested tags for session ${sessionId}:\n` +
    `${lines.join('\n')}\n\n` +
    `Apply with:\n${applyHints}`,
  );
}
