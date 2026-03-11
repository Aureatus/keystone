import { parseHostname } from "portless";

import type { EnvMap } from "./env-files.ts";
import { findFreePort } from "./ports.ts";
import { buildInternalUrl, buildPortlessUrl, supportsPortlessExposure } from "./service-map-format.ts";

export type ServiceProtocol =
  | "http"
  | "https"
  | "ws"
  | "wss"
  | "postgres"
  | "redis"
  | "mysql"
  | "tcp";

export type ServiceRuntime = "local-process" | "docker-published" | "docker-network";

export type ServiceExposure = "direct" | "portless" | "none";

export type ServiceBindingSource =
  | "bind.host"
  | "bind.port"
  | "connect.host"
  | "connect.port"
  | "internalUrl"
  | "publicUrl";

export type ServiceBinding = {
  env: string;
  from: ServiceBindingSource;
  service: string;
  required?: boolean;
};

export type ServiceOverrideEnv = {
  bindHost?: string;
  bindPort?: string;
  connectHost?: string;
  connectPort?: string;
  publicUrl?: string;
};

export type ServiceDefinition = {
  protocol: ServiceProtocol;
  runtime: ServiceRuntime;
  exposure?: ServiceExposure;
  bindHost?: string;
  bindPort?: number;
  connectHost?: string;
  connectPort?: number;
  preferredPort?: number;
  serviceName?: string;
  portlessAlias?: string;
  publicBaseUrl?: string;
  hostEnv?: string;
  portEnv?: string;
  urlEnv?: string;
  publicUrlEnv?: string;
  bindings?: ServiceBinding[];
  enabled?: boolean;
  overrideEnv?: ServiceOverrideEnv;
};

export type PortlessConfig = {
  proxyPort?: number;
  https?: boolean;
  rootName?: string;
};

export type ServiceMapServiceContext = {
  enabled?: boolean;
  bindHost?: string;
  bindPort?: number;
  connectHost?: string;
  connectPort?: number;
  preferredPort?: number;
  publicUrl?: string;
  portlessAlias?: string;
  serviceName?: string;
};

export type ServiceMapContext = {
  projectName?: string;
  cellId?: string;
  cellName?: string;
  worktreePath?: string;
  portless?: PortlessConfig;
  services?: Record<string, ServiceMapServiceContext>;
};

export type ExperimentalFeatures = {
  serviceMap?: boolean;
};

export type PortlessAliasPlan = {
  service: string;
  hostname: string;
  port: number;
};

export const SERVICE_MAP_SCHEMA_VERSION = "0.1.0" as const;

export type ResolvedService = {
  name: string;
  protocol: ServiceProtocol;
  runtime: ServiceRuntime;
  exposure: ServiceExposure;
  bind?: {
    host: string;
    port: number;
  };
  connect: {
    host: string;
    port: number;
  };
  internalUrl?: string;
  publicUrl?: string;
  env: EnvMap;
};

export type ResolvedServiceMap = {
  schemaVersion: typeof SERVICE_MAP_SCHEMA_VERSION;
  services: Record<string, ResolvedService>;
  env: EnvMap;
  warnings: string[];
  portlessAliases: PortlessAliasPlan[];
};

export type ServiceMapManifest = {
  name: string;
  services?: Record<string, ServiceDefinition>;
  portless?: PortlessConfig;
  experimental?: ExperimentalFeatures;
};

export type ResolveServiceMapInput = {
  repoRoot: string;
  env?: EnvMap;
  context?: ServiceMapContext;
};

const DEFAULT_PORTLESS_PROXY_PORT = 1355;

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
};

const readOverride = (env: EnvMap, key: string | undefined): string | undefined => {
  if (!key) {
    return undefined;
  }

  const value = env[key]?.trim();
  return value ? value : undefined;
};

const readOverridePort = (env: EnvMap, key: string | undefined): number | undefined => {
  const value = readOverride(env, key);
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid port override for ${key}: ${value}`);
  }

  return parsed;
};

const resolvePortlessSettings = (manifest: ServiceMapManifest, input: ResolveServiceMapInput) => ({
  proxyPort:
    input.context?.portless?.proxyPort ??
    readOverridePort(input.env ?? {}, "PORTLESS_PORT") ??
    manifest.portless?.proxyPort ??
    DEFAULT_PORTLESS_PROXY_PORT,
  https:
    input.context?.portless?.https ??
    parseBoolean(input.env?.PORTLESS_HTTPS) ??
    manifest.portless?.https ??
    false,
  rootName: input.context?.portless?.rootName ?? manifest.portless?.rootName ?? manifest.name,
});

const normalizeExposure = (service: ServiceDefinition): ServiceExposure => service.exposure ?? "direct";

const makePortlessHostname = (
  manifest: ServiceMapManifest,
  serviceName: string,
  service: ServiceDefinition,
  input: ResolveServiceMapInput
): string => {
  const contextService = input.context?.services?.[serviceName];
  const override =
    contextService?.publicUrl ?? readOverride(input.env ?? {}, service.overrideEnv?.publicUrl);
  if (override) {
    const parsed = new URL(override);
    return parseHostname(parsed.hostname);
  }

  const rootName = resolvePortlessSettings(manifest, input).rootName;
  return parseHostname(contextService?.portlessAlias ?? service.portlessAlias ?? `${serviceName}.${rootName}`);
};

const buildSelfEnv = (service: ServiceDefinition, resolved: ResolvedService): EnvMap => {
  const env: EnvMap = {};

  if (service.hostEnv) {
    env[service.hostEnv] = resolved.connect.host;
  }

  if (service.portEnv) {
    env[service.portEnv] = String(resolved.connect.port);
  }

  if (service.urlEnv && resolved.internalUrl) {
    env[service.urlEnv] = resolved.internalUrl;
  }

  if (service.publicUrlEnv && resolved.publicUrl) {
    env[service.publicUrlEnv] = resolved.publicUrl;
  }

  return env;
};

const readBindingSource = (service: ResolvedService, source: ServiceBindingSource): string | undefined => {
  switch (source) {
    case "bind.host":
      return service.bind?.host;
    case "bind.port":
      return service.bind ? String(service.bind.port) : undefined;
    case "connect.host":
      return service.connect.host;
    case "connect.port":
      return String(service.connect.port);
    case "internalUrl":
      return service.internalUrl;
    case "publicUrl":
      return service.publicUrl;
    default:
      return undefined;
  }
};

const resolveLocalProcess = async (
  serviceName: string,
  service: ServiceDefinition,
  input: ResolveServiceMapInput,
  usedPorts: Set<number>
) => {
  const env = input.env ?? {};
  const contextService = input.context?.services?.[serviceName];
  const overrideBindHost = readOverride(env, service.overrideEnv?.bindHost);
  const overrideConnectHost = readOverride(env, service.overrideEnv?.connectHost);
  const overrideBindPort = readOverridePort(env, service.overrideEnv?.bindPort);
  const overrideConnectPort = readOverridePort(env, service.overrideEnv?.connectPort);

  const bindHost = contextService?.bindHost ?? overrideBindHost ?? service.bindHost ?? "127.0.0.1";
  const connectHost =
    contextService?.connectHost ?? overrideConnectHost ?? service.connectHost ?? bindHost ?? "127.0.0.1";
  const preferredPort =
    contextService?.bindPort ??
    contextService?.connectPort ??
    contextService?.preferredPort ??
    overrideBindPort ??
    overrideConnectPort ??
    service.bindPort ??
    service.connectPort ??
    service.preferredPort ??
    4000;
  const bindPort = await findFreePort(preferredPort, usedPorts);
  usedPorts.add(bindPort);

  return {
    bind: { host: bindHost, port: bindPort },
    connect: {
      host: connectHost,
      port: contextService?.connectPort ?? overrideConnectPort ?? service.connectPort ?? bindPort,
    },
  };
};

const resolveDockerPublished = (
  serviceName: string,
  service: ServiceDefinition,
  input: ResolveServiceMapInput
) => {
  const env = input.env ?? {};
  const contextService = input.context?.services?.[serviceName];
  const connectHost =
    contextService?.connectHost ??
    readOverride(env, service.overrideEnv?.connectHost) ??
    service.connectHost ??
    "127.0.0.1";
  const connectPort =
    contextService?.connectPort ??
    readOverridePort(env, service.overrideEnv?.connectPort) ??
    service.connectPort ??
    service.bindPort;

  if (!connectPort) {
    throw new Error("docker-published services require connectPort or bindPort");
  }

  return {
    connect: { host: connectHost, port: connectPort },
  };
};

const resolveDockerNetwork = (
  serviceName: string,
  service: ServiceDefinition,
  input: ResolveServiceMapInput
) => {
  const env = input.env ?? {};
  const contextService = input.context?.services?.[serviceName];
  const connectHost =
    contextService?.connectHost ??
    readOverride(env, service.overrideEnv?.connectHost) ??
    service.connectHost ??
    contextService?.serviceName ??
    service.serviceName;
  const connectPort =
    contextService?.connectPort ??
    readOverridePort(env, service.overrideEnv?.connectPort) ??
    service.connectPort;

  if (!connectHost) {
    throw new Error("docker-network services require connectHost or serviceName");
  }

  if (!connectPort) {
    throw new Error("docker-network services require connectPort");
  }

  return {
    connect: { host: connectHost, port: connectPort },
  };
};

export const resolveServiceMap = async (
  manifest: ServiceMapManifest,
  input: ResolveServiceMapInput
): Promise<ResolvedServiceMap | undefined> => {
  if (!manifest.experimental?.serviceMap || !manifest.services) {
    return undefined;
  }

  const env: EnvMap = {};
  const warnings: string[] = [];
  const usedPorts = new Set<number>();
  const services: Record<string, ResolvedService> = {};
  const portlessAliases: PortlessAliasPlan[] = [];
  const portlessSettings = resolvePortlessSettings(manifest, input);

  for (const [serviceName, service] of Object.entries(manifest.services)) {
    const contextService = input.context?.services?.[serviceName];
    if (contextService?.enabled === false || (contextService?.enabled === undefined && service.enabled === false)) {
      continue;
    }

    const exposure = normalizeExposure(service);
    if (exposure === "portless" && !supportsPortlessExposure(service.protocol)) {
      throw new Error(`Service ${serviceName} uses Portless exposure but protocol ${service.protocol} is unsupported`);
    }

    const endpoint =
      service.runtime === "local-process"
        ? await resolveLocalProcess(serviceName, service, input, usedPorts)
        : service.runtime === "docker-published"
          ? resolveDockerPublished(serviceName, service, input)
          : resolveDockerNetwork(serviceName, service, input);

    if (exposure === "portless" && service.runtime === "docker-network") {
      throw new Error(`Service ${serviceName} cannot use Portless exposure with docker-network runtime`);
    }

    const internalUrl = buildInternalUrl(
      service.protocol,
      endpoint.connect.host,
      endpoint.connect.port
    );

    let publicUrl =
      contextService?.publicUrl ?? readOverride(input.env ?? {}, service.overrideEnv?.publicUrl) ?? service.publicBaseUrl;
    if (!publicUrl && exposure === "portless") {
      const hostname = makePortlessHostname(manifest, serviceName, service, input);
      publicUrl = buildPortlessUrl(
        service.protocol as Extract<ServiceProtocol, "http" | "https" | "ws" | "wss">,
        hostname,
        portlessSettings.proxyPort,
        portlessSettings.https
      );
      portlessAliases.push({ service: serviceName, hostname, port: endpoint.connect.port });
    }

    if (!publicUrl && exposure === "direct") {
      publicUrl = internalUrl;
    }

    const resolved: ResolvedService = {
      name: serviceName,
      protocol: service.protocol,
      runtime: service.runtime,
      exposure,
      bind: ("bind" in endpoint ? endpoint.bind : undefined) as
        | { host: string; port: number }
        | undefined,
      connect: endpoint.connect,
      internalUrl,
      publicUrl,
      env: {},
    };

    resolved.env = buildSelfEnv(service, resolved);
    Object.assign(env, resolved.env);
    services[serviceName] = resolved;

    if (exposure === "portless" && service.publicUrlEnv && !publicUrl) {
      warnings.push(`Service ${serviceName} requested ${service.publicUrlEnv} but no Portless public URL was generated`);
    }
  }

  for (const [serviceName, service] of Object.entries(manifest.services)) {
    const contextService = input.context?.services?.[serviceName];
    if (contextService?.enabled === false || (contextService?.enabled === undefined && service.enabled === false)) {
      continue;
    }

    for (const binding of service.bindings ?? []) {
      const target = services[binding.service];
      if (!target) {
        if (binding.required !== false) {
          throw new Error(`Binding ${binding.env} on ${serviceName} references unknown service ${binding.service}`);
        }
        continue;
      }

      const value = readBindingSource(target, binding.from);
      if (!value) {
        if (binding.required !== false) {
          throw new Error(
            `Binding ${binding.env} on ${serviceName} could not resolve ${binding.from} from ${binding.service}`
          );
        }
        continue;
      }

      env[binding.env] = value;
      services[serviceName].env[binding.env] = value;
    }
  }

  return {
    schemaVersion: SERVICE_MAP_SCHEMA_VERSION,
    services,
    env,
    warnings,
    portlessAliases,
  };
};

export const renderServiceMapEnv = (serviceMap: ResolvedServiceMap): EnvMap => ({ ...serviceMap.env });

export const renderServiceEnv = (serviceMap: ResolvedServiceMap, serviceName: string): EnvMap => {
  const service = serviceMap.services[serviceName];

  if (!service) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  return { ...service.env };
};
