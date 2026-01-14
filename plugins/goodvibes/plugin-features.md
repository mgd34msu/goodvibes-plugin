# GoodVibes Plugin - Complete Feature List

---

## AGENTS (11)

1. **factory** - Meta-agent that creates specialized Claude Code subagents
2. **skill-creator** - Creates Agent Skills and Claude Code slash commands
3. **backend-engineer** - API, database, auth, server-side development
4. **brutally-honest-reviewer** - Code review, auditing, quality assessment
5. **code-architect** - Architecture refactoring, design patterns
6. **content-platform** - CMS, email, payments, file uploads
7. **devops-deployer** - Deployment, CI/CD, monitoring
8. **frontend-architect** - UI components, styling, accessibility
9. **fullstack-integrator** - State, forms, AI integration, real-time
10. **test-engineer** - Testing strategies, coverage, automation
11. **workflow-planner** - Task breakdown, architecture planning

---

## SKILLS (172)

### Common / Development (9)
1. architecture-assessment
2. code-critique
3. code-organization
4. code-scoring
5. debugging
6. dependency-management
7. improvement-roadmap
8. project-understanding
9. refactoring

### Common / Quality (5)
10. code-quality
11. code-smell-detector
12. review-scoring-rubric
13. security-audit-checklist
14. testing

### Common / Review (8)
15. async-patterns
16. code-organization
17. config-hygiene
18. documentation
19. error-handling
20. import-ordering
21. naming-conventions
22. type-safety

### Common / Tooling (1)
23. mcp-mastery

### Common / Workflow (6)
24. agent-monitoring
25. documentation
26. git-workflows
27. planning/dependency-mapping
28. planning/risk-assessment
29. planning/task-decomposition

### Create (5)
30. agent-sdk-definitions
31. hook-integration
32. script-best-practices
33. workflow-patterns
34. writing-descriptions

### Webdev / AI Integration (1)
35. vercel-ai-sdk

### Webdev / Animation (1)
36. framer-motion

### Webdev / API Layer (9)
37. apollo-server
38. express
39. fastify
40. graphql
41. hono
42. openapi
43. rest-api-design
44. trpc

### Webdev / Authentication (7)
45. auth0
46. clerk
47. firebase-auth
48. lucia
49. nextauth
50. passport
51. supabase-auth

### Webdev / Build Tools (7)
52. bun
53. esbuild
54. rollup
55. tsup
56. turbopack
57. vite
58. webpack

### Webdev / CMS Content (1)
59. mdx

### Webdev / Component Libraries (8)
60. ant-design
61. ark-ui
62. chakra-ui
63. headless-ui
64. mantine
65. material-ui
66. radix-ui
67. shadcn-ui

### Webdev / Databases & ORMs (10)
68. drizzle
69. kysely
70. mongodb
71. planetscale
72. postgresql
73. prisma
74. redis
75. sqlite
76. supabase-db
77. turso

### Webdev / Deployment (5)
78. aws-amplify
79. docker-web
80. fly-io
81. railway
82. render

### Webdev / Deployment Hosting (3)
83. cloudflare-pages
84. netlify
85. vercel

### Webdev / Email (1)
86. resend

### Webdev / Forms (4)
87. conform
88. formik
89. valibot
90. yup

### Webdev / Forms Validation (2)
91. react-hook-form
92. zod

### Webdev / Frontend Core (10)
93. alpine-js
94. htmx
95. javascript-modern
96. preact
97. react
98. solidjs
99. svelte
100. typescript
101. vue
102. web-components

### Webdev / Meta-Frameworks (8)
103. astro
104. gatsby
105. nextjs
106. nuxt
107. qwik
108. remix
109. solidstart
110. sveltekit

### Webdev / Monitoring Analytics (1)
111. sentry

### Webdev / Payments (1)
112. stripe

### Webdev / Realtime WebSockets (1)
113. socket-io

### Webdev / Skills (Standalone) (35)
114. ably
115. anthropic-api
116. auto-animate
117. aws-s3
118. axiom
119. cloudinary
120. contentful
121. css-animations
122. gsap
123. huggingface-js
124. imgix
125. keystonejs
126. langchain-js
127. lemonsqueezy
128. liveblocks
129. logrocket
130. lottie
131. nodemailer
132. openai-api
133. paddle
134. partykit
135. payload
136. paypal
137. pinecone
138. plausible
139. posthog
140. pusher
141. react-email
142. replicate
143. sanity
144. sendgrid
145. sharp
146. strapi
147. uploadthing
148. vercel-analytics
149. view-transitions

### Webdev / State Management (7)
150. jotai
151. nanostores
152. pinia
153. redux-toolkit
154. tanstack-query
155. valtio
156. zustand

### Webdev / Styling (8)
157. css-modules
158. css-variables
159. panda-css
160. sass-scss
161. styled-components
162. tailwindcss
163. unocss
164. vanilla-extract

### Webdev / Testing (8)
165. chromatic
166. cypress
167. jest
168. msw
169. playwright
170. storybook
171. testing-library
172. vitest

---

## MCP TOOLS (91)

### Discovery & Search (7)
1. search_skills - Search skill registry by keywords
2. search_agents - Search agents by expertise
3. search_tools - Search tools by functionality
4. recommend_skills - Analyze task and recommend skills
5. get_skill_content - Load full skill content by path
6. get_agent_content - Load full agent content by path
7. skill_dependencies - Show skill relationships and dependencies

### Context Gathering (6)
8. detect_stack - Analyze project technology stack
9. check_versions - Get installed package versions
10. scan_patterns - Identify code patterns and conventions
11. fetch_docs - Fetch library documentation
12. read_config - Parse configuration files
13. get_conventions - LLM-powered convention analysis

### Schema & API (5)
14. generate_openapi - Generate OpenAPI spec from routes
15. get_schema - Introspect database schema
16. get_database_schema - Auto-detect and extract DB schema
17. get_api_routes - Extract API routes from frameworks
18. get_prisma_operations - Find Prisma usages and N+1 patterns

### Validation & Testing (4)
19. validate_implementation - Check code matches skill patterns
20. run_smoke_test - Quick verification of generated code
21. check_types - Run TypeScript type checking
22. validate_edits_preview - Preview edit impact before applying

### Scaffolding (3)
23. scaffold_project - Create project from template
24. list_templates - List available templates
25. plugin_status - Check plugin health

### Project Health (2)
26. project_issues - Get detailed project issues
27. identify_tech_debt - Identify and grade technical debt

### LSP Code Navigation (18)
28. find_references - Find all references to symbol
29. go_to_definition - Go to symbol definition
30. get_implementations - Find interface implementations
31. rename_symbol - Get edits for safe rename
32. get_code_actions - Get quick fixes and refactorings
33. apply_code_action - Get file edits for code action
34. get_symbol_info - Get detailed symbol information
35. get_call_hierarchy - Get call hierarchy (incoming/outgoing)
36. get_type_hierarchy - Get type inheritance hierarchy
37. get_document_symbols - Get structural outline of document
38. get_signature_help - Get signature help at call site
39. get_diagnostics - Get TypeScript diagnostics
40. find_dead_code - Find unused exports and functions
41. get_api_surface - Analyze public vs internal API
42. safe_delete_check - Confirm zero external usages
43. get_inlay_hints - Get inferred types where implicit
44. workspace_symbols - Search symbols across workspace
45. semantic_diff - LLM-powered type-aware diff

### Error & Debugging (4)
46. parse_error_stack - Parse and analyze error stacks
47. explain_type_error - Explain TS errors with fixes
48. detect_memory_leaks - Monitor memory usage for leaks
49. log_analyzer - Analyze logs for patterns and anomalies

### Dependency Analysis (3)
50. analyze_dependencies - Find unused/missing/outdated packages
51. find_circular_deps - Detect circular import dependencies
52. detect_breaking_changes - LLM-powered breaking change detection

### Testing Tools (3)
53. find_tests_for_file - Find tests covering a source file
54. get_test_coverage - Parse test coverage reports
55. suggest_test_cases - LLM-powered test case suggestions

### Security (2)
56. scan_for_secrets - Scan for credentials and sensitive data
57. check_permissions - Analyze file/network/system access

### Environment (3)
58. get_env_config - Find all env variable usages
59. validate_env_complete - Validate env vars complete and documented
60. upgrade_package - Upgrade npm package with breaking change detection

### Database (1)
61. query_database - Execute SQL queries (PostgreSQL, MySQL, SQLite)

### Type Generation (3)
62. sync_api_types - Detect type drift between backend/frontend
63. generate_fixture - Generate test fixtures from schemas
64. generate_types - Generate TS types from various sources

### Documentation (1)
65. explain_codebase - Generate high-level codebase explanation

### Git (2)
66. create_pull_request - Create GitHub PR with auto-generated descriptions
67. resolve_merge_conflict - Analyze and suggest merge conflict resolutions

### Frontend Analysis (9)
68. get_react_component_tree - Build React component hierarchy
69. analyze_stacking_context - Analyze z-index and stacking contexts
70. analyze_responsive_breakpoints - Analyze Tailwind responsive classes
71. trace_component_state - Trace React state through component trees
72. analyze_render_triggers - Analyze React re-render causes
73. analyze_layout_hierarchy - Analyze CSS layout hierarchy
74. diagnose_overflow - Diagnose CSS overflow issues
75. get_accessibility_tree - Build a11y tree and detect WCAG issues
76. get_sizing_strategy - Analyze element sizing strategy

### Event & Style Analysis (2)
77. analyze_event_flow - Analyze event handling and propagation
78. analyze_tailwind_conflicts - Detect conflicting Tailwind classes

### Build Analysis (1)
79. analyze_bundle - Analyze bundle size and tree-shaking

### Process Management (3)
80. start_dev_server - Start dev server and return when ready
81. health_monitor - Monitor URL endpoint health
82. watch_for_errors - Monitor logs for errors

### Runtime Verification (4)
83. browser_automation - Automate browser with Puppeteer
84. verify_runtime_behavior - Execute code and verify results
85. lighthouse_audit - Run Lighthouse audits
86. visual_regression - Visual regression testing

### Self-Correction (4)
87. retry_with_learning - Retry with progressive fix strategies
88. atomic_multi_edit - Apply edits atomically with rollback
89. auto_rollback - Automatically rollback on failure
90. validate_api_contract - Validate API responses against OpenAPI

### Performance (1)
91. profile_function - Profile function performance

---

## SLASH COMMANDS (3)

1. `/search` - Search plugin resources (skills, agents, tools)
2. `/plugin-status` - Display plugin status and statistics
3. `/load-skill` - Load and display full skill content

---

## LIFECYCLE HOOKS (12)

1. **SessionStart (startup)** - Context injection on new session
2. **SessionStart (resume)** - Context injection on resume
3. **PreToolUse** - Validation before MCP tool execution
4. **PostToolUse** - Tracking after MCP tool execution
5. **PostToolUseFailure** - 3-phase error recovery
6. **PermissionRequest** - Permission validation
7. **UserPromptSubmit** - User input processing
8. **Stop** - Session interruption handling
9. **SubagentStart** - Subagent telemetry capture
10. **SubagentStop** - Output validation
11. **PreCompact** - State preservation before compaction
12. **SessionEnd** - Session cleanup
13. **Notification** - Notification handling

---

## OUTPUT STYLES (2)

1. **vibecoding** - Autonomous orchestration with agent delegation
2. **justvibes** - Fully autonomous silent execution

---

## TEMPLATES (3)

### Minimal
1. **next-app** - Next.js 15 + TypeScript + Tailwind + ESLint
2. **vite-react** - Vite + React 19 + TypeScript + Tailwind

### Full
3. **next-saas** - Full SaaS: NextAuth + Prisma + Stripe + Tailwind

---

## MEMORY & STATE FILES

- `.goodvibes/memory/decisions.md` - Architectural decisions
- `.goodvibes/memory/patterns.md` - Code patterns discovered
- `.goodvibes/memory/failures.md` - Past failures + solutions
- `.goodvibes/memory/preferences.md` - User preferences
- `.goodvibes/state/agent-tracking.json` - Agent telemetry
- `.goodvibes/state/hooks-state.json` - Session state
- `.goodvibes/logs/justvibes-log.md` - JustVibes activity log
- `.goodvibes/logs/telemetry/` - Monthly JSONL logs

---

## CONFIGURATION FILES

- `plugins/goodvibes/.claude-plugin/plugin.json` - Plugin manifest
- `plugins/goodvibes/.mcp.json` - MCP server config
- `plugins/goodvibes/.lsp.json` - LSP server config
- `plugins/goodvibes/hooks/hooks.json` - Hook definitions

---

**TOTALS:**
- 11 agents
- 172 skills
- 91 MCP tools
- 3 slash commands
- 12+ lifecycle hooks
- 2 output styles
- 3 templates
