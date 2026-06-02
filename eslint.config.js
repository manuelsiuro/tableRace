import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "dist-server", "public", ".claude", "*.config.js", "*.config.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // Allow intentionally-unused params/vars when prefixed with `_`
      // (e.g. `step(_inputs)` before a system consumes them). Matches tsc's
      // noUnusedParameters convention.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // ARCHITECTURAL BOUNDARY: the simulation and the code it shares with the Node
  // host must stay render-free, DOM-free, and deterministic, so the SAME code
  // runs identically in the browser and on the server. This rule is what
  // guarantees the netcode seam — keep it green.
  {
    files: ["src/sim/**/*.ts", "src/shared/**/*.ts", "src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["three", "three/*", "pixi.js", "pixi.js/*"],
              message:
                "sim/shared/core must be render-free. Renderers (three/pixi) live in render/ and ui/, which consume Snapshot by value.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "sim/shared/core must be DOM-free so they run in Node too." },
        { name: "document", message: "sim/shared/core must be DOM-free so they run in Node too." },
        { name: "navigator", message: "sim/shared/core must be DOM-free so they run in Node too." },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "Determinism: use a seeded Rng (shared/math createRng) instead of Math.random().",
        },
        {
          object: "Date",
          property: "now",
          message: "Determinism: pass time in via the sim step; do not read Date.now() inside sim/shared/core.",
        },
      ],
    },
  },
  // shared/core are PURE — they may not even depend on the physics engine
  // (that is sim-only). Keeps the wire contract + primitives engine-agnostic.
  {
    files: ["src/shared/**/*.ts", "src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["three", "three/*", "pixi.js", "pixi.js/*", "@dimforge/*"],
              message: "shared/core must be engine-agnostic (no three/pixi/rapier). Rapier is allowed only in sim/.",
            },
          ],
        },
      ],
    },
  },
);
