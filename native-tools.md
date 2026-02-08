# Claude Code CLI - Native Tools Reference

Complete reference for all tools built into the Claude Code CLI, extracted from the v2.1.34 bundle source.

---

## Table of Contents

### Core File I/O
- [Read](#read)
- [Write](#write)
- [Edit](#edit)
- [NotebookEdit](#notebookedit)

### Search
- [Glob](#glob)
- [Grep](#grep)

### Execution
- [Bash](#bash)

### Web
- [WebFetch](#webfetch)
- [WebSearch](#websearch)

### Agent & Task
- [Task](#task)
- [TaskCreate](#taskcreate)
- [TaskUpdate](#taskupdate)
- [TaskGet](#taskget)
- [TaskList](#tasklist)
- [TaskOutput](#taskoutput)
- [TaskStop](#taskstop)

### User Interaction
- [AskUserQuestion](#askuserquestion)

### Planning
- [EnterPlanMode](#enterplanmode)
- [ExitPlanMode](#exitplanmode)

### Extensibility
- [Skill](#skill)
- [ToolSearch](#toolsearch)

### Agent Management
- [TodoWrite](#todowrite)
- [LSP](#lsp)

### Internal Utilities
- [permissions](#permissions)
- [hooks](#hooks)
- [stats](#stats)
- [at_a_glance](#at_a_glance)
- [sandbox](#sandbox)

### Browser & Computer Use
- [javascript_tool](#javascript_tool)
- [read_page](#read_page)
- [find](#find)
- [form_input](#form_input)
- [computer](#computer)
- [navigate](#navigate)
- [resize_window](#resize_window)
- [gif_creator](#gif_creator)
- [upload_image](#upload_image)
- [get_page_text](#get_page_text)
- [tabs_context_mcp](#tabs_context_mcp)
- [tabs_create_mcp](#tabs_create_mcp)
- [update_plan](#update_plan)
- [read_console_messages](#read_console_messages)
- [read_network_requests](#read_network_requests)
- [shortcuts_list](#shortcuts_list)
- [shortcuts_execute](#shortcuts_execute)

---

## Read

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | Absolute path to the file to read |
| `offset` | number | No | Line number to start reading from (1-indexed) |
| `limit` | number | No | Number of lines to read |
| `pages` | string | No | Page range for PDFs (e.g. `"1-5"`, `"3"`, `"10-20"`) |

### File Type Support

**1. Plain Text Files** (default)
- Reads file content with line numbers (`cat -n` format)
- Supports `offset` + `limit` for reading specific line ranges
- Default: reads up to 2000 lines from start
- Lines over 2000 chars are truncated
- Empty files return a system-reminder warning
- If offset exceeds file length, warns with total line count
- Returns: `{ type: "text", file: { filePath, content, numLines, startLine, totalLines } }`

**2. Image Files** (multimodal - visual content)
- Supported formats: `png`, `jpg`, `jpeg`, `gif`, `webp`
- Returns base64-encoded image data sent as visual content to the model
- Includes dimension metadata: `originalWidth`, `originalHeight`, `displayWidth`, `displayHeight`
- Images may be resized for token efficiency
- Returns: `{ type: "image", file: { base64, type, originalSize, dimensions } }`

**3. PDF Files**
- Two modes:
  - **Full PDF read** (no `pages` param) - reads entire PDF if under page limit; uses poppler-utils (`pdftoppm`) or native PDF support
  - **Page-range read** (`pages` param) - extracts specific pages as JPEG images, max 20 pages per request
- Validates page count - large PDFs (>10 pages) require the `pages` parameter
- Requires `poppler-utils` installed for image-based extraction, otherwise uses native document API
- Returns either `{ type: "pdf" }` or `{ type: "parts", file: { count, outputDir, originalSize } }`

**4. Jupyter Notebooks** (`.ipynb`)
- Parses notebook JSON structure
- Returns all cells (code, markdown, outputs) in structured format
- Size-limited - very large notebooks get an error with jq commands to read subsets
- Returns: `{ type: "notebook", file: { filePath, cells } }`

**5. Blocked Binary Formats** (explicit rejection)
- Audio: `mp3`, `wav`, `flac`, `ogg`, `aac`, `m4a`, `wma`, `aiff`, `opus`
- Video: `mp4`, `avi`, `mov`, `wmv`, `flv`, `mkv`, `webm`, `m4v`, `mpeg`, `mpg`
- Archives: `zip`, `rar`, `tar`, `gz`, `bz2`, `7z`, `xz`, `z`, `tgz`, `iso`
- Executables: `exe`, `dll`, `so`, `dylib`, `app`, `msi`, `deb`, `rpm`, `bin`
- Databases: `dat`, `db`, `sqlite`, `sqlite3`, `mdb`, `idx`
- Office docs: `doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`, `odt`, `ods`, `odp`
- Fonts: `ttf`, `otf`, `woff`, `woff2`, `eot`
- Design: `psd`, `ai`, `eps`, `sketch`, `fig`, `xd`
- 3D: `blend`, `obj`, `3ds`, `max`
- Compiled: `class`, `jar`, `war`, `pyc`, `pyo`, `rlib`
- Legacy: `swf`, `fla`

### Validation & Safety Features

- **Permission checking**: Validates against allow/deny rules in permission settings
- **File existence check**: Suggests similar filenames if file not found (`Did you mean X?`)
- **Size limits**: Enforces max file size (`maxSizeBytes`) and max token count (`maxTokens`); suggests using `offset`/`limit` or `Grep` to read portions
- **Binary file detection**: Rejects known binary formats with helpful error
- **Empty file handling**: Special warning for empty files/images
- **UNC path support**: Handles `\\` and `//` network paths
- **Read state tracking**: Records what was read (content + timestamp + offset/limit) for duplicate detection and token accounting
- **Duplicate read detection**: Tracks how many times the same file is read and calculates wasted tokens
- **Skill directory triggers**: Detects when reading files in skill directories and triggers skill loading
- **Session file detection**: Tracks reads of session memory and transcript files for telemetry
- **Nested memory attachment triggers**: Registers files for potential memory attachment

### Concurrency & Classification

- **Concurrency safe**: Yes - multiple reads can run in parallel
- **Read-only**: Yes
- **Search/Read classification**: `{ isSearch: false, isRead: true }`

---

## Bash

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | Yes | The command to execute |
| `timeout` | number | No | Optional timeout in milliseconds (max depends on env) |
| `description` | string | No | Clear, concise description of what this command does |
| `run_in_background` | boolean | No | Set to true to run command in background (if enabled) |
| `dangerouslyDisableSandbox` | boolean | No | Override sandbox mode (dangerous) |
| `_simulatedSedEdit` | object | No | Internal: pre-computed sed edit result from preview |

### Description Guidelines

The `description` parameter should follow these patterns:

**For simple commands** (git, npm, standard CLI tools), keep it brief (5-10 words):
- `ls` → "List files in current directory"
- `git status` → "Show working tree status"
- `npm install` → "Install package dependencies"

**For complex commands** (piped commands, obscure flags), add context:
- `find . -name "*.tmp" -exec rm {} \;` → "Find and delete all .tmp files recursively"
- `git reset --hard origin/main` → "Discard all local changes and match remote main"
- `curl -s url | jq '.data[]'` → "Fetch JSON from URL and extract data array elements"

### Output Schema

Returns an object with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `stdout` | string | Standard output of the command |
| `stderr` | string | Standard error output of the command |
| `rawOutputPath` | string (optional) | Path to raw output file for large MCP tool outputs |
| `interrupted` | boolean | Whether the command was interrupted |
| `isImage` | boolean (optional) | Flag indicating if stdout contains image data |
| `backgroundTaskId` | string (optional) | ID of background task if command is running in background |
| `backgroundedByUser` | boolean (optional) | True if user manually backgrounded with Ctrl+B |
| `dangerouslyDisableSandbox` | boolean (optional) | Flag indicating if sandbox mode was overridden |
| `returnCodeInterpretation` | string (optional) | Semantic interpretation for non-error exit codes |
| `structuredContent` | array (optional) | Structured content blocks from mcp-cli commands |

### Special Features

**1. Sandbox Mode**
- Enabled by default for security
- Can be disabled with `dangerouslyDisableSandbox: true` (dangerous!)
- When sandboxed, certain filesystem operations are restricted
- Annotates stderr with sandbox failure messages

**2. Background Execution**
- Controlled via `run_in_background` parameter
- Background tasks get a unique ID
- Output written to a file that can be read later
- User can manually background with Ctrl+B
- May be disabled via env variable `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`

**3. Simulated Sed Edits**
- Internal optimization: `_simulatedSedEdit` parameter
- Pre-computed sed edit results for faster execution
- Bypasses normal command execution path

**4. Image Output Detection**
- Automatically detects when stdout contains base64 image data
- Formats image data for model consumption
- Supports JPEG format conversion

**5. Command Interruption**
- Tracks whether command was aborted before completion
- Adds special error message when interrupted
- Returns interrupt status in output

**6. Working Directory Persistence**
- For non-agent contexts: working directory persists between calls
- For agent contexts: `preventCwdChanges` prevents directory changes

**7. Auto-Read File Paths**
- Extracts file paths from command output using Haiku model
- Automatically reads discovered files into memory state
- Enables context-aware follow-up operations

**8. Git Index Lock Detection**
- Detects `.git/index.lock` errors
- Logs telemetry for git lock errors

**9. Exit Code Interpretation**
- Semantic interpretation of exit codes
- Annotates non-error codes with special meaning
- Differentiates between error and non-error exits

**10. MCP Tool Output Handling**
- Detects mcp-cli command output
- Writes large outputs to temporary files
- Returns structured content blocks

### Validation

- **Permission checking**: Validates command against tool permission context
- **Timeout validation**: Enforces maximum timeout limit
- **Read-only detection**: Analyzes command to determine if it's read-only
- **Search/read classification**: Classifies commands as search or read operations

### Concurrency & Classification

- **Concurrency safe**: Only if command is classified as read-only
- **Read-only**: Determined by permission system analysis of the command
- **Search/Read classification**: `LKz(command)` analyzes command syntax

### Activity Tracking

- Logs telemetry for command execution:
  - `command_type`: First word of command
  - `stdout_length`: Length of stdout
  - `stderr_length`: Length of stderr
  - `exit_code`: Process exit code
  - `interrupted`: Whether command was interrupted

- Logs code indexing tool usage when detected
- Tracks tool usage for analytics

### Permission System Integration

Uses `AuA(input, toolUseContext)` for permission validation:
- Checks allow/deny rules for command execution
- Supports user confirmation prompts ("ask" behavior)
- Can modify command input based on permission decisions

### User-Facing Name

- Normal mode: "Bash"
- Sandbox mode (with indicator enabled): "SandboxedBash"
- Sed simulation mode: Uses Edit tool name format

### Progress Reporting

- Emits progress updates during long-running commands
- Reports: output, fullOutput, elapsedTimeSeconds, totalLines, timeoutMs
- Uses tool progress messages with unique IDs

---

## Write

### Purpose
Writes a file to the local filesystem. This tool will overwrite existing files.

### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | The absolute path to the file to write (must be absolute, not relative) |
| `content` | string | Yes | The content to write to the file |

### Features
- **Overwrites existing files**: If a file exists at the specified path, it will be completely replaced
- **Content normalization**: Content is processed through `N0A()` function before writing
- **Absolute paths required**: Only accepts absolute file paths, not relative paths
- **Must read before write**: For existing files, you MUST use the Read tool first. The tool will fail if you attempt to write to an existing file without reading it first.

### Validation & Safety
- **File path validation**: Validates that the provided path is absolute
- **Permission checking**: Performs permission checks before writing
- **Read-before-write enforcement**: Requires reading existing files before overwriting them to prevent accidental data loss
- **File tracking**: Tracks file modifications through the read file state system

### Concurrency & Classification
- **Concurrency safe**: No (part of write tools set: `["Edit", "Write", "NotebookEdit"]`)
- **Read-only**: No
- **Needs permissions**: Yes

### Implementation Details
- **Tool name**: "Write"
- **Schema type**: `strictObject`
- **Output**: Returns data about the write operation

### Usage Notes
- ALWAYS prefer editing existing files in the codebase over writing new files
- NEVER write new files unless explicitly required
- NEVER proactively create documentation files (*.md) or README files without explicit request
- Only use emojis if the user explicitly requests it

---

## Edit

### Purpose
Performs exact string replacements in files. This tool modifies existing files by finding and replacing specific text strings.

### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | The absolute path to the file to modify |
| `old_string` | string | Yes | The text to replace (must match exactly) |
| `new_string` | string | Yes | The text to replace it with (must be different from `old_string`) |
| `replace_all` | boolean | No | Replace all occurrences of `old_string` (default: false) |
| `_simulatedSedEdit` | object | No | Internal: pre-computed sed edit result from preview (has `filePath` and `newContent` fields) |

### Features
- **Exact string matching**: The `old_string` must match exactly as it appears in the file
- **Uniqueness requirement**: If `replace_all` is false (default), the edit will FAIL if `old_string` is not unique in the file
- **Multiple replacements**: Use `replace_all: true` to replace all occurrences of the string
- **Diff output**: Returns a diff showing the changes made
- **Pre-computed edits**: Supports `_simulatedSedEdit` parameter for sed-based edits (used internally by Bash tool integration)

### Validation & Safety
- **File path validation**: Validates that the provided path is absolute and exists
- **Permission checking**: Performs permission checks before editing
- **Read-before-edit enforcement**: You MUST use the Read tool at least once before editing. The tool will error if you attempt to edit without reading the file first.
- **Indentation preservation**: When editing text from Read tool output, ensure you preserve the exact indentation as it appears AFTER the line number prefix
- **Line number handling**: The line number prefix format is: `spaces + line number + tab`. Everything after the tab is the actual file content to match. Never include any part of the line number prefix in `old_string` or `new_string`.
- **String validation**: Ensures `old_string` and `new_string` are different

### Concurrency & Classification
- **Concurrency safe**: No (part of write tools set: `["Edit", "Write", "NotebookEdit"]`)
- **Read-only**: No
- **Needs permissions**: Yes

### Implementation Details
- **Tool name**: "Edit"
- **Schema type**: `strictObject`
- **Edit processing**: Edits are processed through `bQ7()` function which validates and prepares the edit operations
- **Output**: Returns data including a diff of changes

### Common Failure Scenarios

1. **Non-unique `old_string`**: If `old_string` appears multiple times and `replace_all` is false, the tool will fail. Solution: Either provide a larger, unique string with more surrounding context, or use `replace_all: true`.

2. **Indentation mismatch**: If the indentation in `old_string` doesn't exactly match the file, the tool will fail. Solution: Ensure you preserve the exact indentation from the Read tool output, excluding the line number prefix.

3. **String not found**: If `old_string` doesn't exist in the file (perhaps due to typos or the file has changed), the tool will fail. Solution: Re-read the file to get the current content.

### Usage Patterns

**Single replacement (default):**
```javascript
{
  "file_path": "/absolute/path/to/file.ts",
  "old_string": "const oldValue = 5;",
  "new_string": "const newValue = 10;"
}
```

**Replace all occurrences:**
```javascript
{
  "file_path": "/absolute/path/to/file.ts",
  "old_string": "oldVariableName",
  "new_string": "newVariableName",
  "replace_all": true
}
```

**Multi-line replacement:**
```javascript
{
  "file_path": "/absolute/path/to/file.ts",
  "old_string": "function oldFunction() {\n  return true;\n}",
  "new_string": "function newFunction() {\n  return false;\n}"
}
```

### Usage Notes
- ALWAYS prefer editing existing files over writing new files
- The Edit tool is optimized for making surgical changes to existing code
- For large-scale refactoring or adding new functionality, consider using the Edit tool multiple times with specific, targeted changes
- When renaming variables/functions throughout a file, use `replace_all: true`

---

## Comparison: Edit vs Write

| Aspect | Edit | Write |
|--------|------|-------|
| **Use case** | Modify existing files | Create new files or completely replace existing files |
| **Requires reading first** | Yes | Yes (for existing files) |
| **Preserves unchanged content** | Yes | No (overwrites entire file) |
| **Granularity** | Surgical (specific string replacements) | Complete file replacement |
| **Diff output** | Yes | No |
| **Best for** | Bug fixes, refactoring, small changes | New files, complete rewrites |
| **Risk level** | Lower (only changes specific strings) | Higher (replaces entire file) |

## General Guidelines

1. **Default to Edit**: When modifying existing files, prefer Edit over Write
2. **Read first**: Always read files before editing or writing to them
3. **Verify changes**: Check the diff output from Edit to ensure changes are correct
4. **Use absolute paths**: Both tools require absolute paths, not relative paths
5. **Avoid unnecessary writes**: Don't create new files unless explicitly required
6. **Preserve formatting**: When using Edit, match indentation and formatting exactly

## File Permission System

Both Write and Edit tools integrate with Claude Code's file permission system:
- Users can configure permissions at various levels (user settings, project settings, CLI args, session)
- Permission levels: `allow`, `deny`, `ask`
- Permission checks happen before tool execution
- Certain file patterns may be restricted (e.g., `.claude/**`, `~/.claude/**`)

## Integration with Other Tools

Both tools interact with:
- **Read tool**: Required before editing/writing existing files
- **Bash tool**: Can use `_simulatedSedEdit` parameter when Bash generates edit operations
- **File tracking system**: Updates read file state after modifications
- **Permission hooks**: PreToolUse hooks can intercept and modify edit/write operations

---

## Glob

### Description

Fast file pattern matching tool that works with any codebase size. Supports glob patterns and returns matching file paths sorted by modification time.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | Yes | The glob pattern to match files against (e.g., "**/*.js", "src/**/*.ts") |
| `path` | string | No | The directory to search in. Defaults to current working directory if not specified. Must be a valid directory path if provided. |

### Features

- **Fast pattern matching**: Optimized for codebases of any size
- **Glob pattern support**: Standard glob patterns including:
  - `*` - matches any sequence of non-separator characters
  - `**` - matches zero or more directories
  - `?` - matches any single non-separator character
  - `[...]` - matches any character in the brackets
  - `{a,b}` - matches a or b
- **Modification time sorting**: Results are sorted by file modification time
- **Directory search**: Can target specific directories or use current working directory
- **Recursive search**: Use `**` for recursive directory traversal

### Use Cases

- Finding files by name patterns
- Locating all files of a specific type
- Building file lists for batch operations
- Discovering files in specific directory structures

### Validation & Safety

- **Path validation**: If path is provided, must be a valid directory
- **Pattern validation**: Pattern must be a valid glob expression
- **Important notes**:
  - When path is omitted, defaults to current working directory (do NOT enter "undefined" or "null")
  - Returns file paths only (not directory contents)

### Concurrency & Classification

- **Concurrency safe**: Yes (read-only operation)
- **Read-only**: Yes
- **Tool category**: File search/discovery

### Best Practices

- Use this tool when you need to find files by name patterns
- For open-ended searches requiring multiple rounds of globbing and grepping, use the Agent tool instead
- Parallel calls are efficient - make multiple Glob calls in a single response when searching for different patterns

### Example Patterns

```
"**/*.js"          - All JavaScript files recursively
"src/**/*.ts"      - All TypeScript files in src/ and subdirectories
"*.json"           - All JSON files in current directory
"test/**/*.spec.ts" - All spec files in test directory
"{src,lib}/**/*.ts" - TypeScript files in src/ or lib/
```

---

## Grep

### Description

A powerful search tool built on ripgrep for searching file contents using regular expressions. Supports multiple output modes, context lines, and filtering options.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pattern` | string | Yes | The regular expression pattern to search for in file contents |
| `path` | string | No | File or directory to search in. Defaults to current working directory. |
| `glob` | string | No | Glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}") - maps to rg --glob |
| `type` | string | No | File type to search (e.g., "js", "py", "rust", "go", "java"). More efficient than glob for standard file types. |
| `output_mode` | string | No | Output mode: "content" (matching lines), "files_with_matches" (file paths only, default), or "count" (match counts) |
| `-i` | boolean | No | Case insensitive search (rg -i) |
| `-n` | boolean | No | Show line numbers in output (rg -n). Requires output_mode: "content". Defaults to true. |
| `-A` | number | No | Number of lines to show after each match (rg -A). Requires output_mode: "content". |
| `-B` | number | No | Number of lines to show before each match (rg -B). Requires output_mode: "content". |
| `-C` | number | No | Alias for context parameter. |
| `context` | number | No | Number of lines to show before and after each match (rg -C). Requires output_mode: "content". |
| `head_limit` | number | No | Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes. Defaults to 0 (unlimited). |
| `offset` | number | No | Skip first N lines/entries before applying head_limit, equivalent to "| tail -n +N | head -N". Defaults to 0. |
| `multiline` | boolean | No | Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false. |

### Features

- **Full regex support**: Supports complete regular expression syntax (e.g., "log.*Error", "function\\s+\\w+")
- **Multiple output modes**:
  - `content`: Shows matching lines with optional context
  - `files_with_matches`: Shows only file paths (default, most efficient)
  - `count`: Shows match counts per file
- **File filtering**:
  - By glob pattern (`glob` parameter)
  - By file type (`type` parameter for common types like js, py, rust)
- **Context control**:
  - Lines before match (`-B`)
  - Lines after match (`-A`)
  - Lines before and after (`-C` or `context`)
- **Result limiting**:
  - `head_limit`: Cap total results
  - `offset`: Skip initial results
  - Works across all output modes
- **Case sensitivity**: Toggle with `-i` flag
- **Line numbers**: Controlled via `-n` flag (default true for content mode)
- **Multiline matching**: Enable with `multiline: true` for patterns that span multiple lines
- **Built on ripgrep**: Uses ripgrep (rg) for high performance

### Pattern Syntax

- **Uses ripgrep syntax** (not grep)
- **Literal braces need escaping**: Use `interface\\{\\}` to find `interface{}` in Go code
- **Single-line by default**: Patterns match within single lines only
- **Multiline patterns**: Use `multiline: true` for cross-line patterns like `struct \\{[\\s\\S]*?field`

### Output Mode Details

#### content mode
- Shows matching lines from files
- Supports `-A`, `-B`, `-C` context parameters
- Supports `-n` for line numbers (default: true)
- Supports `head_limit` to cap output lines

#### files_with_matches mode (default)
- Shows only file paths containing matches
- Most efficient for finding "which files contain X"
- Supports `head_limit` to cap file list

#### count mode
- Shows match counts per file
- Useful for understanding match distribution
- Supports `head_limit` to cap count entries

### Validation & Safety

- **Pattern validation**: Pattern must be a valid regular expression
- **Path validation**: Path must exist and be accessible
- **Context restrictions**: `-A`, `-B`, `-C` only work with `output_mode: "content"`
- **Line numbers restriction**: `-n` only works with `output_mode: "content"`
- **Multiline patterns**: Default is single-line matching; must enable `multiline` for cross-line patterns

### Concurrency & Classification

- **Concurrency safe**: Yes (read-only operation)
- **Read-only**: Yes
- **Tool category**: Content search

### Best Practices

- **ALWAYS use Grep tool for search tasks** - NEVER invoke `grep` or `rg` as Bash commands
- **Use Task tool for open-ended searches** requiring multiple rounds
- **Start with files_with_matches** to find relevant files, then use content mode for details
- **Use type parameter** for standard file types (more efficient than glob)
- **Escape special characters** appropriately for ripgrep syntax
- **Enable multiline** when searching for patterns that span lines
- **Use head_limit** to prevent overwhelming output on large codebases

### Example Patterns

```
"function\\s+\\w+"        - Find function definitions
"import.*from"          - Find import statements
"TODO|FIXME|XXX"        - Find code comments/markers
"class\\s+\\w+"         - Find class definitions
"log.*Error"           - Find log error calls
```

### Example Usage

```json
// Find all TypeScript files with TODO comments
{
  "pattern": "TODO",
  "type": "ts",
  "output_mode": "files_with_matches"
}

// Find error handling with context
{
  "pattern": "catch\\s*\\(",
  "glob": "src/**/*.js",
  "output_mode": "content",
  "context": 3
}

// Count occurrences across files
{
  "pattern": "console\\.log",
  "output_mode": "count"
}
```

---

## WebFetch

### Description

Fetches content from a specified URL and processes it using an AI model. Converts HTML to markdown and analyzes the content based on a provided prompt.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string (URI) | Yes | The URL to fetch content from. Must be a fully-formed valid URL. |
| `prompt` | string | Yes | The prompt to run on the fetched content. Describes what information to extract from the page. |

### Features

- **HTTP/HTTPS support**: HTTP URLs are automatically upgraded to HTTPS
- **HTML to Markdown conversion**: Automatically converts HTML content to readable markdown format
- **AI-powered processing**: Processes content with a small, fast AI model based on the provided prompt
- **15-minute cache**: Self-cleaning cache for faster responses when repeatedly accessing the same URL
- **Redirect handling**: When a URL redirects to a different host, the tool informs you and provides the redirect URL. You should then make a new WebFetch request with the redirect URL.
- **Content summarization**: Results may be summarized if content is very large
- **Read-only**: Does not modify any files or resources

### URL Requirements

- Must be a fully-formed valid URL (with protocol)
- HTTP URLs are automatically upgraded to HTTPS
- Must be publicly accessible (not authenticated)

### Important Limitations

- **WILL FAIL for authenticated or private URLs**
- **Cannot access**: Google Docs, Confluence, Jira, private GitHub repositories, or any service requiring authentication
- **Before using WebFetch**: Check if the URL requires authentication. If so, use ToolSearch first to find a specialized tool that provides authenticated access.
- **For GitHub URLs**: Prefer using the gh CLI via Bash instead (e.g., `gh pr view`, `gh issue view`, `gh api`)
- **MCP web fetch tools**: If an MCP-provided web fetch tool is available, prefer using that tool instead, as it may have fewer restrictions

### Validation & Safety

- **URL validation**: Must be a valid URI format
- **Authentication check**: CRITICAL - will fail on authenticated services
- **Protocol handling**: Automatic HTTP to HTTPS upgrade
- **Redirect handling**: Requires manual follow-up on cross-host redirects
- **Read-only operation**: No modifications to external resources

### Concurrency & Classification

- **Concurrency safe**: Yes (read-only operation)
- **Read-only**: Yes
- **Tool category**: Web content retrieval and analysis

### Use Cases

- Retrieving and analyzing public web content
- Extracting specific information from web pages
- Reading documentation from public websites
- Analyzing article content
- Processing blog posts or public documentation

### Best Practices

- **Always provide a specific prompt** describing what information you want to extract
- **Check authentication requirements** before using (will fail on auth-required URLs)
- **Use specialized tools** for authenticated services (GitHub CLI, etc.)
- **Handle redirects**: Be prepared to make a second request if redirected to a different host
- **Cache awareness**: Same URL within 15 minutes will use cached content

### Example Usage

```json
// Extract main points from an article
{
  "url": "https://example.com/article",
  "prompt": "Summarize the main points of this article in bullet points"
}

// Find specific information
{
  "url": "https://docs.example.com/api",
  "prompt": "Extract all API endpoint URLs and their HTTP methods"
}

// Analyze content structure
{
  "url": "https://example.com/page",
  "prompt": "List all section headings and their hierarchy"
}
```

---

## WebSearch

### Description

Allows Claude to search the web and use the results to inform responses. Provides up-to-date information for current events and recent data beyond Claude's knowledge cutoff.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | The search query to use. Minimum length: 2 characters. |
| `allowed_domains` | string[] | No | Only include search results from these domains. |
| `blocked_domains` | string[] | No | Never include search results from these domains. |

### Features

- **Real-time web search**: Access current information beyond Claude's training cutoff
- **Domain filtering**:
  - **allowed_domains**: Whitelist specific domains to search within
  - **blocked_domains**: Blacklist domains to exclude from results
- **Automatic search execution**: Searches are performed automatically within a single API call
- **Formatted results**: Returns search result blocks including:
  - Result titles
  - URLs as markdown hyperlinks
  - Content snippets
  - Structured formatting
- **Current events**: Perfect for recent news, updates, and time-sensitive information
- **Documentation lookup**: Find latest documentation and guides

### Important Requirements

#### CRITICAL - Source Citations (MANDATORY)

**You MUST follow this requirement:**

- After answering the user's question, you MUST include a "Sources:" section at the end of your response
- In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: `[Title](URL)`
- This is MANDATORY - never skip including sources in your response

**Example format:**

```
[Your answer here]

Sources:
- [Source Title 1](https://example.com/1)
- [Source Title 2](https://example.com/2)
```

#### Date Awareness (CRITICAL)

- **Today's date is 2026-02-06**
- **You MUST use this year when searching for recent information**
- **Example**: If the user asks for "latest React docs", search for "React documentation 2026", NOT "React documentation 2025"
- Always include the current year in searches for recent information, documentation, or current events

### Availability

- **Geographic restriction**: Web search is only available in the US

### Validation & Safety

- **Query length**: Minimum 2 characters
- **Query validation**: Must be a valid search query string
- **Domain validation**: Domains must be valid domain names
- **Filtering logic**:
  - `allowed_domains`: Acts as whitelist (only these domains)
  - `blocked_domains`: Acts as blacklist (exclude these domains)
  - Can use both together (allowed takes precedence)

### Concurrency & Classification

- **Concurrency safe**: Yes (read-only operation)
- **Read-only**: Yes
- **Tool category**: Web search and information retrieval

### Use Cases

- Finding current events and news
- Looking up latest documentation (remember to use 2026 in query)
- Researching recent developments in technology
- Finding up-to-date guides and tutorials
- Checking current status of services or projects
- Gathering real-time information on any topic

### Best Practices

- **Include current year (2026)** in searches for recent content
- **Always cite sources** in your response
- **Use specific queries** for better results
- **Use domain filtering** to focus on authoritative sources
- **Block low-quality domains** to improve result quality
- **Combine multiple searches** if needed for comprehensive answers

### Domain Filtering Examples

```json
// Search only official documentation
{
  "query": "React hooks documentation 2026",
  "allowed_domains": ["react.dev", "reactjs.org"]
}

// Exclude social media
{
  "query": "latest AI developments 2026",
  "blocked_domains": ["twitter.com", "facebook.com", "reddit.com"]
}

// Academic sources only
{
  "query": "climate change research 2026",
  "allowed_domains": ["nature.com", "science.org", "arxiv.org"]
}
```

### Example Usage

```json
// Current events
{
  "query": "technology news February 2026"
}

// Latest documentation
{
  "query": "Next.js 15 documentation 2026",
  "allowed_domains": ["nextjs.org"]
}

// Specific topic research
{
  "query": "TypeScript 5.5 new features 2026",
  "blocked_domains": ["medium.com", "dev.to"]
}
```

### Response Format

When using WebSearch, structure your response as:

1. **Direct answer** to the user's question using search results
2. **Supporting details** from the search results
3. **Sources section** (MANDATORY) with markdown links to all referenced URLs

Example:

```
Based on current information, Next.js 15 was released in October 2025 and includes several major features:

- Improved App Router performance with partial prerendering
- Enhanced Server Actions with better error handling
- New caching strategies for dynamic content

Sources:
- [Next.js 15 Release Notes](https://nextjs.org/blog/next-15)
- [Next.js Documentation](https://nextjs.org/docs)
```

---

## NotebookEdit

### Description
Edits cells in Jupyter notebook files (.ipynb). Supports replacing, inserting, and deleting cells with full control over cell type (code or markdown).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| notebook_path | string | Yes | Absolute path to the .ipynb file to edit |
| cell_id | string | Yes | Unique identifier of the cell to edit/reference |
| new_source | string | Yes | New source code or markdown content for the cell |
| cell_type | "code" \| "markdown" | Yes | Type of the cell being edited |
| edit_mode | "replace" \| "insert" \| "delete" | Yes | Operation mode: replace existing cell, insert new cell, or delete cell |

### Features

- **Cell Operations**:
  - Replace: Completely replaces the contents of an existing cell
  - Insert: Adds a new cell at the specified position
  - Delete: Removes a cell from the notebook

- **Cell Types**:
  - Code cells: Python or other kernel-specific code
  - Markdown cells: Rich text documentation

- **File Handling**:
  - Reads and parses .ipynb JSON structure
  - Preserves notebook metadata and outputs
  - Maintains cell execution order

- **UI Integration**:
  - Shows preview of changes in permission dialog
  - Displays language-specific syntax highlighting (Python for code cells)
  - Configurable preview width (80 or 120 characters based on verbose mode)

### Validation & Safety

**Input Validation**:
- Validates notebook_path points to valid .ipynb file
- Checks cell_id exists in notebook (except for insert mode)
- Validates cell_type is one of allowed values
- Validates edit_mode is one of allowed values
- Validates new_source content based on cell_type

**Permission Checks**:
- Requires write permission for the notebook file
- Shows confirmation dialog with change preview
- Permission metadata includes the notebook path
- "Don't ask again" option available for specific notebook

**Error Handling**:
- Logs parsing failures: `Failed to parse notebook edit input: {error}`
- Returns safe default values on parse failure: `{ notebook_path: "", new_source: "", cell_id: "" }`
- Validates JSON structure of notebook file

### Concurrency & Classification

- **Concurrency safe**: No (file write operation)
- **Read-only**: No (modifies notebook files)
- **Search/Read classification**: Write operation
- **Tool category**: Edit operation (grouped with Edit and Write tools)

### Usage Notes

- Cell IDs in Jupyter notebooks are typically UUIDs
- When inserting, the new cell is placed after the specified cell_id
- Delete mode ignores new_source parameter
- Notebook structure (metadata, outputs) is preserved across edits
- Uses language detection to determine syntax highlighting

---

## TodoWrite

### Description
Manages a todo list for tracking task status within Claude Code CLI sessions. Provides structured task tracking with status management.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| todo_path | string | Unknown | Path to todo list file (possibly optional with default) |
| todo_item | string | Unknown | Description of the task to track |
| status | string | Unknown | Task status: pending, in_progress, completed, or similar |
| action | string | Unknown | Operation: add, update, remove, or similar |

### Features

**Note**: Due to limited source code visibility, the complete feature set is partially documented.

- **Task Management**:
  - Add new todo items to tracking list
  - Update status of existing items
  - Remove completed or cancelled items
  - List current todos

- **Status Tracking**:
  - Multiple status states (pending, in_progress, completed likely)
  - Status transitions
  - Task completion tracking

- **Integration**:
  - Likely integrates with agent task execution
  - May provide task summaries in UI
  - Referenced in task-related flows

### Validation & Safety

**Input Validation** (inferred):
- Validates todo_path if provided
- Validates status values against allowed enum
- Validates action type

**Permission Checks** (inferred):
- Write permissions for todo file location
- May have session-scoped restrictions

### Concurrency & Classification

- **Concurrency safe**: Unknown (likely No due to file writes)
- **Read-only**: No (modifies todo list)
- **Search/Read classification**: Write operation

**Status**: Requires further code investigation to complete documentation.

---

## Task

### Description
Spawns subagents to execute tasks asynchronously. Supports background execution, team-based agent collaboration, and configurable agent types with turn limits.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| subagent_type | string | Yes | Type of agent to spawn (e.g., "engineer", "researcher") |
| instructions | string | Yes | Task instructions for the subagent |
| max_turns | number | No | Maximum conversation turns for the agent |
| background | boolean | No | Whether to run the task in background |
| model | string | No | Model to use for the subagent |
| context | object | No | Additional context to provide to the agent |
| team_config | object | No | Configuration for multi-agent teams |

### Features

- **Agent Types**:
  - Supports multiple subagent types
  - Each type has specialized capabilities
  - Agent types defined in agent definitions

- **Execution Modes**:
  - **Synchronous**: Wait for task completion
  - **Background**: Task runs asynchronously
  - Returns task ID for background tasks
  - Use TaskOutput tool to retrieve results

- **Turn Management**:
  - Configurable max_turns limit
  - Prevents runaway agent execution
  - Tracks turn count during execution

- **Team Support**:
  - Multiple agents can collaborate
  - Agents can message each other
  - Team lead coordinates sub-agents
  - Broadcast and direct messaging

- **Progress Tracking**:
  - Reports task status changes
  - Shows delta summaries
  - Provides progress updates during execution
  - Task completion notifications

- **Context Injection**:
  - Can provide relevant decisions from memory
  - Can include patterns from codebase
  - Can share results from prior operations
  - Budget (tokens/turns) information

### Validation & Safety

**Input Validation**:
- Validates subagent_type against available agent definitions
- Checks instructions are non-empty
- Validates max_turns is positive integer
- Validates model if specified

**Permission Checks**:
- May require permission for agent spawning
- Background tasks may have additional restrictions
- Team configurations may require elevated permissions

**Resource Management**:
- Enforces turn limits
- Tracks token usage
- May enforce budget limits
- Prevents excessive concurrent tasks

**Error Handling**:
- Task execution failures reported
- Agent errors captured and returned
- Timeout handling for long-running tasks

### Concurrency & Classification

- **Concurrency safe**: Yes (when background=true)
- **Read-only**: No (agent may perform write operations)
- **Search/Read classification**: Depends on agent actions
- **Tool category**: Agent orchestration

### Usage Notes

- Background tasks return immediately with task ID
- Use `TaskOutput` tool to retrieve results: "You can check its output using the TaskOutput tool"
- Agent spawning integrates with conversation flow
- Multiple tasks can run concurrently in background
- Task progress messages sent during execution
- Referenced in agent management and networking modules

---

## ToolSearch

### Description
Searches for and loads deferred tools, making them available for use. Supports keyword search and direct tool selection. Part of the deferred tool loading system that reduces initial token overhead.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query or "select:<tool_name>" for direct selection |
| max_results | number | No | Maximum number of tools to return (default: 5) |

### Features

- **Query Modes**:
  - **Keyword Search**: Use keywords to find matching tools
    - Example: "list directory" finds directory listing tools
    - Example: "slack message" finds Slack messaging tools
    - Returns up to max_results tools ranked by relevance
  - **Direct Selection**: Use `select:<tool_name>` for specific tool
    - Example: "select:mcp__slack__read_channel"
    - Returns just that tool if it exists
    - No ranking, immediate load

- **Required Keyword**: Prefix with `+` to require a match
  - Example: "+linear create issue" - only "linear" tools
  - Example: "+slack send" - only "slack" tools
  - Useful when you know the service name

- **Tool Loading**:
  - Both query modes load returned tools immediately
  - No further selection step needed after keyword search
  - Loaded tools become available to call
  - Prevents calling deferred tools before loading

- **Deferred Tool System**:
  - Reduces initial prompt token count
  - Tools loaded on-demand
  - MCP tools often deferred
  - Some built-in tools may be deferred
  - Tool availability tracked per conversation

- **Token Optimization**:
  - Each deferred tool description ~50-100 tokens saved initially
  - Loading only needed tools reduces context size
  - Tool search itself is lightweight

### Validation & Safety

**Input Validation**:
- Validates query is non-empty
- Validates max_results is positive integer
- Checks for valid "select:" syntax
- Query minimum length: 2 characters

**Permission Checks**:
- No special permissions required (read-only operation)
- Loaded tools subject to their own permissions

**Error Handling**:
- Returns empty results if no matches
- Invalid tool names in select mode return empty
- Malformed queries handled gracefully

### Concurrency & Classification

- **Concurrency safe**: Yes (read-only, modifies session state only)
- **Read-only**: Yes (doesn't modify files or external systems)
- **Search/Read classification**: Search/Discovery operation
- **Tool category**: Tool discovery (explicitly listed as read-only tool)

### Usage Notes

- **MANDATORY PREREQUISITE**: Must load deferred tools before calling them
- Tool names in results use full qualified names (e.g., `mcp__server__toolname`)
- After keyword search, all returned tools are loaded
- Don't follow keyword search with select calls for same tools
- Tool search enabled/disabled based on feature flags
- Used in token counting and analysis flows
- Integration with MCP client tool discovery

---

## LSP

### Description
Provides Language Server Protocol integration for advanced code intelligence operations like symbol search, go-to-definition, find references, and code navigation.

### Parameters

**Note**: Complete parameter schema not visible in bundled code. Likely parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| operation | string | Yes | LSP operation type (symbols, definition, references, hover) |
| file_path | string | Yes | Path to the file to analyze |
| position | object | No | Line/column position for position-dependent operations |
| symbol_name | string | No | Symbol to search for |
| workspace_path | string | No | Workspace root for multi-file operations |

### Features

**Note**: Feature set inferred from typical LSP capabilities and tool classification.

- **Symbol Operations**:
  - Search for symbols (functions, classes, variables) across files
  - Get symbol definitions (go-to-definition)
  - Find all references to a symbol
  - Symbol hierarchy and relationships

- **Code Intelligence**:
  - Hover information (documentation, type info)
  - Code completion suggestions
  - Signature help for functions
  - Workspace symbol search

- **Navigation**:
  - Jump to definition
  - Find implementations
  - Find references
  - Document outline/structure

- **Language Support**:
  - Multi-language support via LSP
  - Language-specific features
  - File type detection
  - Workspace-aware operations

### Validation & Safety

**Input Validation** (inferred):
- Validates file_path exists and is readable
- Validates operation type against supported operations
- Validates position coordinates if provided
- Checks workspace_path is valid directory

**Permission Checks**:
- Read permissions for target files
- No write permissions needed (read-only tool)
- May access multiple files in workspace

**Error Handling**:
- LSP server errors reported
- Handles files not in workspace
- Graceful degradation if LSP unavailable

### Concurrency & Classification

- **Concurrency safe**: Yes (read-only operation)
- **Read-only**: Yes (doesn't modify files)
- **Search/Read classification**: Search/Read operation
- **Tool category**: Code intelligence (explicitly listed as read-only tool)

### Usage Notes

- Requires LSP server for target language
- May have initial startup time for LSP server
- Workspace indexing may take time for large projects
- Results depend on LSP server quality
- Language support varies by LSP implementation
- Part of code analysis and navigation features

**Status**: Requires further investigation for complete parameter schema and operation details.

---

## TaskCreate

**Status**: Referenced in delegate mode system prompts but implementation not fully documented in extracted source.

### Purpose

Creates a new task in the task management system. Used primarily in delegate mode where a lead agent coordinates work across teammates.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| subject | string | Yes | Short title/summary of the task |
| description | string | Yes | Detailed description of what needs to be done |
| activeForm | string | No | Present continuous verb form (e.g., "Writing tests", "Fixing bug") |
| owner | string | No | Agent or teammate assigned to the task |
| status | string | No | Initial status (default: "pending") |
| blocks | string[] | No | Task IDs that this task blocks |
| blockedBy | string[] | No | Task IDs that block this task |

### Features

- **Task creation in delegate mode**: Primary use is when team lead creates tasks for teammates
- **Task dependencies**: Support for blocking relationships between tasks
- **Status tracking**: Tasks can be in pending, in_progress, completed, or deleted states
- **Assignment**: Tasks can be assigned to specific team members
- **Description formatting**: Both subject (short) and description (detailed) fields

### Usage Context

From system prompt:
```
You are in delegate mode for team "{teamName}". In this mode, you can ONLY use the following tools:
- TeammateTool: For spawning teammates, sending messages, and team coordination
- TaskCreate: For creating new tasks
- TaskGet: For retrieving task details
- TaskUpdate: For updating task status and adding comments
- TaskList: For listing all tasks
```

### Validation & Safety

- Task list location provided in delegate mode context
- Subject and description are required fields
- Status field validates against known status values

### Concurrency & Classification

- **Concurrency safe**: Unknown (not documented in extracted source)
- **Read-only**: No (creates new tasks)

---

## TaskUpdate

**Status**: Referenced in delegate mode system prompts but implementation not fully documented in extracted source.

### Purpose

Updates an existing task's status, assignments, comments, or dependencies.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| task_id | string | Yes | ID of the task to update |
| status | string | No | New status (pending/in_progress/completed/deleted) |
| owner | string | No | New owner/assignee |
| comment | string | No | Add a comment to the task |
| blocks | string[] | No | Update tasks that this task blocks |
| blockedBy | string[] | No | Update tasks that block this task |

### Features

- **Status transitions**: Update task status through its lifecycle
- **Reassignment**: Change task ownership
- **Comments**: Add progress notes or updates
- **Dependency management**: Modify blocking relationships
- **Partial updates**: Only specified fields are updated

### Usage Context

Used in delegate mode for tracking progress:
- Mark tasks as in_progress when starting work
- Mark tasks as completed when done
- Add comments for progress updates
- Reassign tasks to different teammates

### Validation & Safety

- Validates task_id exists
- Validates status against allowed values
- Validates owner against known teammates

### Concurrency & Classification

- **Concurrency safe**: Unknown (not documented in extracted source)
- **Read-only**: No (modifies tasks)

---

## TaskGet

**Status**: Referenced in delegate mode system prompts but implementation not fully documented in extracted source.

### Purpose

Retrieves detailed information about a specific task.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| task_id | string | Yes | ID of the task to retrieve |

### Features

- **Full task details**: Returns all task fields including status, owner, description
- **Dependency information**: Shows blocking relationships
- **History**: May include comments and status changes

### Usage Context

Used when:
- Need to check task status before taking action
- Want to see full task description
- Checking dependencies before starting work

### Validation & Safety

- Validates task_id exists
- Returns error if task not found

### Concurrency & Classification

- **Concurrency safe**: Yes (read-only)
- **Read-only**: Yes

---

## TaskList

**Status**: Referenced in delegate mode system prompts but implementation not fully documented in extracted source.

### Purpose

Lists all tasks in the task management system with summary information.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter by status (pending/in_progress/completed/deleted) |
| owner | string | No | Filter by owner/assignee |

### Features

- **List all tasks**: Get overview of all tasks
- **Filter by status**: Show only tasks in specific states
- **Filter by owner**: Show only tasks assigned to specific teammate
- **Summary view**: Returns task IDs, subjects, status, and owners
- **Task location**: Task list path provided in delegate mode context

### Usage Context

Used for:
- Getting overview of all work items
- Checking what tasks are pending
- Seeing what each teammate is working on
- Monitoring overall progress

### Validation & Safety

- Validates status filter against known values
- Validates owner filter against known teammates

### Concurrency & Classification

- **Concurrency safe**: Yes (read-only)
- **Read-only**: Yes

---

## TaskOutput

**Status**: Referenced in system messages and background task handling.

### Purpose

Reads output from background tasks. When a command is run with `run_in_background: true` in the Bash tool, use TaskOutput to retrieve its results.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| task_id | string | Yes | ID of the background task |
| blocking | boolean | No | Wait for task to complete (default: false) |
| timeout | number | No | Max time to wait in milliseconds (if blocking) |

### Features

- **Non-blocking reads**: Check output without waiting
- **Blocking reads**: Wait for task completion with timeout
- **Output retrieval**: Get stdout/stderr from background commands
- **Status checking**: See if task is still running, completed, or failed
- **Integration with Bash tool**: Used after `run_in_background: true`

### Usage Context

From system message:
```
You can check its output using the TaskOutput tool.
```

Typical workflow:
1. Run command with Bash tool and `run_in_background: true`
2. Receive task_id in response
3. Use TaskOutput to check status and retrieve results
4. Can poll periodically or use blocking mode

### Validation & Safety

- Validates task_id exists
- Timeout prevents indefinite blocking
- Returns task status even if not complete

### Concurrency & Classification

- **Concurrency safe**: Yes (read-only)
- **Read-only**: Yes

---

## TaskStop

**Status**: Referenced in system messages for background task handling.

### Purpose

Stops a running background task.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| task_id | string | Yes | ID of the background task to stop |
| signal | string | No | Signal to send (SIGTERM, SIGKILL, etc.) |

### Features

- **Graceful termination**: Stop background tasks cleanly
- **Force kill**: Can send SIGKILL if needed
- **Status update**: Task status changes to "killed" or "stopped"
- **Resource cleanup**: Frees resources used by background task

### Usage Context

From system message:
```javascript
if (A.status === "killed")
  return [
    g6({
      content: RI(
        `Task "${A.description}" (${A.taskId}) was stopped by the user.`,
      ),
      isMeta: !0,
    }),
  ];
```

Used when:
- Background task is taking too long
- Task is no longer needed
- User requests cancellation
- Need to stop runaway process

### Validation & Safety

- Validates task_id exists and is running
- Cannot stop already completed tasks
- May require confirmation for destructive operations

### Concurrency & Classification

- **Concurrency safe**: No (modifies task state)
- **Read-only**: No

---

## AskUserQuestion

**Status**: Well-documented in skill examples and system prompts.

### Purpose

Presents interactive questions to the user with predefined options. Used for confirmations, choices, and gathering user input in a structured way.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| questions | Question[] | Yes | Array of questions to ask |
| metadata | object | No | Additional context (e.g., source, category) |

#### Question Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| question | string | Yes | The question text to display |
| header | string | No | Title/header for the question UI |
| options | Option[] | Yes | Array of possible answers |
| multiSelect | boolean | No | Allow multiple selections (default: false) |

#### Option Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| label | string | Yes | Short label for the option |
| description | string | No | Detailed explanation of the option |
| value | string | No | Value to return (defaults to label) |
| url | string | No | Optional URL associated with option |

### Features

- **Structured choices**: Present clear options instead of freeform text
- **Multiple questions**: Ask several questions in sequence
- **Multi-select support**: Allow user to choose multiple options
- **Rich descriptions**: Provide context for each option
- **Metadata tracking**: Tag questions with source/category info
- **Always includes "Other"**: User can provide freeform text via implicit "Other" option
- **Preferred over text questions**: System prompts emphasize using this tool over plain text questions

### Usage Examples

From skill documentation:
```javascript
AskUserQuestion({
  questions: [{
    question: "Add to CLAUDE.local.md: 'Prefer bun over npm for all commands'?",
    header: "Add memory",
    options: [
      { label: "Yes, add it", description: "Add this entry to CLAUDE.local.md" },
      { label: "No, skip", description: "Don't add this entry" },
      { label: "Edit first", description: "Let me modify the entry before adding" }
    ],
    multiSelect: false
  }],
  metadata: { source: "remember" }
})
```

From yes/no confirmation:
```javascript
options: [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
]
```

### Critical Requirements

From skill documentation:
```
## CRITICAL: Use the AskUserQuestion Tool

**Never ask questions via plain text output.** Use the AskUserQuestion tool for ALL confirmations.

WRONG:
```
Should I create CLAUDE.local.md with this entry?
- Yes, create it
- No, skip
```

CORRECT:
```
<use AskUserQuestion tool with questions array>
```

Printing a question as text instead of using AskUserQuestion means the task has failed.
```

From skill creation:
```
You will use the AskUserQuestion to understand what the user wants to automate. Important notes:
- Use AskUserQuestion for ALL questions! Never ask questions via plain text.
```

### Validation & Safety

- **Questions array required**: Must have at least one question
- **Options required**: Each question must have options array
- **No "Needs tweaking" options**: System notes user always has implicit "Other" option for freeform feedback
- **One question per call**: For important decisions, ask separately rather than batching

### Best Practices

1. **Use for all user input**: Never use plain text questions
2. **Clear option labels**: Make choices obvious and actionable
3. **Provide descriptions**: Help user understand implications
4. **Don't over-ask**: Keep questions focused and necessary
5. **One concept per question**: Especially for important decisions
6. **Include header**: Provides context for the question UI
7. **Meaningful metadata**: Tag questions for tracking/analytics

### Concurrency & Classification

- **Concurrency safe**: Yes (blocking for user input)
- **Read-only**: Yes (doesn't modify system state directly)

---

## EnterPlanMode

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| *(none)* | - | - | This tool takes no parameters (empty strictObject) |

### Features

- **Purpose**: Requests permission to enter plan mode for complex tasks requiring exploration and design
- **Plan Mode Activation**: Transitions the user from normal execution mode to read-only planning mode
- **State Management**: 
  - Saves the previous mode (`prePlanMode`) to restore later when exiting
  - Updates `toolPermissionContext.mode` to "plan"
  - Stores mode change in session state (destination: "session")
- **Agent Restriction**: Cannot be used in agent contexts (throws error if `agentId` is present)
- **Mode Transition Tracking**: Calls `Cy()` to track mode transitions for analytics/state management
- **User Confirmation**: Returns a message confirming plan mode entry and guidance on what to do next

### Validation & Safety

- **Input Validation**: None required (empty input schema)
- **Permission Check**: Always returns `{behavior: "allow"}` - no additional permissions needed
- **Preconditions**: Cannot be called by agents (throws error)
- **Side Effects**: 
  - Changes app state to plan mode
  - Triggers plan mode transition event
  - Stores previous mode for restoration

### Output

**Success Output Schema**:
- `message` (string): Confirmation that plan mode was entered

**Tool Result Content**:
The tool returns different guidance depending on configuration:
- **Default mode**: Full instructions on how to use plan mode (7 steps)
- **Simplified mode** (if `uO()` returns true): Brief "DO NOT write or edit any files" warning

**Instructions provided in default mode**:
1. Thoroughly explore the codebase to understand existing patterns
2. Identify similar features and architectural approaches  
3. Consider multiple approaches and their trade-offs
4. Use AskUserQuestion if you need to clarify the approach
5. Design a concrete implementation strategy
6. When ready, use ExitPlanMode to present your plan for approval
7. Remember: DO NOT write or edit any files yet (read-only exploration)

### Concurrency & Classification

- **Concurrency safe**: Yes (isConcurrencySafe: true)
- **Read-only**: Yes (isReadOnly: true)
- **Requires user interaction**: No
- **Max result size**: 100,000 characters

---

## ExitPlanMode

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| allowedPrompts | array of objects | No | Prompt-based permissions needed to implement the plan (describes categories of actions rather than specific commands) |
| pushToRemote | boolean | No | Whether to push the plan to a remote Claude.ai session |
| remoteSessionId | string | No | The remote session ID if pushed to remote |
| remoteSessionUrl | string | No | The remote session URL if pushed to remote |
| remoteSessionTitle | string | No | Title for the remote session |

**allowedPrompts array item structure** (ykY type):
- Each item is a semantic description of an action (e.g., "run tests", "install dependencies")

### Features

- **Purpose**: Prompts the user to exit plan mode and start coding
- **Multiple Execution Paths**:
  1. **Agent Mode with Plan Approval Required** (`Kz() && zy1()`):
     - Reads plan file from disk
     - Creates plan approval request with unique ID
     - Sends message to team lead via `X9()`
     - Marks agent as awaiting approval
     - Returns plan content and request ID
  2. **Push to Remote Session** (if `pushToRemote && remoteSessionId`):
     - Pushes plan to remote Claude.ai session via `YQ1()`
     - Exits plan mode and restores previous mode
  3. **Standard Exit**:
     - Exits plan mode immediately
     - Restores previous mode from `prePlanMode`
     - Marks plan mode as exited (`gN(true)`, `Kx(true)`)
- **Plan File Management**:
  - Reads plan from file at path returned by `OZ(agentId)`
  - Uses `uD(agentId)` to get plan content
  - Validates plan file exists before agent approval flow
- **State Management**:
  - Restores `toolPermissionContext.mode` to previous value
  - Clears `prePlanMode` from state
  - Sets plan mode exit flags
- **Task Tool Detection**: Checks if Task tool is available (`XK` tool name)

### Validation & Safety

- **Permission Check**: 
  - If agent mode (`Kz()`): Always allows
  - Otherwise: Asks user for confirmation ("Exit plan mode?")
- **Plan File Validation** (agent mode):
  - Throws error if no plan file found at expected path
  - Error message includes path and instructs to write plan before calling tool
- **Preconditions**:
  - Must be in plan mode to exit
  - Agent mode requires plan file to exist

### Output

**Success Output Schema** (CkY):
- `plan` (string): The plan content
- `isAgent` (boolean): Whether this is an agent context
- `filePath` (string): Path to the plan file
- `pushToRemote` (boolean, optional): Whether plan was pushed to remote
- `remoteSessionId` (string, optional): Remote session ID if pushed
- `remoteSessionUrl` (string, optional): Remote session URL if pushed
- `hasTaskTool` (boolean, optional): Whether Task tool is available
- `awaitingLeaderApproval` (boolean, optional): True if agent is waiting for approval
- `requestId` (string, optional): Unique ID for approval request

**Tool Result Content Variants**:
1. **Pushed to Remote**: Brief confirmation (no repetition of URL)
2. **Awaiting Approval**: Detailed instructions on what happens next (4 steps + request ID)
3. **Agent Approved**: Simple "ok" instruction
4. **Standard Exit**: Confirmation of exit with plan file path and next steps guidance

### Concurrency & Classification

- **Concurrency safe**: Yes (isConcurrencySafe: true)
- **Read-only**: No (isReadOnly: false) - modifies state
- **Requires user interaction**: Yes (unless agent mode)
- **Max result size**: 100,000 characters

---

## Skill

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| skill | string | Yes | The skill name. E.g., "commit", "review-pr", or "pdf" |
| args | string | No | Optional arguments for the skill |

### Features

- **Purpose**: Execute a registered skill by name
- **Skill Name Handling**:
  - Accepts skill names with or without leading "/" slash
  - Strips leading "/" if present (tracks usage with telemetry)
  - Looks up skill in registry via `kZ(UJ())`
- **Skill Loading**: Uses `uh(skillName, registry)` to load skill configuration
- **Skill Types Supported**: Only "prompt" type skills (inline execution)
- **Output Types**:
  - **Inline execution** (`status: "inline"`): Returns skill validation info
  - **Forked execution** (`status: "forked"`): Returns result from sub-agent
- **Permission Rules**:
  - Checks deny rules first (blocks matching skills)
  - Then checks allow rules (permits matching skills)
  - Supports wildcard patterns (e.g., "commit:*" for all commit-related skills)
  - Auto-allows skills with no explicit rules if marked as auto-invocable
- **Permission Suggestions**: Offers two suggestion types when asking:
  1. Allow specific skill: `toolName: "Skill", ruleContent: "skill-name"`
  2. Allow skill family: `toolName: "Skill", ruleContent: "skill-name:*"`

### Validation & Safety

- **Input Validation** (`validateInput`):
  1. **Empty Check**: Returns error code 1 if skill name is empty/whitespace
  2. **Skill Existence**: Returns error code 2 if skill not found in registry
  3. **Skill Loading**: Returns error code 3 if skill cannot be loaded
  4. **Model Invocation Check**: Returns error code 4 if skill has `disable-model-invocation` flag
  5. **Skill Type Check**: Returns error code 5 if skill is not "prompt" type
- **Permission Check** (`checkPermissions`):
  - Strips leading "/" from skill name before checking
  - Checks against permission rules in order: deny rules → allow rules → default
  - Uses pattern matching function `_()` to match rules:
    - Exact match: "skill-name" matches "skill-name"
    - Wildcard match: "skill-name:*" matches "skill-name:anything"
  - Returns deny/allow with rule metadata when matched
  - Falls back to ask behavior if no rules match and skill not auto-invocable
- **Auto-Invocation Check**: Uses `UPY(skill)` to determine if skill can be auto-invoked

### Output

**Success Output Schema** (union of two types):

**Type 1: Inline Execution** (BPY):
- `success` (boolean): Whether the skill is valid
- `commandName` (string): The name of the skill
- `allowedTools` (array of strings, optional): Tools allowed by this skill
- `model` (string, optional): Model override if specified
- `status` (literal "inline", optional): Execution status

**Type 2: Forked Execution** (mPY):
- `success` (boolean): Whether the skill completed successfully
- `commandName` (string): The name of the skill  
- `status` (literal "forked"): Execution status
- `agentId` (string): The ID of the sub-agent that executed the skill
- `result` (string): The result from the forked skill execution

### Concurrency & Classification

- **Concurrency safe**: No (isConcurrencySafe: false)
- **Read-only**: No (isReadOnly: false)
- **Max result size**: 100,000 characters

---

## permissions

### Parameters

This is a **local-jsx** tool that takes a raw string argument (not a structured schema).

**Argument Pattern**: `open` (optional subcommand)

### Features

- **Purpose**: Manage allow & deny tool permission rules
- **Type**: Local JSX tool (renders UI components)
- **Aliases**: `allowed-tools`
- **Primary Functions**:
  1. **Enable Plan Mode**: If not already in plan mode, enables it
  2. **Display Current Plan**: Shows the current plan content with path
  3. **Open Plan in Editor**: If "open" subcommand provided, opens plan file in configured editor
- **Plan Mode Check**: Checks if `toolPermissionContext.mode === "plan"`
- **Plan File Management**:
  - Gets plan content via `uD()`
  - Gets plan path via `OZ()`
  - Detects editor name via `MI()` then `X_()` for display name
- **UI Rendering**: Uses React components to display:
  - "Current Plan" header (bold)
  - Plan file path (dimmed)
  - Plan content
  - Editor instructions (if editor configured)

### Validation & Safety

- **No Explicit Validation**: Takes raw string input
- **Mode Transitions**: Uses `Cy()` to track plan mode entry
- **State Management**: Updates `toolPermissionContext` with:
  - `type: "setMode"`
  - `mode: "plan"`
  - `destination: "session"`
- **Editor Integration**: Uses `fm()` to open file (may throw on failure)

### Output

**Scenarios**:
1. **Entering Plan Mode**: Returns "Enabled plan mode" text
2. **Already in Plan Mode, No Plan**: Returns "Already in plan mode. No plan written yet."
3. **Open Subcommand Success**: Returns "Opened plan in editor: {path}"
4. **Open Subcommand Failure**: Returns "Failed to open plan in editor: {error}"
5. **Display Plan**: Returns JSX component rendering with plan details

### Concurrency & Classification

- **Tool Type**: local-jsx (not standard tool)
- **Always Enabled**: isEnabled: () => true
- **Not Hidden**: isHidden: false
- **User Facing Name**: "permissions"

---

## hooks

### Parameters

This is a **local-jsx** tool that takes no parameters (the call implementation doesn't use the input).

### Features

- **Purpose**: Manage hook configurations for tool events
- **Type**: Local JSX tool
- **Primary Function**: Lists files currently in the read file state context
- **Context Inspection**: 
  - Reads from `readFileState` in tool context
  - Uses `oS()` to extract file list from state
  - Falls back to empty array if no read file state
- **Output Format**: Plain text with newline-separated file paths
- **Path Display**: Shows relative paths from working directory via `MAz(y6(), filePath)`

### Validation & Safety

- **No Input Validation**: Doesn't process input parameters
- **Safe Fallback**: Returns "No files in context" if context is empty
- **Read-Only**: Only inspects existing state, doesn't modify anything

### Output

**Output Format**:
```
Files in context:
{relative-path-1}
{relative-path-2}
...
```

Or if no files:
```
No files in context
```

### Concurrency & Classification

- **Tool Type**: local-jsx (not standard tool)
- **Always Enabled**: isEnabled: () => true
- **Not Hidden**: isHidden: false
- **User Facing Name**: "hooks"

---

## stats

### Parameters

This is a **local-jsx** tool that takes no parameters.

### Features

- **Purpose**: Show your Claude Code usage statistics and activity
- **Type**: Local JSX tool (renders interactive UI)
- **Data Collection**: 
  - Calls `Fb()` via `bwq()` and `l4z()` to gather statistics
  - Processes file extensions via `o4z()` using `i4z` extension map
  - Analyzes usage via `a4z()` function
- **Statistics Tracked**:
  - File type distribution and counts
  - Tool usage patterns
  - Session activity
  - Project areas worked on
  - Big wins (impressive accomplishments)
  - Friction points (where things go wrong)
  - Unused features
  - Features to try
  - Opportunities on the horizon
- **AI-Generated Insights**: Calls `xwq()` to generate "At a Glance" summary:
  - Uses AI model with 8192 max tokens
  - Generates 4-part structure:
    1. What's working (user's unique style)
    2. What's hindering (Claude's fault vs user friction)
    3. Quick wins to try (specific features)
    4. Ambitious workflows for better models (future capabilities)
- **HTML Report Generation**: 
  - Creates styled HTML with embedded CSS
  - Uses bar charts for visual representation
  - Includes multiple sections with anchors for navigation
  - Sanitizes content via `j9()` for HTML entities
  - Formats markdown via `xV6()` (bold text support)

### Validation & Safety

- **No Input Validation**: Tool takes no parameters
- **Read-Only**: Only reads and displays data, no modifications
- **Safe Content Rendering**: HTML entity escaping via `j9()`

### Output

**Statistics Report Sections**:
1. **At a Glance** - AI-generated 4-part summary with navigation links
2. **What You Work On** - Project areas with session counts
3. **Impressive Things You Did** - Big wins and accomplishments  
4. **Where Things Go Wrong** - Friction points and issues
5. **Features to Try** - Recommended unused features
6. **On the Horizon** - Future opportunities and ambitious workflows
7. **Charts & Metrics** - Visual representations of usage data

**Color Scheme** (from CSS):
- Bar fills use specific colors for different metrics
- Sections have themed styling
- Links and navigation elements styled for usability

### Concurrency & Classification

- **Tool Type**: local-jsx
- **Always Enabled**: isEnabled: () => true
- **Not Hidden**: isHidden: false  
- **User Facing Name**: "stats"

---

## at_a_glance

Note: `at_a_glance` is not a standalone tool but rather a **data structure** and **AI prompt** used by the `stats` tool.

### Structure

**Input to AI Model** (via `xwq()`):
```javascript
{
  name: "at_a_glance",
  prompt: "<detailed multi-paragraph prompt>",
  maxTokens: 8192
}
```

### AI Prompt Structure

The prompt instructs the AI to write a 4-part "At a Glance" summary:

1. **What's working** (2-3 sentences)
   - User's unique interaction style with Claude
   - Impactful things they've accomplished
   - High-level, avoid tool call details
   - Not fluffy or overly complimentary

2. **What's hindering you** (2-3 sentences)
   - Split into:
     a) Claude's fault (misunderstandings, wrong approaches, bugs)
     b) User-side friction (context issues, environment problems)
   - Honest but constructive

3. **Quick wins to try** (2-3 sentences)
   - Specific Claude Code features to try
   - Compelling workflow techniques
   - Avoid generic advice like "provide more context"

4. **Ambitious workflows for better models** (2-3 sentences)
   - Preparation for next 3-6 months
   - Workflows that seem impossible now but will become possible
   - Forward-looking capabilities

### Features

- **Coaching Tone**: Designed to help users improve their Claude usage
- **Context Provided**: 
  - Session data summary
  - Project areas (what user works on)
  - Big wins (impressive accomplishments)
  - Friction points
  - Unused features  
  - Opportunities on the horizon
- **Output Format**: Valid JSON object with 4 keys:
  ```json
  {
    "whats_working": "...",
    "whats_hindering": "...",
    "quick_wins": "...",
    "ambitious_workflows": "..."
  }
  ```
- **Integration**: Result stored in `O.at_a_glance` and used by stats tool HTML generation

### Validation & Safety

- **No Direct Validation**: This is data passed to AI, not a tool with validation
- **JSON Parsing**: Stats tool must parse AI response as JSON
- **Fallback Handling**: If AI generation fails, stats tool omits the section

### Usage in stats Tool

The `at_a_glance` data is rendered in HTML as:
```html
<div class="at-a-glance">
  <div class="glance-title">At a Glance</div>
  <div class="glance-sections">
    <!-- 4 sections with navigation links -->
  </div>
</div>
```

Each section includes:
- Bold label ("What's working:", etc.)
- Formatted content via `xV6()` (markdown bold → HTML strong)
- Navigation link to relevant report section

---

## sandbox

### Parameters

This is a **local-jsx** tool that takes a raw string argument.

**Argument Hint**: `exclude "command pattern"`

### Features

- **Purpose**: Manage sandbox configuration for command execution safety
- **Type**: Local JSX tool (immediate: true for instant execution)
- **Dynamic Description**: Description updates based on current state:
  - Checks sandbox dependencies via `I8.checkDependencies()`
  - Shows status icons: warning (⚠️ if deps missing), tick (✓ if enabled), circle (○ if disabled)
  - Displays current configuration:
    - "sandbox disabled"
    - "sandbox enabled" or "sandbox enabled (auto-allow)"
    - ", fallback allowed" suffix if unsandboxed commands permitted
    - " (managed)" suffix if locked by policy
- **Status Checks**:
  - `I8.isSandboxingEnabled()` - Is sandbox active?
  - `I8.isAutoAllowBashIfSandboxedEnabled()` - Auto-allow Bash when sandboxed?
  - `I8.areUnsandboxedCommandsAllowed()` - Can run commands outside sandbox?
  - `I8.areSandboxSettingsLockedByPolicy()` - Are settings managed by policy?
  - `I8.checkDependencies()` - Are required dependencies installed?
- **Platform Support**:
  - Checks `I8.isSupportedPlatform()` - Platform compatibility
  - Checks `I8.isPlatformInEnabledList()` - Platform in allowlist
  - Hidden if platform not supported or not in enabled list
- **Interactive Configuration**: Description includes "(⏎ to configure)" hint for user action

### Validation & Safety

- **No Input Validation**: Takes raw string argument (likely for exclude patterns)
- **Platform Restrictions**: Tool hidden on unsupported platforms
- **Policy Management**: Settings can be locked by organizational policy
- **Dependency Checking**: Validates required sandbox dependencies are installed
- **Safety Modes**:
  - Sandboxed execution (isolated environment)
  - Auto-allow mode (automatic approval when sandboxed)
  - Fallback mode (can run unsandboxed commands)
  - Managed mode (policy-controlled)

### Output

**Status Display Format**:
```
{icon} {status-description} (⏎ to configure)
```

**Examples**:
- `⚠️ sandbox disabled (⏎ to configure)` - Dependencies missing
- `✓ sandbox enabled (auto-allow), fallback allowed (⏎ to configure)` - Full features
- `✓ sandbox enabled (managed) (⏎ to configure)` - Policy-controlled
- `○ sandbox disabled (⏎ to configure)` - Not active

### Concurrency & Classification

- **Tool Type**: local-jsx
- **Always Enabled**: isEnabled: () => true
- **Conditionally Hidden**: Hidden if platform unsupported or not in enabled list
- **Immediate Execution**: immediate: true (executes without confirmation)
- **User Facing Name**: "sandbox"

---

## Browser & Computer Use Tools

These tools are available when Claude Code is running in computer use / browser mode. They enable full browser automation including DOM interaction, mouse/keyboard control, screenshot capture, tab management, and debugging capabilities.

---

### javascript_tool

**Purpose**: Execute JavaScript code in the context of the current page

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | Yes | Must be set to 'javascript_exec' |
| text | string | Yes | The JavaScript code to execute. The code will be evaluated in the page context. The result of the last expression will be returned automatically. Do NOT use 'return' statements - just write the expression you want to evaluate (e.g., 'window.myData.value' not 'return window.myData.value'). You can access and modify the DOM, call page functions, and interact with page variables. |
| tabId | number | Yes | Tab ID to execute the code in. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |

**Features**:
- Executes JavaScript in the page's context with access to DOM, window object, and page variables
- Returns the result of the last expression or any thrown errors
- No need for explicit return statements - expressions are auto-evaluated
- Can interact with and modify page state

---

### read_page

**Purpose**: Get an accessibility tree representation of elements on the page

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| tabId | number | Yes | Tab ID to read from. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |
| filter | string | No | Filter elements: "interactive" for buttons/links/inputs only, "all" for all elements including non-visible ones (default: all elements) |
| depth | number | No | Maximum depth of the tree to traverse (default: 15). Use a smaller depth if output is too large. |
| ref_id | string | No | Reference ID of a parent element to read. Will return the specified element and all its children. Use this to focus on a specific part of the page when output is too large. |
| max_chars | number | No | Maximum characters for output (default: 50000). Set to a higher value if your client can handle large outputs. |

**Features**:
- Returns accessibility tree with element references for use in other tools
- By default includes all elements (visible and non-visible)
- Can filter to only interactive elements (buttons, links, inputs)
- Output limited to 50000 characters by default
- Can focus on specific element subtrees using ref_id
- Adjustable tree depth to control output size

---

### find

**Purpose**: Find elements on the page using natural language queries

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Natural language description of what to find (e.g., "search bar", "add to cart button", "product title containing organic") |
| tabId | number | Yes | Tab ID to search in. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |

**Features**:
- Searches for elements by purpose (e.g., "search bar", "login button")
- Searches for elements by text content (e.g., "organic mango product")
- Returns up to 20 matching elements with references
- Returns notification if more than 20 matches exist, suggesting more specific query
- Element references can be used with other tools (form_input, computer, etc.)

---

### form_input

**Purpose**: Set values in form elements using element reference ID

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ref | string | Yes | Element reference ID from the read_page tool (e.g., "ref_1", "ref_2") |
| value | string, boolean, or number | Yes | The value to set. For checkboxes use boolean, for selects use option value or text, for other inputs use appropriate string/number |
| tabId | number | Yes | Tab ID to set form value in. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |

**Features**:
- Sets values in form inputs using element references from read_page or find
- Supports different value types for different input types
- Checkbox support with boolean values
- Select/dropdown support with option values or text
- Text input support with strings or numbers

---

### computer

**Purpose**: Use mouse and keyboard to interact with the browser and take screenshots

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | Yes | The action to perform: `left_click`, `right_click`, `double_click`, `triple_click`, `type`, `screenshot`, `wait`, `scroll`, `key`, `left_click_drag`, `zoom`, `scroll_to`, `hover` |
| tabId | number | Yes | Tab ID to execute the action on. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |
| coordinate | array[number, number] | Conditional | (x, y): The x (pixels from the left edge) and y (pixels from the top edge) coordinates. Required for `left_click`, `right_click`, `double_click`, `triple_click`, and `scroll`. For `left_click_drag`, this is the end position. |
| text | string | Conditional | The text to type (for `type` action) or the key(s) to press (for `key` action). For `key` action: Provide space-separated keys (e.g., "Backspace Backspace Delete"). Supports keyboard shortcuts using the platform's modifier key (use "cmd" on Mac, "ctrl" on Windows/Linux, e.g., "cmd+a" or "ctrl+a" for select all). |
| duration | number | Conditional | The number of seconds to wait. Required for `wait`. Maximum 30 seconds. (min: 0, max: 30) |
| scroll_direction | string | Conditional | The direction to scroll: "up", "down", "left", "right". Required for `scroll`. |
| scroll_amount | number | No | The number of scroll wheel ticks. Optional for `scroll`, defaults to 3. (min: 1, max: 10) |
| start_coordinate | array[number, number] | Conditional | (x, y): The starting coordinates for `left_click_drag`. |
| region | array[number, number, number, number] | Conditional | (x0, y0, x1, y1): The rectangular region to capture for `zoom`. Coordinates define a rectangle from top-left (x0, y0) to bottom-right (x1, y1) in pixels from the viewport origin. Required for `zoom` action. Useful for inspecting small UI elements like icons, buttons, or text. |
| repeat | number | No | Number of times to repeat the key sequence. Only applicable for `key` action. Must be a positive integer between 1 and 100. Default is 1. Useful for navigation tasks like pressing arrow keys multiple times. (min: 1, max: 100) |
| ref | string | No | Element reference ID from read_page or find tools (e.g., "ref_1", "ref_2"). Required for `scroll_to` action. Can be used as alternative to `coordinate` for click actions. |
| modifiers | string | No | Modifier keys for click actions. Supports: "ctrl", "shift", "alt", "cmd" (or "meta"), "win" (or "windows"). Can be combined with "+" (e.g., "ctrl+shift", "cmd+alt"). Optional. |

**Features**:
- **Clicking**: left_click, right_click (context menus), double_click, triple_click
- **Typing**: type action for text input, key action for specific keys and shortcuts
- **Screenshots**: screenshot action captures the viewport, zoom action captures specific regions
- **Waiting**: wait action pauses execution (max 30 seconds)
- **Scrolling**: scroll action with directional control and adjustable amount, scroll_to scrolls element into view
- **Dragging**: left_click_drag for drag operations from start to end coordinates
- **Hovering**: hover action reveals tooltips, dropdowns, or hover states
- **Modifier keys**: Support for ctrl, shift, alt, cmd/meta, windows keys
- **Element references**: Can use ref instead of coordinates for click and scroll_to actions
- **Key repetition**: Repeat key sequences up to 100 times for navigation
- **Platform-aware shortcuts**: Automatically uses correct modifier keys per platform

**Important Notes**:
- Always consult a screenshot to determine coordinates before clicking on elements like icons
- If a click fails to load, try adjusting the click location so the cursor tip falls on the element
- Click buttons, links, and icons with the cursor tip in the center of the element
- Don't click boxes on their edges unless asked

---

### navigate

**Purpose**: Navigate to a URL, or go forward/back in browser history

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| url | string | Yes | The URL to navigate to. Can be provided with or without protocol (defaults to https://). Use "forward" to go forward in history or "back" to go back in history. |
| tabId | number | Yes | Tab ID to navigate. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |

**Features**:
- Navigate to any URL (protocol optional, defaults to https://)
- Browser history navigation with "forward" and "back" commands
- Works within the current tab group

---

### resize_window

**Purpose**: Resize the current browser window to specified dimensions

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| width | number | Yes | Target window width in pixels |
| height | number | Yes | Target window height in pixels |
| tabId | number | Yes | Tab ID to get the window for. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |

**Features**:
- Resize browser window to exact pixel dimensions
- Useful for testing responsive designs
- Useful for setting up specific screen sizes for testing

---

### gif_creator

**Purpose**: Manage GIF recording and export for browser automation sessions

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | Yes | Action to perform: 'start_recording' (begin capturing), 'stop_recording' (stop capturing but keep frames), 'export' (generate and export GIF), 'clear' (discard frames) |
| tabId | number | Yes | Tab ID to identify which tab group this operation applies to |
| download | boolean | Conditional | Always set this to true for the 'export' action only. This causes the gif to be downloaded in the browser. |
| filename | string | No | Optional filename for exported GIF (default: 'recording-[timestamp].gif'). For 'export' action only. |
| options | object | No | Optional GIF enhancement options for 'export' action. See options properties below. |

**Options object properties**:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| showClickIndicators | boolean | true | Show orange circles at click locations |
| showDragPaths | boolean | true | Show red arrows for drag actions |
| showActionLabels | boolean | true | Show black labels describing actions |
| showProgressBar | boolean | true | Show orange progress bar at bottom |
| showWatermark | boolean | true | Show Claude logo watermark |
| quality | number | 10 | GIF compression quality, 1-30 (lower = better quality, slower encoding) |

**Features**:
- Record browser automation sessions as animated GIFs
- Control recording start/stop independently from export
- Visual overlays: click indicators, drag paths, action labels, progress bar, watermark
- Configurable quality settings (1-30 scale)
- Export with download or coordinate-based upload to page element
- All operations scoped to the tab's group
- Clear frames to discard and start fresh

**Workflow**:
1. Call with action='start_recording' to begin capture
2. Take a screenshot immediately after starting to capture initial state
3. Perform browser actions (clicks, scrolls, navigation)
4. Take a screenshot immediately before stopping to capture final state
5. Call with action='stop_recording' to finish capture
6. Call with action='export' and download=true to generate and download GIF
7. Or use action='clear' to discard frames

---

### upload_image

**Purpose**: Upload a previously captured screenshot or user-uploaded image to a file input or drag & drop target

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| imageId | string | Yes | ID of a previously captured screenshot (from the computer tool's screenshot action) or a user-uploaded image |
| tabId | number | Yes | Tab ID where the target element is located. This is where the image will be uploaded to. |
| ref | string | Conditional | Element reference ID from read_page or find tools (e.g., "ref_1", "ref_2"). Use this for file inputs (especially hidden ones) or specific elements. Provide either ref or coordinate, not both. |
| coordinate | array[number, number] | Conditional | Viewport coordinates [x, y] for drag & drop to a visible location. Use this for drag & drop targets like Google Docs. Provide either ref or coordinate, not both. |
| filename | string | No | Optional filename for the uploaded file (default: "image.png") |

**Features**:
- Upload screenshots captured from computer tool
- Upload user-uploaded images
- Two targeting approaches:
  - **ref**: For specific elements, especially hidden file inputs
  - **coordinate**: For drag & drop to visible locations (e.g., Google Docs)
- Custom filename support
- Provide either ref or coordinate, not both

---

### get_page_text

**Purpose**: Extract raw text content from the page, prioritizing article content

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| tabId | number | Yes | Tab ID to extract text from. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |

**Features**:
- Extracts plain text without HTML formatting
- Prioritizes article content for better readability
- Ideal for reading articles, blog posts, or other text-heavy pages
- Returns raw text suitable for analysis or processing

---

### tabs_context_mcp

**Purpose**: Get context information about the current MCP tab group

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| createIfEmpty | boolean | No | Creates a new MCP tab group if none exists, creates a new Window with a new tab group containing an empty tab (which can be used for this conversation). If a MCP tab group already exists, this parameter has no effect. |

**Features**:
- Returns all tab IDs inside the current MCP tab group
- **CRITICAL**: Must be called at least once before using other browser automation tools to know what tabs exist
- Can optionally create a new tab group if none exists
- Each new conversation should create its own new tab (using tabs_create_mcp) rather than reusing existing tabs, unless the user explicitly asks to use an existing tab

---

### tabs_create_mcp

**Purpose**: Creates a new empty tab in the MCP tab group

**Parameters**: None (empty schema)

**Features**:
- Creates a new empty tab in the MCP tab group
- **CRITICAL**: Must get context using tabs_context_mcp at least once before using other browser automation tools
- Returns the new tab ID for use in subsequent operations

---

### update_plan

**Purpose**: Present a plan to the user for approval before taking actions

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| domains | array[string] | Yes | List of domains you will visit (e.g., ['github.com', 'stackoverflow.com']). These domains will be approved for the session when the user accepts the plan. |
| approach | array[string] | Yes | High-level description of what you will do. Focus on outcomes and key actions, not implementation details. Be concise - aim for 3-7 items. |

**Features**:
- Present domains and approach to user before taking actions
- User sees intended domains and overall strategy
- Once approved, can proceed with actions on approved domains without additional prompts
- Approach should be outcome-focused and concise (3-7 items)
- No implementation details required in approach

---

### read_console_messages

**Purpose**: Read browser console messages for debugging and monitoring

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| tabId | number | Yes | Tab ID to read console messages from. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |
| onlyErrors | boolean | No | If true, only return error and exception messages. Default is false (return all message types). |
| clear | boolean | No | If true, clear the console messages after reading to avoid duplicates on subsequent calls. Default is false. |
| pattern | string | No | Regex pattern to filter console messages. Only messages matching this pattern will be returned (e.g., 'error|warning' to find errors and warnings, 'MyApp' to filter app-specific logs). You should always provide a pattern to avoid getting too many irrelevant messages. |
| limit | number | No | Maximum number of messages to return. Defaults to 100. Increase only if you need more results. |

**Features**:
- Read console.log, console.error, console.warn, etc. from browser
- Useful for debugging JavaScript errors and viewing application logs
- Returns console messages from current domain only
- Filter to only errors/exceptions with onlyErrors parameter
- Regex pattern filtering to find specific messages
- Clear messages after reading to avoid duplicates
- Configurable result limit (default: 100)
- **IMPORTANT**: Always provide a pattern to filter messages - without a pattern, you may get too many irrelevant messages

---

### read_network_requests

**Purpose**: Read HTTP network requests from a specific tab for debugging and monitoring

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| tabId | number | Yes | Tab ID to read network requests from. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |
| urlPattern | string | No | Optional URL pattern to filter requests. Only requests whose URL contains this string will be returned (e.g., '/api/' to filter API calls, 'example.com' to filter by domain). |
| clear | boolean | No | If true, clear the network requests after reading to avoid duplicates on subsequent calls. Default is false. |
| limit | number | No | Maximum number of requests to return. Defaults to 100. Increase only if you need more results. |

**Features**:
- Read all HTTP network requests (XHR, Fetch, documents, images, etc.)
- Useful for debugging API calls and monitoring network activity
- Returns all requests made by current page, including cross-origin
- Filter by URL pattern to find specific requests (e.g., API calls)
- Requests automatically cleared when page navigates to different domain
- Clear requests after reading to avoid duplicates
- Configurable result limit (default: 100)

---

### shortcuts_list

**Purpose**: List all available shortcuts and workflows

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| tabId | number | Yes | Tab ID to list shortcuts from. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |

**Features**:
- Returns all available shortcuts with their commands and descriptions
- Shows whether each item is a workflow
- Shortcuts and workflows are interchangeable terms
- Use shortcuts_execute to run a shortcut or workflow

---

### shortcuts_execute

**Purpose**: Execute a shortcut or workflow in a new sidepanel window

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| tabId | number | Yes | Tab ID to execute the shortcut on. Must be a tab in the current group. Use tabs_context_mcp first if you don't have a valid tab ID. |
| shortcutId | string | No | The ID of the shortcut to execute |
| command | string | No | The command name of the shortcut to execute (e.g., 'debug', 'summarize'). Do not include the leading slash. |

**Features**:
- Execute shortcuts or workflows by ID or command name
- Shortcuts and workflows are interchangeable terms
- Runs in a new sidepanel window using the current tab
- Starts execution and returns immediately (does not wait for completion)
- Use shortcuts_list first to see available shortcuts
- Command parameter should not include leading slash
