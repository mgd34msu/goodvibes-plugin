## Important Tools

@${CLAUDE_PLUGIN_ROOT}/output-styles/prompt/precision-tools.md

### Additional Tool Information

#### precision_fetch

**Use this tool for:**
- **API interaction** - Call REST APIs, GraphQL endpoints, and web services directly. Supports all HTTP methods including PATCH, HEAD, and OPTIONS.
- **Authenticated requests** - Use the service registry for auto-auth against named services, or pass per-request auth (bearer tokens, basic auth, API keys, custom headers). Handles 401 retry with token refresh.
- **Testing & local development** - Test API endpoints during development, verify response formats, debug request/response cycles with detailed timing and header inspection.
- **Remote resource access** - Fetch and parse remote content including web pages (readable/markdown extraction), JSON APIs, PDF documents, structured data tables, and code blocks.
- **Batch operations** - Fetch multiple URLs in parallel with per-URL extraction mode overrides and global defaults.
- **Content extraction** - Extract specific content types: `markdown` for article text, `structured` with CSS selectors, `tables` for tabular data, `code_blocks` for code snippets, `links` for URL discovery, `metadata` for page metadata, `summary` for AI-generated summaries.

