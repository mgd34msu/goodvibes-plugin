# Quick Start: mcp-cli-wrapper

Use `--json-file` to avoid heredoc escaping issues with complex JSON.

## Basic Usage

```bash
# 1. Create a JSON file
cat > my-query.json <<'EOF'
{
  "queries": [
    {
      "id": "find-files",
      "type": "glob",
      "patterns": ["src/**/*.ts"]
    }
  ],
  "output_mode": "files_only"
}
