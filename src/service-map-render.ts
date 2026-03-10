import { formatEnvFile, type EnvMap } from "./env-files.ts";
import { renderServiceEnv, renderServiceMapEnv, type ResolvedServiceMap } from "./service-map.ts";

type RenderOptions = {
  header?: string[];
  sortKeys?: boolean;
};

const formatRenderedEnv = (env: EnvMap, options?: RenderOptions): string =>
  formatEnvFile(env, {
    header: options?.header,
    sortKeys: options?.sortKeys,
  });

export const renderServiceMapEnvFile = (serviceMap: ResolvedServiceMap, options?: RenderOptions): string =>
  formatRenderedEnv(renderServiceMapEnv(serviceMap), options);

export const renderServiceEnvFile = (
  serviceMap: ResolvedServiceMap,
  serviceName: string,
  options?: RenderOptions
): string => formatRenderedEnv(renderServiceEnv(serviceMap, serviceName), options);
