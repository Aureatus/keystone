import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseEnvFile } from "../src/env-files.ts";
import { runClear, runDoctor, runGenerate, runInit, runScanSecrets } from "../src/manifest.ts";

const tempDirs: string[] = [];

const createTempWorkspace = (): string => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "keystone-test-"));
  tempDirs.push(tempDir);
  return tempDir;
};

const writeManifest = (workspaceRoot: string, contents: string): string => {
  const manifestPath = path.join(workspaceRoot, "env.manifest.ts");
  writeFileSync(manifestPath, contents, "utf8");
  return manifestPath;
};

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("manifest workflows", () => {
  test("runInit copies template files and skips existing destinations", async () => {
    const workspaceRoot = createTempWorkspace();
    writeFileSync(path.join(workspaceRoot, ".env.example"), "TOKEN=\n", "utf8");

    const manifestPath = writeManifest(
      workspaceRoot,
      `export default {
        name: "init-test",
        initFiles: [{ templatePath: ".env.example", destinationPath: ".env" }],
      };
      `
    );

    const firstRun = await runInit(manifestPath, workspaceRoot);
    expect(firstRun.createdPaths).toEqual([".env"]);
    expect(readFileSync(path.join(workspaceRoot, ".env"), "utf8")).toBe("TOKEN=\n");

    const secondRun = await runInit(manifestPath, workspaceRoot);
    expect(secondRun.skippedPaths).toEqual([".env"]);
  });

  test("runDoctor and runGenerate apply aliases and defaults", async () => {
    const workspaceRoot = createTempWorkspace();
    mkdirSync(path.join(workspaceRoot, ".generated"), { recursive: true });
    writeFileSync(
      path.join(workspaceRoot, ".env"),
      ["OLD_API_URL=http://legacy.internal:8080", "SECRET_TOKEN=super-secret"].join("\n"),
      "utf8"
    );

    const manifestPath = writeManifest(
      workspaceRoot,
      `export default {
        name: "generate-test",
        sourceFiles: [".env"],
        variables: {
          API_URL: { aliases: ["OLD_API_URL"], required: true },
          SECRET_TOKEN: { required: true, secret: true },
          PORT: { defaultValue: "4500" },
          PUBLIC_API_URL: { defaultValue: (env) => env.API_URL },
        },
        build({ env }) {
          return {
            outputs: [
              { path: ".generated/server.env", env },
              { path: ".generated/client.env", includeKeys: ["PUBLIC_API_URL"], public: true },
            ],
          };
        },
        clearPaths: [".generated/server.env", ".generated/client.env"],
      };
      `
    );

    const doctorResult = await runDoctor(manifestPath, workspaceRoot);
    expect(doctorResult.errors).toEqual([]);
    expect(doctorResult.warnings).toContain("Using deprecated env alias OLD_API_URL for API_URL");

    const generateResult = await runGenerate(manifestPath, workspaceRoot);
    expect(generateResult.writtenPaths).toEqual([
      ".generated/server.env",
      ".generated/client.env",
    ]);

    const serverEnv = parseEnvFile(
      readFileSync(path.join(workspaceRoot, ".generated/server.env"), "utf8")
    );
    const clientEnv = parseEnvFile(
      readFileSync(path.join(workspaceRoot, ".generated/client.env"), "utf8")
    );

    expect(serverEnv.API_URL).toBe("http://legacy.internal:8080");
    expect(serverEnv.PORT).toBe("4500");
    expect(clientEnv).toEqual({ PUBLIC_API_URL: "http://legacy.internal:8080" });

    const clearResult = await runClear(manifestPath, workspaceRoot);
    expect(clearResult.removedPaths).toEqual([
      ".generated/server.env",
      ".generated/client.env",
    ]);
    expect(existsSync(path.join(workspaceRoot, ".generated/server.env"))).toBe(false);
  });

  test("runScanSecrets rejects secret values in templates and public outputs", async () => {
    const workspaceRoot = createTempWorkspace();
    mkdirSync(path.join(workspaceRoot, ".generated"), { recursive: true });
    writeFileSync(path.join(workspaceRoot, ".env.example"), "SECRET_TOKEN=filled\n", "utf8");
    writeFileSync(path.join(workspaceRoot, ".env"), "SECRET_TOKEN=real-secret\n", "utf8");

    const manifestPath = writeManifest(
      workspaceRoot,
      `export default {
        name: "secret-scan-test",
        sourceFiles: [".env"],
        initFiles: [{ templatePath: ".env.example", destinationPath: ".env.local" }],
        variables: {
          SECRET_TOKEN: { required: true, secret: true },
        },
        build({ env }) {
          return {
            outputs: [
              { path: ".generated/public.env", env, public: true },
            ],
          };
        },
      };
      `
    );

    const scanResult = await runScanSecrets(manifestPath, workspaceRoot);
    expect(scanResult.errors).toContain(
      "Secret key SECRET_TOKEN must be blank in template file .env.example"
    );
    expect(scanResult.errors).toContain(
      "Secret key SECRET_TOKEN is exposed in public output .generated/public.env"
    );
  });
});
