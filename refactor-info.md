# Registry Engine Decomposition

We took a small but real MCP server engine that had grown organically into a flat file structure — about 10 source files sitting at the same level, each mixing different concerns together. Configuration lived next to business logic, utility functions were duplicated across files, and the MCP protocol layer was tangled into domain operations.

The work had three phases:

## Analysis & Inventory

We went through every single element in the codebase — every function, type, constant, and variable — and classified what it actually *does* rather than where it happened to live. We cataloged about 75 distinct elements total. We identified three monolithic functions that were doing too many things at once, duplicate code that existed in multiple places, naming inconsistencies, and blocking I/O calls that should have been async.

## Architecture Design

We sorted all 75 elements into a strict 4-layer hierarchy:

- **Layer 0 (Shared)**: Pure infrastructure with zero domain knowledge — configuration resolution, logging, response formatting, utility functions, constants. Things any engine would need.
- **Layer 1 (Core)**: Single-concern domain functions. Each function does exactly one thing — load a registry, run a search query, parse a file's metadata, classify content, resolve a file path. No function at this layer combines multiple operations. They can do I/O, but they don't orchestrate.
- **Layer 2 (Extensions)**: Multi-concern orchestration. These functions compose multiple Layer 1 functions together to fulfill a complete use case — "search for skills" means loading a registry, building a search index, running a query, and formatting results. This is where the three monolithic functions got decomposed into smaller pieces.
- **Layer 3 (Plugins)**: Paper-thin protocol dispatchers. They receive an incoming request, validate the schema, call the right Layer 2 function, and return the response. Zero business logic — just routing.

Dependencies flow strictly downward. Layer 3 can call Layer 2, Layer 2 can call Layer 1, Layer 1 can call Layer 0. Never upward, never sideways within the same layer.

We also renamed 37 elements during this process — dropping inconsistent prefixes, replacing ambiguous names with domain-specific ones, and aligning naming conventions across all layers.

## Implementation & Review

We built all four layers in parallel, deleted the old flat files, fixed the inevitable type errors from the rewiring, ran a full code review (scored 8.8/10), fixed every finding from the review, and verified the whole thing compiles and builds cleanly. The final output is the same number of lines of code doing the same work, but organized so that each file has one clear reason to exist and one clear set of dependencies.

The engine went from 10 flat files to 26 files across 4 directories, but each file is smaller, more focused, and independently understandable. The key insight is that "more files" isn't complexity — tangled dependencies and mixed concerns are complexity. The new structure makes it obvious where any future change should go.
