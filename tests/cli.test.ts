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
  test("service-map resolve prints validated JSON", () => {
    const workspaceRoot = createTempWorkspace();
    const manifestPath = path.join(workspaceRoot, "env.manifest.ts");

    writeFileSync(
      manifestPath,
      `export default {
        name: "cli-test",
        experimental: { serviceMap: true },
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
        "service-map",
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

  test("service-map resolve writes JSON to an output file", () => {
    const workspaceRoot = createTempWorkspace();
    const manifestPath = path.join(workspaceRoot, "env.manifest.ts");
    const outputPath = path.join(workspaceRoot, "service-map.json");

    writeFileSync(
      manifestPath,
      `export default {
        name: "cli-output-test",
        experimental: { serviceMap: true },
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
        "service-map",
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

  test("service-map resolve pretty-prints to an output file when requested", () => {
    const workspaceRoot = createTempWorkspace();
    const manifestPath = path.join(workspaceRoot, "env.manifest.ts");
    const outputPath = path.join(workspaceRoot, "service-map.pretty.json");

    writeFileSync(
      manifestPath,
      `export default {
        name: "cli-pretty-test",
        experimental: { serviceMap: true },
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
        "service-map",
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

  test("service-map resolve accepts a structured context file", () => {
    const workspaceRoot = createTempWorkspace();
    const manifestPath = path.join(workspaceRoot, "env.manifest.ts");
    const contextPath = path.join(workspaceRoot, "service-map-context.json");

    writeFileSync(
      manifestPath,
      `export default {
        name: "cli-context-test",
        experimental: { serviceMap: true },
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

    writeFileSync(
      contextPath,
      JSON.stringify(
        {
          cellName: "cell-123",
          portless: {
            rootName: "cell-123",
            proxyPort: 1455,
          },
          services: {
            api: {
              preferredPort: 5512,
            },
          },
        },
        null,
        2
      ),
      "utf8"
    );

    const result = Bun.spawnSync(
      [
        "bun",
        "src/cli.ts",
        "service-map",
        "resolve",
        "--manifest",
        manifestPath,
        "--context",
        contextPath,
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
      services: Record<string, { connect: { port: number }; publicUrl?: string }>;
      portlessAliases: Array<{ hostname: string; port: number }>;
    };

    expect(payload.services.api.connect.port).toBe(5512);
    expect(payload.services.api.publicUrl).toBe("http://api.cell-123.localhost:1455");
    expect(payload.portlessAliases[0]).toEqual({
      service: "api",
      hostname: "api.cell-123.localhost",
      port: 5512,
    });
  });
});
