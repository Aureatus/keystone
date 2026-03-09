import { describe, expect, test } from "bun:test";

import { resolveServiceTopology } from "../src/topology.ts";

describe("service topology", () => {
  test("resolves local, portless, and docker-network services", async () => {
    const topology = await resolveServiceTopology(
      {
        name: "demo",
        experimental: { serviceTopology: true },
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

    expect(topology).toBeDefined();
    expect(topology?.services.api.connect.host).toBe("127.0.0.1");
    expect(topology?.services.api.connect.port).toBe(4312);
    expect(topology?.services.api.publicUrl).toBe("http://api.demo.localhost:1355");
    expect(topology?.services.postgres.connect.host).toBe("postgres");
    expect(topology?.services.postgres.internalUrl).toBe("postgres://postgres:5432");
    expect(topology?.env.PUBLIC_API_URL).toBe("http://api.demo.localhost:1355");
    expect(topology?.env.DATABASE_URL_FROM_BINDING).toBe("postgres://postgres:5432");
    expect(topology?.portlessAliases).toEqual([
      { service: "api", hostname: "api.demo.localhost", port: 4312 },
    ]);
  });

  test("fails when docker-network leaves host or port unresolved", async () => {
    await expect(
      resolveServiceTopology(
        {
          name: "broken",
          experimental: { serviceTopology: true },
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
    const topology = await resolveServiceTopology(
      {
        name: "override-demo",
        experimental: { serviceTopology: true },
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

    expect(topology?.services.api.connect).toEqual({ host: "api.internal", port: 4012 });
    expect(topology?.env.API_HOST).toBe("api.internal");
    expect(topology?.env.API_PORT).toBe("4012");
  });
});
