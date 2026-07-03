/**
 * Preview-token persistence for structural_edit's two-step contract.
 *
 * A `preview` call stores a token on disk carrying the computed post-edit
 * content per file plus each file's content hash. An `apply` call names the
 * token; the store re-reads it, and the tool re-hashes every file so a file that
 * changed since preview is refused (`refused_stale`) rather than silently
 * re-matched. Tokens are:
 *   - SINGLE-USE — `loadAndConsume` deletes the file as it reads it, so a token
 *     cannot be replayed and two concurrent applies cannot both win.
 *   - EXPIRING — a 10-minute TTL; `apply` rejects an expired token and the store
 *     sweeps stale files opportunistically.
 *   - NAMESPACED — stored under `core/config` `getStatePath` (`.goodvibes/
 *     edit-tokens/`), honoring R15. The state ROOT defaults to the server cwd
 *     (the project root in production); `GOODVIBES_STATE_ROOT` overrides it,
 *     which the tests use to keep token files inside an isolated temp dir.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { getStatePath } from '@goodvibes/core/config';

/** Preview tokens expire 10 minutes after they are minted. */
export const TOKEN_TTL_MS = 10 * 60 * 1000;

/** Token ids are `se_<base36-time>_<hex>`; validated before any path is built. */
const TOKEN_ID_RE = /^se_[a-z0-9]+_[a-f0-9]+$/;

/** Per-file record captured at preview time. */
export interface PreviewFileRecord {
  resolved_path: string;
  /** sha256 of the file content at preview time (empty string if unreadable). */
  hash: string;
  /** Whether the file was readable at preview time. */
  existed: boolean;
}

/** Per-entry record captured at preview time (keyed like api_request entries). */
export interface PreviewEntryRecord {
  /** id or index-as-string — never collapsed with same-file siblings. */
  key: string;
  id?: string;
  path: string;
  resolved_path: string;
  status: 'ready' | 'no_match' | 'error';
  match_count: number;
  error?: string;
}

/** The full persisted preview token. */
export interface PreviewToken {
  token: string;
  created_at: number;
  expires_at: number;
  transaction: 'atomic' | 'partial';
  mode: string;
  base_path?: string;
  files: PreviewFileRecord[];
  entries: PreviewEntryRecord[];
  /** resolved_path -> final post-edit content, ONLY for files with ready edits. */
  computed: Record<string, string>;
}

/** The state ROOT for token files (overridable for test isolation). */
function stateRoot(): string {
  return process.env.GOODVIBES_STATE_ROOT || process.cwd();
}

function tokenDir(): string {
  return getStatePath(stateRoot(), 'edit-tokens');
}

/** sha256 hex of a UTF-8 string (byte-exact and stable across preview/apply). */
export function sha256(content: string): string {
  return crypto.createHash('sha256').update(Buffer.from(content, 'utf-8')).digest('hex');
}

/** Mint a fresh, path-safe token id. */
export function newTokenId(): string {
  return `se_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

/** Persist a preview token. */
export async function saveToken(tok: PreviewToken): Promise<void> {
  const dir = tokenDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${tok.token}.json`), JSON.stringify(tok), 'utf-8');
}

/**
 * Load a token AND delete it in the same step (single-use). Returns null when
 * the id is malformed or the file is absent/already-consumed. The delete happens
 * before parsing so a replay always misses even if the JSON is corrupt.
 */
export async function loadAndConsumeToken(token: string): Promise<PreviewToken | null> {
  if (typeof token !== 'string' || !TOKEN_ID_RE.test(token)) return null;
  const file = path.join(tokenDir(), `${token}.json`);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf-8');
  } catch {
    return null;
  }
  await fs.unlink(file).catch(() => {});
  try {
    return JSON.parse(raw) as PreviewToken;
  } catch {
    return null;
  }
}

/** Best-effort removal of expired token files (called opportunistically). */
export async function sweepExpiredTokens(now: number = Date.now()): Promise<void> {
  const dir = tokenDir();
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((n) => n.endsWith('.json'))
      .map(async (n) => {
        const file = path.join(dir, n);
        try {
          const raw = await fs.readFile(file, 'utf-8');
          const tok = JSON.parse(raw) as PreviewToken;
          if (typeof tok.expires_at === 'number' && tok.expires_at < now) {
            await fs.unlink(file).catch(() => {});
          }
        } catch {
          /* skip unreadable/corrupt token files */
        }
      }),
  );
}
