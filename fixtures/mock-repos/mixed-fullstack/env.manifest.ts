import { defineManifest } from "@aureatus/keystone";

export default defineManifest({
  name: "mixed-fullstack",
  experimental: {
    serviceMap: true,
  },
  portless: {
    rootName: "mixed-fullstack",
    proxyPort: 1355,
  },
  services: {
    web: {
      protocol: "http",
      runtime: "local-process",
      exposure: "portless",
      preferredPort: 4313,
      publicUrlEnv: "WEB_PUBLIC_URL",
      bindings: [
        { env: "PUBLIC_API_URL", service: "api", from: "publicUrl" },
        { env: "PUBLIC_DOCS_URL", service: "docs", from: "publicUrl" },
      ],
    },
    api: {
      protocol: "http",
      runtime: "docker-published",
      exposure: "portless",
      connectPort: 8080,
      hostEnv: "API_HOST",
      portEnv: "API_PORT",
      publicUrlEnv: "API_PUBLIC_URL",
      bindings: [{ env: "DATABASE_URL", service: "postgres", from: "internalUrl" }],
    },
    postgres: {
      protocol: "postgres",
      runtime: "docker-network",
      serviceName: "postgres",
      connectPort: 5432,
      hostEnv: "PGHOST",
      portEnv: "PGPORT",
      urlEnv: "POSTGRES_INTERNAL_URL",
    },
    docs: {
      protocol: "http",
      runtime: "docker-published",
      exposure: "direct",
      connectPort: 4173,
      publicUrlEnv: "DOCS_PUBLIC_URL",
    },
  },
});
