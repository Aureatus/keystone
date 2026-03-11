import { defineManifest } from "@aureatus/keystone";

export default defineManifest({
  name: "portless-web-api",
  experimental: {
    serviceMap: true,
  },
  portless: {
    rootName: "portless-web-api",
    proxyPort: 1355,
  },
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
    web: {
      protocol: "http",
      runtime: "local-process",
      exposure: "portless",
      preferredPort: 4313,
      bindings: [
        { env: "PUBLIC_API_URL", service: "api", from: "publicUrl" },
      ],
      publicUrlEnv: "WEB_PUBLIC_URL",
    },
  },
});
