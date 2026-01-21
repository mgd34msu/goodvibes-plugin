/**
 * Architecture Verification interfaces for Batch Engine
 * Provides comprehensive verification of system architecture including layers,
 * components, data flow, and connections.
 * @see SPEC-v2 Section 2
 */

// ============================================================================
// System Layer Definitions (SPEC-v2 Section 2.1)
// ============================================================================

/**
 * System layers from SPEC-v2 Section 2.1
 * Defines the architectural hierarchy of the GoodVibes system
 */
export const SYSTEM_LAYERS = {
  /** Top-level orchestration controlling modes, agents, and hooks */
  ORCHESTRATION: 'orchestration',
  /** Core batch processing engine */
  BATCH_ENGINE: 'batch_engine',
  /** High-level precision tools for common operations */
  PRECISION_TOOLS: 'precision_tools',
  /** Low-level native Claude Code tools */
  NATIVE_TOOLS: 'native_tools',
} as const;

/** Type for system layer values */
export type SystemLayer = (typeof SYSTEM_LAYERS)[keyof typeof SYSTEM_LAYERS];

/** Type for system layer keys */
export type SystemLayerKey = keyof typeof SYSTEM_LAYERS;

// ============================================================================
// Layer Component Definitions
// ============================================================================

/**
 * Components per layer from SPEC-v2 Section 2.1
 * Maps each layer to its constituent components
 */
export const LAYER_COMPONENTS = {
  /** Orchestration layer components */
  orchestration: [
    'mode_system',
    'agent_pool',
    'context_manager',
    'hook_executor',
  ],
  /** Batch engine layer components */
  batch_engine: [
    'batch_parser',
    'operation_executor',
    'transaction_manager',
    'result_aggregator',
  ],
  /** Precision tools layer components */
  precision_tools: [
    'precision_grep',
    'precision_read',
    'precision_glob',
    'precision_symbols',
    'precision_edit',
    'precision_write',
    'precision_exec',
    'precision_fetch',
  ],
  /** Native tools layer components */
  native_tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'LSP'],
} as const;

/** Type for layer component arrays */
export type LayerComponents = typeof LAYER_COMPONENTS;

/** Get component names for a specific layer */
export type ComponentsOfLayer<L extends SystemLayer> = LayerComponents[L][number];

// ============================================================================
// Component Verification Types
// ============================================================================

/**
 * Verification result for a single component
 */
export interface ComponentVerification {
  /** Component name */
  name: string;

  /** Whether the component exists in the implementation */
  exists: boolean;

  /** Whether the interface is completely implemented */
  interface_complete: boolean;

  /** File location of the interface (if exists) */
  location?: string;

  /** List of required interfaces for this component */
  required_interfaces: string[];

  /** List of interfaces that are implemented */
  implemented_interfaces: string[];

  /** List of interfaces that are missing */
  missing_interfaces: string[];
}

/**
 * Verification result for a layer
 */
export interface LayerVerification {
  /** Layer name */
  layer: SystemLayer;

  /** Human-readable description of the layer */
  description: string;

  /** Verification results for each component in the layer */
  components: ComponentVerification[];

  /** Overall layer status */
  status: 'complete' | 'partial' | 'missing';

  /** List of missing components or interfaces */
  missing?: string[];
}

// ============================================================================
// Data Flow Verification Types
// ============================================================================

/**
 * Definition of a data flow path through the system
 */
export interface DataFlowPath {
  /** Name of this data flow */
  name: string;

  /** Description of what this flow accomplishes */
  description: string;

  /** Starting point of the flow */
  from: string;

  /** Intermediate components the data passes through */
  through: string[];

  /** Destination of the flow */
  to: string;

  /** Whether this flow has been verified */
  verified: boolean;

  /** Issues found during verification */
  issues?: string[];
}

/**
 * Verification result for data flows
 */
export interface DataFlowVerification {
  /** All data flow paths in the system */
  paths: DataFlowPath[];

  /** Count of verified flows */
  verified: number;

  /** Count of failed flows */
  failed: number;

  /** Overall data flow status */
  status: 'passed' | 'partial' | 'failed';
}

// ============================================================================
// Connection Verification Types
// ============================================================================

/**
 * Type of connection between components
 * - direct: Direct method call or property access
 * - event: Event-based communication
 * - callback: Callback function injection
 * - injection: Dependency injection
 */
export type ConnectionType = 'direct' | 'event' | 'callback' | 'injection';

/**
 * Definition of a connection between two components
 */
export interface ComponentConnection {
  /** Source component */
  from: string;

  /** Target component */
  to: string;

  /** Type of connection */
  type: ConnectionType;

  /** Whether this connection has been verified */
  verified: boolean;

  /** Whether the interface for this connection exists */
  interface_exists: boolean;

  /** Issue description if verification failed */
  issue?: string;
}

/**
 * Verification result for component connections
 */
export interface ConnectionVerification {
  /** All component connections */
  connections: ComponentConnection[];

  /** Count of verified connections */
  verified: number;

  /** Count of failed connections */
  failed: number;

  /** Overall connection status */
  status: 'passed' | 'partial' | 'failed';
}

// ============================================================================
// Diagram Verification Types
// ============================================================================

/**
 * Type of discrepancy found between diagram and implementation
 * - missing_in_diagram: Component exists in code but not in diagram
 * - missing_in_impl: Component exists in diagram but not in code
 * - connection_mismatch: Connection differs between diagram and code
 */
export type DiscrepancyType =
  | 'missing_in_diagram'
  | 'missing_in_impl'
  | 'connection_mismatch';

/**
 * A discrepancy between diagram and implementation
 */
export interface Discrepancy {
  /** Type of discrepancy */
  type: DiscrepancyType;

  /** Component involved in the discrepancy */
  component: string;

  /** Human-readable description of the discrepancy */
  description: string;
}

/**
 * Result of diagram verification
 */
export interface DiagramMatch {
  /** Whether the diagram matches the implementation */
  matches: boolean;

  /** List of discrepancies found */
  discrepancies: Discrepancy[];
}

/**
 * Interface for verifying architecture diagrams
 */
export interface DiagramVerification {
  /**
   * Verify that a diagram matches the actual implementation
   * @param diagram - Diagram content (ASCII, Mermaid, etc.)
   * @returns Match result with discrepancies
   */
  verifyDiagram(diagram: string): Promise<DiagramMatch>;
}

// ============================================================================
// Architecture Verification Report
// ============================================================================

/**
 * Summary of architecture verification
 */
export interface ArchitectureVerificationSummary {
  /** Number of layers that are complete */
  layers_complete: number;

  /** Number of layers that are incomplete */
  layers_incomplete: number;

  /** List of missing components across all layers */
  missing_components: string[];

  /** List of connection issues found */
  connection_issues: string[];
}

/**
 * Overall architecture verification report status
 */
export type ArchitectureVerificationStatus = 'passed' | 'partial' | 'failed';

/**
 * Complete architecture verification report
 */
export interface ArchitectureVerificationReport {
  /** ISO timestamp when verification was performed */
  verified_at: string;

  /** Verification results for each layer */
  layers: LayerVerification[];

  /** Data flow verification results */
  data_flow: DataFlowVerification;

  /** Connection verification results */
  connections: ConnectionVerification;

  /** Overall verification status */
  status: ArchitectureVerificationStatus;

  /** Summary of verification results */
  summary: ArchitectureVerificationSummary;
}

// ============================================================================
// Architecture Verifier Interface
// ============================================================================

/**
 * Main architecture verification interface
 * Provides methods to verify the complete system architecture
 */
export interface ArchitectureVerifier {
  /**
   * Verify the complete architecture
   * Runs all verification checks and returns a comprehensive report
   * @returns Complete architecture verification report
   */
  verifyAll(): Promise<ArchitectureVerificationReport>;

  /**
   * Verify a specific layer
   * @param layer - Layer key to verify
   * @returns Verification result for the specified layer
   */
  verifyLayer(layer: SystemLayerKey): Promise<LayerVerification>;

  /**
   * Verify all data flows through the system
   * @returns Data flow verification results
   */
  verifyDataFlow(): Promise<DataFlowVerification>;

  /**
   * Verify all component connections
   * @returns Connection verification results
   */
  verifyConnections(): Promise<ConnectionVerification>;
}

// ============================================================================
// Architecture Checklist
// ============================================================================

/**
 * Architecture verification checklist items organized by category
 * Used to ensure all architectural requirements are met
 */
export const ARCHITECTURE_CHECKLIST = {
  /** Orchestration layer requirements */
  orchestration_layer: [
    'ModeSystem interface exists',
    'AgentPool interface exists',
    'ContextManager/Injector interface exists',
    'HookExecutor interface exists',
    'GoodVibesRuntime connects all',
  ],
  /** Batch engine layer requirements */
  batch_engine_layer: [
    'Batch interface exists',
    'BatchConfig interface exists',
    'All operation types defined',
    'BatchResult interface exists',
    'Transaction modes supported',
  ],
  /** Precision tools layer requirements */
  precision_tools_layer: [
    'precision_grep interface exists',
    'precision_read interface exists',
    'precision_glob interface exists',
    'precision_symbols interface exists',
    'precision_edit interface exists',
    'precision_write interface exists',
    'precision_exec interface exists',
    'precision_fetch interface exists',
  ],
  /** Data flow requirements */
  data_flow: [
    'User request -> Orchestration verified',
    'Orchestration -> Batch Engine verified',
    'Batch Engine -> Precision Tools verified',
    'Precision Tools -> Native Tools verified',
    'Results flow back correctly',
  ],
  /** Connection requirements */
  connections: [
    'Runtime -> StateManager connected',
    'Runtime -> CheckpointManager connected',
    'Runtime -> AgentPool connected',
    'Hooks -> Runtime connected',
    'BatchEngine -> Hooks connected',
  ],
} as const;

/** Type for architecture checklist category keys */
export type ArchitectureChecklistCategory = keyof typeof ARCHITECTURE_CHECKLIST;

/** Get checklist items for a category */
export type ArchitectureChecklistItemsOf<C extends ArchitectureChecklistCategory> =
  (typeof ARCHITECTURE_CHECKLIST)[C][number];

// ============================================================================
// Checklist Verification Types
// ============================================================================

/**
 * Status of a single checklist item
 */
export interface ArchitectureChecklistItemStatus {
  /** The checklist item description */
  item: string;

  /** Whether the item has been verified */
  verified: boolean;

  /** Optional notes about the verification */
  notes?: string;
}

/**
 * Status of a checklist category
 */
export interface ArchitectureChecklistCategoryStatus {
  /** Category name */
  category: ArchitectureChecklistCategory;

  /** Status of each item in the category */
  items: ArchitectureChecklistItemStatus[];

  /** Number of items verified */
  verified_count: number;

  /** Total number of items */
  total_count: number;

  /** Whether all items are verified */
  complete: boolean;
}

/**
 * Complete checklist verification result
 */
export interface ChecklistVerificationResult {
  /** Status of each category */
  categories: ArchitectureChecklistCategoryStatus[];

  /** Overall verified count */
  total_verified: number;

  /** Overall total count */
  total_items: number;

  /** Overall completion percentage */
  completion_percent: number;

  /** Whether all items are verified */
  all_complete: boolean;
}

// ============================================================================
// Verifier Configuration
// ============================================================================

/**
 * Configuration options for the architecture verifier
 */
export interface ArchitectureVerifierConfig {
  /** Root directory of the project */
  project_root: string;

  /** Directory containing interface definitions */
  interfaces_dir: string;

  /** Whether to include detailed file locations in reports */
  include_locations: boolean;

  /** Whether to verify diagrams if present */
  verify_diagrams: boolean;

  /** Timeout for verification operations in milliseconds */
  timeout_ms: number;
}

/**
 * Default verifier configuration
 */
export const DEFAULT_VERIFIER_CONFIG: ArchitectureVerifierConfig = {
  project_root: '.',
  interfaces_dir: 'src/interfaces',
  include_locations: true,
  verify_diagrams: false,
  timeout_ms: 30000,
};

// ============================================================================
// Factory Interface
// ============================================================================

/**
 * Factory for creating architecture verifier instances
 */
export interface ArchitectureVerifierFactory {
  /**
   * Create a new architecture verifier
   * @param config - Optional configuration overrides
   * @returns Configured architecture verifier
   */
  create(config?: Partial<ArchitectureVerifierConfig>): ArchitectureVerifier;
}

// ============================================================================
// Extended Verifier Interface
// ============================================================================

/**
 * Extended architecture verifier with additional capabilities
 */
export interface ExtendedArchitectureVerifier extends ArchitectureVerifier {
  /** Current configuration */
  readonly config: ArchitectureVerifierConfig;

  /**
   * Verify a specific component
   * @param layer - Layer containing the component
   * @param component - Component name to verify
   * @returns Component verification result
   */
  verifyComponent(
    layer: SystemLayerKey,
    component: string
  ): Promise<ComponentVerification>;

  /**
   * Verify the architecture checklist
   * @returns Checklist verification result
   */
  verifyChecklist(): Promise<ChecklistVerificationResult>;

  /**
   * Verify a diagram against implementation
   * @param diagram - Diagram content
   * @returns Diagram match result
   */
  verifyDiagram(diagram: string): Promise<DiagramMatch>;

  /**
   * Get all missing components across all layers
   * @returns Array of missing component identifiers
   */
  getMissingComponents(): Promise<string[]>;

  /**
   * Get all connection issues
   * @returns Array of connection issue descriptions
   */
  getConnectionIssues(): Promise<string[]>;
}

// ============================================================================
// Verification Event Types
// ============================================================================

/**
 * Events emitted during architecture verification
 */
export type VerificationEvent =
  | 'verification_started'
  | 'layer_verified'
  | 'component_verified'
  | 'data_flow_verified'
  | 'connections_verified'
  | 'verification_completed'
  | 'verification_failed';

/**
 * Data passed to verification event handlers
 */
export interface VerificationEventData {
  /** Event type */
  event: VerificationEvent;

  /** ISO timestamp of event */
  timestamp: string;

  /** Event-specific payload */
  payload?: {
    /** For layer_verified events */
    layer?: LayerVerification;

    /** For component_verified events */
    component?: ComponentVerification;

    /** For data_flow_verified events */
    data_flow?: DataFlowVerification;

    /** For connections_verified events */
    connections?: ConnectionVerification;

    /** For verification_completed events */
    report?: ArchitectureVerificationReport;

    /** For verification_failed events */
    error?: Error;
  };
}

/**
 * Handler for verification events
 */
export interface VerificationEventHandler {
  (event: VerificationEvent, data: VerificationEventData): void;
}

/**
 * Verifier with event support
 */
export interface ObservableArchitectureVerifier extends ExtendedArchitectureVerifier {
  /**
   * Register an event handler
   * @param event - Event type to handle
   * @param handler - Handler function
   */
  on(event: VerificationEvent, handler: VerificationEventHandler): void;

  /**
   * Unregister an event handler
   * @param event - Event type
   * @param handler - Handler to remove
   */
  off(event: VerificationEvent, handler: VerificationEventHandler): void;
}

