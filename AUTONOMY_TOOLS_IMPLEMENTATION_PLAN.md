# Autonomy Tools Implementation Plan

## Overview

**Goal:** Enhance GoodVibes plugin with 35 new tools enabling fully autonomous agent-driven coding.

**Current State:** 56 MCP tools
**Target State:** 91 MCP tools

**Timeline:** 6 Phases

---

## Phase 1: Process & Server Management (Week 1)
**Theme:** Foundation for runtime verification

### Tools (3)

#### 1.1 `start_dev_server`
- **Type:** Process Management
- **Priority:** P0 (blocks other tools)
- **Complexity:** Medium
- **Implementation:**
  - Spawn process with `child_process.spawn()`
  - Detect "ready" state via stdout patterns (e.g., "ready on", "listening on")
  - Health check endpoint polling
  - Graceful shutdown with SIGTERM/SIGKILL fallback
  - Return PID, port, ready state
- **Input Schema:**
  ```typescript
  {
    command: string;       // e.g., "npm run dev"
    ready_pattern?: string; // regex to detect ready state
    health_url?: string;   // URL to poll for health
    timeout?: number;      // max wait for ready (default 30s)
    port?: number;         // expected port
  }
  ```
- **Output Schema:**
  ```typescript
  {
    pid: number;
    port: number;
    status: "running" | "ready" | "failed";
    url: string;
    logs: string[];  // last N lines of output
  }
  ```
- **Dependencies:** None
- **Test Strategy:** Start a simple HTTP server, verify ready detection

#### 1.2 `health_monitor`
- **Type:** Background Monitoring
- **Priority:** P1
- **Complexity:** Medium-High
- **Implementation:**
  - Attach to running process by PID
  - Stream stdout/stderr to ring buffer
  - Pattern match for errors, warnings, crashes
  - Periodic health endpoint checks
  - Memory/CPU sampling via `process.memoryUsage()` equivalent
- **Input Schema:**
  ```typescript
  {
    pid: number;
    health_url?: string;
    error_patterns?: string[];  // regexes to flag as errors
    sample_interval?: number;   // ms between checks (default 5000)
  }
  ```
- **Output Schema:**
  ```typescript
  {
    status: "healthy" | "degraded" | "unhealthy" | "crashed";
    uptime: number;
    memory_mb: number;
    errors: Array<{ timestamp: string; message: string }>;
    warnings: Array<{ timestamp: string; message: string }>;
    last_health_check: { status: number; latency_ms: number };
  }
  ```
- **Dependencies:** `start_dev_server` (for testing)
- **Test Strategy:** Start server, inject errors, verify detection

#### 1.3 `watch_for_errors`
- **Type:** Log Monitoring
- **Priority:** P1
- **Complexity:** Medium
- **Implementation:**
  - Tail log file or process stdout
  - Pattern match against common error signatures
  - Stack trace extraction and grouping
  - Deduplication of repeated errors
- **Input Schema:**
  ```typescript
  {
    source: "pid" | "file";
    pid?: number;
    file_path?: string;
    patterns?: string[];  // custom error patterns
    duration?: number;    // how long to watch (default: until stopped)
  }
  ```
- **Output Schema:**
  ```typescript
  {
    errors: Array<{
      timestamp: string;
      type: string;
      message: string;
      stack?: string;
      count: number;  // occurrences
    }>;
    total_errors: number;
    unique_errors: number;
    watching: boolean;
  }
  ```
- **Dependencies:** None (but pairs with `start_dev_server`)
- **Test Strategy:** Generate known errors, verify capture

---

## Phase 2: Runtime Verification (Week 2)
**Theme:** Verify code actually works

### Tools (4)

#### 2.1 `verify_runtime_behavior`
- **Type:** HTTP Testing
- **Priority:** P0
- **Complexity:** Medium
- **Implementation:**
  - Make HTTP requests to running server
  - Compare response against expectations
  - Support for status code, headers, body matching
  - JSON path assertions
  - Response time thresholds
- **Input Schema:**
  ```typescript
  {
    requests: Array<{
      method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
      url: string;
      headers?: Record<string, string>;
      body?: unknown;
      expect: {
        status?: number;
        headers?: Record<string, string>;
        body?: unknown;         // exact match
        body_contains?: string; // substring
        json_path?: Array<{ path: string; value: unknown }>;
        max_latency_ms?: number;
      };
    }>;
    base_url?: string;
    timeout?: number;
  }
  ```
- **Output Schema:**
  ```typescript
  {
    passed: boolean;
    results: Array<{
      request: { method: string; url: string };
      passed: boolean;
      actual: { status: number; body: unknown; latency_ms: number };
      failures: string[];  // what didn't match
    }>;
    summary: { total: number; passed: number; failed: number };
  }
  ```
- **Dependencies:** Running server (from `start_dev_server`)
- **Test Strategy:** Test against known API endpoints

#### 2.2 `browser_automation`
- **Type:** E2E Testing
- **Priority:** P0
- **Complexity:** High
- **Implementation:**
  - Puppeteer or Playwright integration
  - Page navigation, clicking, typing, waiting
  - Screenshot capture
  - Console log/error capture
  - Network request interception
- **Input Schema:**
  ```typescript
  {
    steps: Array<{
      action: "goto" | "click" | "type" | "wait" | "screenshot" | "assert";
      selector?: string;
      url?: string;
      text?: string;
      timeout?: number;
      filename?: string;  // for screenshot
      assertion?: {
        type: "visible" | "hidden" | "text_contains" | "url_contains";
        value?: string;
      };
    }>;
    viewport?: { width: number; height: number };
    headless?: boolean;
  }
  ```
- **Output Schema:**
  ```typescript
  {
    success: boolean;
    steps: Array<{
      action: string;
      success: boolean;
      error?: string;
      screenshot?: string;  // base64 or file path
      duration_ms: number;
    }>;
    console_logs: string[];
    console_errors: string[];
    final_url: string;
  }
  ```
- **Dependencies:** Puppeteer/Playwright npm package
- **Test Strategy:** Navigate to page, click button, verify state change

#### 2.3 `visual_regression`
- **Type:** Screenshot Comparison
- **Priority:** P1
- **Complexity:** Medium
- **Implementation:**
  - Take screenshot of URL/element
  - Compare against baseline using pixel diff
  - Configurable threshold for acceptable diff
  - Generate diff image highlighting changes
- **Input Schema:**
  ```typescript
  {
    url: string;
    selector?: string;      // specific element, or full page
    baseline_path: string;  // path to baseline image
    threshold?: number;     // 0-1, acceptable diff ratio (default 0.01)
    viewport?: { width: number; height: number };
    wait_for?: string;      // selector to wait for before screenshot
  }
  ```
- **Output Schema:**
  ```typescript
  {
    match: boolean;
    diff_ratio: number;           // 0-1
    diff_pixels: number;
    baseline_path: string;
    actual_path: string;
    diff_path?: string;           // only if mismatch
    dimensions: { width: number; height: number };
  }
  ```
- **Dependencies:** `browser_automation` (for screenshot), pixelmatch library
- **Test Strategy:** Compare identical pages, then modify and detect diff

#### 2.4 `lighthouse_audit`
- **Type:** Performance Analysis
- **Priority:** P2
- **Complexity:** Medium
- **Implementation:**
  - Run Lighthouse via lighthouse npm package
  - Capture performance, accessibility, best practices, SEO scores
  - Extract key metrics (LCP, FID, CLS)
  - Recommendations extraction
- **Input Schema:**
  ```typescript
  {
    url: string;
    categories?: Array<"performance" | "accessibility" | "best-practices" | "seo">;
    device?: "mobile" | "desktop";
    throttling?: boolean;  // simulate slow network
  }
  ```
- **Output Schema:**
  ```typescript
  {
    scores: {
      performance: number;
      accessibility: number;
      best_practices: number;
      seo: number;
    };
    metrics: {
      first_contentful_paint: number;
      largest_contentful_paint: number;
      cumulative_layout_shift: number;
      total_blocking_time: number;
      speed_index: number;
    };
    opportunities: Array<{
      title: string;
      description: string;
      savings_ms?: number;
      savings_bytes?: number;
    }>;
    diagnostics: Array<{ title: string; description: string }>;
  }
  ```
- **Dependencies:** lighthouse npm package, Chrome
- **Test Strategy:** Audit known URL, verify scores returned

---

## Phase 3: Self-Correction & Safety (Week 3)
**Theme:** Recover from failures automatically

### Tools (5)

#### 3.1 `atomic_multi_edit`
- **Type:** File Operations
- **Priority:** P0
- **Complexity:** Medium-High
- **Implementation:**
  - Accept multiple file edits as transaction
  - Create backup of all files before editing
  - Apply edits sequentially
  - Run validation (TypeScript check) after all edits
  - If validation fails, restore all backups
  - Return success only if all edits + validation pass
- **Input Schema:**
  ```typescript
  {
    edits: Array<{
      file: string;
      old_text: string;
      new_text: string;
    }>;
    validate?: {
      type_check?: boolean;   // run tsc --noEmit
      lint?: boolean;         // run eslint
      test?: boolean;         // run tests
      custom?: string;        // custom command
    };
    dry_run?: boolean;        // preview only, don't apply
  }
  ```
- **Output Schema:**
  ```typescript
  {
    success: boolean;
    applied: boolean;
    edits: Array<{
      file: string;
      success: boolean;
      error?: string;
    }>;
    validation: {
      passed: boolean;
      type_errors?: string[];
      lint_errors?: string[];
      test_failures?: string[];
    };
    rollback_performed: boolean;
  }
  ```
- **Dependencies:** Existing Edit tool patterns
- **Test Strategy:** Apply breaking change, verify rollback

#### 3.2 `auto_rollback`
- **Type:** Git Operations
- **Priority:** P0
- **Complexity:** Medium
- **Implementation:**
  - Track files modified since last "checkpoint"
  - Run specified validation command
  - If validation fails, `git checkout` all modified files
  - Optionally stash changes before rollback
- **Input Schema:**
  ```typescript
  {
    trigger: "test_failure" | "type_error" | "lint_error" | "custom";
    validation_command?: string;  // command that returns non-zero on failure
    stash_before_rollback?: boolean;
    files?: string[];  // specific files, or all modified
  }
  ```
- **Output Schema:**
  ```typescript
  {
    validation_passed: boolean;
    validation_output: string;
    rollback_performed: boolean;
    files_reverted: string[];
    stash_ref?: string;  // if stashed
  }
  ```
- **Dependencies:** Git
- **Test Strategy:** Make breaking change, run tests, verify revert

#### 3.3 `retry_with_learning`
- **Type:** Meta/Orchestration
- **Priority:** P1
- **Complexity:** High
- **Implementation:**
  - Execute action (tool call or command)
  - On failure, analyze error using LLM
  - Generate modified approach based on error
  - Retry with modifications
  - Track what was tried to avoid loops
  - Max retry limit
- **Input Schema:**
  ```typescript
  {
    action: {
      type: "tool" | "command";
      tool_name?: string;
      tool_args?: unknown;
      command?: string;
    };
    max_retries?: number;  // default 3
    error_context?: string;  // additional context for LLM
  }
  ```
- **Output Schema:**
  ```typescript
  {
    success: boolean;
    attempts: Array<{
      attempt: number;
      action: unknown;
      error?: string;
      analysis?: string;  // LLM explanation of what went wrong
      modification?: string;  // what was changed for next attempt
    }>;
    final_result?: unknown;
    gave_up_reason?: string;
  }
  ```
- **Dependencies:** LLM integration (Claude CLI)
- **Test Strategy:** Intentionally fail, verify retry logic

#### 3.4 `resolve_merge_conflict`
- **Type:** Git + LLM
- **Priority:** P1
- **Complexity:** High
- **Implementation:**
  - Parse conflict markers in file
  - Extract "ours" and "theirs" versions
  - Use LLM to understand intent of both changes
  - Generate merged version that preserves both intents
  - Optionally run validation after resolution
- **Input Schema:**
  ```typescript
  {
    file: string;
    context?: string;  // what we were trying to do
    prefer?: "ours" | "theirs" | "merge";  // hint for resolution
    validate_after?: boolean;
  }
  ```
- **Output Schema:**
  ```typescript
  {
    resolved: boolean;
    conflicts_found: number;
    resolutions: Array<{
      ours: string;
      theirs: string;
      merged: string;
      explanation: string;  // why this resolution
    }>;
    validation?: { passed: boolean; errors?: string[] };
  }
  ```
- **Dependencies:** Git, LLM
- **Test Strategy:** Create intentional conflict, verify sensible resolution

#### 3.5 `validate_api_contract`
- **Type:** Contract Testing
- **Priority:** P2
- **Complexity:** Medium
- **Implementation:**
  - Load OpenAPI/JSON Schema spec
  - Make requests to running API
  - Validate responses against spec
  - Report schema violations
- **Input Schema:**
  ```typescript
  {
    spec_path: string;  // OpenAPI spec file
    base_url: string;
    endpoints?: string[];  // specific endpoints, or all
    include_examples?: boolean;  // use spec examples as test data
  }
  ```
- **Output Schema:**
  ```typescript
  {
    valid: boolean;
    results: Array<{
      endpoint: string;
      method: string;
      valid: boolean;
      violations: Array<{
        path: string;  // JSON path in response
        expected: string;
        actual: string;
        message: string;
      }>;
    }>;
    summary: { total: number; valid: number; invalid: number };
  }
  ```
- **Dependencies:** OpenAPI parser, running server
- **Test Strategy:** Create spec, verify matching and non-matching responses

---

## Phase 4: Analysis & Intelligence (Week 4)
**Theme:** Deeper code understanding

### Tools (6)

#### 4.1 `query_database`
- **Type:** Database Operations
- **Priority:** P1
- **Complexity:** Medium
- **Implementation:**
  - Parse DATABASE_URL from env
  - Support PostgreSQL, MySQL, SQLite
  - Execute read-only queries (SELECT only by default)
  - Return structured results
  - Optional: allow write queries with confirmation
- **Input Schema:**
  ```typescript
  {
    query: string;
    database_url?: string;  // override env
    readonly?: boolean;     // default true, reject INSERT/UPDATE/DELETE
    limit?: number;         // auto-add LIMIT if not present
    format?: "json" | "table";
  }
  ```
- **Output Schema:**
  ```typescript
  {
    success: boolean;
    rows: unknown[];
    row_count: number;
    columns: Array<{ name: string; type: string }>;
    execution_time_ms: number;
    query_plan?: string;  // EXPLAIN output if requested
  }
  ```
- **Dependencies:** Database drivers (pg, mysql2, better-sqlite3)
- **Test Strategy:** Query test database, verify results

#### 4.2 `profile_function`
- **Type:** Performance Analysis
- **Priority:** P2
- **Complexity:** High
- **Implementation:**
  - Instrument target function with timing
  - Run function with provided inputs
  - Capture execution time, memory delta
  - Multiple iterations for statistical accuracy
  - Flamegraph generation (optional)
- **Input Schema:**
  ```typescript
  {
    file: string;
    function_name: string;
    inputs: unknown[];  // arguments to pass
    iterations?: number;  // default 100
    warmup?: number;      // warmup iterations
    capture_memory?: boolean;
  }
  ```
- **Output Schema:**
  ```typescript
  {
    function: string;
    iterations: number;
    timing: {
      mean_ms: number;
      median_ms: number;
      p95_ms: number;
      p99_ms: number;
      min_ms: number;
      max_ms: number;
      std_dev_ms: number;
    };
    memory?: {
      heap_used_delta_mb: number;
      external_delta_mb: number;
    };
    flamegraph_path?: string;
  }
  ```
- **Dependencies:** Node.js profiler, potentially 0x or clinic.js
- **Test Strategy:** Profile known function, verify timing captured

#### 4.3 `detect_memory_leaks`
- **Type:** Memory Analysis
- **Priority:** P2
- **Complexity:** High
- **Implementation:**
  - Take heap snapshots at intervals
  - Compare snapshots for growing objects
  - Identify retained objects that shouldn't persist
  - Report suspected leak locations
- **Input Schema:**
  ```typescript
  {
    target: "pid" | "command";
    pid?: number;
    command?: string;  // e.g., "npm run dev"
    duration_seconds?: number;  // how long to monitor
    snapshot_interval_ms?: number;
    trigger_gc?: boolean;  // force GC between snapshots
  }
  ```
- **Output Schema:**
  ```typescript
  {
    leak_detected: boolean;
    heap_growth_mb: number;
    snapshots: Array<{
      timestamp: string;
      heap_used_mb: number;
    }>;
    suspects: Array<{
      constructor: string;
      count_growth: number;
      size_growth_mb: number;
      retained_by?: string;  // what's holding reference
    }>;
    recommendations: string[];
  }
  ```
- **Dependencies:** V8 heap profiler
- **Test Strategy:** Create intentional memory leak, verify detection

#### 4.4 `generate_types`
- **Type:** Type Inference
- **Priority:** P2
- **Complexity:** Medium-High
- **Implementation:**
  - Fetch data from API endpoint
  - Analyze JSON structure
  - Generate TypeScript interfaces
  - Handle nested objects, arrays, unions
  - Detect optional fields across samples
- **Input Schema:**
  ```typescript
  {
    source: "url" | "file" | "inline";
    url?: string;
    file_path?: string;  // JSON file
    data?: unknown;      // inline JSON
    samples?: number;    // fetch multiple times to detect optionals
    type_name?: string;  // name for root type
    export?: boolean;
  }
  ```
- **Output Schema:**
  ```typescript
  {
    types: string;  // TypeScript code
    type_names: string[];  // generated type names
    nullable_fields: string[];  // fields that were sometimes null/undefined
    union_fields: Array<{ field: string; types: string[] }>;
  }
  ```
- **Dependencies:** JSON type inference logic
- **Test Strategy:** Infer types from known API, compare to expected

#### 4.5 `identify_tech_debt`
- **Type:** Code Analysis
- **Priority:** P1
- **Complexity:** Medium
- **Implementation:**
  - Aggregate from existing tools:
    - `find_dead_code` - unused exports
    - `find_circular_deps` - import cycles
    - `check_permissions` - security risks
    - `scan_for_secrets` - leaked credentials
    - `get_test_coverage` - untested code
    - `get_diagnostics` - TS errors/warnings
  - Calculate weighted score
  - Prioritize by severity and effort
- **Input Schema:**
  ```typescript
  {
    path?: string;
    include?: Array<"dead_code" | "circular_deps" | "security" | "coverage" | "type_errors">;
    coverage_threshold?: number;  // minimum acceptable coverage
  }
  ```
- **Output Schema:**
  ```typescript
  {
    score: number;  // 0-100, higher = more debt
    grade: "A" | "B" | "C" | "D" | "F";
    breakdown: {
      dead_code: { count: number; score: number };
      circular_deps: { count: number; score: number };
      security_issues: { high: number; medium: number; score: number };
      coverage_gaps: { uncovered_files: number; score: number };
      type_errors: { count: number; score: number };
    };
    prioritized_issues: Array<{
      type: string;
      severity: "high" | "medium" | "low";
      location: string;
      description: string;
      effort: "trivial" | "small" | "medium" | "large";
      recommendation: string;
    }>;
  }
  ```
- **Dependencies:** Existing analysis tools
- **Test Strategy:** Run on known codebase, verify aggregation

#### 4.6 `log_analyzer`
- **Type:** Log Analysis
- **Priority:** P1
- **Complexity:** Medium
- **Implementation:**
  - Tail log file or connect to process
  - Parse structured logs (JSON) or unstructured
  - Extract timestamps, levels, messages
  - Pattern matching for errors, warnings
  - Anomaly detection (sudden spike in errors)
  - Grouping and deduplication
- **Input Schema:**
  ```typescript
  {
    source: "file" | "pid" | "command";
    path?: string;
    pid?: number;
    command?: string;
    duration_seconds?: number;
    patterns?: Array<{ name: string; regex: string; level: string }>;
    structured?: boolean;  // expect JSON logs
  }
  ```
- **Output Schema:**
  ```typescript
  {
    entries_analyzed: number;
    time_range: { start: string; end: string };
    levels: { debug: number; info: number; warn: number; error: number };
    errors: Array<{
      message: string;
      count: number;
      first_seen: string;
      last_seen: string;
      sample_stack?: string;
    }>;
    warnings: Array<{ message: string; count: number }>;
    anomalies: Array<{
      type: string;
      description: string;
      timestamp: string;
    }>;
    patterns_matched: Record<string, number>;
  }
  ```
- **Dependencies:** None
- **Test Strategy:** Analyze known log file, verify parsing

---

## Phase 5: Smart Wrappers & Polish (Week 5)
**Theme:** Developer experience improvements

### Tools (7)

#### 5.1 `generate_fixture`
- **Type:** Test Data Generation
- **Priority:** P1
- **Complexity:** Medium
- **Implementation:**
  - Load schema from Prisma/Drizzle/TypeScript types
  - Generate realistic data using faker
  - Handle relationships (foreign keys)
  - Support for specific scenarios
- **Input Schema:**
  ```typescript
  {
    model: string;  // Prisma model name or TS type
    count?: number;
    overrides?: Record<string, unknown>;  // specific values
    with_relations?: string[];  // include related models
    scenario?: string;  // e.g., "empty", "edge_cases", "realistic"
  }
  ```
- **Output Schema:**
  ```typescript
  {
    fixtures: unknown[];
    code: string;  // TypeScript code to create fixtures
    prisma_seed?: string;  // Prisma seed script
  }
  ```
- **Dependencies:** Schema parsing, faker.js
- **Test Strategy:** Generate from known schema, verify valid data

#### 5.2 `validate_env_complete`
- **Type:** Environment Validation
- **Priority:** P1
- **Complexity:** Low
- **Implementation:**
  - Run `get_env_config` to find all usages
  - Compare against actual .env file
  - Report missing, unused, and undocumented
- **Input Schema:**
  ```typescript
  {
    env_file?: string;  // default ".env"
    example_file?: string;  // default ".env.example"
    ignore?: string[];  // vars to ignore
  }
  ```
- **Output Schema:**
  ```typescript
  {
    valid: boolean;
    missing: Array<{ name: string; used_in: string[] }>;
    unused: Array<{ name: string; defined_in: string }>;
    undocumented: Array<{ name: string }>;  // in .env but not .env.example
    type_mismatches: Array<{ name: string; expected: string; actual: string }>;
  }
  ```
- **Dependencies:** `get_env_config`
- **Test Strategy:** Create .env with gaps, verify detection

#### 5.3 `upgrade_package`
- **Type:** Dependency Management
- **Priority:** P1
- **Complexity:** Medium
- **Implementation:**
  - Check current vs latest version
  - Fetch changelog/release notes
  - Run `detect_breaking_changes` on type definitions
  - Preview changes before upgrade
  - Optionally run tests after upgrade
- **Input Schema:**
  ```typescript
  {
    package: string;
    target_version?: string;  // default "latest"
    include_changelog?: boolean;
    dry_run?: boolean;
    run_tests_after?: boolean;
  }
  ```
- **Output Schema:**
  ```typescript
  {
    package: string;
    current_version: string;
    target_version: string;
    breaking_changes: Array<{ change: string; migration: string }>;
    changelog_summary?: string;
    upgrade_applied: boolean;
    test_results?: { passed: boolean; output: string };
    rollback_command: string;
  }
  ```
- **Dependencies:** npm registry API, `detect_breaking_changes`
- **Test Strategy:** Upgrade known package, verify changelog fetch

#### 5.4 `sync_api_types`
- **Type:** Type Synchronization
- **Priority:** P2
- **Complexity:** Medium
- **Implementation:**
  - Find API route handlers (backend)
  - Find API call sites (frontend)
  - Compare request/response types
  - Generate sync diff
  - Optionally auto-fix
- **Input Schema:**
  ```typescript
  {
    backend_path?: string;  // default "src/app/api" or "pages/api"
    frontend_path?: string;  // default "src"
    auto_fix?: boolean;
  }
  ```
- **Output Schema:**
  ```typescript
  {
    in_sync: boolean;
    drifts: Array<{
      endpoint: string;
      backend_type: string;
      frontend_type: string;
      diff: string;
      fix?: string;  // suggested fix
    }>;
    fixes_applied?: number;
  }
  ```
- **Dependencies:** TypeScript analysis
- **Test Strategy:** Create intentional drift, verify detection

#### 5.5 `generate_openapi`
- **Type:** Documentation
- **Priority:** P2
- **Complexity:** Medium
- **Implementation:**
  - Extend `get_api_routes`
  - Extract request/response types
  - Generate OpenAPI 3.0 spec
  - Include examples from types
- **Input Schema:**
  ```typescript
  {
    output_path?: string;  // default "openapi.json"
    title?: string;
    version?: string;
    include_examples?: boolean;
    framework?: "nextjs" | "express" | "fastify" | "hono";
  }
  ```
- **Output Schema:**
  ```typescript
  {
    spec_path: string;
    routes_documented: number;
    missing_types: string[];  // routes without type info
    warnings: string[];
  }
  ```
- **Dependencies:** `get_api_routes`
- **Test Strategy:** Generate from known API, validate spec

#### 5.6 `explain_codebase`
- **Type:** Documentation
- **Priority:** P3
- **Complexity:** Medium
- **Implementation:**
  - Analyze directory structure
  - Identify key files (entry points, configs)
  - Extract exports from main modules
  - Generate high-level summary using LLM
  - Cache for fast retrieval
- **Input Schema:**
  ```typescript
  {
    path?: string;
    depth?: "shallow" | "medium" | "deep";
    focus?: string[];  // specific areas to detail
    refresh?: boolean;  // regenerate cache
  }
  ```
- **Output Schema:**
  ```typescript
  {
    summary: string;  // 2-3 paragraph overview
    architecture: string;  // technical architecture
    key_files: Array<{ path: string; purpose: string }>;
    entry_points: string[];
    dependencies_summary: string;
    patterns_used: string[];
    cached: boolean;
    generated_at: string;
  }
  ```
- **Dependencies:** LLM
- **Test Strategy:** Generate for known codebase, verify accuracy

#### 5.7 `create_pull_request`
- **Type:** Git/GitHub
- **Priority:** P3
- **Complexity:** Low
- **Implementation:**
  - Get current branch and diff from main
  - Run `semantic_diff` for change analysis
  - Generate title and description using LLM
  - Create PR via `gh pr create`
  - Add labels based on change type
- **Input Schema:**
  ```typescript
  {
    base?: string;  // default "main"
    title?: string;  // auto-generate if not provided
    draft?: boolean;
    labels?: string[];
    reviewers?: string[];
  }
  ```
- **Output Schema:**
  ```typescript
  {
    pr_url: string;
    pr_number: number;
    title: string;
    description: string;
    files_changed: number;
    labels: string[];
  }
  ```
- **Dependencies:** `semantic_diff`, `gh` CLI
- **Test Strategy:** Create PR, verify description quality

---

## Phase 6: Frontend Intelligence (Week 6)
**Theme:** Help agents understand CSS, layout, and component architecture

### Tools (10)

#### 6.1 `analyze_layout_hierarchy`
- **Type:** Static CSS Analysis
- **Priority:** P0
- **Complexity:** High
- **Implementation:**
  - Parse JSX/TSX to extract DOM structure
  - Extract Tailwind classes or CSS rules
  - Build layout tree with sizing strategies
  - Identify constraint flow (parent→child)
  - Flag potential overflow points
- **Input Schema:**
  ```typescript
  {
    file: string;           // component file path
    selector?: string;      // focus on specific element
    include_computed?: boolean;  // requires running app
  }
  ```
- **Output Schema:**
  ```typescript
  {
    layout_tree: {
      element: string;
      tag: string;
      classes: string[];
      sizing: {
        width: { strategy: "fixed" | "percentage" | "auto" | "flex"; value?: string };
        height: { strategy: "fixed" | "percentage" | "auto" | "flex"; value?: string };
      };
      display: "block" | "flex" | "grid" | "inline" | "none";
      flex_props?: { direction: string; grow: number; shrink: number; basis: string };
      grid_props?: { template: string; area?: string };
      overflow: { x: string; y: string };
      position: "static" | "relative" | "absolute" | "fixed" | "sticky";
      children: LayoutNode[];
    };
    constraint_notes: string[];  // human-readable insights
    potential_issues: Array<{
      element: string;
      issue: string;
      suggestion: string;
    }>;
  }
  ```
- **Dependencies:** JSX parser (babel), Tailwind class parser
- **Test Strategy:** Analyze known component, verify tree structure

#### 6.2 `diagnose_overflow`
- **Type:** Layout Problem Diagnosis
- **Priority:** P0
- **Complexity:** High
- **Implementation:**
  - Parse component layout hierarchy
  - Trace sizing constraints from root to problem element
  - Identify where content exceeds container
  - Generate fix options with trade-off analysis
  - Recommend inside vs outside fix
- **Input Schema:**
  ```typescript
  {
    file: string;
    problem_description?: string;  // e.g., "content overflowing"
    element_hint?: string;         // selector or class name
  }
  ```
- **Output Schema:**
  ```typescript
  {
    diagnosis: {
      overflow_source: string;
      cause: string;
      constraint_chain: Array<{
        element: string;
        constrains: string;
        computed_size?: string;
      }>;
      fix_options: Array<{
        location: "inside" | "outside" | "chain";
        element: string;
        fix: string;
        code_change?: string;
        trade_off: string;
      }>;
      recommendation: {
        location: "inside" | "outside";
        reason: string;
        suggested_fix: string;
      };
    };
  }
  ```
- **Dependencies:** `analyze_layout_hierarchy`
- **Test Strategy:** Create component with overflow, verify correct diagnosis

#### 6.3 `get_sizing_strategy`
- **Type:** Element Analysis
- **Priority:** P1
- **Complexity:** Medium
- **Implementation:**
  - Find specific element in component
  - Extract all sizing-related styles
  - Determine how size is computed (intrinsic vs extrinsic)
  - Show constraint chain from ancestors
- **Input Schema:**
  ```typescript
  {
    file: string;
    selector: string;  // class, id, or element path
  }
  ```
- **Output Schema:**
  ```typescript
  {
    element: string;
    sizing: {
      width: {
        specified: string;      // Tailwind class or CSS
        strategy: string;       // how it's determined
        computed?: string;      // actual value if running
        constrained_by?: string[];  // parent constraints
      };
      height: {
        specified: string;
        strategy: string;
        computed?: string;
        constrained_by?: string[];
      };
      min_max: {
        min_width?: string;
        max_width?: string;
        min_height?: string;
        max_height?: string;
      };
    };
    flex_behavior?: {
      grow: number;
      shrink: number;
      basis: string;
      will_shrink: boolean;
      will_grow: boolean;
    };
    overflow: { x: string; y: string };
  }
  ```
- **Dependencies:** Tailwind parser
- **Test Strategy:** Query known elements, verify sizing info

#### 6.4 `analyze_responsive_breakpoints`
- **Type:** Responsive Analysis
- **Priority:** P0
- **Complexity:** Medium-High
- **Implementation:**
  - Parse all responsive Tailwind classes (sm:, md:, lg:, xl:, 2xl:)
  - Group by breakpoint
  - Detect state changes at each breakpoint
  - Identify missing breakpoint coverage
  - Warn about inconsistencies
- **Input Schema:**
  ```typescript
  {
    file: string;
    element?: string;  // specific element, or whole component
  }
  ```
- **Output Schema:**
  ```typescript
  {
    breakpoints: {
      [breakpoint: string]: {
        applies_at: string;  // e.g., "640px and up"
        layout_changes: Array<{
          element: string;
          property: string;
          value: string;
        }>;
      };
    };
    state_transitions: Array<{
      from_breakpoint: string;
      to_breakpoint: string;
      element: string;
      changes: string;
    }>;
    coverage: {
      mobile: boolean;
      tablet: boolean;
      desktop: boolean;
      large_desktop: boolean;
    };
    warnings: Array<{
      breakpoint: string;
      issue: string;
      suggestion: string;
    }>;
  }
  ```
- **Dependencies:** Tailwind class parser
- **Test Strategy:** Analyze responsive component, verify breakpoint detection

#### 6.5 `analyze_stacking_context`
- **Type:** z-index Analysis
- **Priority:** P1
- **Complexity:** Medium-High
- **Implementation:**
  - Parse component tree for z-index and context-creating properties
  - Build stacking context hierarchy
  - Identify isolated contexts (transform, filter, opacity < 1, etc.)
  - Detect potential layering issues
- **Input Schema:**
  ```typescript
  {
    file: string;
    include_portals?: boolean;  // look for portal destinations
  }
  ```
- **Output Schema:**
  ```typescript
  {
    stacking_contexts: Array<{
      element: string;
      z_index: number | "auto";
      creates_context: boolean;
      context_reason?: string;  // why it creates context
      children: StackingContext[];
    }>;
    context_creators: Array<{
      element: string;
      reason: string;  // e.g., "position: fixed + z-index"
      z_index: number;
    }>;
    potential_issues: Array<{
      issue: string;
      elements_involved: string[];
      explanation: string;
      fix: string;
    }>;
    portals_detected: Array<{
      source: string;
      destination: string;
      z_index: number;
    }>;
  }
  ```
- **Dependencies:** JSX parser, CSS parser
- **Test Strategy:** Create components with layering issues, verify detection

#### 6.6 `trace_component_state`
- **Type:** React State Analysis
- **Priority:** P1
- **Complexity:** High
- **Implementation:**
  - Parse component for useState, useReducer, useContext
  - Track props flow through component tree
  - Identify prop drilling patterns
  - Detect callback stability issues
  - Suggest state placement improvements
- **Input Schema:**
  ```typescript
  {
    file: string;
    include_children?: boolean;  // analyze child components too
    depth?: number;              // how deep to trace
  }
  ```
- **Output Schema:**
  ```typescript
  {
    component: string;
    local_state: Array<{
      name: string;
      type: string;
      initial_value?: string;
      used_in: string[];  // components that use this
      setter_passed_to?: string[];
    }>;
    props: {
      received: Array<{
        name: string;
        type: string;
        from: string;
        drilling_depth: number;
      }>;
      passed_down: Array<{
        name: string;
        to: string[];
        depth: number;
      }>;
    };
    context: {
      consumed: Array<{ name: string; values_used: string[] }>;
      provided: Array<{ name: string; value: string }>;
    };
    issues: Array<{
      type: "prop_drilling" | "callback_stability" | "state_placement" | "missing_memo";
      description: string;
      location: string;
      suggestion: string;
    }>;
  }
  ```
- **Dependencies:** TypeScript AST parser
- **Test Strategy:** Analyze component with prop drilling, verify detection

#### 6.7 `analyze_render_triggers`
- **Type:** React Performance Analysis
- **Priority:** P1
- **Complexity:** High
- **Implementation:**
  - Parse component for render triggers
  - Identify inline objects/functions in JSX
  - Check for missing memoization
  - Trace context subscriptions
  - Estimate render cost
- **Input Schema:**
  ```typescript
  {
    file: string;
    include_children?: boolean;
  }
  ```
- **Output Schema:**
  ```typescript
  {
    component: string;
    is_memoized: boolean;
    render_triggers: Array<{
      cause: string;
      frequency: "every_render" | "on_change" | "rare";
      location?: string;
      preventable: boolean;
      fix?: string;
    }>;
    inline_definitions: Array<{
      type: "object" | "array" | "function";
      location: string;
      line: number;
      fix: string;
    }>;
    context_subscriptions: Array<{
      context: string;
      values_used: string[];
      granularity: "fine" | "coarse";  // using whole context vs specific values
    }>;
    children_analysis: Array<{
      component: string;
      memoized: boolean;
      re_renders_when: string;
    }>;
    optimization_priority: Array<{
      fix: string;
      impact: "high" | "medium" | "low";
      effort: "trivial" | "small" | "medium";
    }>;
  }
  ```
- **Dependencies:** TypeScript AST parser
- **Test Strategy:** Analyze component with render issues, verify detection

#### 6.8 `get_accessibility_tree`
- **Type:** Accessibility Analysis
- **Priority:** P1
- **Complexity:** Medium-High
- **Implementation:**
  - Parse JSX for semantic elements and ARIA attributes
  - Build accessibility tree structure
  - Check focus order and keyboard navigation
  - Identify missing labels, roles, states
  - Verify ARIA patterns (combobox, dialog, etc.)
- **Input Schema:**
  ```typescript
  {
    file: string;
    element?: string;  // specific element to analyze
    check_patterns?: boolean;  // verify ARIA patterns
  }
  ```
- **Output Schema:**
  ```typescript
  {
    a11y_tree: {
      role: string;
      name: string;
      description?: string;
      focusable: boolean;
      hidden: boolean;
      expanded?: boolean;
      selected?: boolean;
      children: A11yNode[];
    };
    focus_order: Array<{
      index: number;
      element: string;
      tabindex?: number;
    }>;
    issues: Array<{
      severity: "error" | "warning" | "suggestion";
      element: string;
      issue: string;
      wcag_criterion?: string;
      fix: string;
    }>;
    keyboard_interactions: {
      expected: string[];
      implemented: string[];
      missing: string[];
    };
    aria_patterns: Array<{
      pattern: string;  // e.g., "combobox", "dialog"
      valid: boolean;
      missing_attributes?: string[];
    }>;
  }
  ```
- **Dependencies:** JSX parser, ARIA spec knowledge
- **Test Strategy:** Analyze interactive component, verify a11y issues detected

#### 6.9 `analyze_event_flow`
- **Type:** Event Handling Analysis
- **Priority:** P2
- **Complexity:** Medium
- **Implementation:**
  - Parse JSX for event handlers
  - Trace event propagation through component tree
  - Detect stopPropagation usage
  - Identify potential double-handling issues
  - Map event delegation patterns
- **Input Schema:**
  ```typescript
  {
    file: string;
    event?: string;  // specific event type, e.g., "click"
  }
  ```
- **Output Schema:**
  ```typescript
  {
    handlers: Array<{
      element: string;
      event: string;
      handler: string;
      line: number;
      stops_propagation: boolean;
      prevents_default: boolean;
    }>;
    event_flows: {
      [scenario: string]: Array<{
        step: number;
        element: string;
        handler: string;
        stops_here: boolean;
      }>;
    };
    issues: Array<{
      issue: string;
      elements: string[];
      explanation: string;
      fix: string;
    }>;
    delegation_patterns: Array<{
      container: string;
      delegates_for: string[];
      event: string;
    }>;
  }
  ```
- **Dependencies:** JSX parser
- **Test Strategy:** Analyze component with nested handlers, verify flow detection

#### 6.10 `analyze_tailwind_conflicts`
- **Type:** Tailwind Analysis
- **Priority:** P1
- **Complexity:** Medium
- **Implementation:**
  - Parse all Tailwind classes in component
  - Detect conflicting utilities (e.g., p-2 px-4)
  - Find redundant classes
  - Check for specificity issues with arbitrary selectors
  - Suggest consolidation
- **Input Schema:**
  ```typescript
  {
    file: string;
    include_arbitrary?: boolean;  // check arbitrary values/selectors
  }
  ```
- **Output Schema:**
  ```typescript
  {
    elements_analyzed: number;
    conflicts: Array<{
      element: string;
      line: number;
      classes: string[];
      conflict_type: "override" | "redundant" | "contradiction";
      explanation: string;
      fix: string;
    }>;
    redundant_classes: Array<{
      element: string;
      class: string;
      reason: string;
    }>;
    specificity_issues: Array<{
      element: string;
      issue: string;
      overriding_source: string;
      fix: string;
    }>;
    suggestions: Array<{
      element: string;
      current: string;
      suggested: string;
      reason: string;
    }>;
  }
  ```
- **Dependencies:** Tailwind class parser, specificity calculator
- **Test Strategy:** Create component with conflicts, verify detection

---

## Implementation Order Summary

| Week | Phase | Tools | Total |
|------|-------|-------|-------|
| 1 | Process & Server | `start_dev_server`, `health_monitor`, `watch_for_errors` | 3 |
| 2 | Runtime Verification | `verify_runtime_behavior`, `browser_automation`, `visual_regression`, `lighthouse_audit` | 4 |
| 3 | Self-Correction | `atomic_multi_edit`, `auto_rollback`, `retry_with_learning`, `resolve_merge_conflict`, `validate_api_contract` | 5 |
| 4 | Analysis | `query_database`, `profile_function`, `detect_memory_leaks`, `generate_types`, `identify_tech_debt`, `log_analyzer` | 6 |
| 5 | Smart Wrappers | `generate_fixture`, `validate_env_complete`, `upgrade_package`, `sync_api_types`, `generate_openapi`, `explain_codebase`, `create_pull_request` | 7 |
| 6 | Frontend Intelligence | `analyze_layout_hierarchy`, `diagnose_overflow`, `get_sizing_strategy`, `analyze_responsive_breakpoints`, `analyze_stacking_context`, `trace_component_state`, `analyze_render_triggers`, `get_accessibility_tree`, `analyze_event_flow`, `analyze_tailwind_conflicts` | 10 |

**Total: 35 tools over 6 weeks**

---

## Technical Dependencies

### NPM Packages to Add
```json
{
  "puppeteer": "^22.0.0",
  "lighthouse": "^12.0.0",
  "pixelmatch": "^5.3.0",
  "pngjs": "^7.0.0",
  "@faker-js/faker": "^8.0.0",
  "pg": "^8.11.0",
  "mysql2": "^3.6.0",
  "better-sqlite3": "^9.0.0",
  "@babel/parser": "^7.24.0",
  "@babel/traverse": "^7.24.0",
  "@babel/types": "^7.24.0",
  "postcss": "^8.4.0",
  "postcss-selector-parser": "^6.0.0"
}
```

### Infrastructure Requirements
- Chrome/Chromium for Puppeteer/Lighthouse
- Database connections for `query_database`
- Background process management for monitoring tools

---

## Testing Strategy

Each tool should have:
1. **Unit tests** - Core logic in isolation
2. **Integration tests** - With real dependencies (server, database, etc.)
3. **Validation against existing codebase** - Run on GoodVibes plugin itself

---

## Success Metrics

After implementation:
- Agent can start server, make changes, verify they work, rollback if broken
- Agent can detect and fix its own errors without human intervention
- Agent can manage full PR workflow from code to merge
- Agent can maintain type safety across frontend/backend
- Agent can identify and prioritize tech debt autonomously
- Agent understands CSS layout hierarchy and fixes overflow at correct level
- Agent maintains responsive design across all breakpoints
- Agent avoids z-index conflicts and stacking context issues
- Agent optimizes React render performance proactively
- Agent maintains accessibility compliance automatically

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Browser automation flaky | Retry logic, longer timeouts, headless stability |
| Database credentials exposure | Read-only by default, no credential logging |
| Infinite retry loops | Max retry limits, exponential backoff |
| Memory leaks in monitoring | Bounded buffers, automatic cleanup |
| Breaking changes in dependencies | Pin versions, integration tests |

---

## Next Steps

1. Review and approve plan
2. Create feature branch `feat/autonomy-tools`
3. Implement Phase 1 (Process & Server Management)
4. Test on real project
5. Iterate through remaining phases
