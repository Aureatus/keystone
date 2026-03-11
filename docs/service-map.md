# Service Map Direction

This document describes the planned service-level model for Keystone.

Status: the first experimental slice is now implemented in Keystone for manifest-level endpoint resolution and env generation. Runtime orchestration and Portless alias execution still belong outside Keystone.

It remains experimental mainly because the contract has not yet been exercised by a real external orchestrator. The types, JSON shape, and helper APIs are now tested, but we still expect to learn from the first Hive integration.

For cross-runtime adoption, treat Keystone as having two public surfaces:

- the TypeScript SDK exported from `src/`
- the OpenAPI contract in `openapi/service-map.openapi.yaml`

The OpenAPI contract is the intended bridge for consumers like Hive's Elixir backend.
It should be generated from TypeScript-first Zod schemas rather than maintained by hand.

It is intentionally explicit about defaults and overrides so users can understand what Keystone will infer, when it will infer it, and how to opt out.

## Goal

Keystone should be able to describe a project's services in one place and then resolve:

- bind host and port for each service
- connect host and port for each service
- public URLs for HTTP services
- generated env vars for consumers
- optional Portless aliases for stable local HTTP URLs

This is especially useful for orchestrators like Hive, where a cell may contain several services plus per-cell generated runtime values.

## Core rule

Keystone should not infer endpoint shapes from protocol alone.

Instead, endpoint resolution should come from three explicit concerns:

- `protocol` - what kind of service this is (`http`, `postgres`, `redis`, `tcp`, etc.)
- `runtime` - where it runs (`local-process`, `docker-published`, `docker-network`, etc.)
- `exposure` - how consumers reach it (`direct`, `portless`, `none`)

Protocol only tells Keystone how to format values. Runtime and exposure tell Keystone what values are valid to derive.

## Recommended model

Planned service definitions should look roughly like this:

```ts
type ServiceDefinition = {
  protocol: "http" | "https" | "postgres" | "redis" | "tcp";
  runtime: "local-process" | "docker-published" | "docker-network";
  exposure?: "direct" | "portless" | "none";
  bindHost?: string;
  bindPort?: number;
  connectHost?: string;
  connectPort?: number;
  portEnv?: string;
  hostEnv?: string;
  urlEnv?: string;
  publicUrlEnv?: string;
};
```

And Keystone should resolve that into a concrete endpoint:

```ts
type ResolvedService = {
  protocol: string;
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
};
```

## Safe defaults

Defaults should only apply when the runtime makes them safe and unsurprising.

### `runtime: "local-process"`

Use when Hive or another local orchestrator starts the service directly on the host machine.

Recommended defaults:

- bind host: `127.0.0.1`
- connect host: `127.0.0.1`
- bind port: generated or explicitly provided
- connect port: same as bind port

This is the one place where defaulting to `127.0.0.1` is reasonable.

### `runtime: "docker-published"`

Use when Docker or Docker Compose publishes a container port back to the host.

Recommended defaults:

- connect host: `127.0.0.1`
- connect port: published host port
- bind host/port: optional, not always meaningful to consumers

This still behaves like a host-local dependency from the client's point of view.

### `runtime: "docker-network"`

Use when one container talks to another by service name on the Docker network.

Implemented behavior:

- do not default host to `127.0.0.1`
- require `connectHost` or a container service name
- require `connectPort` or a known container port

Example:

- `connectHost: "postgres"`
- `connectPort: 5432`

This avoids the wrong and confusing behavior where Keystone guesses loopback even though the service is only reachable inside Docker.

## URL construction

Keystone should only build URLs when the protocol supports a meaningful URL shape.

### Good automatic URL candidates

- `http`
- `https`
- `ws`
- `wss`

These can safely produce:

- `internalUrl`
- `publicUrl`

### Conditional URL candidates

- `postgres`
- `redis`
- `mysql`

These may support DSN helpers, but Keystone should only build them when the necessary fields exist.

### No automatic URL by default

- generic `tcp`

For generic TCP services, Keystone should expose host and port, not invent a URL.

## Portless integration

Portless fits Keystone best as an optional exposure strategy for HTTP services.

Implemented behavior:

- `exposure: "portless"` means the service still binds to a real local port
- Keystone uses the bundled `portless` package to normalize hostnames and format stable browser-facing URLs
- Keystone should prefer that stable URL for generated public env vars
- Keystone should still expose direct bind/connect details for internal use when needed

This means a service can have both:

- `connect.host = 127.0.0.1`
- `connect.port = 4312`
- `publicUrl = http://api.cell-abc.localhost:1355`

That is not contradictory. It is the intended split between internal connectivity and public dev access.

## Docker support

Keystone should work cleanly with both process-based and Docker-based orchestration.

Keystone now also includes a small helper for Compose-style runtime data:

```ts
createServiceMapContextFromDockerCompose(manifest, {
  projectName: "my-stack",
  services: {
    api: {
      serviceName: "api",
      ports: [{ containerPort: 8080, publishedPort: 18080 }],
    },
  },
})
```

That helper converts discovered Docker/Compose runtime information into a `ServiceMapContext` that can be passed straight into `resolveServiceMap(...)`.

### Local processes

Example:

- Hive starts `api`
- Keystone assigns `bindPort`
- clients use `127.0.0.1:<port>` or Portless public URLs

### Docker published ports

Example:

- Docker Compose publishes Postgres to `127.0.0.1:5439`
- Keystone generates:
  - `PGHOST=127.0.0.1`
  - `PGPORT=5439`
  - optional `DATABASE_URL`

### Docker network-only services

Example:

- app container connects to `postgres:5432`
- Keystone generates:
  - `PGHOST=postgres`
  - `PGPORT=5432`

The key rule is that Docker network hostnames should be explicit, not inferred from local-process defaults.

## Hive integration

Hive should be able to consume Keystone through an SDK rather than reimplementing port and env logic.

Planned SDK shape:

```ts
resolveCellServiceMap(...)
generateCellEnv(...)
getPortlessAliases(...)
getServiceEndpoints(...)
```

An equivalent wire-level contract should be kept in sync through `openapi/service-map.openapi.yaml`, with the main external response shape centered on `ResolvedServiceMap`.
In Keystone, that file should be generated from `src/openapi/service-map-contract.ts` and checked in CI.

The implementation direction is now:

- resolve a service map from `manifest + structured context`
- return a `ResolvedServiceMap` object as the primary contract
- optionally render env maps or env files from that resolved service map via helper functions

This keeps the core model structured for orchestrators like Hive while still supporting traditional env-file workflows.

Additional mock consumer repos live under `fixtures/mock-repos/` and are exercised in tests so the service-map model is not only validated against a single smoke fixture.

That would let Hive:

1. create a worktree cell
2. resolve the service map for that cell
3. start local processes and/or Docker services
4. register Portless aliases for HTTP services
5. write generated env files for the cell

## Override philosophy

Keystone should have small, obvious defaults and easy override paths.

Rules:

- defaults should be documented next to the config shape
- every inferred host or port should be overridable
- `runtime` should control whether loopback defaults are allowed
- `protocol` should control formatting, not connectivity assumptions
- Portless should be opt-in, not hidden magic

If a user can understand the default in one sentence and override it in one field, that is a good Keystone behavior.

## Recommended next implementation step

Add a documented experimental service-map layer to Keystone with:

- service definitions
- runtime and exposure modes
- resolved endpoints
- Portless-aware HTTP exposure
- Docker-aware connect host rules

Then add a fixture that covers:

- one Portless HTTP service
- one direct local TCP service
- one Docker-network style service
