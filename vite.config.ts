import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { port: 5173, open: true },
  build: { target: "es2022", sourcemap: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.{test,spec}.ts", "server/**/*.{test,spec}.ts"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
