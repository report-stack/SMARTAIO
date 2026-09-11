// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.
export function requireClientId(clientId) {
  if (clientId === undefined || clientId === null || String(clientId).trim() === "") {
    throw new TypeError("client_id is required");
  }
  return String(clientId).trim();
}

export function filterByClient(records, clientId) {
  const expected = requireClientId(clientId);
  return records.filter((record) => String(record.client_id) === expected);
}

export function assertSingleClient(records, clientId) {
  const expected = requireClientId(clientId);
  const foreign = records.find((record) => String(record.client_id) !== expected);
  if (foreign) throw new Error("CROSS_CLIENT_DATA_DETECTED");
  return records;
}

export function buildClientNewsKey({ clientId, canonicalUrl }) {
  const expected = requireClientId(clientId);
  if (!canonicalUrl || String(canonicalUrl).trim() === "") throw new TypeError("canonical_url is required");
  return `${expected}|${String(canonicalUrl).trim()}`;
}
