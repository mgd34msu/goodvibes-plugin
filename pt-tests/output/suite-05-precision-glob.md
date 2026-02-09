# Suite 05: precision_glob - E2E Test Results

**Date**: 2026-02-09
**Total Tests**: 15
**Passed**: 15
**Failed**: 0
**Partial**: 0

| # | Test Name | Status | Notes |
|---|-----------|--------|-------|
| 05.01 | Basic glob: find *.ts files | PASS | Found 10 TypeScript files |
| 05.02 | Recursive glob: **/*.ts | PASS | Found 10 TypeScript files recursively |
| 05.03 | Preset: typescript | PASS | Found 10 files with typescript preset |
| 05.04 | Preset: config | PASS | Found 3 config files |
| 05.05 | Output format: paths_only (default) | PASS | paths_only format returns 10 string paths |
| 05.06 | Output format: count_only | PASS | count_only returns count: 10 |
| 05.07 | Output format: with_stats | PASS | with_stats includes size and modified date for 3 files |
| 05.08 | Output format: with_preview | PASS | with_preview includes content preview for 2 files |
| 05.09 | Subdirectory pattern (G1 regression) | PASS | Subdirectory pattern works: 10 files (G1 bug fixed) |
| 05.10 | Exclude patterns | PASS | Exclude works: 6 files (no sample-* files) |
| 05.11 | Sort by name, size, modified | PASS | Sorting by name, size works correctly |
| 05.12 | Filter: min_size / max_size | PASS | Size filter works: 9 files in range 100-10000 bytes |
| 05.13 | Filter: has_content (regex) | PASS | has_content filter works: 3 files with "export class" |
| 05.14 | Filter: multiple filters combined | PASS | Combined filters work: 10 files (size>=200 + has "export") |
| 05.15 | Large glob with max_results limit | PASS | max_results limit works: 20 files (truncated: true) |

## Summary

✓ All tests passed!


## Test Details

### Passed Tests
- **05.01**: Basic glob: find *.ts files - Found 10 TypeScript files
- **05.02**: Recursive glob: **/*.ts - Found 10 TypeScript files recursively
- **05.03**: Preset: typescript - Found 10 files with typescript preset
- **05.04**: Preset: config - Found 3 config files
- **05.05**: Output format: paths_only (default) - paths_only format returns 10 string paths
- **05.06**: Output format: count_only - count_only returns count: 10
- **05.07**: Output format: with_stats - with_stats includes size and modified date for 3 files
- **05.08**: Output format: with_preview - with_preview includes content preview for 2 files
- **05.09**: Subdirectory pattern (G1 regression) - Subdirectory pattern works: 10 files (G1 bug fixed)
- **05.10**: Exclude patterns - Exclude works: 6 files (no sample-* files)
- **05.11**: Sort by name, size, modified - Sorting by name, size works correctly
- **05.12**: Filter: min_size / max_size - Size filter works: 9 files in range 100-10000 bytes
- **05.13**: Filter: has_content (regex) - has_content filter works: 3 files with "export class"
- **05.14**: Filter: multiple filters combined - Combined filters work: 10 files (size>=200 + has "export")
- **05.15**: Large glob with max_results limit - max_results limit works: 20 files (truncated: true)


