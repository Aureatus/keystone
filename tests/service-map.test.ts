import { describe, expect, test } from "bun:test";

import { renderServiceEnvFile, renderServiceMapEnvFile } from "../src/service-map-render.ts";
import { resolveServiceMap, SERVICE_MAP_SCHEMA_VERSION } from "../src/service-map.ts";

describe("service map", () => {
  test("resolves local, portless, and docker-network services", async () => {
    const serviceMap = await resolveServiceMap(
      {
        name: "demo",
        experimental: { serviceMap: true },
        portless: { rootName: "demo", proxyPort: 1355 },
        services: {
          api: {
            protocol: "http",
            runtime: "local-process",
            exposure: "portless",
            preferredPort: 4312,
            hostEnv: "API_HOST",
            portEnv: "API_PORT",
            urlEnv: "API_INTERNAL_URL",
            publicUrlEnv: "API_PUBLIC_URL",
          },
          postgres: {
            protocol: "postgres",
            runtime: "docker-network",
            serviceName: "postgres",
            connectPort: 5432,
            hostEnv: "PGHOST",
            portEnv: "PGPORT",
            urlEnv: "DATABASE_URL",
          },
          web: {
            protocol: "http",
            runtime: "local-process",
            exposure: "direct",
            preferredPort: 4313,
            bindings: [
              { env: "PUBLIC_API_URL", service: "api", from: "publicUrl" },
              { env: "DATABASE_URL_FROM_BINDING", service: "postgres", from: "internalUrl" },
            ],
          },
        },
      },
      {
        repoRoot: "/tmp/demo",
        env: {},
      }
    );

    expect(serviceMap).toBeDefined();
    expect(serviceMap?.schemaVersion).toBe(SERVICE_MAP_SCHEMA_VERSION);
    expect(serviceMap?.services.api.connect.host).toBe("127.0.0.1");
    expect(serviceMap?.services.api.connect.port).toBe(4312);
    expect(serviceMap?.services.api.publicUrl).toBe("http://api.demo.localhost:1355");
    expect(serviceMap?.services.postgres.connect.host).toBe("postgres");
    expect(serviceMap?.services.postgres.internalUrl).toBe("postgres://postgres:5432");
    expect(serviceMap?.env.PUBLIC_API_URL).toBe("http://api.demo.localhost:1355");
    expect(serviceMap?.env.DATABASE_URL_FROM_BINDING).toBe("postgres://postgres:5432");
    expect(serviceMap?.portlessAliases).toEqual([
      { service: "api", hostname: "api.demo.localhost", port: 4312 },
    ]);
  });

  test("fails when docker-network leaves host or port unresolved", async () => {
    await expect(
      resolveServiceMap(
        {
          name: "broken",
          experimental: { serviceMap: true },
          services: {
            postgres: {
              protocol: "postgres",
              runtime: "docker-network",
            },
          },
        },
        {
          repoRoot: "/tmp/broken",
          env: {},
        }
      )
    ).rejects.toThrow("docker-network services require connectHost or serviceName");
  });

  test("supports simple env overrides", async () => {
    const serviceMap = await resolveServiceMap(
      {
        name: "override-demo",
        experimental: { serviceMap: true },
        services: {
          api: {
            protocol: "http",
            runtime: "docker-published",
            connectPort: 3000,
            hostEnv: "API_HOST",
            portEnv: "API_PORT",
            overrideEnv: {
              connectHost: "API_CONNECT_HOST",
              connectPort: "API_CONNECT_PORT",
            },
          },
        },
      },
      {
        repoRoot: "/tmp/override-demo",
        env: {
          API_CONNECT_HOST: "api.internal",
          API_CONNECT_PORT: "4012",
        },
      }
    );

    expect(serviceMap?.services.api.connect).toEqual({ host: "api.internal", port: 4012 });
    expect(serviceMap?.env.API_HOST).toBe("api.internal");
    expect(serviceMap?.env.API_PORT).toBe("4012");
  });

  test("supports structured context overrides for service endpoints and portless names", async () => {
    const serviceMap = await resolveServiceMap(
      {
        name: "context-demo",
        experimental: { serviceMap: true },
        services: {
          api: {
            protocol: "http",
            runtime: "local-process",
            exposure: "portless",
            preferredPort: 4312,
            publicUrlEnv: "API_PUBLIC_URL",
          },
          postgres: {
            protocol: "postgres",
            runtime: "docker-network",
            serviceName: "postgres",
            connectPort: 5432,
            hostEnv: "PGHOST",
            portEnv: "PGPORT",
          },
        },
      },
      {
        repoRoot: "/tmp/context-demo",
        context: {
          cellName: "cell-123",
          portless: { rootName: "cell-123", proxyPort: 1455 },
          services: {
            api: {
              preferredPort: 5512,
              portlessAlias: "api.cell-123",
            },
            postgres: {
              connectHost: "postgres-service",
              connectPort: 6432,
            },
          },
        },
      }
    );

    expect(serviceMap?.services.api.connect.port).toBe(5512);
    expect(serviceMap?.services.api.publicUrl).toBe("http://api.cell-123.localhost:1455");
    expect(serviceMap?.services.postgres.connect).toEqual({ host: "postgres-service", port: 6432 });
    expect(serviceMap?.env.PGHOST).toBe("postgres-service");
    expect(serviceMap?.env.PGPORT).toBe("6432");
  });

  test("supports cyclic cross-service bindings without startup semantics", async () => {
    const serviceMap = await resolveServiceMap(
      {
        name: "cyclic-demo",
        experimental: { serviceMap: true },
        portless: { rootName: "cyclic-demo", proxyPort: 1355 },
        services: {
          web: {
            protocol: "http",
            runtime: "local-process",
            exposure: "portless",
            preferredPort: 4312,
            publicUrlEnv: "WEB_PUBLIC_URL",
            bindings: [{ env: "PUBLIC_API_URL", service: "api", from: "publicUrl" }],
          },
          api: {
            protocol: "http",
            runtime: "local-process",
            exposure: "portless",
            preferredPort: 4313,
            publicUrlEnv: "API_PUBLIC_URL",
            bindings: [{ env: "WEB_ORIGIN", service: "web", from: "publicUrl" }],
          },
        },
      },
      {
        repoRoot: "/tmp/cyclic-demo",
      }
    );

    expect(serviceMap?.services.web.publicUrl).toBe("http://web.cyclic-demo.localhost:1355");
    expect(serviceMap?.services.api.publicUrl).toBe("http://api.cyclic-demo.localhost:1355");
    expect(serviceMap?.services.web.env.PUBLIC_API_URL).toBe("http://api.cyclic-demo.localhost:1355");
    expect(serviceMap?.services.api.env.WEB_ORIGIN).toBe("http://web.cyclic-demo.localhost:1355");
    expect(serviceMap?.env.PUBLIC_API_URL).toBe("http://api.cyclic-demo.localhost:1355");
    expect(serviceMap?.env.WEB_ORIGIN).toBe("http://web.cyclic-demo.localhost:1355");
  });

  test("renders service-map and service env files from resolved service map", async () => {
    const serviceMap = await resolveServiceMap(
      {
        name: "render-demo",
        experimental: { serviceMap: true },
        services: {
          api: {
            protocol: "http",
            runtime: "local-process",
            exposure: "portless",
            preferredPort: 4312,
            hostEnv: "API_HOST",
            portEnv: "API_PORT",
            publicUrlEnv: "API_PUBLIC_URL",
          },
        },
      },
      {
        repoRoot: "/tmp/render-demo",
        context: {
          portless: { rootName: "render-demo" },
        },
      }
    );

    expect(serviceMap).toBeDefined();

    const serviceMapEnvFile = renderServiceMapEnvFile(serviceMap!, {
      header: ["# Generated service map env"],
    });
    const serviceEnvFile = renderServiceEnvFile(serviceMap!, "api");

    expect(serviceMapEnvFile).toContain("# Generated service map env");
    expect(serviceMapEnvFile).toContain('API_PUBLIC_URL="http://api.render-demo.localhost:1355"');
    expect(serviceEnvFile).toContain('API_HOST="127.0.0.1"');
    expect(serviceEnvFile).toContain('API_PORT="4312"');
  });
});
