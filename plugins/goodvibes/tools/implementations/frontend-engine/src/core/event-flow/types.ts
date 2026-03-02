/**
 * Event Flow Core Types
 *
 * All type definitions for event flow analysis,
 * including event handlers, component tree nodes, and analysis results.
 *
 * @module core/event-flow/types
 */

// =============================================================================
// Event Handler Types
// =============================================================================

/**
 * Information about an event handler
 */
export interface EventHandler {
  /** Element or component name */
  element: string;
  /** Event type (click, change, etc.) */
  event: string;
  /** Handler function name or inline code */
  handler: string;
  /** Line number where handler is defined */
  line: number;
  /** Whether handler calls stopPropagation */
  stops_propagation: boolean;
  /** Whether handler calls preventDefault */
  prevents_default: boolean;
}

/**
 * Internal node tracking for component tree
 */
export interface ComponentNode {
  element: string;
  parent: ComponentNode | null;
  children: ComponentNode[];
  handlers: EventHandler[];
  line: number;
  depth: number;
}

// =============================================================================
// Analysis Result Types
// =============================================================================

/**
 * Step in an event flow
 */
export interface EventFlowStep {
  step: number;
  element: string;
  handler: string;
  stops_here: boolean;
}

/**
 * Event flow scenario
 */
export interface EventFlow {
  scenario: string;
  steps: EventFlowStep[];
}

/**
 * Issue detected in event handling
 */
export interface EventIssue {
  issue: string;
  elements: string[];
  explanation: string;
  fix: string;
}

/**
 * Event delegation pattern
 */
export interface DelegationPattern {
  container: string;
  delegates_for: string[];
  event: string;
}

// =============================================================================
// Tool Arguments
// =============================================================================

/**
 * Arguments for the analyze_event_flow tool
 */
export interface AnalyzeEventFlowArgs {
  /** Path to the component file to analyze */
  file: string;
  /** Filter to specific event type (e.g., "click", "change") */
  event?: string;
}
