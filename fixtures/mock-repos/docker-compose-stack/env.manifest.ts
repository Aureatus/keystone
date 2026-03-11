import { defineManifest } from "@aureatus/keystone";

export default defineManifest({
  name: "docker-compose-stack",
  experimental: {
    serviceMap: true,
  },
  services: {
    api: {
      protocol: "http",
      runtime: "docker-published",
      connectPort: 8080,
      hostEnv: "API_HOST",
      portEnv: "API_PORT",
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
    worker: {
      protocol: "tcp",
      runtime: "docker-network",
      serviceName: "worker",
      connectPort: 9000,
      hostEnv: "WORKER_HOST",
      portEnv: "WORKER_PORT",
      bindings: [
        { env: "DATABASE_URL_FROM_BINDING", service: "postgres", from: "internalUrl" },
      ],
    },
  },
});
