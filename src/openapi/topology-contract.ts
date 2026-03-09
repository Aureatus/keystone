import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

const envMapSchema = z.record(z.string(), z.string()).openapi("EnvMap");

export const resolveTopologyRequestSchema = z
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
      .openapi({ description: "Optional environment overrides applied before topology resolution." }),
  })
  .openapi("ResolveTopologyRequest");

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

export const resolvedTopologySchema = z
  .object({
    services: z.record(z.string(), resolvedServiceSchema),
    env: envMapSchema,
    warnings: z.array(z.string()),
    portlessAliases: z.array(portlessAliasPlanSchema),
  })
  .openapi("ResolvedTopology");

export const errorResponseSchema = z
  .object({
    error: z.string(),
  })
  .openapi("ErrorResponse");

export type ResolveTopologyRequest = z.infer<typeof resolveTopologyRequestSchema>;
export type ResolvedTopologyResponse = z.infer<typeof resolvedTopologySchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export const createTopologyOpenApiDocument = () => {
  const registry = new OpenAPIRegistry();

  registry.register("ResolveTopologyRequest", resolveTopologyRequestSchema);
  registry.register("ServiceEndpoint", serviceEndpointSchema);
  registry.register("ResolvedService", resolvedServiceSchema);
  registry.register("PortlessAliasPlan", portlessAliasPlanSchema);
  registry.register("ResolvedTopology", resolvedTopologySchema);
  registry.register("ErrorResponse", errorResponseSchema);

  registry.registerPath({
    method: "post",
    path: "/v1/topology/resolve",
    summary: "Resolve service topology for a Keystone manifest",
    operationId: "resolveTopology",
    request: {
      body: {
        required: true,
        content: {
          "application/json": {
            schema: resolveTopologyRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Resolved topology",
        content: {
          "application/json": {
            schema: resolvedTopologySchema,
          },
        },
      },
      400: {
        description: "Invalid manifest or topology request",
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
      title: "Keystone Topology API",
      version: "0.1.0",
      description:
        "Experimental API contract for resolving Keystone service topology from a manifest. This schema exists so non-TypeScript consumers such as Hive's Elixir backend can rely on a stable wire format even though Keystone's authoring experience is TypeScript-first.",
    },
    servers: [{ url: "http://localhost:4010" }],
  });
};
