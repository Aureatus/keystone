#!/usr/bin/env bun

import { writeFileSync } from "node:fs";
import path from "node:path";

import { resolvedTopologySchema } from "./openapi/topology-contract.ts";
import {
  runClear,
  runDoctor,
  runGenerate,
  runInit,
  runResolveTopology,
  runScanSecrets,
} from "./manifest.ts";

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

const topologyUsage =
  "Usage: keystone topology resolve --manifest <path> [--repo-root <path>] [--json] [--output <path>] [--pretty]";

const main = async (): Promise<void> => {
  const [, , command, ...rest] = process.argv;
  const subcommand = rest[0];
  const commandArgs = command === "topology" ? rest.slice(1) : rest;
  const manifestPath = readOption(rest, "--manifest");
  const repoRoot = readOption(rest, "--repo-root");

  if (!command || !(command === "topology" ? subcommand : manifestPath)) {
    throw new Error(
      `Usage: keystone <generate|doctor|clear|init|scan-secrets> --manifest <path> [--repo-root <path>]\n       ${topologyUsage}`
    );
  }

  if (command === "topology") {
    if (subcommand !== "resolve") {
      throw new Error(`Unknown topology command: ${subcommand ?? "<missing>"}`);
    }

    const topologyManifestPath = readOption(commandArgs, "--manifest");
    const topologyRepoRoot = readOption(commandArgs, "--repo-root");
    if (!topologyManifestPath) {
      throw new Error(topologyUsage);
    }

    const resolvedManifestPath = path.resolve(topologyManifestPath);
    const resolvedRepoRoot = topologyRepoRoot
      ? path.resolve(topologyRepoRoot)
      : path.dirname(resolvedManifestPath);
    const topology = await runResolveTopology(resolvedManifestPath, resolvedRepoRoot);
    const payload = resolvedTopologySchema.parse(topology);
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
