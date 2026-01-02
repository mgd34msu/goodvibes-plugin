---
description: Search for agents, skills, or tools in the GoodVibes plugin
argument-hint: [skills|agents|tools] <query>
---

# Search Plugin Resources

Search across agents, skills, and tools to find relevant capabilities.

## Usage

```
/search <query>              # Search all resources
/search skills <query>       # Search only skills
/search agents <query>       # Search only agents
/search tools <query>        # Search only tools
```

## Instructions

Parse the user's search query from $ARGUMENTS.

If the first word is "skills", "agents", or "tools", search only that category.
Otherwise, search all categories.

Use the MCP tools:
- `search_skills` for skill search
- `search_agents` for agent search
- `search_tools` for tool search

Present results in a clear table format showing:
- Name
- Path
- Description
- Relevance score

If no results found, suggest alternative search terms.

## Arguments

$ARGUMENTS
