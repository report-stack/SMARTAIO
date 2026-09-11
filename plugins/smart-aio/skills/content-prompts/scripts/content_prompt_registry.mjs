#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const registryPath = fileURLToPath(
  new URL("../../../references/content-v1/prompts.json", import.meta.url),
);
export const assemblyRulesPath = fileURLToPath(
  new URL("../../../references/content-v1/assembly-rules.json", import.meta.url),
);
export const sourceManifestPath = fileURLToPath(
  new URL("../../../references/content-v1/manifests/SHA256SUMS", import.meta.url),
);

export function digest(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function loadContentPromptRegistry() {
  return JSON.parse(await readFile(registryPath, "utf8"));
}

export async function loadAssemblyRules() {
  return JSON.parse(await readFile(assemblyRulesPath, "utf8"));
}

export async function verifyContentPromptRegistry() {
  const registry = await loadContentPromptRegistry();
  const failures = [];

  for (const [name, item] of Object.entries(registry.prompts)) {
    const actual = digest(item.value);
    if (actual !== item.sha256 || item.value.length !== item.length) failures.push(name);
  }

  if (failures.length) {
    throw new Error(`content-v1 verification failed: ${failures.join(", ")}`);
  }

  const assemblyRules = await loadAssemblyRules();
  const promptKeys = Object.keys(registry.prompts).sort();
  const ruleKeys = Object.keys(assemblyRules.rules || {}).sort();
  const declaredKeys = [...(assemblyRules.prompt_keys || [])].sort();
  if (assemblyRules.version !== "content-v1") failures.push("assembly-rules.version");
  if (assemblyRules.execution !== "SMART_AIO_SKILLS_ONLY") failures.push("assembly-rules.execution");
  if (JSON.stringify(promptKeys) !== JSON.stringify(ruleKeys)) failures.push("assembly-rules.rules");
  if (JSON.stringify(promptKeys) !== JSON.stringify(declaredKeys)) failures.push("assembly-rules.prompt_keys");
  if (failures.length) throw new Error(`content-v1 verification failed: ${failures.join(", ")}`);

  const sourceSnapshot = await verifyContentSourceBundle();
  return {
    version: registry.version || "content-v1",
    promptCount: Object.keys(registry.prompts).length,
    assemblyRuleCount: Object.keys(assemblyRules.rules).length,
    sourceFileCount: sourceSnapshot.fileCount,
  };
}

export async function verifyContentSourceBundle() {
  const manifest = await readFile(sourceManifestPath, "utf8");
  const contentRoot = resolve(dirname(sourceManifestPath), "..");
  const failures = [];
  let fileCount = 0;
  for (const line of manifest.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = line.match(/^([a-f0-9]{64})\s+\.?\/?(.+)$/i);
    if (!match) {
      failures.push(`invalid manifest line: ${line}`);
      continue;
    }
    const expected = match[1].toLowerCase();
    const filePath = resolve(contentRoot, match[2]);
    if (filePath !== contentRoot && !filePath.startsWith(`${contentRoot}${sep}`)) {
      failures.push(`path outside content bundle: ${match[2]}`);
      continue;
    }
    try {
      const content = await readFile(filePath);
      const actual = createHash("sha256").update(content).digest("hex");
      if (actual !== expected) failures.push(match[2]);
      fileCount += 1;
    } catch {
      failures.push(match[2]);
    }
  }
  if (!fileCount || failures.length) throw new Error(`content-v1 source verification failed: ${failures.join(", ")}`);
  return Object.freeze({ version: "content-v1", fileCount });
}

export async function getContentPrompt(key) {
  const registry = await loadContentPromptRegistry();
  const item = registry.prompts[key];
  if (!item) throw new Error(`unknown prompt key: ${key || "(missing)"}`);
  return Object.freeze({ key, ...item });
}

async function main() {
  const command = process.argv[2] || "list";
  const key = process.argv[3];
  const registry = await loadContentPromptRegistry();

  if (command === "list") {
    for (const [name, item] of Object.entries(registry.prompts)) {
      process.stdout.write(`${name}\t${item.length}\t${item.sha256}\n`);
    }
    return;
  }

  if (command === "verify") {
    const result = await verifyContentPromptRegistry();
    process.stdout.write(`${result.version} verified: ${result.promptCount} prompts\n`);
    return;
  }

  if (command === "get") {
    const item = await getContentPrompt(key);
    process.stdout.write(item.value);
    return;
  }

  if (command === "meta") {
    const item = await getContentPrompt(key);
    const { value: _value, key: _key, ...metadata } = item;
    process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
