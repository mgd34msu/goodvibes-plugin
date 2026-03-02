/**
 * Domain-Specific Error Classes — Shared Layer
 *
 * Provides a base RuntimeEngineError class and domain-specific subclasses
 * for each architectural layer. These allow callers to catch and handle
 * errors by domain rather than relying on message string matching.
 *
 * Hierarchy:
 *   RuntimeEngineError (base)
 *   ├── ConfigError      — configuration load/parse failures
 *   ├── ParseError       — JSON or data parse failures
 *   ├── StateError       — state store I/O failures
 *   ├── QueueError       — event/dead-letter queue violations
 *   ├── ProcessingError  — lifecycle/processing state violations
 *   ├── IPCError         — IPC server/client communication failures
 *   ├── WorkflowError    — workflow engine registration/execution failures
 *   └── HookError        — hook processing failures
 */

/**
 * Base error class for all runtime engine errors.
 *
 * All domain-specific errors extend this class, enabling catch-all handling
 * via `instanceof RuntimeEngineError` at module boundaries.
 */
export class RuntimeEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    // Maintain proper prototype chain in ES5 transpilation targets
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when runtime configuration cannot be loaded or is invalid.
 *
 * @example
 * throw new ConfigError(`Missing required field: ${field}`);
 */
export class ConfigError extends RuntimeEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONFIG_ERROR', cause);
  }
}

/**
 * Thrown when JSON or structured data cannot be parsed.
 *
 * @example
 * throw new ParseError(`Corrupt JSON in ${filePath}: ${err.message}`, err);
 */
export class ParseError extends RuntimeEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, 'PARSE_ERROR', cause);
  }
}

/**
 * Thrown when the state store encounters an I/O or locking failure.
 *
 * @example
 * throw new StateError(`StateStore.set failed for key "${key}": ${message}`);
 */
export class StateError extends RuntimeEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, 'STATE_ERROR', cause);
  }
}

/**
 * Thrown when event queue capacity or invariant constraints are violated.
 *
 * @example
 * throw new QueueError(`event queue is full (max_size=${maxSize})`);
 */
export class QueueError extends RuntimeEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, 'QUEUE_ERROR', cause);
  }
}

/**
 * Thrown when processing lifecycle transitions are invalid or preconditions fail.
 *
 * @example
 * throw new ProcessingError(`Cannot resume from status '${status}': must be 'paused'`);
 */
export class ProcessingError extends RuntimeEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, 'PROCESSING_ERROR', cause);
  }
}

/**
 * Thrown when IPC server or client operations fail.
 *
 * @example
 * throw new IPCError('IPC server was not created');
 */
export class IPCError extends RuntimeEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, 'IPC_ERROR', cause);
  }
}

/**
 * Thrown when workflow definition registration or instance creation fails.
 *
 * @example
 * throw new WorkflowError(`WorkflowDefinition '${id}' is already registered`);
 */
export class WorkflowError extends RuntimeEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, 'WORKFLOW_ERROR', cause);
  }
}

/**
 * Thrown when hook processing encounters an unrecoverable error.
 *
 * @example
 * throw new HookError(`Hook handler '${name}' failed: ${message}`);
 */
export class HookError extends RuntimeEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, 'HOOK_ERROR', cause);
  }
}

/**
 * Thrown when a workflow action exceeds the configured execution timeout.
 *
 * When caught by the workflow engine the transition is rolled back to the
 * pre-transition state and the error is logged with full context.
 *
 * @example
 * throw new WorkflowTimeoutError(
 *   `Action 'invoke_handler' exceeded 30000 ms timeout`,
 *   30000,
 * );
 */
export class WorkflowTimeoutError extends RuntimeEngineError {
  /** The timeout value in milliseconds that was exceeded. */
  constructor(
    message: string,
    public readonly timeoutMs: number,
    cause?: unknown,
  ) {
    super(message, 'WORKFLOW_TIMEOUT_ERROR', cause);
  }
}
