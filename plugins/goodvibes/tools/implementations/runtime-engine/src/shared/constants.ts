/**
 * Shared constants for the runtime engine.
 *
 * Version and other fixed values that are not configuration-driven.
 */

/**
 * Protocol/schema version of the runtime engine wire format.
 *
 * This is the protocol version, NOT the npm package version. It describes the
 * shape of MCP tool inputs/outputs and IPC message envelopes. Increment this
 * when making breaking changes to the wire format so that clients can detect
 * incompatible runtime versions.
 *
 * Updated at release time; not stored in user-facing config.
 */
export const ENGINE_VERSION = '1.0.0';

/**
 * Maximum length for event type strings used in log-injection sanitization.
 * Event types exceeding this length are truncated before logging.
 */
export const MAX_EVENT_TYPE_LENGTH = 100;

/**
 * Maximum length of agent output previews included in log entries and event payloads.
 */
export const MAX_OUTPUT_PREVIEW_LENGTH = 200;

/**
 * Default port for the HTTP listener (external events plugin).
 * Used in both HttpListenerConfig default and DEFAULT_CONFIG.
 */
export const DEFAULT_HTTP_LISTENER_PORT = 3847;

/**
 * Default limit for event query and tail operations.
 */
export const DEFAULT_EVENT_QUERY_LIMIT = 50;
