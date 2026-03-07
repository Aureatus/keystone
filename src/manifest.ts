import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  formatEnvFile,
  loadEnvFiles,
  pickEnv,
  removeFileIfExists,
  type EnvMap,
  writeFileIfChanged,
} from "./env-files.ts";

export type EnvVariableDefinition = {
  aliases?: string[];
  defaultValue?: string | ((env: EnvMap, ctx: ManifestContext) => string | undefined);
  required?: boolean;
  secret?: boolean;
};

export type ManifestOutput = {
  path: string;
  env?: EnvMap;
  includeKeys?: readonly string[];
  header?: string[];
  public?: boolean;
};

export type ManifestInitFile = {
  templatePath: string;
  destinationPath: string;
};

export type ManifestBuildResult = {
  env?: EnvMap;
  outputs?: ManifestOutput[];
  warnings?: string[];
};

export type ManifestDoctorResult = {
  warnings?: string[];
  errors?: string[];
};

export type ManifestContext = {
  command: "generate" | "doctor" | "clear" | "init" | "scan-secrets";
  repoRoot: string;
  manifestPath: string;
  sourceEnv: EnvMap;
  env: EnvMap;
  loadSources: () => EnvMap;
  resolvePath: (relativePath: string) => string;
};

export type EnvManifest = {
  name: string;
  sourceFiles?: string[];
  variables?: Record<string, EnvVariableDefinition>;
  outputs?: ManifestOutput[];
  initFiles?: ManifestInitFile[];
  clearPaths?: string[];
  build?: (ctx: ManifestContext) => Promise<ManifestBuildResult> | ManifestBuildResult;
  doctor?: (ctx: ManifestContext) => Promise<ManifestDoctorResult> | ManifestDoctorResult;
};

export const defineManifest = <T extends EnvManifest>(manifest: T): T => manifest;

const resolveSourcePaths = (repoRoot: string, manifest: EnvManifest): string[] =>
  (manifest.sourceFiles ?? []).map((relativePath) => path.join(repoRoot, relativePath));

const applyVariableDefinitions = (
  env: EnvMap,
  manifest: EnvManifest,
  ctx: Omit<ManifestContext, "sourceEnv" | "env">,
  aliasWarnings: string[]
): EnvMap => {
  const nextEnv: EnvMap = { ...env };
  const variables = manifest.variables ?? {};

  for (const [key, definition] of Object.entries(variables)) {
    if (!nextEnv[key]) {
      for (const alias of definition.aliases ?? []) {
        const aliasValue = nextEnv[alias];
        if (!aliasValue) {
          continue;
        }

        nextEnv[key] = aliasValue;
        aliasWarnings.push(`Using deprecated env alias ${alias} for ${key}`);
        break;
      }
    }

    if (!nextEnv[key] && definition.defaultValue !== undefined) {
      const defaultValue =
        typeof definition.defaultValue === "function"
          ? definition.defaultValue(nextEnv, {
              ...ctx,
              sourceEnv: env,
              env: nextEnv,
            })
          : definition.defaultValue;

      if (defaultValue !== undefined) {
        nextEnv[key] = defaultValue;
      }
    }
  }

  return nextEnv;
};

export const loadManifest = async (manifestPath: string): Promise<EnvManifest> => {
  const manifestUrl = pathToFileURL(manifestPath).href;
  const imported = await import(manifestUrl);
  const manifest = (imported.default ?? imported.manifest) as EnvManifest | undefined;

  if (!manifest) {
    throw new Error(`Manifest at ${manifestPath} does not export a default manifest`);
  }

  return manifest;
};

const resolveOutputEnv = (output: ManifestOutput, env: EnvMap): EnvMap =>
  output.env ?? pickEnv(env, output.includeKeys ?? Object.keys(env));

const createBaseContext = (
  command: ManifestContext["command"],
  repoRoot: string,
  manifestPath: string,
  manifest: EnvManifest
): Omit<ManifestContext, "sourceEnv" | "env"> => ({
  command,
  repoRoot,
  manifestPath,
  loadSources: () => loadEnvFiles(resolveSourcePaths(repoRoot, manifest)),
  resolvePath: (relativePath: string) => path.join(repoRoot, relativePath),
});

export const resolveManifestContext = async (
  manifestPath: string,
  command: ManifestContext["command"],
  repoRoot?: string
) => {
  const resolvedManifestPath = path.resolve(manifestPath);
  const manifest = await loadManifest(resolvedManifestPath);
  const resolvedRepoRoot = repoRoot ? path.resolve(repoRoot) : path.dirname(resolvedManifestPath);
  const baseContext = createBaseContext(command, resolvedRepoRoot, resolvedManifestPath, manifest);
  const sourceEnv = baseContext.loadSources();
  const aliasWarnings: string[] = [];
  const env = applyVariableDefinitions(sourceEnv, manifest, baseContext, aliasWarnings);

  const context: ManifestContext = {
    ...baseContext,
    sourceEnv,
    env,
  };

  return { manifest, context, aliasWarnings };
};

export const runGenerate = async (manifestPath: string, repoRoot?: string) => {
  const { manifest, context, aliasWarnings } = await resolveManifestContext(
    manifestPath,
    "generate",
    repoRoot
  );

  const buildResult = (await manifest.build?.(context)) ?? {};
  const env = { ...context.env, ...(buildResult.env ?? {}) };
  const outputs = buildResult.outputs ?? manifest.outputs ?? [];
  const writtenPaths: string[] = [];

  for (const output of outputs) {
    const absolutePath = context.resolvePath(output.path);
    const outputEnv = resolveOutputEnv(output, env);
    const contents = formatEnvFile(outputEnv, {
      header: output.header,
    });

    writeFileIfChanged(absolutePath, contents);
    writtenPaths.push(output.path);
  }

  return {
    env,
    outputs,
    writtenPaths,
    warnings: [...aliasWarnings, ...(buildResult.warnings ?? [])],
  };
};

export const runDoctor = async (manifestPath: string, repoRoot?: string) => {
  const { manifest, context, aliasWarnings } = await resolveManifestContext(
    manifestPath,
    "doctor",
    repoRoot
  );
  const errors: string[] = [];

  for (const [key, definition] of Object.entries(manifest.variables ?? {})) {
    if (definition.required && !context.env[key]?.trim()) {
      errors.push(`Missing required env variable: ${key}`);
    }
  }

  const customResult = (await manifest.doctor?.(context)) ?? {};

  return {
    errors: [...errors, ...(customResult.errors ?? [])],
    warnings: [...aliasWarnings, ...(customResult.warnings ?? [])],
  };
};

export const runClear = async (manifestPath: string, repoRoot?: string) => {
  const { manifest, context } = await resolveManifestContext(manifestPath, "clear", repoRoot);
  const removedPaths: string[] = [];
  const clearPaths = manifest.clearPaths ?? manifest.outputs?.map((output) => output.path) ?? [];

  for (const relativePath of clearPaths) {
    const absolutePath = context.resolvePath(relativePath);
    if (removeFileIfExists(absolutePath)) {
      removedPaths.push(relativePath);
    }
  }

  return { removedPaths };
};

export const runInit = async (manifestPath: string, repoRoot?: string) => {
  const { manifest, context } = await resolveManifestContext(manifestPath, "init", repoRoot);
  const createdPaths: string[] = [];
  const skippedPaths: string[] = [];

  for (const initFile of manifest.initFiles ?? []) {
    const destinationPath = context.resolvePath(initFile.destinationPath);
    if (existsSync(destinationPath)) {
      skippedPaths.push(initFile.destinationPath);
      continue;
    }

    const templatePath = context.resolvePath(initFile.templatePath);
    assertFileExists(templatePath, `Missing init template at ${templatePath}`);
    const contents = readFileSync(templatePath, "utf8");
    writeFileIfChanged(destinationPath, contents);
    createdPaths.push(initFile.destinationPath);
  }

  return { createdPaths, skippedPaths };
};

export const runScanSecrets = async (manifestPath: string, repoRoot?: string) => {
  const { manifest, context, aliasWarnings } = await resolveManifestContext(
    manifestPath,
    "scan-secrets",
    repoRoot
  );
  const errors: string[] = [];
  const warnings: string[] = [...aliasWarnings];
  const secretKeys = Object.entries(manifest.variables ?? {})
    .filter(([, definition]) => definition.secret)
    .map(([key]) => key);

  for (const initFile of manifest.initFiles ?? []) {
    const templatePath = context.resolvePath(initFile.templatePath);
    if (!existsSync(templatePath)) {
      continue;
    }

    const templateEnv = loadEnvFiles([templatePath]);
    for (const secretKey of secretKeys) {
      if (templateEnv[secretKey]?.trim()) {
        errors.push(
          `Secret key ${secretKey} must be blank in template file ${initFile.templatePath}`
        );
      }
    }
  }

  const buildResult = (await manifest.build?.(context)) ?? {};
  const env = { ...context.env, ...(buildResult.env ?? {}) };
  const outputs = buildResult.outputs ?? manifest.outputs ?? [];

  for (const output of outputs) {
    if (!output.public) {
      continue;
    }

    const outputEnv = resolveOutputEnv(output, env);
    for (const secretKey of secretKeys) {
      if (outputEnv[secretKey]?.trim()) {
        errors.push(`Secret key ${secretKey} is exposed in public output ${output.path}`);
      }
    }
  }

  if (secretKeys.length === 0) {
    warnings.push("No secret-marked env variables were defined in the manifest.");
  }

  return { errors, warnings };
};

export const assertFileExists = (absolutePath: string, message: string): void => {
  if (!existsSync(absolutePath)) {
    throw new Error(message);
  }
};
