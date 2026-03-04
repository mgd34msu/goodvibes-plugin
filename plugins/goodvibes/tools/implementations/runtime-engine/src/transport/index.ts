/**
 * Transport Abstraction Layer — public API
 */

export type { RuntimeTransport, TransportMode } from './types.js';
export { LocalTransport } from './local-transport.js';
export { RemoteTransport } from './remote-transport.js';
export type { RemoteTransportOptions } from './remote-transport.js';
export { createTransport, discoverDaemonSocket } from './factory.js';
export type { TransportFactoryOptions } from './factory.js';
export * from './daemon-protocol.js';
