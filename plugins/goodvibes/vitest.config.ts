import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Only include core module tests - hooks and tools have their own vitest configs
    include: ["src/core/__tests__/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/hooks/**",
      "**/tools/**",
      "**/.claude/worktrees/**",
      "**/delete_me/**",
    ],
  },
});
