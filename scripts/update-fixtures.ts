import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runResolveServiceMap } from "../src/manifest.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const writeJson = (filePath: string, value: unknown): void => {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const updateSmokeFixture = async (): Promise<void> => {
  const fixtureRoot = path.join(repoRoot, "fixtures", "smoke-workspace");
  const manifestPath = path.join(fixtureRoot, "env.manifest.ts");
  const defaultOutputPath = path.join(fixtureRoot, "service-map.example.json");
  const contextPath = path.join(fixtureRoot, "service-map.context.example.json");
  const contextOutputPath = path.join(fixtureRoot, "service-map.context.resolved.json");

  const defaultServiceMap = await runResolveServiceMap(manifestPath, fixtureRoot);
  writeJson(defaultOutputPath, defaultServiceMap);

  const context = JSON.parse(readFileSync(contextPath, "utf8")) as Parameters<typeof runResolveServiceMap>[2]["context"];
  const contextServiceMap = await runResolveServiceMap(manifestPath, fixtureRoot, { context });
  writeJson(contextOutputPath, contextServiceMap);
};

const updateMockRepoFixtures = async (): Promise<void> => {
  const fixtureRoot = path.join(repoRoot, "fixtures", "mock-repos");
  for (const entry of readdirSync(fixtureRoot)) {
    const repoPath = path.join(fixtureRoot, entry);
    if (!statSync(repoPath).isDirectory()) {
      continue;
    }

    const manifestPath = path.join(repoPath, "env.manifest.ts");
    if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
      continue;
    }

    const outputPath = path.join(repoPath, "service-map.example.json");
    const contextPath = path.join(repoPath, "service-map.context.json");
    const context = existsSync(contextPath)
      ? (JSON.parse(readFileSync(contextPath, "utf8")) as Parameters<typeof runResolveServiceMap>[2]["context"])
      : undefined;
    const serviceMap = await runResolveServiceMap(manifestPath, repoPath, { context });
    writeJson(outputPath, serviceMap);
  }
};

await updateSmokeFixture();
await updateMockRepoFixtures();
process.stdout.write("Updated fixture service-map examples.\n");
