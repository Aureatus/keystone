import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createServiceMapContextFromDockerCompose } from "../src/docker-compose.ts";
import { loadManifest, runResolveServiceMap } from "../src/manifest.ts";

const repoRoot = "/home/aureatus/dev/projects/keystone";
const fixtureRoot = path.join(repoRoot, "fixtures", "mock-repos");

describe("mock repos", () => {
  test("resolves the portless web/api fixture", async () => {
    const manifestPath = path.join(fixtureRoot, "portless-web-api", "env.manifest.ts");
    const serviceMap = await runResolveServiceMap(manifestPath, path.dirname(manifestPath));

    expect(serviceMap?.services.api.publicUrl).toBe("http://api.portless-web-api.localhost:1355");
    expect(serviceMap?.services.web.publicUrl).toBe("http://web.portless-web-api.localhost:1355");
    expect(serviceMap?.env.PUBLIC_API_URL).toBe("http://api.portless-web-api.localhost:1355");
  });

  test("builds service-map context from docker compose runtime data", async () => {
    const manifestPath = path.join(fixtureRoot, "docker-compose-stack", "env.manifest.ts");
    const manifest = await loadManifest(manifestPath);

    const context = createServiceMapContextFromDockerCompose(manifest, {
      projectName: "docker-compose-stack",
      services: {
        api: {
          serviceName: "api",
          ports: [{ containerPort: 8080, publishedPort: 18080, hostIp: "127.0.0.1" }],
        },
        postgres: {
          serviceName: "postgres",
          networkHost: "postgres",
          ports: [{ containerPort: 5432, publishedPort: 15432 }],
        },
        worker: {
          serviceName: "worker",
          networkHost: "worker",
          ports: [{ containerPort: 9000, publishedPort: 19000 }],
        },
      },
    });

    expect(context.services?.api).toEqual({
      connectHost: "127.0.0.1",
      connectPort: 18080,
      bindPort: 18080,
    });
    expect(context.services?.postgres).toEqual({
      serviceName: "postgres",
      connectHost: "postgres",
      connectPort: 5432,
    });

    const serviceMap = await runResolveServiceMap(manifestPath, path.dirname(manifestPath), { context });
    expect(serviceMap?.services.api.connect.port).toBe(18080);
    expect(serviceMap?.env.DATABASE_URL_FROM_BINDING).toBe("postgres://postgres:5432");
  });

  test("matches the checked-in docker compose service-map example", async () => {
    const manifestPath = path.join(fixtureRoot, "docker-compose-stack", "env.manifest.ts");
    const contextPath = path.join(fixtureRoot, "docker-compose-stack", "service-map.context.json");
    const expectedPath = path.join(fixtureRoot, "docker-compose-stack", "service-map.example.json");
    const context = JSON.parse(readFileSync(contextPath, "utf8")) as Parameters<typeof runResolveServiceMap>[2]["context"];

    const serviceMap = await runResolveServiceMap(manifestPath, path.dirname(manifestPath), { context });
    expect(serviceMap).toEqual(JSON.parse(readFileSync(expectedPath, "utf8")));
  });

  test("resolves the mixed fullstack fixture with portless and docker-published services", async () => {
    const manifestPath = path.join(fixtureRoot, "mixed-fullstack", "env.manifest.ts");
    const contextPath = path.join(fixtureRoot, "mixed-fullstack", "service-map.context.json");
    const expectedPath = path.join(fixtureRoot, "mixed-fullstack", "service-map.example.json");
    const context = JSON.parse(readFileSync(contextPath, "utf8")) as Parameters<typeof runResolveServiceMap>[2]["context"];

    const serviceMap = await runResolveServiceMap(manifestPath, path.dirname(manifestPath), { context });

    expect(serviceMap?.services.web.publicUrl).toBe("http://web.feature-auth.localhost:1455");
    expect(serviceMap?.services.api.publicUrl).toBe("http://api.feature-auth.localhost:1455");
    expect(serviceMap?.services.docs.publicUrl).toBe("http://127.0.0.1:14173");
    expect(serviceMap?.env.DATABASE_URL).toBe("postgres://postgres:5432");
    expect(serviceMap?.env.PUBLIC_API_URL).toBe("http://api.feature-auth.localhost:1455");
    expect(serviceMap).toEqual(JSON.parse(readFileSync(expectedPath, "utf8")));
  });
});
