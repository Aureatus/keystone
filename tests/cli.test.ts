import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDirs: string[] = [];

const createTempWorkspace = (): string => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "keystone-cli-test-"));
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("cli", () => {
  test("topology resolve prints validated JSON", () => {
    const workspaceRoot = createTempWorkspace();
    const manifestPath = path.join(workspaceRoot, "env.manifest.ts");

    writeFileSync(
      manifestPath,
      `export default {
        name: "cli-test",
        experimental: { serviceTopology: true },
        services: {
          api: {
            protocol: "http",
            runtime: "local-process",
            exposure: "portless",
            preferredPort: 4312,
            hostEnv: "API_HOST",
            portEnv: "API_PORT",
            publicUrlEnv: "API_PUBLIC_URL"
          }
        }
      };
      `,
      "utf8"
    );

    const result = Bun.spawnSync(
      [
        "bun",
        "src/cli.ts",
        "topology",
        "resolve",
        "--manifest",
        manifestPath,
        "--json",
      ],
      {
        cwd: "/home/aureatus/dev/projects/keystone",
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      }
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout.toString()) as {
      services: Record<string, { publicUrl?: string; env: Record<string, string> }>;
      portlessAliases: Array<{ hostname: string }>;
    };

    expect(payload.services.api.publicUrl).toBe("http://api.cli-test.localhost:1355");
    expect(payload.services.api.env.API_PUBLIC_URL).toBe("http://api.cli-test.localhost:1355");
    expect(payload.portlessAliases[0]?.hostname).toBe("api.cli-test.localhost");
  });

  test("topology resolve writes JSON to an output file", () => {
    const workspaceRoot = createTempWorkspace();
    const manifestPath = path.join(workspaceRoot, "env.manifest.ts");
    const outputPath = path.join(workspaceRoot, "topology.json");

    writeFileSync(
      manifestPath,
      `export default {
        name: "cli-output-test",
        experimental: { serviceTopology: true },
        services: {
          api: {
            protocol: "http",
            runtime: "local-process",
            exposure: "portless",
            preferredPort: 4312,
            publicUrlEnv: "API_PUBLIC_URL"
          }
        }
      };
      `,
      "utf8"
    );

    const result = Bun.spawnSync(
      [
        "bun",
        "src/cli.ts",
        "topology",
        "resolve",
        "--manifest",
        manifestPath,
        "--output",
        outputPath,
      ],
      {
        cwd: "/home/aureatus/dev/projects/keystone",
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(`Wrote ${outputPath}`);

    const written = readFileSync(outputPath, "utf8");
    expect(written.includes("\n  \"services\":")).toBe(false);

    const payload = JSON.parse(written) as {
      services: Record<string, { publicUrl?: string }>;
    };

    expect(payload.services.api.publicUrl).toBe("http://api.cli-output-test.localhost:1355");
  });

  test("topology resolve pretty-prints to an output file when requested", () => {
    const workspaceRoot = createTempWorkspace();
    const manifestPath = path.join(workspaceRoot, "env.manifest.ts");
    const outputPath = path.join(workspaceRoot, "topology.pretty.json");

    writeFileSync(
      manifestPath,
      `export default {
        name: "cli-pretty-test",
        experimental: { serviceTopology: true },
        services: {
          api: {
            protocol: "http",
            runtime: "local-process",
            exposure: "portless",
            preferredPort: 4312,
            publicUrlEnv: "API_PUBLIC_URL"
          }
        }
      };
      `,
      "utf8"
    );

    const result = Bun.spawnSync(
      [
        "bun",
        "src/cli.ts",
        "topology",
        "resolve",
        "--manifest",
        manifestPath,
        "--output",
        outputPath,
        "--pretty",
      ],
      {
        cwd: "/home/aureatus/dev/projects/keystone",
        stdout: "pipe",
        stderr: "pipe",
        env: process.env,
      }
    );

    expect(result.exitCode).toBe(0);

    const written = readFileSync(outputPath, "utf8");
    expect(written).toContain("\n  \"services\": {");
  });
});
