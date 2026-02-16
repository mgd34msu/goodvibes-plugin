#!/usr/bin/env bash
# Requires: bash 4+
set -euo pipefail

# Validation script for project onboarding completeness
# Checks: dependencies, env setup, database, tests, build

printf "%s\n" "-----------------------------------------------------------"
printf "[INFO] Starting project onboarding validation...\n"
printf "%s\n" "-----------------------------------------------------------"

# Track overall status
fail_count=0
warn_count=0

# Phase 1: Check Node.js version
printf "\n[Phase 1] Checking Node.js version...\n"
if command -v node >/dev/null 2>&1; then
    node_version=$(node --version)
    printf "[PASS] Node.js installed: %s\n" "$node_version"
else
    printf "[FAIL] Node.js not found. Install Node.js 18+ to continue.\n"
    fail_count=$((fail_count + 1))
fi

# Phase 2: Check package manager
printf "\n[Phase 2] Checking package manager...\n"
if [ -f "pnpm-lock.yaml" ]; then
    if command -v pnpm >/dev/null 2>&1; then
        printf "[PASS] pnpm detected and available\n"
    else
        printf "[WARN] pnpm-lock.yaml found but pnpm not installed. Install with: npm install -g pnpm\n"
        warn_count=$((warn_count + 1))
    fi
elif [ -f "yarn.lock" ]; then
    if command -v yarn >/dev/null 2>&1; then
        printf "[PASS] Yarn detected and available\n"
    else
        printf "[WARN] yarn.lock found but yarn not installed\n"
        warn_count=$((warn_count + 1))
    fi
elif [ -f "package-lock.json" ]; then
    printf "[PASS] npm detected (package-lock.json)\n"
else
    printf "[WARN] No lock file found. Run package manager install first.\n"
    warn_count=$((warn_count + 1))
fi

# Phase 3: Check dependencies installed
printf "\n[Phase 3] Checking dependencies...\n"
if [ -d "node_modules" ]; then
    # Count installed packages
    installed_count=$(find node_modules -maxdepth 1 -type d | wc -l)
    printf "[PASS] node_modules exists with %d packages\n" "$installed_count"
else
    printf "[FAIL] node_modules not found. Run: npm install (or pnpm install, yarn install)\n"
    fail_count=$((fail_count + 1))
fi

# Phase 4: Check environment variables
printf "\n[Phase 4] Checking environment configuration...\n"
if [ -f ".env.example" ]; then
    printf "[INFO] .env.example found\n"
    if [ -f ".env.local" ] || [ -f ".env" ]; then
        printf "[PASS] Environment file configured (.env.local or .env)\n"
    else
        printf "[WARN] .env.example exists but no .env.local or .env file. Copy .env.example to .env.local\n"
        warn_count=$((warn_count + 1))
    fi
else
    printf "[INFO] No .env.example found - may not be required\n"
fi

# Phase 5: Check database setup (Prisma)
printf "\n[Phase 5] Checking database setup...\n"
if [ -f "prisma/schema.prisma" ]; then
    printf "[INFO] Prisma schema found\n"
    if [ -d "prisma/migrations" ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
        migration_count=$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l)
        printf "[PASS] Prisma migrations exist (%d migrations)\n" "$migration_count"
    else
        printf "[WARN] Prisma schema exists but no migrations found. Run: npx prisma migrate dev\n"
        warn_count=$((warn_count + 1))
    fi
else
    printf "[INFO] No Prisma schema found - database may not be used\n"
fi

# Phase 6: Check TypeScript configuration
printf "\n[Phase 6] Checking TypeScript setup...\n"
if [ -f "tsconfig.json" ]; then
    printf "[PASS] tsconfig.json found\n"
    # Check if TypeScript is in dependencies
    if grep -q '"typescript"' -- package.json 2>/dev/null; then
        printf "[PASS] TypeScript in dependencies\n"
    else
        printf "[WARN] tsconfig.json exists but TypeScript not in package.json\n"
        warn_count=$((warn_count + 1))
    fi
else
    printf "[INFO] No tsconfig.json - project may use JavaScript\n"
fi

# Phase 7: Check linting configuration
printf "\n[Phase 7] Checking linting setup...\n"
if [ -f ".eslintrc.json" ] || [ -f ".eslintrc.js" ] || [ -f "eslint.config.js" ] || [ -f "eslint.config.mjs" ] || [ -f "eslint.config.cjs" ] || [ -f ".eslintrc.cjs" ]; then
    printf "[PASS] ESLint configuration found\n"
else
    printf "[INFO] No ESLint configuration found\n"
fi

if [ -f ".prettierrc" ] || [ -f ".prettierrc.json" ] || [ -f "prettier.config.js" ]; then
    printf "[PASS] Prettier configuration found\n"
else
    printf "[INFO] No Prettier configuration found\n"
fi

# Phase 8: Check test setup
printf "\n[Phase 8] Checking test configuration...\n"
if grep -q '"test"' -- package.json 2>/dev/null; then
    printf "[PASS] Test script found in package.json\n"
    # Check for test files
    test_files=$(find . -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.test.js" -o -name "*.spec.ts" \) -not -path "*/node_modules/*" 2>/dev/null | wc -l)
    if [ "$test_files" -gt 0 ]; then
        printf "[PASS] %d test files found\n" "$test_files"
    else
        printf "[WARN] Test script exists but no test files found\n"
        warn_count=$((warn_count + 1))
    fi
else
    printf "[INFO] No test script in package.json\n"
fi

# Phase 9: Verify build script
printf "\n[Phase 9] Checking build configuration...\n"
if grep -q '"build"' -- package.json 2>/dev/null; then
    printf "[PASS] Build script found in package.json\n"
else
    printf "[WARN] No build script in package.json\n"
    warn_count=$((warn_count + 1))
fi

# Phase 10: Check for documentation
printf "\n[Phase 10] Checking documentation...\n"
if [ -f "README.md" ]; then
    printf "[PASS] README.md found\n"
else
    printf "[WARN] No README.md found - consider creating one\n"
    warn_count=$((warn_count + 1))
fi

if [ -f ".claude/CLAUDE.md" ]; then
    printf "[PASS] .claude/CLAUDE.md found (AI context file)\n"
else
    printf "[INFO] No .claude/CLAUDE.md - consider creating one for AI assistants\n"
fi

if [ -f "CONTRIBUTING.md" ]; then
    printf "[PASS] CONTRIBUTING.md found\n"
else
    printf "[INFO] No CONTRIBUTING.md found\n"
fi

# Summary
printf "\n%s\n" "-----------------------------------------------------------"
printf "[SUMMARY] Validation complete\n"
printf "%s\n" "-----------------------------------------------------------"

if [ "$fail_count" -eq 0 ] && [ "$warn_count" -eq 0 ]; then
    printf "[PASS] All checks passed! Project onboarding is complete.\n"
    exit 0
elif [ "$fail_count" -eq 0 ]; then
    printf "[WARN] %d warnings found. Review warnings above.\n" "$warn_count"
    exit 0
else
    printf "[FAIL] %d critical issues, %d warnings. Fix failures before continuing.\n" "$fail_count" "$warn_count"
    exit 1
fi
