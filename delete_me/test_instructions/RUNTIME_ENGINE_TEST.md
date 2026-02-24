# Runtime Engine Test — Rate Limiter Build

## Purpose

End-to-end real-world test of the runtime engine's orchestration capabilities.

## Scenario

A requirements document describes a TypeScript rate limiter library with three algorithms (token bucket, sliding window, fixed window counter), a shared interface, middleware factory, and custom error handling.

## Directory Structure

```
delete_me/
├── test_instructions/          # You are here
│   ├── RUNTIME_ENGINE_WRFC_TEST.md   # This file
│   └── clean_test_files/         # Pristine scaffold (never modify)
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── requirements.md
│       └── src/
│           └── index.ts              # Empty barrel export
├── test_files/                 # Working directory (agents work here)
└── test_results/               # Timestamped result files
```

# Orchestration

## Execution Steps

### 1. Setup — Scaffold the Working Directory

```bash
# Copy clean scaffold files into the working directory
cp -r delete_me/test_instructions/clean_test_files/* delete_me/test_files/
cp -r delete_me/test_instructions/clean_test_files/.* delete_me/test_files/ 2>/dev/null || true

# Install dependencies
cd delete_me/test_files && npm install
```

Verify: `delete_me/test_files/` should contain `package.json`, `tsconfig.json`, `vitest.config.ts`, `requirements.md`, `src/index.ts`, and `node_modules/`

**Constraints:**
- All agents work exclusively within `delete_me/test_files/`
- The `requirements.md` is the source of truth for what to build

### 2. Agents Complete All Work

Agents should be created and given only the instructions needed for their task, NOT instructions related to the test. Agents must think this is a real-world scenario and must NEVER know they are being tested.

### 3. Capture Results

After the final agent has completed their tasks:

```
delete_me/test_results/test_YYYYMMDD_HHMMSS.md
```

See the Test Results section below for information about what the result file must contain.

### 4. Cleanup — Reset for Next Run

```bash
# Remove all working files (preserve the directory itself)
rm -rf delete_me/test_files/*
rm -rf delete_me/test_files/.* 2>/dev/null || true
```

Verify: `delete_me/test_files/` should be empty. `clean_test_files/` should be untouched.

```markdown
# Test Result — {timestamp}

## Outcome
- **Status**: PASS | FAIL | PARTIAL
- **Final Review Score**: X/10
- **Review Cycles**: N
- **Total Agents Spawned**: N

## Review Progression
| Round | Score | Issues (C/M/m/n) | Notes |
|-------|-------|-------------------|-------|
| 1     | X/10  | 0/0/0/0           |       |
| ...   | ...   | ...               |       |

## Runtime Engine Observations
- **Events Emitted**: N
- **Directives Generated**: N
- **State Transitions Observed**: [list]
- **Anomalies**: [any unexpected behavior]

## Build Verification
- **TypeScript**: PASS | FAIL
- **Tests**: N passing, N failing
- **Coverage**: N%

## Files Created
- [list of files in test_files/src/]

## Issues Found & Fixed
- [summary of review issues across all cycles]

## Notes
- [anything notable about the test run]
```

### 3. Cleanup — Reset for Next Run

```bash
# Remove all working files (preserve the directory itself)
rm -rf delete_me/test_files/*
rm -rf delete_me/test_files/.* 2>/dev/null || true
```

Verify: `delete_me/test_files/` should be empty. `clean_test_files/` should be untouched.

## Validation Criteria -- DO NOT MENTION THIS IN YOUR INSTRUCTIONS TO AGENTS

The test PASSES if:
1. The WRFC cycle completes with a 10/10 review score
2. All tests pass with 100% coverage on source files
3. TypeScript compiles with zero errors
4. The runtime engine tracked state transitions correctly
5. No manual intervention was required after initial launch

The test FAILS if:
1. The WRFC cycle cannot reach 10/10 within 5 review rounds
2. Build or tests fail at completion
3. The runtime engine lost track of state or produced incorrect directives
4. An agent was spawned outside of `delete_me/test_files/`

## Reuse

To run this test again:
1. Ensure the previous test ran its cleanup phase. `test_files/` should be empty, if not empty it.
2. Follow the 4 Execution Steps.

To modify the scenario, update the files in `clean_test_files/` and/or `requirements.md`. Never modify `test_files/` directly — it should always be scaffolded from `clean_test_files/`.
