// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.
import { createHash, randomUUID } from "node:crypto";

export function createRunId() {
  return `run_${randomUUID()}`;
}

export function buildIdempotencyKey({ clientId, articleId, operation, contentVersion }) {
  const required = { clientId, articleId, operation, contentVersion };
  for (const [key, value] of Object.entries(required)) {
    if (value === undefined || value === null || String(value).trim() === "") {
      throw new TypeError(`${key} is required`);
    }
  }

  const payload = [clientId, articleId, operation, contentVersion]
    .map((value) => String(value).trim())
    .join("|");
  return createHash("sha256").update(payload).digest("hex");
}

export function createAuditEvent({ runId, userId, role, clientId, articleId, operation, result, summary, errorCode = null, now = new Date() }) {
  const event = {
    event_id: `evt_${randomUUID()}`,
    run_id: runId,
    user_id: userId,
    role,
    client_id: clientId,
    article_id: articleId,
    operation,
    result,
    error_code: errorCode,
    summary,
    created_at: now.toISOString(),
  };

  for (const [key, value] of Object.entries(event)) {
    if (value === undefined) throw new TypeError(`${key} must be explicit`);
  }
  return Object.freeze(event);
}

export class InMemoryWorkflowGuard {
  #locks = new Map();
  #completed = new Map();

  begin(input, { ttlMs = 10 * 60 * 1000, now = Date.now() } = {}) {
    const idempotencyKey = buildIdempotencyKey(input);
    const previous = this.#completed.get(idempotencyKey);
    if (previous?.result === "SUCCESS") {
      return { accepted: false, reason: "ALREADY_COMPLETED", idempotencyKey, previousRunId: previous.runId };
    }

    const lockKey = `${input.clientId}|${input.articleId}|${input.operation}`;
    const current = this.#locks.get(lockKey);
    if (current && current.expiresAt > now) {
      return { accepted: false, reason: "LOCKED", idempotencyKey, activeRunId: current.runId };
    }

    const runId = createRunId();
    this.#locks.set(lockKey, { runId, expiresAt: now + ttlMs, idempotencyKey });
    return { accepted: true, runId, lockKey, idempotencyKey, expiresAt: now + ttlMs };
  }

  complete({ lockKey, runId, idempotencyKey, result }) {
    const lock = this.#locks.get(lockKey);
    if (!lock || lock.runId !== runId) throw new Error("LOCK_OWNERSHIP_MISMATCH");
    this.#completed.set(idempotencyKey, { runId, result });
    this.#locks.delete(lockKey);
  }

  release({ lockKey, runId }) {
    const lock = this.#locks.get(lockKey);
    if (lock?.runId === runId) this.#locks.delete(lockKey);
  }
}
