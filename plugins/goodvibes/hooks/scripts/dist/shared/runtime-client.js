/**
 * RuntimeClient — Hook-side IPC client for the runtime engine.
 *
 * Thin wrapper that hooks use to communicate with the runtime engine
 * via Unix domain socket. When the runtime engine is not available,
 * all methods return null/false gracefully so hooks can fall back
 * to their existing behavior.
 *
 * Transport convention: newline-delimited JSON — one message per connection,
 * one response per connection, then close. Matches the IPC server protocol.
 *
 * Discovery order for the socket path:
 * 1. GOODVIBES_RUNTIME_SOCKET environment variable
 * 2. Session-keyed pointer file: .goodvibes/state/runtime-{sessionId}.socket (exact match)
 * 3. Pointer file scan: .goodvibes/state/runtime-{id}.socket (PID or UUID, multi-session)
 *    Base directory resolved from CLAUDE_PROJECT_DIR env var, falling back to process.cwd().
 * 4. Legacy pointer file: .goodvibes/state/runtime.socket (backward compatibility)
 * 5. Well-known tmpdir path: {tmpdir}/goodvibes-runtime/runtime.sock
 *
 * This module has zero external dependencies — only Node.js stdlib (net, fs,
 * path, os) so it can be safely imported by any hook script.
 */
import * as net from 'node:net';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
/** Timeout in ms for hook event sends (fire-and-forget with short wait). */
const HOOK_EVENT_TIMEOUT_MS = 500;
/** Timeout in ms for synchronous query calls. */
const QUERY_TIMEOUT_MS = 500;
/**
 * Generates a simple unique ID for correlating request/response pairs.
 * Uses Date.now() + random suffix — sufficient for short-lived hook connections.
 */
function generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
/**
 * Thin IPC client for hook scripts.
 *
 * Automatically discovers the runtime engine socket on construction. All
 * public methods return null/false when the engine is unreachable, allowing
 * hooks to fall through to their existing logic without modification.
 *
 * @example
 * ```ts
 * const client = new RuntimeClient(sessionId);
 * if (client.isAvailable()) {
 *   await client.sendHookEvent('session:started', hookInput);
 *   const result = await client.query({ kind: 'get_system_message' });
 *   if (result?.kind === 'system_message') {
 *     // use result.message
 *   }
 * }
 * ```
 */
export class RuntimeClient {
    /** Absolute path to the Unix domain socket, or null if not discoverable. */
    socketPath;
    /**
     * @param sessionId - Optional Claude Code session ID for session-keyed
     *   socket pointer lookup. When provided, enables exact-match discovery
     *   via `runtime-{sessionId}.socket` pointer files.
     */
    constructor(sessionId) {
        this.socketPath = this.discoverSocket(sessionId);
    }
    // ─── Public API ─────────────────────────────────────────────────────────────
    /**
     * Returns true if the runtime engine socket path was discovered and the
     * socket file currently exists on disk.
     *
     * This is a fast synchronous check — it does NOT attempt a connection.
     */
    isAvailable() {
        return this.socketPath !== null && existsSync(this.socketPath);
    }
    /**
     * Notify the runtime engine of a hook event.
     *
     * Fire-and-forget semantics with a 500 ms timeout. Returns the response
     * data if the engine replies in time, or null otherwise. Errors are
     * swallowed — the hook must never fail because of this call.
     *
     * @param hookName  - Logical hook event name (e.g. 'session:started').
     * @param hookInput - Full hook input payload received from Claude Code.
     * @returns Response data from the engine, or null on timeout/error.
     */
    async sendHookEvent(hookName, hookInput) {
        if (!this.isAvailable())
            return null;
        const message = {
            type: 'hook_event',
            id: generateId(),
            hook_name: hookName,
            hook_input: hookInput,
            timestamp: new Date().toISOString(),
        };
        const response = await this.sendMessage(message, HOOK_EVENT_TIMEOUT_MS);
        if (!response || response.status === 'error')
            return null;
        return response.data ?? null;
    }
    /**
     * Query the runtime engine for state or a decision.
     *
     * Times out after QUERY_TIMEOUT_MS milliseconds (default 500 ms). Returns null if the engine is unreachable or
     * the call fails for any reason. Errors are swallowed.
     *
     * @param query - The query to execute (discriminated by `kind`).
     * @returns Response data from the engine, or null on timeout/error.
     */
    async query(query) {
        if (!this.isAvailable())
            return null;
        const message = {
            type: 'query',
            id: generateId(),
            query,
        };
        const response = await this.sendMessage(message, QUERY_TIMEOUT_MS);
        if (!response || response.status === 'error')
            return null;
        return response.data ?? null;
    }
    // ─── Private helpers ────────────────────────────────────────────────────────
    /**
     * Open a new Unix domain socket connection, write the JSON message
     * (newline-terminated), read the JSON response (newline-terminated),
     * then close. Returns null on timeout or any socket error.
     *
     * @param message   - The IPC message to send.
     * @param timeoutMs - Maximum milliseconds to wait before giving up.
     * @returns Parsed {@link IPCResponse}, or null on failure.
     */
    sendMessage(message, timeoutMs) {
        const socketPath = this.socketPath;
        return new Promise((resolve) => {
            let resolved = false;
            const done = (result) => {
                if (resolved)
                    return;
                resolved = true;
                clearTimeout(timer);
                resolve(result);
            };
            const timer = setTimeout(() => {
                socket.destroy();
                done(null);
            }, timeoutMs);
            const socket = net.createConnection({ path: socketPath });
            socket.once('error', () => {
                done(null);
            });
            socket.once('connect', () => {
                const payload = JSON.stringify(message) + '\n';
                socket.write(payload, 'utf-8');
            });
            let rawData = '';
            socket.on('data', (chunk) => {
                rawData += chunk.toString('utf-8');
                const newlineIdx = rawData.indexOf('\n');
                if (newlineIdx === -1)
                    return; // Response not yet complete
                const line = rawData.slice(0, newlineIdx);
                socket.destroy();
                try {
                    const response = JSON.parse(line);
                    done(response);
                }
                catch {
                    done(null);
                }
            });
            socket.once('close', () => {
                done(null);
            });
        });
    }
    /**
     * Discover the runtime engine socket path using five strategies.
     *
     * Resolution order:
     * 1. `GOODVIBES_RUNTIME_SOCKET` env var — set by runtime engine at startup.
     * 2. Session-keyed pointer file `runtime-{sessionId}.socket` — exact match, no ambiguity.
     * 3. Pointer file scan `runtime-{id}.socket` (PID or UUID) — fallback for concurrent sessions.
     * 4. Legacy pointer file `runtime.socket` — backward compatibility with older engine versions.
     * 5. Well-known tmpdir path: `{os.tmpdir()}/goodvibes-runtime/runtime.sock`.
     *
     * @param sessionId - Optional Claude Code session ID for session-keyed lookup (Strategy 2).
     * @returns Absolute socket path string, or null if none is discoverable.
     */
    discoverSocket(sessionId) {
        // Strategy 1: Explicit env var (set by runtime engine at startup)
        const envPath = process.env['GOODVIBES_RUNTIME_SOCKET'];
        if (envPath) {
            return envPath;
        }
        const cwd = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
        const stateDir = join(cwd, '.goodvibes', 'state');
        const stateDirExists = existsSync(stateDir);
        // Strategy 2: Session-keyed pointer file (exact match, no ambiguity).
        // Written by IPC router on session:started. Preferred over PID scan
        // because it's unambiguous in multi-session scenarios.
        if (sessionId && stateDirExists) {
            try {
                const sessionPointer = join(stateDir, `runtime-${sessionId}.socket`);
                const socketPath = readFileSync(sessionPointer, 'utf-8').trim();
                if (socketPath && existsSync(socketPath))
                    return socketPath;
            }
            catch {
                // Ignore — fall through to PID scan
            }
        }
        // Strategy 3: Scan for per-PID pointer files written by concurrent sessions.
        // Multiple Claude Code sessions for the same project each write their own
        // runtime-{pid}.socket file. We pick the first one that points to an
        // existing socket file.
        if (stateDirExists) {
            try {
                const entries = readdirSync(stateDir);
                for (const entry of entries) {
                    // Widened pattern matches both PID-based (runtime-12345.socket) and
                    // session-keyed (runtime-{uuid}.socket) pointer files as a fallback
                    // when sessionId was not provided (Strategy 2 was skipped).
                    if (/^runtime-[a-zA-Z0-9_-]+\.socket$/.test(entry)) {
                        try {
                            const socketPath = readFileSync(join(stateDir, entry), 'utf-8').trim();
                            if (socketPath && existsSync(socketPath))
                                return socketPath;
                        }
                        catch {
                            // Ignore — try next entry
                        }
                    }
                }
            }
            catch {
                // Ignore — fall through to next strategy
            }
        }
        // Strategy 4: Legacy pointer file for backward compatibility with older
        // runtime engine versions that wrote a single shared runtime.socket file.
        const legacyPointerFile = join(stateDir, 'runtime.socket');
        if (existsSync(legacyPointerFile)) {
            try {
                const socketPath = readFileSync(legacyPointerFile, 'utf-8').trim();
                if (socketPath && existsSync(socketPath))
                    return socketPath;
            }
            catch {
                // Ignore — fall through to next strategy
            }
        }
        // Strategy 5: Well-known tmpdir location — legacy fallback path for manual or
        // external socket placement. Note: the process-manager does NOT create sockets
        // here; it uses per-session paths. This strategy will only match sockets
        // placed here by external tooling.
        const defaultPath = join(tmpdir(), 'goodvibes-runtime', 'runtime.sock');
        if (existsSync(defaultPath)) {
            return defaultPath;
        }
        return null;
    }
}
