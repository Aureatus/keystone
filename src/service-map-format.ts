import { formatUrl } from "portless";

import type { ServiceProtocol } from "./service-map.ts";

const DEFAULT_PORTS: Partial<Record<ServiceProtocol, number>> = {
  http: 80,
  https: 443,
  ws: 80,
  wss: 443,
  postgres: 5432,
  redis: 6379,
  mysql: 3306,
};

const withScheme = (scheme: string, host: string, port: number): string => {
  const defaultPort = DEFAULT_PORTS[scheme as ServiceProtocol];
  return defaultPort === port ? `${scheme}://${host}` : `${scheme}://${host}:${port}`;
};

const withRequiredPort = (scheme: string, host: string, port: number): string =>
  `${scheme}://${host}:${port}`;

export const supportsPortlessExposure = (protocol: ServiceProtocol): boolean =>
  protocol === "http" || protocol === "https" || protocol === "ws" || protocol === "wss";

export const buildInternalUrl = (
  protocol: ServiceProtocol,
  host: string,
  port: number
): string | undefined => {
  switch (protocol) {
    case "http":
      return withScheme("http", host, port);
    case "https":
      return withScheme("https", host, port);
    case "ws":
      return withScheme("ws", host, port);
    case "wss":
      return withScheme("wss", host, port);
    case "postgres":
      return withRequiredPort("postgres", host, port);
    case "redis":
      return withRequiredPort("redis", host, port);
    case "mysql":
      return withRequiredPort("mysql", host, port);
    case "tcp":
      return undefined;
    default:
      return undefined;
  }
};

export const buildPortlessUrl = (
  protocol: Extract<ServiceProtocol, "http" | "https" | "ws" | "wss">,
  hostname: string,
  proxyPort: number,
  tls: boolean
): string => {
  if (protocol === "http" || protocol === "https") {
    return formatUrl(hostname, proxyPort, tls || protocol === "https");
  }

  const httpUrl = formatUrl(hostname, proxyPort, tls || protocol === "wss");
  return httpUrl.replace(/^http/, "ws");
};
