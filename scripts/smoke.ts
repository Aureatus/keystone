import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseEnvFile } from "../src/env-files.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.join(repoRoot, "fixtures", "smoke-workspace");

const run = (cwd: string, args: string[]) => {
  const result = Bun.spawnSync(["bun", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();

  if (result.exitCode !== 0) {
    throw new Error(
      [`Command failed: bun ${args.join(" ")}`, stdout.trim(), stderr.trim()]
        .filter(Boolean)
        .join("\n")
    );
  }

  return { stdout, stderr };
};

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const main = (): void => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "keystone-smoke-"));
  const workspaceRoot = path.join(tempRoot, "smoke-workspace");

  try {
    cpSync(fixtureRoot, workspaceRoot, { recursive: true });

    writeFileSync(
      path.join(workspaceRoot, "package.json"),
      `${JSON.stringify(
        {
          name: "keystone-smoke-workspace",
          private: true,
          type: "module",
          dependencies: {
            "@aureatus/keystone": `file:${repoRoot}`,
          },
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    run(workspaceRoot, ["install"]);

    const initResult = run(workspaceRoot, [
      "x",
      "keystone",
      "init",
      "--manifest",
      "env.manifest.ts",
    ]);
    assert(initResult.stdout.includes("Created .env.base"), "init did not create .env.base");
    assert(existsSync(path.join(workspaceRoot, ".env.base")), "init did not write .env.base");

    const doctorResult = run(workspaceRoot, [
      "x",
      "keystone",
      "doctor",
      "--manifest",
      "env.manifest.ts",
    ]);
    assert(
      doctorResult.stdout.includes("Env manifest is healthy."),
      "doctor did not report a healthy manifest"
    );
    assert(
      doctorResult.stderr.includes("Using deprecated env alias OLD_API_URL for API_URL"),
      "doctor did not emit the alias warning"
    );

    const secretScanResult = run(workspaceRoot, [
      "x",
      "keystone",
      "scan-secrets",
      "--manifest",
      "env.manifest.ts",
    ]);
    assert(
      secretScanResult.stdout.includes("Secret scan passed."),
      "secret scan did not report success"
    );

    const generateResult = run(workspaceRoot, [
      "x",
      "keystone",
      "generate",
      "--manifest",
      "env.manifest.ts",
    ]);
    assert(
      generateResult.stdout.includes("Wrote .generated/server.env"),
      "generate did not report server output"
    );
    assert(
      generateResult.stdout.includes("Wrote .generated/client.env"),
      "generate did not report client output"
    );

    const serverEnv = parseEnvFile(
      readFileSync(path.join(workspaceRoot, ".generated", "server.env"), "utf8")
    );
    const clientEnv = parseEnvFile(
      readFileSync(path.join(workspaceRoot, ".generated", "client.env"), "utf8")
    );

    assert(serverEnv.API_URL === "http://legacy.internal:8080", "server API_URL mismatch");
    assert(serverEnv.ACCESS_TOKEN === "super-secret-token", "server ACCESS_TOKEN mismatch");
    assert(serverEnv.PORT === "4312", "server PORT layering mismatch");
    assert(serverEnv.APP_ORIGIN === "http://127.0.0.1:4312", "server APP_ORIGIN mismatch");
    assert(clientEnv.PUBLIC_APP_NAME === "smoke-app", "client PUBLIC_APP_NAME mismatch");
    assert(
      clientEnv.PUBLIC_API_URL === "http://legacy.internal:8080",
      "client PUBLIC_API_URL mismatch"
    );
    assert(clientEnv.ACCESS_TOKEN === undefined, "client output exposed ACCESS_TOKEN");

    run(workspaceRoot, ["x", "keystone", "clear", "--manifest", "env.manifest.ts"]);
    assert(
      !existsSync(path.join(workspaceRoot, ".generated", "server.env")),
      "clear did not remove server env"
    );
    assert(
      !existsSync(path.join(workspaceRoot, ".generated", "client.env")),
      "clear did not remove client env"
    );

    process.stdout.write("Smoke test passed.\n");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
};

main();
