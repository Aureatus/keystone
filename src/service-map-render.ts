import { formatEnvFile, type EnvMap } from "./env-files.ts";
import { renderServiceEnv, renderServiceMapEnv, type ResolvedServiceMap } from "./service-map.ts";

export type ServiceMapRenderOptions = {
  header?: string[];
  sortKeys?: boolean;
  pretty?: boolean;
};

export type ServiceMapRenderTarget = {
  service?: string;
};

export type ServiceMapRenderFormat = "env" | "json";

const selectRenderedEnv = (serviceMap: ResolvedServiceMap, target?: ServiceMapRenderTarget): EnvMap => {
  if (target?.service) {
    return renderServiceEnv(serviceMap, target.service);
  }

  return renderServiceMapEnv(serviceMap);
};

const formatRenderedEnv = (env: EnvMap, options?: ServiceMapRenderOptions): string =>
  formatEnvFile(env, {
    header: options?.header,
    sortKeys: options?.sortKeys,
  });

export const renderServiceMapEnvFile = (serviceMap: ResolvedServiceMap, options?: ServiceMapRenderOptions): string =>
  formatRenderedEnv(renderServiceMapEnv(serviceMap), options);

export const renderServiceEnvFile = (
  serviceMap: ResolvedServiceMap,
  serviceName: string,
  options?: ServiceMapRenderOptions
): string => formatRenderedEnv(renderServiceEnv(serviceMap, serviceName), options);

export const renderServiceMapJson = (
  serviceMap: ResolvedServiceMap,
  target?: ServiceMapRenderTarget,
  options?: ServiceMapRenderOptions
): string => `${JSON.stringify(selectRenderedEnv(serviceMap, target), null, options?.pretty ? 2 : undefined)}\n`;

export const renderServiceMapOutput = (
  serviceMap: ResolvedServiceMap,
  format: ServiceMapRenderFormat,
  target?: ServiceMapRenderTarget,
  options?: ServiceMapRenderOptions
): string => {
  if (format === "json") {
    return renderServiceMapJson(serviceMap, target, options);
  }

  const env = selectRenderedEnv(serviceMap, target);
  return formatRenderedEnv(env, options);
};
