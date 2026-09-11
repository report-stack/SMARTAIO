// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.
import { requireClientId } from "./client-scope.mjs";

const REQUIRED_FIELDS = Object.freeze(["ranking_config_id", "domain", "country", "device", "keywords", "schedule_expression"]);

export function prepareAhrefsConnection(config = {}) {
  const clientId = requireClientId(config.client_id);
  const missingFields = REQUIRED_FIELDS.filter((field) => {
    const value = config[field];
    return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
  });
  if (!config.has_api_token) missingFields.push("api_token");
  const uniqueMissing = [...new Set(missingFields)];
  if (!config.enabled) {
    return Object.freeze({ client_id: clientId, provider: "ahrefs", status: "WAITING_FOR_CONFIGURATION", enabled: false, missing_fields: uniqueMissing });
  }
  if (uniqueMissing.length) {
    return Object.freeze({ client_id: clientId, provider: "ahrefs", status: "BLOCKED_MISSING_CONFIGURATION", enabled: true, missing_fields: uniqueMissing });
  }
  const keywords = config.keywords.map((value) => String(value).trim()).filter(Boolean);
  return Object.freeze({
    client_id: clientId,
    provider: "ahrefs",
    status: "READY_FOR_CONNECTOR",
    enabled: true,
    ranking_config_id: String(config.ranking_config_id),
    domain: String(config.domain).trim(),
    country: String(config.country).trim(),
    device: String(config.device).trim(),
    keywords,
    schedule_expression: String(config.schedule_expression).trim(),
    secret_handling: "Read the API token from a secret store at execution time. Never save it to Sheets, Drive, logs, or config JSON.",
  });
}

export function assertAhrefsResultScope({ client_id, requests = [], results = [] }) {
  const clientId = requireClientId(client_id);
  const allowed = new Set(requests.map((item) => `${item.client_id}|${item.keyword}|${item.device || "desktop"}`));
  for (const result of results) {
    if (String(result.client_id) !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:ahrefs_result");
    if (!allowed.has(`${result.client_id}|${result.keyword}|${result.device || "desktop"}`)) throw new Error("UNREQUESTED_AHREFS_RESULT");
  }
  return results;
}
