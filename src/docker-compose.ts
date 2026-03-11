import type { ServiceMapContext, ServiceMapManifest, ServiceMapServiceContext } from "./service-map.ts";
import type { ServiceDefinition } from "./service-map.ts";

export type DockerComposePublishedPort = {
  containerPort: number;
  publishedPort: number;
  hostIp?: string;
};

export type DockerComposeServiceRuntime = {
  serviceName: string;
  containerName?: string;
  ports?: DockerComposePublishedPort[];
  networkHost?: string;
};

export type DockerComposeContextInput = {
  projectName?: string;
  cellId?: string;
  cellName?: string;
  worktreePath?: string;
  services: Record<string, DockerComposeServiceRuntime>;
};

const pickPublishedPort = (
  manifestService: ServiceDefinition,
  runtimeService: DockerComposeServiceRuntime
): DockerComposePublishedPort | undefined => {
  const ports = runtimeService.ports ?? [];
  if (ports.length === 0) {
    return undefined;
  }

  const preferredContainerPort = manifestService.connectPort ?? manifestService.bindPort;
  if (preferredContainerPort) {
    const exactMatch = ports.find((port) => port.containerPort === preferredContainerPort);
    if (exactMatch) {
      return exactMatch;
    }
  }

  return ports[0];
};

export const createServiceMapContextFromDockerCompose = (
  manifest: ServiceMapManifest,
  input: DockerComposeContextInput
): ServiceMapContext => {
  const services: Record<string, ServiceMapServiceContext> = {};

  for (const [serviceKey, manifestService] of Object.entries(manifest.services ?? {})) {
    const runtimeService = input.services[serviceKey];
    if (!runtimeService) {
      continue;
    }

    if (manifestService.runtime === "docker-published") {
      const publishedPort = pickPublishedPort(manifestService, runtimeService);
      if (!publishedPort) {
        throw new Error(`Docker Compose service ${serviceKey} does not expose a published port`);
      }

      services[serviceKey] = {
        connectHost: publishedPort.hostIp && publishedPort.hostIp !== "0.0.0.0" ? publishedPort.hostIp : "127.0.0.1",
        connectPort: publishedPort.publishedPort,
        bindPort: publishedPort.publishedPort,
      };
      continue;
    }

    if (manifestService.runtime === "docker-network") {
      services[serviceKey] = {
        serviceName: runtimeService.networkHost ?? runtimeService.serviceName,
        connectHost: runtimeService.networkHost ?? runtimeService.serviceName,
        connectPort:
          manifestService.connectPort ?? manifestService.bindPort ?? pickPublishedPort(manifestService, runtimeService)?.containerPort,
      };
    }
  }

  return {
    projectName: input.projectName,
    cellId: input.cellId,
    cellName: input.cellName,
    worktreePath: input.worktreePath,
    services,
  };
};
