import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import dotenv from "dotenv";

export type EnvMap = Record<string, string>;

export const parseEnvFile = (contents: string): EnvMap => {
  const parsed = dotenv.parse(contents);
  const result: EnvMap = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (!key) {
      continue;
    }

    result[key] = value ?? "";
  }

  return result;
};

export const loadEnvFile = (absolutePath: string): EnvMap => {
  if (!existsSync(absolutePath)) {
    return {};
  }

  return parseEnvFile(readFileSync(absolutePath, "utf8"));
};

export const loadEnvFiles = (absolutePaths: string[]): EnvMap => {
  const result: EnvMap = {};

  for (const absolutePath of absolutePaths) {
    Object.assign(result, loadEnvFile(absolutePath));
  }

  return result;
};

const escapeEnvValue = (value: string): string => {
  if (value === "") {
    return "";
  }

  const escaped = value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `"${escaped}"`;
};

export const formatEnvFile = (
  env: EnvMap,
  options?: {
    header?: string[];
    sortKeys?: boolean;
  }
): string => {
  const lines = [...(options?.header ?? [])];
  if (lines.length > 0) {
    lines.push("");
  }

  const keys = Object.keys(env);
  if (options?.sortKeys !== false) {
    keys.sort();
  }

  for (const key of keys) {
    lines.push(`${key}=${escapeEnvValue(env[key] ?? "")}`);
  }

  lines.push("");

  return lines.join("\n");
};

export const writeFileIfChanged = (absolutePath: string, contents: string): boolean => {
  if (existsSync(absolutePath)) {
    const existing = readFileSync(absolutePath, "utf8");
    if (existing === contents) {
      return false;
    }
  }

  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents, "utf8");
  return true;
};

export const removeFileIfExists = (absolutePath: string): boolean => {
  if (!existsSync(absolutePath)) {
    return false;
  }

  unlinkSync(absolutePath);
  return true;
};

export const pickEnv = (env: EnvMap, keys: readonly string[]): EnvMap => {
  const scoped: EnvMap = {};

  for (const key of keys) {
    const value = env[key];
    if (value !== undefined) {
      scoped[key] = value;
    }
  }

  return scoped;
};
