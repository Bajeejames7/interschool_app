import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // One database, so test files run one after another.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:test@localhost:55432/interschool_test",
      CREATOR_EMAIL: "abel@ambassadors.test",
      TOKEN_SECRET: "test-secret",
    },
  },
});
