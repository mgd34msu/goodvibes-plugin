/**
 * Stack-Specific Skills interfaces for Batch Engine
 * @see SPEC-v2 Section 14.1
 *
 * Defines interfaces for stack detection and stack-specific skill loading.
 * Supports React, Node.js, and Python stacks with patterns, guidance,
 * and section-based content organization.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core Skill Types (forward declaration for skills-core.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core skill names for the batch engine
 * These are framework-agnostic skills that apply across all stacks
 * @see SPEC-v2 Section 14.1
 */
export const CORE_SKILL_NAMES = [
  'type-safety',
  'error-handling',
  'async-patterns',
  'import-ordering',
  'documentation',
  'code-organization',
  'naming-conventions',
  'config-hygiene',
  'testing',
  'security',
] as const;

export type CoreSkillName = typeof CORE_SKILL_NAMES[number];

// ─────────────────────────────────────────────────────────────────────────────
// Supported Stacks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported technology stacks for stack-specific skills
 * @see SPEC-v2 Section 14.1
 */
export const SUPPORTED_STACKS = ['react', 'node', 'python'] as const;

/**
 * Type representing a supported stack
 */
export type SupportedStack = typeof SUPPORTED_STACKS[number];

/**
 * Check if a string is a supported stack
 * @param value - Value to check
 * @returns True if the value is a supported stack
 */
export function isSupportedStack(value: string): value is SupportedStack {
  return SUPPORTED_STACKS.includes(value as SupportedStack);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of stack detection for a project
 * @see SPEC-v2 Section 14.1
 */
export interface DetectedStack {
  /** The detected stack type */
  stack: SupportedStack;
  /** Confidence score from 0-1 (1 = certain) */
  confidence: number;
  /** Indicators that led to this detection */
  indicators: string[];
  /** Detected version of the stack (e.g., "18.2.0" for React) */
  version?: string;
  /** Primary framework within the stack (e.g., "next" for React) */
  framework?: string;
  /** Additional metadata about the detection */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for stack detection functionality
 * @see SPEC-v2 Section 14.1
 */
export interface StackDetector {
  /**
   * Detect all stacks in the current project
   * Scans package.json, pyproject.toml, and project structure
   * @returns Array of detected stacks sorted by confidence
   */
  detect(): Promise<DetectedStack[]>;

  /**
   * Detect stacks from a list of file paths
   * @param files - Array of file paths to analyze
   * @returns Array of detected stacks
   */
  detectFromFiles(files: string[]): DetectedStack[];

  /**
   * Detect stacks from package.json content
   * @param content - Parsed package.json content
   * @returns Array of detected stacks (React, Node)
   */
  detectFromPackageJson(content: PackageJsonContent): DetectedStack[];

  /**
   * Detect stacks from pyproject.toml content
   * @param content - Parsed pyproject.toml content
   * @returns Array of detected stacks (Python)
   */
  detectFromPyproject(content: PyprojectContent): DetectedStack[];

  /**
   * Get the primary stack for the project
   * @returns The stack with highest confidence, or undefined if none detected
   */
  getPrimaryStack(): Promise<DetectedStack | undefined>;

  /**
   * Check if a specific stack is present in the project
   * @param stack - Stack to check for
   * @param minConfidence - Minimum confidence threshold (default: 0.5)
   * @returns True if the stack is detected with sufficient confidence
   */
  hasStack(stack: SupportedStack, minConfidence?: number): Promise<boolean>;
}

/**
 * Simplified package.json structure for stack detection
 */
export interface PackageJsonContent {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  type?: 'module' | 'commonjs';
  engines?: { node?: string; npm?: string };
}

/**
 * Simplified pyproject.toml structure for stack detection
 */
export interface PyprojectContent {
  project?: {
    name?: string;
    dependencies?: string[];
    'requires-python'?: string;
  };
  tool?: {
    poetry?: {
      dependencies?: Record<string, string | { version: string }>;
      'dev-dependencies'?: Record<string, string | { version: string }>;
    };
    setuptools?: Record<string, unknown>;
    pytest?: Record<string, unknown>;
    mypy?: Record<string, unknown>;
    ruff?: Record<string, unknown>;
  };
  'build-system'?: {
    'build-backend'?: string;
    requires?: string[];
  };
}

/**
 * Confidence thresholds for stack detection
 */
export const CONFIDENCE_THRESHOLDS = {
  /** High confidence - primary indicator found */
  HIGH: 0.9,
  /** Medium confidence - secondary indicators found */
  MEDIUM: 0.7,
  /** Low confidence - only file extension indicators */
  LOW: 0.5,
  /** Minimum threshold for considering a stack present */
  MINIMUM: 0.3,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// React Stack Skill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React-specific pattern definition
 * @see SPEC-v2 Section 14.1
 */
export interface ReactPattern {
  /** Pattern name (e.g., "Compound Components") */
  name: string;
  /** Description of the pattern */
  description: string;
  /** When to use this pattern */
  when_to_use: string;
  /** Code example demonstrating the pattern */
  example: string;
  /** Related patterns */
  related?: string[];
  /** Anti-patterns to avoid */
  anti_patterns?: string[];
}

/**
 * React hooks guidance definition
 * @see SPEC-v2 Section 14.1
 */
export interface HooksGuidance {
  /** Hook name (e.g., "useState", "useEffect") */
  hook: string;
  /** Description of the hook's purpose */
  description: string;
  /** Rules for using this hook correctly */
  rules: string[];
  /** Code example demonstrating proper usage */
  example: string;
  /** Common mistakes to avoid */
  common_mistakes?: string[];
  /** Performance considerations */
  performance_notes?: string;
}

/**
 * React stack skill sections
 * Maps section names to their markdown content
 */
export interface ReactSkillSections {
  /** Component patterns and best practices */
  component_patterns: string;
  /** React hooks patterns and rules */
  hooks_patterns: string;
  /** State management approaches (Redux, Zustand, Jotai, etc.) */
  state_management: string;
  /** Testing patterns for React components */
  testing_patterns: string;
  /** Performance optimization patterns */
  performance_patterns: string;
}

/**
 * Complete React stack skill definition
 * @see SPEC-v2 Section 14.1
 */
export interface ReactStackSkill {
  /** Stack identifier */
  name: 'react';
  /** Skill display name */
  displayName: string;
  /** Skill description */
  description: string;
  /** Section content organized by topic */
  sections: ReactSkillSections;
  /** React-specific patterns */
  patterns: ReactPattern[];
  /** Hooks guidance and rules */
  hooks_guidance: HooksGuidance[];
  /** Supported React versions */
  supported_versions: string[];
  /** Compatible frameworks (Next.js, Remix, etc.) */
  frameworks: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Node.js Stack Skill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Node.js-specific pattern definition
 * @see SPEC-v2 Section 14.1
 */
export interface NodePattern {
  /** Pattern name (e.g., "Repository Pattern") */
  name: string;
  /** Description of the pattern */
  description: string;
  /** Framework this pattern applies to (optional) */
  framework?: string;
  /** Code example demonstrating the pattern */
  example: string;
  /** When to use this pattern */
  when_to_use?: string;
  /** Related patterns */
  related?: string[];
}

/**
 * Node.js middleware guidance definition
 * @see SPEC-v2 Section 14.1
 */
export interface MiddlewareGuidance {
  /** Middleware type (e.g., "error-handler", "authentication") */
  type: string;
  /** Description of the middleware's purpose */
  description: string;
  /** Recommended order in the middleware chain */
  order: number;
  /** Code example demonstrating the middleware */
  example: string;
  /** Framework this applies to */
  framework?: string;
  /** Performance considerations */
  performance_notes?: string;
}

/**
 * Node.js stack skill sections
 * Maps section names to their markdown content
 */
export interface NodeSkillSections {
  /** API design patterns and best practices */
  api_patterns: string;
  /** Middleware patterns and ordering */
  middleware_patterns: string;
  /** Async/await and Promise patterns */
  async_patterns: string;
  /** Error handling strategies */
  error_handling: string;
  /** Testing patterns for Node.js */
  testing_patterns: string;
}

/**
 * Complete Node.js stack skill definition
 * @see SPEC-v2 Section 14.1
 */
export interface NodeStackSkill {
  /** Stack identifier */
  name: 'node';
  /** Skill display name */
  displayName: string;
  /** Skill description */
  description: string;
  /** Section content organized by topic */
  sections: NodeSkillSections;
  /** Node.js-specific patterns */
  patterns: NodePattern[];
  /** Middleware guidance and ordering */
  middleware_guidance: MiddlewareGuidance[];
  /** Supported Node.js versions */
  supported_versions: string[];
  /** Compatible frameworks (Express, Fastify, Hono, etc.) */
  frameworks: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Python Stack Skill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Python-specific pattern definition
 * @see SPEC-v2 Section 14.1
 */
export interface PythonPattern {
  /** Pattern name (e.g., "Context Manager") */
  name: string;
  /** Description of the pattern */
  description: string;
  /** Framework this pattern applies to (optional) */
  framework?: string;
  /** Code example demonstrating the pattern */
  example: string;
  /** When to use this pattern */
  when_to_use?: string;
  /** PEP references */
  pep_references?: string[];
}

/**
 * Python typing guidance definition
 * @see SPEC-v2 Section 14.1
 */
export interface TypingGuidance {
  /** Type construct (e.g., "TypeVar", "Protocol", "Generic") */
  type: string;
  /** Description of when to use this type construct */
  description: string;
  /** Code example demonstrating proper usage */
  example: string;
  /** Python version requirements */
  python_version?: string;
  /** Related typing constructs */
  related?: string[];
}

/**
 * Python stack skill sections
 * Maps section names to their markdown content
 */
export interface PythonSkillSections {
  /** Async/await patterns with asyncio */
  async_patterns: string;
  /** Type hints and typing module patterns */
  typing_patterns: string;
  /** Testing patterns with pytest */
  testing_patterns: string;
  /** Project structure and module organization */
  project_structure: string;
  /** Dependency management (pip, poetry, uv) */
  dependency_management: string;
}

/**
 * Complete Python stack skill definition
 * @see SPEC-v2 Section 14.1
 */
export interface PythonStackSkill {
  /** Stack identifier */
  name: 'python';
  /** Skill display name */
  displayName: string;
  /** Skill description */
  description: string;
  /** Section content organized by topic */
  sections: PythonSkillSections;
  /** Python-specific patterns */
  patterns: PythonPattern[];
  /** Type hints guidance */
  typing_guidance: TypingGuidance[];
  /** Supported Python versions */
  supported_versions: string[];
  /** Compatible frameworks (FastAPI, Django, Flask, etc.) */
  frameworks: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack Skills Content
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete stack skills content for all supported stacks
 * @see SPEC-v2 Section 14.1
 */
export interface StackSkillsContent {
  /** React stack skill */
  react: ReactStackSkill;
  /** Node.js stack skill */
  node: NodeStackSkill;
  /** Python stack skill */
  python: PythonStackSkill;
}

/**
 * Union type for any stack skill
 */
export type AnyStackSkill = ReactStackSkill | NodeStackSkill | PythonStackSkill;

/**
 * Get the skill type for a given stack
 */
export type StackSkillFor<T extends SupportedStack> = T extends 'react'
  ? ReactStackSkill
  : T extends 'node'
    ? NodeStackSkill
    : T extends 'python'
      ? PythonStackSkill
      : never;

// ─────────────────────────────────────────────────────────────────────────────
// Stack Skills Loader
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface for loading stack-specific skills
 * @see SPEC-v2 Section 14.1
 */
export interface StackSkillsLoader {
  /**
   * Load skill content for a specific stack
   * @param stack - Stack to load skill for
   * @returns The complete stack skill
   */
  loadForStack<T extends SupportedStack>(stack: T): Promise<StackSkillFor<T>>;

  /**
   * Load all stack skills
   * @returns Complete stack skills content
   */
  loadAll(): Promise<StackSkillsContent>;

  /**
   * Get a specific section from a stack skill
   * @param stack - Stack to get section from
   * @param section - Section name
   * @returns Section content or undefined if not found
   */
  getSection(stack: SupportedStack, section: string): Promise<string | undefined>;

  /**
   * Get all patterns for a stack
   * @param stack - Stack to get patterns from
   * @returns Array of patterns
   */
  getPatterns(stack: SupportedStack): Promise<ReactPattern[] | NodePattern[] | PythonPattern[]>;

  /**
   * Get guidance for a stack (hooks, middleware, or typing)
   * @param stack - Stack to get guidance from
   * @returns Array of guidance items
   */
  getGuidance(
    stack: SupportedStack
  ): Promise<HooksGuidance[] | MiddlewareGuidance[] | TypingGuidance[]>;

  /**
   * Check if a skill is loaded and cached
   * @param stack - Stack to check
   * @returns True if the skill is already loaded
   */
  isLoaded(stack: SupportedStack): boolean;

  /**
   * Clear cached skill content
   * @param stack - Optional stack to clear (clears all if not specified)
   */
  clearCache(stack?: SupportedStack): void;

  /**
   * Preload skills for detected stacks
   * @param detectedStacks - Array of detected stacks
   */
  preloadForStacks(detectedStacks: DetectedStack[]): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stack Skills File Paths
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base paths for stack skill directories
 * @see SPEC-v2 Section 14.1
 */
export const STACK_SKILL_PATHS = {
  /** React stack skills directory */
  react: 'skills/stacks/react/',
  /** Node.js stack skills directory */
  node: 'skills/stacks/node/',
  /** Python stack skills directory */
  python: 'skills/stacks/python/',
} as const;

export type StackSkillPath = typeof STACK_SKILL_PATHS[SupportedStack];

/**
 * Files within each stack skill directory
 * @see SPEC-v2 Section 14.1
 */
export const STACK_SKILL_FILES = {
  /** React stack skill files */
  react: ['components.md', 'hooks.md', 'state.md', 'testing.md', 'performance.md'] as const,
  /** Node.js stack skill files */
  node: ['api.md', 'middleware.md', 'async.md', 'errors.md', 'testing.md'] as const,
  /** Python stack skill files */
  python: ['async.md', 'typing.md', 'testing.md', 'structure.md', 'deps.md'] as const,
} as const;

export type ReactSkillFile = typeof STACK_SKILL_FILES.react[number];
export type NodeSkillFile = typeof STACK_SKILL_FILES.node[number];
export type PythonSkillFile = typeof STACK_SKILL_FILES.python[number];
export type StackSkillFile = ReactSkillFile | NodeSkillFile | PythonSkillFile;

/**
 * Mapping from section names to file names for each stack
 */
export const SECTION_TO_FILE_MAP = {
  react: {
    component_patterns: 'components.md',
    hooks_patterns: 'hooks.md',
    state_management: 'state.md',
    testing_patterns: 'testing.md',
    performance_patterns: 'performance.md',
  },
  node: {
    api_patterns: 'api.md',
    middleware_patterns: 'middleware.md',
    async_patterns: 'async.md',
    error_handling: 'errors.md',
    testing_patterns: 'testing.md',
  },
  python: {
    async_patterns: 'async.md',
    typing_patterns: 'typing.md',
    testing_patterns: 'testing.md',
    project_structure: 'structure.md',
    dependency_management: 'deps.md',
  },
} as const;

/**
 * Get the file path for a stack skill section
 * @param stack - Stack identifier
 * @param section - Section name
 * @returns File path relative to plugin root
 */
export function getStackSkillFilePath(stack: SupportedStack, section: string): string | undefined {
  const sectionMap = SECTION_TO_FILE_MAP[stack] as Record<string, string>;
  const fileName = sectionMap[section];
  if (!fileName) return undefined;
  return `${STACK_SKILL_PATHS[stack]}${fileName}`;
}

/**
 * Get all file paths for a stack
 * @param stack - Stack identifier
 * @returns Array of file paths
 */
export function getAllStackSkillFilePaths(stack: SupportedStack): string[] {
  const basePath = STACK_SKILL_PATHS[stack];
  const files = STACK_SKILL_FILES[stack];
  return files.map((file) => `${basePath}${file}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Relevant section reference for agent context
 */
export interface RelevantSection {
  /** Skill name (core or stack) */
  skill: string;
  /** Section within the skill */
  section: string;
  /** Section content */
  content: string;
  /** Relevance score (0-1) */
  relevance?: number;
}

/**
 * Combined skill context for agents
 * Includes both core skills and stack-specific skills
 * @see SPEC-v2 Section 14.1
 */
export interface SkillContext {
  /** Core skills applicable to the task */
  core: CoreSkillName[];
  /** Detected stacks in the project */
  stacks: DetectedStack[];
  /** Names of skills that have been loaded into context */
  loaded_skills: string[];
  /** Relevant sections extracted from skills */
  relevant_sections: RelevantSection[];
  /** Total token count of loaded skill content */
  token_count?: number;
  /** Maximum allowed tokens for skills */
  token_budget?: number;
}

/**
 * Empty skill context for initialization
 */
export const EMPTY_SKILL_CONTEXT: SkillContext = {
  core: [],
  stacks: [],
  loaded_skills: [],
  relevant_sections: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Stack Detection Indicators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Package indicators for React detection
 */
export const REACT_INDICATORS = {
  /** Primary React packages */
  primary: ['react', 'react-dom', 'react-native'],
  /** React frameworks */
  frameworks: ['next', 'remix', 'gatsby', '@remix-run/react', 'expo'],
  /** React state management */
  state: ['redux', '@reduxjs/toolkit', 'zustand', 'jotai', 'recoil', 'mobx-react'],
  /** React testing libraries */
  testing: ['@testing-library/react', 'enzyme', 'react-test-renderer'],
} as const;

/**
 * Package indicators for Node.js detection
 */
export const NODE_INDICATORS = {
  /** Primary Node.js server packages */
  primary: ['express', 'fastify', 'koa', 'hono', '@hono/node-server', 'nest'],
  /** Node.js frameworks */
  frameworks: ['@nestjs/core', 'express', 'fastify', 'hono', 'koa'],
  /** Node.js utilities */
  utilities: ['dotenv', 'cors', 'helmet', 'morgan', 'compression'],
  /** Node.js ORMs */
  orms: ['prisma', 'drizzle-orm', 'typeorm', 'sequelize', 'mongoose', 'kysely'],
} as const;

/**
 * Package indicators for Python detection
 */
export const PYTHON_INDICATORS = {
  /** Primary Python packages */
  primary: ['fastapi', 'django', 'flask', 'starlette', 'aiohttp'],
  /** Python frameworks */
  frameworks: ['fastapi', 'django', 'flask', 'tornado', 'sanic'],
  /** Python testing */
  testing: ['pytest', 'unittest', 'hypothesis', 'tox'],
  /** Python type checking */
  typing: ['mypy', 'pyright', 'pydantic'],
} as const;

/**
 * File extension indicators for stack detection
 */
export const FILE_EXTENSION_INDICATORS = {
  react: ['.jsx', '.tsx'],
  node: ['.mjs', '.cjs'],
  python: ['.py', '.pyi', '.pyx'],
} as const;

/**
 * Configuration file indicators for stack detection
 */
export const CONFIG_FILE_INDICATORS = {
  react: ['next.config.js', 'next.config.mjs', 'remix.config.js', 'gatsby-config.js'],
  node: ['tsconfig.json', 'package.json', 'nodemon.json', '.nvmrc'],
  python: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile'],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Default Stack Skills
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default empty React stack skill for initialization
 */
export const DEFAULT_REACT_SKILL: ReactStackSkill = {
  name: 'react',
  displayName: 'React',
  description: 'React component patterns, hooks, and best practices',
  sections: {
    component_patterns: '',
    hooks_patterns: '',
    state_management: '',
    testing_patterns: '',
    performance_patterns: '',
  },
  patterns: [],
  hooks_guidance: [],
  supported_versions: ['17.x', '18.x', '19.x'],
  frameworks: ['next', 'remix', 'gatsby', 'vite'],
};

/**
 * Default empty Node.js stack skill for initialization
 */
export const DEFAULT_NODE_SKILL: NodeStackSkill = {
  name: 'node',
  displayName: 'Node.js',
  description: 'Node.js API patterns, middleware, and server best practices',
  sections: {
    api_patterns: '',
    middleware_patterns: '',
    async_patterns: '',
    error_handling: '',
    testing_patterns: '',
  },
  patterns: [],
  middleware_guidance: [],
  supported_versions: ['18.x', '20.x', '22.x'],
  frameworks: ['express', 'fastify', 'hono', 'nest'],
};

/**
 * Default empty Python stack skill for initialization
 */
export const DEFAULT_PYTHON_SKILL: PythonStackSkill = {
  name: 'python',
  displayName: 'Python',
  description: 'Python async patterns, typing, and project structure',
  sections: {
    async_patterns: '',
    typing_patterns: '',
    testing_patterns: '',
    project_structure: '',
    dependency_management: '',
  },
  patterns: [],
  typing_guidance: [],
  supported_versions: ['3.10', '3.11', '3.12', '3.13'],
  frameworks: ['fastapi', 'django', 'flask', 'starlette'],
};

/**
 * Default empty stack skills content
 */
export const DEFAULT_STACK_SKILLS_CONTENT: StackSkillsContent = {
  react: DEFAULT_REACT_SKILL,
  node: DEFAULT_NODE_SKILL,
  python: DEFAULT_PYTHON_SKILL,
};

/**
 * Get default skill for a stack
 * @param stack - Stack identifier
 * @returns Default skill for the stack
 */
export function getDefaultSkillForStack<T extends SupportedStack>(stack: T): StackSkillFor<T> {
  const defaults: Record<SupportedStack, AnyStackSkill> = {
    react: DEFAULT_REACT_SKILL,
    node: DEFAULT_NODE_SKILL,
    python: DEFAULT_PYTHON_SKILL,
  };
  return defaults[stack] as StackSkillFor<T>;
}
