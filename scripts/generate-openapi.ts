import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { createTopologyOpenApiDocument } from "../src/openapi/topology-contract.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputPath = path.join(repoRoot, "openapi", "topology.openapi.yaml");
const checkOnly = process.argv.includes("--check");

const contents = `${YAML.stringify(createTopologyOpenApiDocument())}`;

if (checkOnly) {
  if (!existsSync(outputPath)) {
    throw new Error(`Missing generated OpenAPI file at ${outputPath}`);
  }

  const existing = readFileSync(outputPath, "utf8");
  if (existing !== contents) {
    throw new Error("OpenAPI file is out of date. Run: bun run openapi:generate");
  }

  process.stdout.write("OpenAPI file is up to date.\n");
} else {
  writeFileSync(outputPath, contents, "utf8");
  process.stdout.write(`Wrote ${outputPath}\n`);
}
