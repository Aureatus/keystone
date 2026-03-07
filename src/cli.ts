#!/usr/bin/env bun

import path from "node:path";

import { runClear, runDoctor, runGenerate, runInit, runScanSecrets } from "./manifest.ts";

const readOption = (args: string[], option: string): string | undefined => {
  const index = args.indexOf(option);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
};

const main = async (): Promise<void> => {
  const [, , command, ...rest] = process.argv;
  const manifestPath = readOption(rest, "--manifest");
  const repoRoot = readOption(rest, "--repo-root");

  if (!command || !manifestPath) {
    throw new Error(
      "Usage: keystone <generate|doctor|clear|init|scan-secrets> --manifest <path> [--repo-root <path>]"
    );
  }

  const resolvedManifestPath = path.resolve(manifestPath);
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
