/**
 * External Events Plugin — Barrel Exports
 *
 * Layer 3: Webhook ingestion via file drops, optional HTTP listener,
 * and payload normalization.
 */

// Plugin entry point
export { ExternalPlugin, createDefaultExternalPluginConfig } from './external-plugin.js';
export type { ExternalPluginConfig } from './external-plugin.js';

// File watcher
export { FileWatcher, DEFAULT_FILE_WATCHER_CONFIG } from './file-watcher.js';
export type { FileWatcherConfig } from './file-watcher.js';

// HTTP listener
export { HttpListener, DEFAULT_HTTP_LISTENER_CONFIG } from './http-listener.js';
export type { HttpListenerConfig } from './http-listener.js';

// Normalizer registry and built-ins
export {
  NormalizerRegistry,
  createDefaultRegistry,
  normalizeGithub,
  normalizeGeneric,
} from './normalizers/index.js';
export type { Normalizer } from './normalizers/index.js';
