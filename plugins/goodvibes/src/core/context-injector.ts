/**
 * Task types for context detection.
 */
export type TaskType =
  | "backend"
  | "frontend"
  | "fullstack"
  | "testing"
  | "review"
  | "architecture"
  | "deployment"
  | "content"
  | "planning"
  | "general";

/**
 * Context source types.
 */
export type ContextSource = "skill" | "convention" | "state" | "memory" | "codebase" | "custom";

/**
 * A context item to be injected.
 */
export interface ContextItem {
  /** Unique identifier */
  id: string;
  /** Source type */
  source: ContextSource;
  /** Content to inject */
  content: string;
  /** Priority (higher = injected earlier) */
  priority: number;
  /** Task types this applies to */
  task_types?: TaskType[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Assembled context ready for injection.
 */
export interface AssembledContext {
  /** All context items in order */
  items: ContextItem[];
  /** Total character count */
  total_chars: number;
  /** Task type that was detected */
  detected_task_type: TaskType;
  /** Assembly timestamp */
  assembled_at: string;
}

/**
 * Detection result.
 */
export interface DetectionResult {
  /** Detected task type */
  task_type: TaskType;
  /** Confidence score (0-1) */
  confidence: number;
  /** Keywords that triggered detection */
  matched_keywords: string[];
  /** Suggested agent type */
  suggested_agent?: string;
}

/**
 * Context injector configuration.
 */
export interface ContextInjectorConfig {
  /** Maximum total context size in characters */
  max_context_chars: number;
  /** Whether to auto-detect task type */
  auto_detect: boolean;
  /** Default task type when detection fails */
  default_task_type: TaskType;
  /** Minimum confidence for detection */
  min_detection_confidence: number;
}

/**
 * Keyword patterns for task type detection.
 */
const DETECTION_PATTERNS: Record<TaskType, string[]> = {
  backend: [
    "api", "rest", "graphql", "trpc", "endpoint", "route", "database", "sql",
    "prisma", "drizzle", "postgresql", "mysql", "mongodb", "redis", "auth",
    "authentication", "jwt", "oauth", "middleware", "server", "backend",
    "validation", "schema", "migration", "seed", "crud", "webhook"
  ],
  frontend: [
    "ui", "component", "react", "vue", "svelte", "next", "nuxt", "remix",
    "astro", "page", "layout", "navigation", "header", "footer", "modal",
    "button", "form", "input", "card", "css", "tailwind", "styled", "theme",
    "dark mode", "responsive", "mobile", "animation", "accessibility", "a11y",
    "seo", "hydration", "ssr", "routing"
  ],
  fullstack: [
    "state", "zustand", "redux", "jotai", "tanstack", "react query", "swr",
    "cache", "fetch", "mutation", "form validation", "zod", "real-time",
    "websocket", "socket.io", "live", "sync", "ai", "llm", "chatgpt", "claude",
    "openai", "anthropic", "streaming", "chat", "rag", "vector", "embeddings"
  ],
  testing: [
    "test", "testing", "unit test", "integration", "e2e", "vitest", "jest",
    "playwright", "cypress", "testing library", "coverage", "mock", "msw",
    "stub", "spy", "fixture", "snapshot", "tdd", "assertion", "describe",
    "storybook", "visual test", "regression"
  ],
  review: [
    "review", "code review", "audit", "quality", "assess", "evaluate",
    "critique", "feedback", "score", "rate", "check my code", "technical debt",
    "code smell", "best practices", "clean code", "maintainability",
    "pr review", "pull request", "honest feedback", "production ready"
  ],
  architecture: [
    "refactor", "restructure", "reorganize", "architecture", "folder structure",
    "file organization", "module", "clean up", "extract", "abstract",
    "consolidate", "dry", "solid", "design pattern", "dependency",
    "circular dependency", "dead code", "duplication", "decouple",
    "separation of concerns", "barrel file"
  ],
  deployment: [
    "deploy", "deployment", "hosting", "vercel", "netlify", "cloudflare",
    "aws", "railway", "fly.io", "docker", "container", "ci/cd", "pipeline",
    "github actions", "build", "bundle", "vite", "webpack", "production",
    "staging", "environment", "env", "domain", "ssl", "cdn", "monitoring",
    "sentry", "analytics", "serverless", "edge"
  ],
  content: [
    "cms", "content management", "sanity", "contentful", "strapi", "payload",
    "blog", "posts", "articles", "mdx", "markdown", "rich text", "email",
    "resend", "sendgrid", "newsletter", "payment", "stripe", "checkout",
    "subscription", "billing", "e-commerce", "cart", "order", "file upload",
    "uploadthing", "cloudinary", "s3", "storage", "media"
  ],
  planning: [
    "plan", "planning", "breakdown", "complex task", "multi-step",
    "architecture plan", "implementation plan", "roadmap", "task list",
    "work breakdown", "approach", "step by step", "phases", "dependencies",
    "parallel", "orchestrate", "sequence", "prioritize", "scope", "blockers"
  ],
  general: []
};

/**
 * Agent type suggestions based on task type.
 */
const AGENT_SUGGESTIONS: Record<TaskType, string> = {
  backend: "goodvibes:backend-engineer",
  frontend: "goodvibes:frontend-architect",
  fullstack: "goodvibes:fullstack-integrator",
  testing: "goodvibes:test-engineer",
  review: "goodvibes:brutally-honest-reviewer",
  architecture: "goodvibes:code-architect",
  deployment: "goodvibes:devops-deployer",
  content: "goodvibes:content-platform",
  planning: "goodvibes:workflow-planner",
  general: "general-purpose"
};

/** Default configuration */
const DEFAULT_CONFIG: ContextInjectorConfig = {
  max_context_chars: 50000,
  auto_detect: true,
  default_task_type: "general",
  min_detection_confidence: 0.3,
};

/**
 * Context injection system for automatic context assembly based on task type.
 */
export class ContextInjector {
  private config: ContextInjectorConfig;
  private contextItems: Map<string, ContextItem>;
  private skillLoader: ((skillName: string) => Promise<string | null>) | null = null;
  private conventionLoader: ((projectPath: string) => Promise<string | null>) | null = null;
  private stateProvider: (() => Record<string, unknown>) | null = null;

  /**
   * Creates a new ContextInjector instance.
   */
  constructor(config: Partial<ContextInjectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.contextItems = new Map();
  }

  /**
   * Sets the skill loader function.
   */
  setSkillLoader(loader: (skillName: string) => Promise<string | null>): void {
    this.skillLoader = loader;
  }

  /**
   * Sets the convention loader function.
   */
  setConventionLoader(loader: (projectPath: string) => Promise<string | null>): void {
    this.conventionLoader = loader;
  }

  /**
   * Sets the state provider function.
   */
  setStateProvider(provider: () => Record<string, unknown>): void {
    this.stateProvider = provider;
  }

  /**
   * Registers a context item.
   */
  registerContext(item: ContextItem): void {
    this.contextItems.set(item.id, item);
  }

  /**
   * Unregisters a context item.
   */
  unregisterContext(id: string): boolean {
    return this.contextItems.delete(id);
  }

  /**
   * Detects the task type from input text.
   */
  detectTaskType(input: string): DetectionResult {
    const normalizedInput = input.toLowerCase();
    const scores: Record<TaskType, { score: number; keywords: string[] }> = {} as Record<
      TaskType,
      { score: number; keywords: string[] }
    >;

    // Calculate scores for each task type
    for (const [taskType, patterns] of Object.entries(DETECTION_PATTERNS) as [TaskType, string[]][]) {
      const matchedKeywords: string[] = [];
      let score = 0;

      for (const pattern of patterns) {
        if (normalizedInput.includes(pattern)) {
          matchedKeywords.push(pattern);
          score += 1;
        }
      }

      scores[taskType] = { score, keywords: matchedKeywords };
    }

    // Find the highest scoring task type
    let maxScore = 0;
    let detectedType: TaskType = this.config.default_task_type;
    let matchedKeywords: string[] = [];

    for (const [taskType, { score, keywords }] of Object.entries(scores) as [
      TaskType,
      { score: number; keywords: string[] }
    ][]) {
      if (score > maxScore) {
        maxScore = score;
        detectedType = taskType;
        matchedKeywords = keywords;
      }
    }

    // Calculate confidence
    const maxPossibleScore = Math.max(...Object.values(DETECTION_PATTERNS).map((p) => p.length));
    const confidence = maxScore > 0 ? Math.min(maxScore / (maxPossibleScore * 0.2), 1) : 0;

    // Fall back to default if confidence is too low
    if (confidence < this.config.min_detection_confidence) {
      detectedType = this.config.default_task_type;
      matchedKeywords = [];
    }

    return {
      task_type: detectedType,
      confidence,
      matched_keywords: matchedKeywords,
      suggested_agent: AGENT_SUGGESTIONS[detectedType],
    };
  }

  /**
   * Assembles context for a given task type.
   */
  async assembleContext(
    taskType: TaskType,
    options: {
      skills?: string[];
      includeConventions?: boolean;
      includeState?: boolean;
      customContext?: ContextItem[];
    } = {}
  ): Promise<AssembledContext> {
    const items: ContextItem[] = [];

    // Add registered context items that match the task type
    for (const item of this.contextItems.values()) {
      if (!item.task_types || item.task_types.includes(taskType)) {
        items.push(item);
      }
    }

    // Load and add skills
    if (options.skills && this.skillLoader) {
      for (const skillName of options.skills) {
        const content = await this.skillLoader(skillName);
        if (content) {
          items.push({
            id: `skill:${skillName}`,
            source: "skill",
            content,
            priority: 80,
            task_types: [taskType],
          });
        }
      }
    }

    // Load and add conventions
    if (options.includeConventions && this.conventionLoader) {
      const conventions = await this.conventionLoader(process.cwd());
      if (conventions) {
        items.push({
          id: "conventions",
          source: "convention",
          content: conventions,
          priority: 70,
        });
      }
    }

    // Add state context
    if (options.includeState && this.stateProvider) {
      const state = this.stateProvider();
      items.push({
        id: "state",
        source: "state",
        content: JSON.stringify(state, null, 2),
        priority: 60,
      });
    }

    // Add custom context items
    if (options.customContext) {
      items.push(...options.customContext);
    }

    // Sort by priority (higher first)
    items.sort((a, b) => b.priority - a.priority);

    // Truncate to max size
    let totalChars = 0;
    const finalItems: ContextItem[] = [];

    for (const item of items) {
      if (totalChars + item.content.length <= this.config.max_context_chars) {
        finalItems.push(item);
        totalChars += item.content.length;
      } else {
        // Try to fit a truncated version
        const remaining = this.config.max_context_chars - totalChars;
        if (remaining > 500) {
          finalItems.push({
            ...item,
            content: item.content.slice(0, remaining - 20) + "\n[truncated...]",
          });
          totalChars += remaining;
        }
        break;
      }
    }

    return {
      items: finalItems,
      total_chars: totalChars,
      detected_task_type: taskType,
      assembled_at: new Date().toISOString(),
    };
  }

  /**
   * Auto-injects context based on task description.
   */
  async autoInject(
    taskDescription: string,
    options: {
      skills?: string[];
      includeConventions?: boolean;
      includeState?: boolean;
    } = {}
  ): Promise<AssembledContext> {
    // Detect task type
    const detection = this.detectTaskType(taskDescription);

    // Get default skills for task type
    const defaultSkills = this.getDefaultSkillsForTaskType(detection.task_type);
    const allSkills = [...(options.skills || []), ...defaultSkills];

    // Assemble context
    return this.assembleContext(detection.task_type, {
      ...options,
      skills: allSkills,
    });
  }

  /**
   * Gets default skills for a task type.
   */
  private getDefaultSkillsForTaskType(taskType: TaskType): string[] {
    const skillMap: Record<TaskType, string[]> = {
      backend: ["api-design", "database-patterns", "error-handling"],
      frontend: ["component-patterns", "styling-best-practices", "accessibility"],
      fullstack: ["state-management", "form-handling", "data-fetching"],
      testing: ["testing-strategies", "mocking-patterns"],
      review: ["code-quality", "security-checklist"],
      architecture: ["design-patterns", "refactoring-techniques"],
      deployment: ["ci-cd-patterns", "monitoring-setup"],
      content: ["cms-integration", "payment-integration"],
      planning: ["task-breakdown", "estimation"],
      general: [],
    };

    return skillMap[taskType] || [];
  }

  /**
   * Gets the configuration.
   */
  getConfig(): ContextInjectorConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   */
  updateConfig(config: Partial<ContextInjectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets all registered context items.
   */
  getRegisteredContexts(): ContextItem[] {
    return Array.from(this.contextItems.values());
  }

  /**
   * Clears all registered context items.
   */
  clearContexts(): void {
    this.contextItems.clear();
  }

  /**
   * Gets agent suggestion for a task.
   */
  suggestAgent(taskDescription: string): string {
    const detection = this.detectTaskType(taskDescription);
    return detection.suggested_agent || "general-purpose";
  }
}
