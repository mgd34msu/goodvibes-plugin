# Release Notes: v1.0.28

**Release Date:** 2026-01-31

## Summary

This release introduces automatic base64 encoding for shell-unsafe content, a unified plugin management command, and version checking on session start.

---

## New Features

### Unified Plugin Command (`/goodvibes:plugin`)
- New subcommand-based plugin management
- `/goodvibes:plugin status` - Shows plugin health, registries, hooks, and version
- `/goodvibes:plugin update` - Runs OS-appropriate update script (PowerShell on Windows, bash on Linux/macOS)
- Replaces the old `/goodvibes:plugin-status` command

### Version Check on Session Start
- Automatically checks GitHub for latest release version on every session start
- Displays update notification if a newer version is available
- Shows the command to run: `/goodvibes:plugin update`
- Silent on network failures (assumes up-to-date)

### Auto Base64 Encoding in tool-update Hook
- Detects shell-unsafe content in precision tool calls (quotes, backticks, `${vars}`)
- Automatically encodes content to base64 variants (`content_base64`, `find_base64`, `replace_base64`, etc.)
- Transparent to the user - no manual encoding required
- Supports: `precision_write`, `precision_edit`, `precision_grep`, `precision_exec`, `discover`

---

## Changes Since v1.0.23

### v1.0.27
- Rebuild with updated version checker message

### v1.0.26
- Simplified version checker update message to use `/goodvibes:plugin update`
- Condensed codebase-review command description

### v1.0.25
- Added unified `/goodvibes:plugin` command with `update` and `status` subcommands
- Removed standalone `/goodvibes:plugin-status` command
- Added `.goodvibes/` to `.gitignore`

### v1.0.24
- Re-enabled and enhanced `tool-update.mjs` hook
- Added automatic base64 encoding for shell-unsafe precision tool content
- Improved hook functionality for transparent content encoding

---

## Upgrade Instructions

```bash
/goodvibes:plugin update
```

Then restart your Claude Code session.

---

## Breaking Changes

- `/goodvibes:plugin-status` has been removed. Use `/goodvibes:plugin status` instead.
