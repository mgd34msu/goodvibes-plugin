#!/bin/bash

# Fix all test files to use correct module paths
# This script updates test mocks to match the refactored code structure

echo "Fixing test imports to match refactored code structure..."

# Pattern 1: Fix telemetry.js -> telemetry/index.js
find src/__tests__ -name "*.test.ts" -type f -exec sed -i "s|'../telemetry\.js'|'../telemetry/index.js'|g" {} \;
find src/__tests__ -name "*.test.ts" -type f -exec sed -i "s|'../../telemetry\.js'|'../../telemetry/index.js'|g" {} \;

# Pattern 2: Fix state.js -> state/index.js
find src/__tests__ -name "*.test.ts" -type f -exec sed -i "s|'../state\.js'|'../state/index.js'|g" {} \;
find src/__tests__ -name "*.test.ts" -type f -exec sed -i "s|'../../state\.js'|'../../state/index.js'|g" {} \;

# Pattern 3: Fix notification.js -> shared/notification.js
find src/__tests__ -name "*.test.ts" -type f -exec sed -i "s|'../notification\.js'|'../shared/notification.js'|g" {} \;
find src/__tests__ -name "*.test.ts" -type f -exec sed -i "s|'../../notification\.js'|'../../shared/notification.js'|g" {} \;

# Pattern 4: Fix memory.js -> memory/index.js
find src/__tests__ -name "*.test.ts" -type f -exec sed -i "s|'../memory\.js'|'../memory/index.js'|g" {} \;
find src/__tests__ -name "*.test.ts" -type f -exec sed -i "s|'../../memory\.js'|'../../memory/index.js'|g" {} \;

# Pattern 5: Fix crash-recovery.js -> session-start/crash-recovery.js
find src/__tests__ -name "*.test.ts" -type f -exec sed -i "s|'../crash-recovery\.js'|'../session-start/crash-recovery.js'|g" {} \;

echo "Test import fixes complete!"
echo "Re-running tests to verify..."
