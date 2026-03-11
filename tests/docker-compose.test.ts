import { describe, expect, test } from "bun:test";

import { createServiceMapContextFromDockerCompose } from "../src/docker-compose.ts";
import type { ServiceMapManifest } from "../src/service-map.ts";

describe("docker compose helpers", () => {
  test("selects the published port matching the manifest service port", () => {
    const manifest: ServiceMapManifest = {
      name: "compose-port-match",
      experimental: { serviceMap: true },
      services: {
        api: {
          protocol: "http",
          runtime: "docker-published",
          connectPort: 8080,
        },
      },
    };

    const context = createServiceMapContextFromDockerCompose(manifest, {
      services: {
        api: {
          serviceName: "api",
          ports: [
            { containerPort: 3000, publishedPort: 13000, hostIp: "127.0.0.1" },
            { containerPort: 8080, publishedPort: 18080, hostIp: "127.0.0.1" },
          ],
        },
      },
    });

    expect(context.services?.api).toEqual({
      connectHost: "127.0.0.1",
      connectPort: 18080,
      bindPort: 18080,
    });
  });

  test("normalizes 0.0.0.0 to loopback for published services", () => {
    const manifest: ServiceMapManifest = {
      name: "compose-host-normalization",
      experimental: { serviceMap: true },
      services: {
        api: {
          protocol: "http",
          runtime: "docker-published",
          connectPort: 8080,
        },
      },
    };

    const context = createServiceMapContextFromDockerCompose(manifest, {
      services: {
        api: {
          serviceName: "api",
          ports: [{ containerPort: 8080, publishedPort: 18080, hostIp: "0.0.0.0" }],
        },
      },
    });

    expect(context.services?.api?.connectHost).toBe("127.0.0.1");
  });

  test("throws when a docker-published service has no published ports", () => {
    const manifest: ServiceMapManifest = {
      name: "compose-missing-port",
      experimental: { serviceMap: true },
      services: {
        api: {
          protocol: "http",
          runtime: "docker-published",
          connectPort: 8080,
        },
      },
    };

    expect(() =>
      createServiceMapContextFromDockerCompose(manifest, {
        services: {
          api: {
            serviceName: "api",
          },
        },
      })
    ).toThrow("Docker Compose service api does not expose a published port");
  });

  test("prefers explicit networkHost over serviceName for docker-network services", () => {
    const manifest: ServiceMapManifest = {
      name: "compose-network-host",
      experimental: { serviceMap: true },
      services: {
        postgres: {
          protocol: "postgres",
          runtime: "docker-network",
          connectPort: 5432,
        },
      },
    };

    const context = createServiceMapContextFromDockerCompose(manifest, {
      services: {
        postgres: {
          serviceName: "postgres",
          networkHost: "postgres-primary",
          ports: [{ containerPort: 5432, publishedPort: 15432 }],
        },
      },
    });

    expect(context.services?.postgres).toEqual({
      serviceName: "postgres-primary",
      connectHost: "postgres-primary",
      connectPort: 5432,
    });
  });
});
