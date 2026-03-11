import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: "dist",
    target: "es2022",
    platform: "node",
    splitting: false,
  },
  {
    entry: {
      cli: "src/cli.ts",
    },
    format: ["esm"],
    sourcemap: true,
    clean: false,
    outDir: "dist",
    target: "es2022",
    platform: "node",
    splitting: false,
  },
]);
