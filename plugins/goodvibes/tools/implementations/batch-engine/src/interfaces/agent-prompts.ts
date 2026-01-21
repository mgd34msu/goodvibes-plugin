/**
 * Agent Prompt interfaces for Batch Engine
 * @see SPEC-v2 Section 12
 */

import type { AgentContext } from './context.js';
import type { AgentSpec } from './operations/exec.js';

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Agent types matching the goodvibes plugin agents
 * These are the 6 consolidated agents plus supporting agents
 */
export type AgentType =
  | 'goodvibes:backend-engineer'
  | 'goodvibes:frontend-architect'
  | 'goodvibes:fullstack-integrator'
  | 'goodvibes:test-engineer'
  | 'goodvibes:brutally-honest-reviewer'
  | 'goodvibes:code-architect'
  | 'goodvibes:devops-deployer'
  | 'goodvibes:content-platform'
  | 'goodvibes:workflow-planner';

// =============================================================================
// Prompt Template Variables
// =============================================================================

/**
 * Variables available for prompt template interpolation
 */
export interface PromptVariables {
  /** Primary task description */
  task: string;
  /** Files/directories in scope */
  scope: string[];
  /** Constraints to follow */
  constraints: string[];
  /** Full agent context */
  context: AgentContext;
  /** Results from prior agents in the chain */
  prior_results?: Record<string, unknown>;
  /** Relevant past decisions */
  relevant_decisions?: string[];
  /** Relevant patterns to follow */
  relevant_patterns?: string[];
  /** Past failures to avoid */
  past_failures?: string[];
  /** Budget constraints */
  budget?: {
    tokens_remaining: number;
    turns_remaining: number;
  };
}

// =============================================================================
// Prompt Sections
// =============================================================================

/**
 * A section of a prompt template
 */
export interface PromptSection {
  /** Section identifier */
  name: string;
  /** Section content (may contain interpolation placeholders) */
  content: string;
  /** Whether this section is required in the final prompt */
  required: boolean;
  /** Order in which sections appear (lower = earlier) */
  order: number;
}

/**
 * Default sections included in all agent prompts
 */
export const DEFAULT_SECTIONS: PromptSection[] = [
  { name: 'role', content: '', required: true, order: 0 },
  { name: 'task', content: '', required: true, order: 1 },
  { name: 'scope', content: '', required: true, order: 2 },
  { name: 'constraints', content: '', required: false, order: 3 },
  { name: 'context', content: '', required: false, order: 4 },
  { name: 'prior_results', content: '', required: false, order: 5 },
  { name: 'decisions', content: '', required: false, order: 6 },
  { name: 'patterns', content: '', required: false, order: 7 },
  { name: 'failures', content: '', required: false, order: 8 },
  { name: 'budget', content: '', required: false, order: 9 },
  { name: 'output_format', content: '', required: true, order: 10 },
];

// =============================================================================
// Prompt Templates
// =============================================================================

/**
 * A complete prompt template for an agent type
 */
export interface PromptTemplate {
  /** Agent type this template is for */
  agent_type: AgentType;
  /** Ordered sections of the prompt */
  sections: PromptSection[];
  /** Maximum tokens for the prompt (for truncation) */
  max_tokens?: number;
}

/**
 * Result of building a prompt from a template
 */
export interface BuiltPrompt {
  /** Agent type the prompt was built for */
  agent_type: AgentType;
  /** The complete prompt string */
  full_prompt: string;
  /** Estimated token count */
  token_estimate: number;
  /** Names of sections included in the prompt */
  sections_included: string[];
  /** Names of sections omitted (e.g., due to token limits) */
  sections_omitted: string[];
  /** Whether the prompt was truncated to fit token limits */
  truncated: boolean;
}

// =============================================================================
// Agent Role Descriptions
// =============================================================================

/**
 * Role descriptions for each agent type
 * Used in the 'role' section of prompts
 */
export const AGENT_ROLES: Record<AgentType, string> = {
  'goodvibes:backend-engineer':
    'Backend engineer specializing in APIs, databases, authentication, and server-side logic',
  'goodvibes:frontend-architect':
    'Frontend architect specializing in UI components, styling, and client-side rendering',
  'goodvibes:fullstack-integrator':
    'Fullstack integrator specializing in state management, forms, real-time features, and AI integration',
  'goodvibes:test-engineer':
    'Test engineer specializing in unit tests, integration tests, and E2E testing',
  'goodvibes:brutally-honest-reviewer':
    'Code reviewer providing thorough, honest assessment of code quality',
  'goodvibes:code-architect':
    'Code architect specializing in refactoring, structure, and design patterns',
  'goodvibes:devops-deployer':
    'DevOps engineer specializing in deployment, CI/CD, and infrastructure',
  'goodvibes:content-platform':
    'Content platform specialist for CMS, email, payments, and file uploads',
  'goodvibes:workflow-planner':
    'Workflow planner for breaking down complex tasks and coordinating work',
};

// =============================================================================
// Context Injection Configuration
// =============================================================================

/**
 * Configuration for injecting context into agent prompts
 */
export interface ContextInjectionConfig {
  /** Include past decisions in context */
  include_decisions: boolean;
  /** Include recognized patterns in context */
  include_patterns: boolean;
  /** Include past failures in context */
  include_failures: boolean;
  /** Include results from prior agents */
  include_prior_results: boolean;
  /** Maximum number of decisions to include */
  max_decisions: number;
  /** Maximum number of patterns to include */
  max_patterns: number;
  /** Maximum number of failures to include */
  max_failures: number;
}

/**
 * Default context injection configuration
 */
export const DEFAULT_CONTEXT_INJECTION: ContextInjectionConfig = {
  include_decisions: true,
  include_patterns: true,
  include_failures: true,
  include_prior_results: true,
  max_decisions: 5,
  max_patterns: 3,
  max_failures: 3,
};

// =============================================================================
// Prompt Builder Interface
// =============================================================================

/**
 * Interface for building agent prompts
 */
export interface PromptBuilder {
  // -------------------------------------------------------------------------
  // Build prompts
  // -------------------------------------------------------------------------

  /**
   * Build a prompt for a specific agent type with variables
   */
  build(agent_type: AgentType, variables: PromptVariables): BuiltPrompt;

  /**
   * Build a prompt from an agent spec and context
   */
  buildFromSpec(spec: AgentSpec, context: AgentContext): BuiltPrompt;

  // -------------------------------------------------------------------------
  // Template management
  // -------------------------------------------------------------------------

  /**
   * Get the template for an agent type
   */
  getTemplate(agent_type: AgentType): PromptTemplate | undefined;

  /**
   * Register a new template or replace an existing one
   */
  registerTemplate(template: PromptTemplate): void;

  // -------------------------------------------------------------------------
  // Section management
  // -------------------------------------------------------------------------

  /**
   * Add a section to an agent's template
   */
  addSection(agent_type: AgentType, section: PromptSection): void;

  /**
   * Remove a section from an agent's template
   */
  removeSection(agent_type: AgentType, section_name: string): void;

  // -------------------------------------------------------------------------
  // Optimization
  // -------------------------------------------------------------------------

  /**
   * Estimate token count for a prompt string
   */
  estimateTokens(prompt: string): number;

  /**
   * Truncate a prompt to fit within token limits
   */
  truncateToFit(prompt: string, max_tokens: number): string;
}

// =============================================================================
// Prompt Builder Events
// =============================================================================

/**
 * Events emitted during prompt building
 */
export type PromptBuilderEvent =
  | { type: 'section_added'; agent_type: AgentType; section: string }
  | { type: 'section_omitted'; agent_type: AgentType; section: string; reason: string }
  | { type: 'prompt_truncated'; agent_type: AgentType; original_tokens: number; final_tokens: number }
  | { type: 'template_registered'; agent_type: AgentType }
  | { type: 'template_not_found'; agent_type: AgentType };

/**
 * Event handler for prompt builder events
 */
export type PromptBuilderEventHandler = (event: PromptBuilderEvent) => void;

// =============================================================================
// Prompt Validation
// =============================================================================

/**
 * Result of validating a prompt template
 */
export interface PromptValidationResult {
  /** Whether the template is valid */
  valid: boolean;
  /** Validation errors if invalid */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
}

/**
 * Validate a prompt template
 */
export interface PromptValidator {
  /**
   * Validate a prompt template
   */
  validate(template: PromptTemplate): PromptValidationResult;

  /**
   * Validate a built prompt
   */
  validateBuilt(prompt: BuiltPrompt): PromptValidationResult;
}
