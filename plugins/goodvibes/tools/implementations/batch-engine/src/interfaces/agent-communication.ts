/**
 * Agent Communication interfaces for Batch Engine
 * @see SPEC-v2 Section 12.3
 */

import type { ActiveAgent, CompletedAgent } from './state.js';

/**
 * Message types for inter-agent communication
 * - data: Share data between agents
 * - status: Status update notification
 * - request: Request for data or action
 * - response: Response to a request
 * - broadcast: Message to all agents
 * - error: Error notification
 */
export type MessageType =
  | 'data'
  | 'status'
  | 'request'
  | 'response'
  | 'broadcast'
  | 'error';

/**
 * Message priority levels
 * Determines processing order in message queues
 */
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Inter-agent message
 * Core message structure for all agent-to-agent communication
 */
export interface AgentMessage {
  /** Unique message identifier */
  id: string;
  /** Type of message */
  type: MessageType;
  /** Sender agent ID or 'orchestrator' */
  from: string;
  /** Target agent ID or 'all' for broadcast */
  to: string | 'all';
  /** Message priority */
  priority: MessagePriority;
  /** ISO timestamp when message was created */
  timestamp: string;
  /** Message payload (type depends on message type) */
  payload: unknown;
  /** Whether sender expects a response */
  requires_response?: boolean;
  /** Timeout for expected response in milliseconds */
  response_timeout_ms?: number;
  /** Correlation ID linking request/response pairs */
  correlation_id?: string;
}

/**
 * Shared result between agents
 * Represents data shared from one agent to another
 */
export interface SharedResult {
  /** Agent ID that shared the result */
  from_agent: string;
  /** Agent ID that received the result */
  to_agent: string;
  /** Key to access this result in context */
  result_key: string;
  /** The shared data */
  data: unknown;
  /** ISO timestamp when result was shared */
  shared_at: string;
  /** ISO timestamp when result expires (optional) */
  expires_at?: string;
}

/**
 * Request types for agent-to-agent requests
 * - get_output: Request agent's output data
 * - get_status: Request agent's current status
 * - wait_complete: Wait for agent to complete
 * - cancel: Request cancellation of agent task
 * - data: Request specific data from agent
 */
export type RequestType =
  | 'get_output'
  | 'get_status'
  | 'wait_complete'
  | 'cancel'
  | 'data';

/**
 * Request to another agent
 * Structured request with timeout handling
 */
export interface AgentRequest {
  /** Unique request identifier */
  id: string;
  /** Type of request */
  type: RequestType;
  /** Requesting agent ID */
  from: string;
  /** Target agent ID */
  to: string;
  /** Additional request data (type depends on request type) */
  data?: unknown;
  /** Request timeout in milliseconds */
  timeout_ms: number;
  /** ISO timestamp when request was sent */
  sent_at: string;
}

/**
 * Response from agent
 * Response to an AgentRequest
 */
export interface AgentResponse {
  /** ID of the request being responded to */
  request_id: string;
  /** Responding agent ID */
  from: string;
  /** Requesting agent ID */
  to: string;
  /** Whether the request was successful */
  success: boolean;
  /** Response data (if successful) */
  data?: unknown;
  /** Error message (if unsuccessful) */
  error?: string;
  /** ISO timestamp when response was sent */
  responded_at: string;
}

/**
 * Broadcast message
 * Message sent to all agents simultaneously
 */
export interface BroadcastMessage {
  /** Unique broadcast identifier */
  id: string;
  /** Sender: 'orchestrator' or agent ID */
  from: string;
  /** Human-readable message */
  message: string;
  /** Additional broadcast data */
  data?: unknown;
  /** Broadcast priority */
  priority: MessagePriority;
  /** ISO timestamp when broadcast was sent */
  sent_at: string;
  /** Agent IDs that received the broadcast */
  received_by: string[];
}

/**
 * Communication channel interface
 * Core interface for agent-to-agent communication
 */
export interface AgentCommunication {
  /**
   * Share results from one agent to another
   * @param from - Source agent ID
   * @param to - Target agent ID
   * @param data - Data to share
   * @param key - Optional key for accessing result in context
   * @returns The created SharedResult
   */
  shareResults(from: string, to: string, data: unknown, key?: string): SharedResult;

  /**
   * Get all shared results for an agent
   * @param agent_id - Agent ID to get results for
   * @returns Array of shared results
   */
  getSharedResults(agent_id: string): SharedResult[];

  /**
   * Broadcast a message to all agents
   * @param from - Sender ID ('orchestrator' or agent ID)
   * @param message - Human-readable message
   * @param data - Optional additional data
   * @param priority - Message priority (defaults to 'normal')
   * @returns The created BroadcastMessage
   */
  broadcast(from: string, message: string, data?: unknown, priority?: MessagePriority): BroadcastMessage;

  /**
   * Send a request to another agent and wait for response
   * @param from - Requesting agent ID
   * @param to - Target agent ID
   * @param type - Type of request
   * @param data - Optional request data
   * @param timeout_ms - Request timeout in milliseconds
   * @returns Promise resolving to agent response
   */
  request(from: string, to: string, type: RequestType, data?: unknown, timeout_ms?: number): Promise<AgentResponse>;

  /**
   * Respond to an incoming request
   * @param request - The request to respond to
   * @param success - Whether the request was successful
   * @param data - Response data (if successful)
   * @param error - Error message (if unsuccessful)
   * @returns The created AgentResponse
   */
  respond(request: AgentRequest, success: boolean, data?: unknown, error?: string): AgentResponse;

  /**
   * Send a message to an agent's queue
   * @param message - Message to send
   */
  send(message: AgentMessage): void;

  /**
   * Receive all pending messages for an agent
   * @param agent_id - Agent ID to receive messages for
   * @returns Array of pending messages (clears queue)
   */
  receive(agent_id: string): AgentMessage[];

  /**
   * Peek at the next message without removing it
   * @param agent_id - Agent ID to peek messages for
   * @returns Next message or undefined if queue is empty
   */
  peek(agent_id: string): AgentMessage | undefined;

  /**
   * Wait for an agent to complete
   * @param agent_id - Agent ID to wait for
   * @param timeout_ms - Optional timeout in milliseconds
   * @returns Promise resolving to completed agent
   */
  waitForAgent(agent_id: string, timeout_ms?: number): Promise<CompletedAgent>;

  /**
   * Wait for any of the specified agents to complete
   * @param agent_ids - Array of agent IDs to wait for
   * @param timeout_ms - Optional timeout in milliseconds
   * @returns Promise resolving to first completed agent
   */
  waitForAnyOf(agent_ids: string[], timeout_ms?: number): Promise<CompletedAgent>;
}

/**
 * Communication manager with full capabilities
 * Extends AgentCommunication with history, stats, and management features
 */
export interface AgentCommunicationManager extends AgentCommunication {
  /**
   * Get message history for an agent
   * @param agent_id - Agent ID to get history for
   * @returns Array of all messages sent/received by agent
   */
  getMessageHistory(agent_id: string): AgentMessage[];

  /**
   * Get all shared result history
   * @returns Array of all shared results
   */
  getSharedResultHistory(): SharedResult[];

  /**
   * Get broadcast history
   * @returns Array of all broadcast messages
   */
  getBroadcastHistory(): BroadcastMessage[];

  /**
   * Get pending requests for an agent
   * @param agent_id - Agent ID to get pending requests for
   * @returns Array of pending requests
   */
  getPendingRequests(agent_id: string): AgentRequest[];

  /**
   * Cancel a pending request
   * @param request_id - ID of request to cancel
   * @returns True if request was cancelled, false if not found
   */
  cancelRequest(request_id: string): boolean;

  /**
   * Clear all messages for an agent
   * @param agent_id - Agent ID to clear messages for
   */
  clearMessages(agent_id: string): void;

  /**
   * Clear expired shared results
   * @returns Number of results cleared
   */
  clearExpiredResults(): number;

  /**
   * Get communication statistics
   * @returns Current statistics
   */
  getStats(): CommunicationStats;
}

/**
 * Communication statistics
 * Aggregated metrics for communication operations
 */
export interface CommunicationStats {
  /** Total messages sent */
  messages_sent: number;
  /** Total messages received */
  messages_received: number;
  /** Total broadcasts sent */
  broadcasts_sent: number;
  /** Total results shared */
  results_shared: number;
  /** Total requests sent */
  requests_sent: number;
  /** Requests that completed successfully */
  requests_completed: number;
  /** Requests that timed out */
  requests_timed_out: number;
  /** Average response time in milliseconds */
  avg_response_time_ms: number;
}

/**
 * Result sharing configuration
 * Controls automatic result sharing behavior
 */
export interface SharingConfig {
  /** Automatically share results when agent completes */
  auto_share_on_complete: boolean;
  /** Time-to-live for shared results in milliseconds */
  result_ttl_ms: number;
  /** Maximum number of results to keep per agent */
  max_results_per_agent: number;
}

/**
 * Default sharing configuration
 * Sensible defaults for most use cases
 */
export const DEFAULT_SHARING_CONFIG: SharingConfig = {
  auto_share_on_complete: true,
  result_ttl_ms: 3600000, // 1 hour
  max_results_per_agent: 10,
};
