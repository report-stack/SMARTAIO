import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../../../../.codex-plugin/plugin.json", import.meta.url), "utf8"));

export const SMART_AIO_PLUGIN_VERSION = Object.freeze(String(manifest.version || "").trim());

export function requireCurrentSmartAioPluginVersion(value, field = "smart_aio_plugin_version") {
  const version = String(value ?? "").trim();
  if (!version) throw new Error(`${field.toUpperCase()}_REQUIRED`);
  if (version !== SMART_AIO_PLUGIN_VERSION) {
    throw new Error(`${field.toUpperCase()}_MISMATCH:${version}:expected:${SMART_AIO_PLUGIN_VERSION}`);
  }
  return version;
}
