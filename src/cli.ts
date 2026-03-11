#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { resolveServiceMapRequestSchema, resolvedServiceMapSchema } from "./openapi/service-map-contract.ts";
import {
  runClear,
  runDoctor,
  runGenerate,
  runInit,
  runResolveServiceMap,
  runScanSecrets,
} from "./manifest.ts";
import { renderServiceMapOutput } from "./service-map-render.ts";

const readOption = (args: string[], option: string): string | undefined => {
  const index = args.indexOf(option);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
};

const hasFlag = (args: string[], flag: string): boolean => args.includes(flag);

const renderJson = (value: unknown, pretty: boolean): string =>
  `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`;

const serviceMapUsage =
  "Usage: keystone service-map resolve --manifest <path> [--repo-root <path>] [--context <path>] [--json] [--output <path>] [--pretty]\n       keystone service-map render --manifest <path> [--repo-root <path>] [--context <path>] [--service <name>] [--format env|json] [--output <path>] [--pretty]";

const readJsonFile = (filePath: string): unknown => JSON.parse(readFileSync(filePath, "utf8"));

const resolveServiceMapRequestFromArgs = (commandArgs: string[]) => {
  const serviceMapManifestPath = readOption(commandArgs, "--manifest");
  const serviceMapRepoRoot = readOption(commandArgs, "--repo-root");
  const serviceMapContextPath = readOption(commandArgs, "--context");
  if (!serviceMapManifestPath) {
    throw new Error(serviceMapUsage);
  }

  const resolvedManifestPath = path.resolve(serviceMapManifestPath);
  const resolvedRepoRoot = serviceMapRepoRoot
    ? path.resolve(serviceMapRepoRoot)
    : path.dirname(resolvedManifestPath);
  const request = resolveServiceMapRequestSchema.parse({
    manifestPath: resolvedManifestPath,
    repoRoot: resolvedRepoRoot,
    context: serviceMapContextPath ? readJsonFile(path.resolve(serviceMapContextPath)) : undefined,
  });

  return { request, resolvedManifestPath, resolvedRepoRoot };
};

const main = async (): Promise<void> => {
  const [, , command, ...rest] = process.argv;
  const subcommand = rest[0];
  const isServiceMapCommand = command === "service-map";
  const commandArgs = isServiceMapCommand ? rest.slice(1) : rest;
  const manifestPath = readOption(rest, "--manifest");
  const repoRoot = readOption(rest, "--repo-root");

  if (!command || !(isServiceMapCommand ? subcommand : manifestPath)) {
    throw new Error(
      `Usage: keystone <generate|doctor|clear|init|scan-secrets> --manifest <path> [--repo-root <path>]\n       ${serviceMapUsage}`
    );
  }

  if (isServiceMapCommand) {
    if (subcommand !== "resolve" && subcommand !== "render") {
      throw new Error(`Unknown service-map command: ${subcommand ?? "<missing>"}`);
    }

    const { request, resolvedManifestPath, resolvedRepoRoot } = resolveServiceMapRequestFromArgs(commandArgs);
    const serviceMap = await runResolveServiceMap(resolvedManifestPath, resolvedRepoRoot, {
      env: request.env,
      context: request.context,
    });

    if (subcommand === "resolve") {
      const payload = resolvedServiceMapSchema.parse(serviceMap);
      const outputPath = readOption(commandArgs, "--output");
      const pretty = hasFlag(commandArgs, "--pretty") || !outputPath;
      const rendered = renderJson(payload, pretty);

      if (outputPath) {
        const resolvedOutputPath = path.resolve(outputPath);
        writeFileSync(resolvedOutputPath, rendered, "utf8");
        process.stdout.write(`Wrote ${resolvedOutputPath}\n`);
        return;
      }

      process.stdout.write(rendered);
      return;
    }

    const formatOption = readOption(commandArgs, "--format") ?? "env";
    if (formatOption !== "env" && formatOption !== "json") {
      throw new Error(`Unsupported render format: ${formatOption}`);
    }

    const outputPath = readOption(commandArgs, "--output");
    const pretty = hasFlag(commandArgs, "--pretty") || formatOption === "json";
    const rendered = renderServiceMapOutput(
      serviceMap,
      formatOption,
      { service: readOption(commandArgs, "--service") },
      { pretty }
    );

    if (outputPath) {
      const resolvedOutputPath = path.resolve(outputPath);
      writeFileSync(resolvedOutputPath, rendered, "utf8");
      process.stdout.write(`Wrote ${resolvedOutputPath}\n`);
      return;
    }

    process.stdout.write(rendered);
    return;
  }

  const resolvedManifestPath = path.resolve(manifestPath as string);
  const resolvedRepoRoot = repoRoot ? path.resolve(repoRoot) : path.dirname(resolvedManifestPath);

  if (command === "generate") {
    const result = await runGenerate(resolvedManifestPath, resolvedRepoRoot);
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }
    for (const relativePath of result.writtenPaths) {
      console.log(`Wrote ${relativePath}`);
    }
    return;
  }

  if (command === "doctor") {
    const result = await runDoctor(resolvedManifestPath, resolvedRepoRoot);
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.error(`Error: ${error}`);
      }
      process.exit(1);
    }
    console.log("Env manifest is healthy.");
    return;
  }

  if (command === "clear") {
    const result = await runClear(resolvedManifestPath, resolvedRepoRoot);
    for (const relativePath of result.removedPaths) {
      console.log(`Removed ${relativePath}`);
    }
    return;
  }

  if (command === "init") {
    const result = await runInit(resolvedManifestPath, resolvedRepoRoot);
    for (const relativePath of result.createdPaths) {
      console.log(`Created ${relativePath}`);
    }
    for (const relativePath of result.skippedPaths) {
      console.log(`Skipped ${relativePath}`);
    }
    return;
  }

  if (command === "scan-secrets") {
    const result = await runScanSecrets(resolvedManifestPath, resolvedRepoRoot);
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning}`);
    }
    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.error(`Error: ${error}`);
      }
      process.exit(1);
    }
    console.log("Secret scan passed.");
    return;
  }

  throw new Error(`Unknown command: ${command}`);
};

await main();
