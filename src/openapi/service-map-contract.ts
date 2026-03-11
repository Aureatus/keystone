import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const envMapSchema = z.record(z.string(), z.string()).openapi("EnvMap");

export const serviceMapServiceContextSchema = z
  .object({
    enabled: z.boolean().optional(),
    bindHost: z.string().optional(),
    bindPort: z.number().int().positive().optional(),
    connectHost: z.string().optional(),
    connectPort: z.number().int().positive().optional(),
    preferredPort: z.number().int().positive().optional(),
    publicUrl: z.string().optional(),
    portlessAlias: z.string().optional(),
    serviceName: z.string().optional(),
  })
  .openapi("ServiceMapServiceContext");

export const serviceMapContextSchema = z
  .object({
    projectName: z.string().optional(),
    cellId: z.string().optional(),
    cellName: z.string().optional(),
    worktreePath: z.string().optional(),
    portless: z
      .object({
        proxyPort: z.number().int().positive().optional(),
        https: z.boolean().optional(),
        rootName: z.string().optional(),
      })
      .optional(),
    services: z.record(z.string(), serviceMapServiceContextSchema).optional(),
  })
  .openapi("ServiceMapContext");

export const resolveServiceMapRequestSchema = z
  .object({
    manifestPath: z
      .string()
      .min(1)
      .openapi({ description: "Absolute or repo-relative path to `env.manifest.ts`." }),
    repoRoot: z
      .string()
      .min(1)
      .optional()
      .openapi({ description: "Optional override for repository root." }),
    env: envMapSchema
      .optional()
      .openapi({ description: "Optional environment overrides applied before service-map resolution." }),
    context: serviceMapContextSchema
      .optional()
      .openapi({ description: "Structured runtime context used to resolve the service map." }),
  })
  .openapi("ResolveServiceMapRequest");

export const serviceEndpointSchema = z
  .object({
    host: z.string(),
    port: z.number().int().positive(),
  })
  .openapi("ServiceEndpoint");

export const resolvedServiceSchema = z
  .object({
    name: z.string(),
    protocol: z.enum(["http", "https", "ws", "wss", "postgres", "redis", "mysql", "tcp"]),
    runtime: z.enum(["local-process", "docker-published", "docker-network"]),
    exposure: z.enum(["direct", "portless", "none"]),
    bind: serviceEndpointSchema.nullish(),
    connect: serviceEndpointSchema,
    internalUrl: z.string().nullish(),
    publicUrl: z.string().nullish(),
    env: envMapSchema,
  })
  .openapi("ResolvedService");

export const portlessAliasPlanSchema = z
  .object({
    service: z.string(),
    hostname: z.string(),
    port: z.number().int().positive(),
  })
  .openapi("PortlessAliasPlan");

export const resolvedServiceMapSchema = z
  .object({
    schemaVersion: z.string(),
    services: z.record(z.string(), resolvedServiceSchema),
    env: envMapSchema,
    warnings: z.array(z.string()),
    portlessAliases: z.array(portlessAliasPlanSchema),
  })
  .openapi("ResolvedServiceMap");

export const errorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi("ErrorResponse");

export type ResolveServiceMapRequest = z.infer<typeof resolveServiceMapRequestSchema>;
export type ResolvedServiceMapResponse = z.infer<typeof resolvedServiceMapSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const createServiceMapOpenApiDocument = () => {
  const registry = new OpenAPIRegistry();

  registry.register("ServiceMapServiceContext", serviceMapServiceContextSchema);
  registry.register("ServiceMapContext", serviceMapContextSchema);
  registry.register("ResolveServiceMapRequest", resolveServiceMapRequestSchema);
  registry.register("ServiceEndpoint", serviceEndpointSchema);
  registry.register("ResolvedService", resolvedServiceSchema);
  registry.register("PortlessAliasPlan", portlessAliasPlanSchema);
  registry.register("ResolvedServiceMap", resolvedServiceMapSchema);
  registry.register("ErrorResponse", errorResponseSchema);

  registry.registerPath({
    method: "post",
    path: "/v1/service-map/resolve",
    summary: "Resolve a service map for a Keystone manifest",
    operationId: "resolveServiceMap",
    request: {
      body: {
        required: true,
        content: {
          "application/json": {
            schema: resolveServiceMapRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Resolved service map",
        content: {
          "application/json": {
            schema: resolvedServiceMapSchema,
          },
        },
      },
      400: {
        description: "Invalid manifest or service-map request",
        content: {
          "application/json": {
            schema: errorResponseSchema,
          },
        },
      },
    },
  });

  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Keystone Service Map API",
      version: "0.1.0",
      description:
        "Experimental API contract for resolving a Keystone service map from a manifest. This schema exists so non-TypeScript consumers such as Hive's Elixir backend can rely on a stable wire format even though Keystone's authoring experience is TypeScript-first.",
    },
    servers: [{ url: "http://localhost:4010" }],
  });
};
