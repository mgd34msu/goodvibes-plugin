// src/transport/daemon-protocol.ts

/**
 * RPC call message — used by RemoteTransport to invoke
 * RuntimeTransport methods on the daemon.
 *
 * Extends the existing IPC protocol with a transport-specific
 * message type. The daemon socket is separate from the hook
 * IPC socket to avoid interference.
 */
export interface DaemonRPCRequest {
  type: 'rpc_call';
  id: string;
  /** Method name from RuntimeTransport interface. */
  method: string;
  /** Named method arguments. */
  args: Record<string, unknown>;
  /** Session ID of the calling client. */
  session_id: string;
}

export interface DaemonRPCResponse {
  id: string;
  status: 'ok' | 'error';
  /** Serialized return value. */
  result?: unknown;
  /** Error message if status === 'error'. */
  error?: string;
}

/**
 * Session management messages.
 */
export interface DaemonSessionMessage {
  type: 'session_join' | 'session_leave';
  id: string;
  session_id: string;
  /** State snapshot to merge on join (optional). */
  state_snapshot?: Record<string, unknown>;
}

/** All daemon protocol messages. */
export type DaemonMessage = DaemonRPCRequest | DaemonSessionMessage;
