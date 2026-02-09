# Suite 06: precision_grep - E2E Test Results

**Date**: 2026-02-09
**Total Tests**: 15
**Passed**: 15
**Failed**: 0
**Partial**: 0

| # | Test Name | Status | Notes |
|---|-----------|--------|-------|
| 06.01 | Basic pattern search: find "export" | PASS | Found "export" in 10 files |
| 06.02 | Case insensitive search | PASS | Case insensitive: found 10 files |
| 06.03 | Whole word matching | PASS | Whole word match: found 4 files |
| 06.04 | Glob filter: search only *.ts files | PASS | Glob filter works: 10 .ts files |
| 06.05 | Output format: count_only | PASS | count_only: 10 files, 57 matches |
| 06.06 | Output format: files_only | PASS | files_only: 3 files |
| 06.07 | Output format: locations (with line numbers) | PASS | locations: 3 files with line numbers |
| 06.08 | Output format: matches (with matched text) | PASS | matches: 3 files with text snippets |
| 06.09 | Output format: context (with before/after) | PASS | context: 3 files with context |
| 06.10 | Multiple queries in parallel (batch of 3) | PASS | Parallel batch: 3 queries, 16 total file matches |
| 06.11 | Regex pattern with groups: capture function names | PASS | Regex groups work: 8 files with function exports |
| 06.12 | Multiline search | PASS | Multiline: found 3 files |
| 06.13 | Exclude patterns | PASS | Exclude works: 6 files (no sample-* files) |
| 06.14 | max_results and max_per_item limits | PASS | Limits work: 5 files, max 2 per file |
| 06.15 | Complex batch: 5 queries, mixed formats, parallel | PASS | Complex batch: 5 parallel queries, 128 total matches |

## Summary

✓ All tests passed!


## Test Details

### Passed Tests
- **06.01**: Basic pattern search: find "export" - Found "export" in 10 files
- **06.02**: Case insensitive search - Case insensitive: found 10 files
- **06.03**: Whole word matching - Whole word match: found 4 files
- **06.04**: Glob filter: search only *.ts files - Glob filter works: 10 .ts files
- **06.05**: Output format: count_only - count_only: 10 files, 57 matches
- **06.06**: Output format: files_only - files_only: 3 files
- **06.07**: Output format: locations (with line numbers) - locations: 3 files with line numbers
- **06.08**: Output format: matches (with matched text) - matches: 3 files with text snippets
- **06.09**: Output format: context (with before/after) - context: 3 files with context
- **06.10**: Multiple queries in parallel (batch of 3) - Parallel batch: 3 queries, 16 total file matches
- **06.11**: Regex pattern with groups: capture function names - Regex groups work: 8 files with function exports
- **06.12**: Multiline search - Multiline: found 3 files
- **06.13**: Exclude patterns - Exclude works: 6 files (no sample-* files)
- **06.14**: max_results and max_per_item limits - Limits work: 5 files, max 2 per file
- **06.15**: Complex batch: 5 queries, mixed formats, parallel - Complex batch: 5 parallel queries, 128 total matches


