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
 * 2. .goodvibes/state/runtime.socket pointer file in cwd (contains the path)
 * 3. Well-known tmpdir path: {tmpdir}/goodvibes-runtime/runtime.sock
 *
 * This module has zero external dependencies — only Node.js stdlib (net, fs,
 * path, os) so it can be safely imported by any hook script.
 */
/** Response data discriminated union — mirrors protocol.ts IPCResponseData. */
type IPCResponseData = {
    kind: 'system_message';
    message: string;
    directives?: Directive[];
} | {
    kind: 'workflow_state';
    instance: Record<string, unknown>;
} | {
    kind: 'agent_status';
    agent: Record<string, unknown>;
} | {
    kind: 'tool_decision';
    allow: boolean;
    reason?: string;
    modified_input?: Record<string, unknown>;
} | {
    kind: 'context_injection';
    context: string;
    priority: number;
} | {
    kind: 'ack';
} | {
    kind: 'pending_bind';
    workflow_id: string | null;
};
/** Directive from runtime engine to hook. */
export interface Directive {
    /** Action type. */
    type: 'inject_system_message' | 'block_tool' | 'modify_input' | 'warn' | 'suggest';
    /** Directive content payload. */
    content: string;
    /** Priority — higher values take precedence. */
    priority: number;
    /** Source subsystem that generated this directive. */
    source: string;
}
/** Query kinds supported by the runtime engine. */
export type IPCQueryKind = {
    kind: 'get_system_message';
} | {
    kind: 'get_directives';
} | {
    kind: 'get_workflow_state';
    workflow_id: string;
} | {
    kind: 'get_agent_status';
    agent_id: string;
} | {
    kind: 'should_block_tool';
    tool_name: string;
    tool_input: Record<string, unknown>;
} | {
    kind: 'get_context_injection';
} | {
    kind: 'resolve_pending_bind';
    agent_type: string;
};
/** Exported response data type for callers. */
export type RuntimeResponseData = IPCResponseData;
/**
 * Thin IPC client for hook scripts.
 *
 * Automatically discovers the runtime engine socket on construction. All
 * public methods return null/false when the engine is unreachable, allowing
 * hooks to fall through to their existing logic without modification.
 *
 * @example
 * ```ts
 * const client = new RuntimeClient();
 * if (client.isAvailable()) {
 *   await client.sendHookEvent('session:started', hookInput);
 *   const result = await client.query({ kind: 'get_system_message' });
 *   if (result?.kind === 'system_message') {
 *     // use result.message
 *   }
 * }
 * ```
 */
export declare class RuntimeClient {
    /** Absolute path to the Unix domain socket, or null if not discoverable. */
    private readonly socketPath;
    constructor();
    /**
     * Returns true if the runtime engine socket path was discovered and the
     * socket file currently exists on disk.
     *
     * This is a fast synchronous check — it does NOT attempt a connection.
     */
    isAvailable(): boolean;
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
    sendHookEvent(hookName: string, hookInput: Record<string, unknown>): Promise<RuntimeResponseData | null>;
    /**
     * Query the runtime engine for state or a decision.
     *
     * Times out after QUERY_TIMEOUT_MS milliseconds (default 500 ms). Returns null if the engine is unreachable or
     * the call fails for any reason. Errors are swallowed.
     *
     * @param query - The query to execute (discriminated by `kind`).
     * @returns Response data from the engine, or null on timeout/error.
     */
    query(query: IPCQueryKind): Promise<RuntimeResponseData | null>;
    /**
     * Open a new Unix domain socket connection, write the JSON message
     * (newline-terminated), read the JSON response (newline-terminated),
     * then close. Returns null on timeout or any socket error.
     *
     * @param message   - The IPC message to send.
     * @param timeoutMs - Maximum milliseconds to wait before giving up.
     * @returns Parsed {@link IPCResponse}, or null on failure.
     */
    private sendMessage;
    /**
     * Discover the runtime engine socket path using three strategies.
     *
     * Resolution order:
     * 1. `GOODVIBES_RUNTIME_SOCKET` env var — set by runtime engine at startup.
     * 2. `.goodvibes/state/runtime.socket` pointer file in cwd — contains path.
     * 3. Well-known tmpdir path: `{os.tmpdir()}/goodvibes-runtime/runtime.sock`.
     *
     * @returns Absolute socket path string, or null if none is discoverable.
     */
    private discoverSocket;
}
export {};
