// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.
import { randomUUID } from "node:crypto";

const STAGE_ROLES = Object.freeze({
  FINAL_APPROVAL: new Set(["admin", "reviewer", "publisher", "human-approver"]),
});

const FINAL_DECISIONS = new Set(["APPROVED", "REJECTED"]);

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function assertSame(actual, expected, label) {
  if (requireText(actual, label) !== requireText(expected, `expected_${label}`)) {
    if (label === "client_id") throw new Error("CROSS_CLIENT_DATA_DETECTED:approval");
    throw new Error(`APPROVAL_SCOPE_MISMATCH:${label}`);
  }
}

export function normalizeApprovalDecision(input, expected = {}) {
  const stage = requireText(input?.stage, "approval.stage").toUpperCase();
  const approvalStatus = requireText(input?.approval_status, "approval.approval_status").toUpperCase();
  const approverRole = requireText(input?.approver_role, "approval.approver_role").toLowerCase();
  if (!STAGE_ROLES[stage]) throw new Error(`UNKNOWN_APPROVAL_STAGE:${stage}`);
  if (!FINAL_DECISIONS.has(approvalStatus)) throw new Error(`UNKNOWN_APPROVAL_STATUS:${approvalStatus}`);
  if (!STAGE_ROLES[stage].has(approverRole)) throw new Error(`APPROVER_ROLE_NOT_ALLOWED:${stage}`);

  const approvedAt = requireText(input?.approved_at, "approval.approved_at");
  if (Number.isNaN(Date.parse(approvedAt))) throw new TypeError("approval.approved_at must be an ISO date-time");

  const normalized = {
    approval_id: input.approval_id ? requireText(input.approval_id, "approval.approval_id") : `apr_${randomUUID()}`,
    client_id: requireText(input.client_id, "approval.client_id"),
    article_id: requireText(input.article_id, "approval.article_id"),
    run_id: input.run_id ? requireText(input.run_id, "approval.run_id") : null,
    stage,
    approval_status: approvalStatus,
    approver_user_id: requireText(input.approver_user_id, "approval.approver_user_id"),
    approver_role: approverRole,
    content_version: requireText(input.content_version, "approval.content_version"),
    reason: String(input.reason || "").trim(),
    approved_at: new Date(approvedAt).toISOString(),
  };

  if (expected.stage) assertSame(normalized.stage, String(expected.stage).toUpperCase(), "stage");
  if (expected.client_id) assertSame(normalized.client_id, expected.client_id, "client_id");
  if (expected.article_id) assertSame(normalized.article_id, expected.article_id, "article_id");
  if (expected.run_id) assertSame(normalized.run_id, expected.run_id, "run_id");
  if (expected.content_version) assertSame(normalized.content_version, expected.content_version, "content_version");

  return Object.freeze(normalized);
}

export function requireApprovedDecision(input, expected = {}) {
  const decision = normalizeApprovalDecision(input, expected);
  if (decision.approval_status !== "APPROVED") {
    throw new Error(`APPROVAL_REQUIRED:${decision.stage}`);
  }
  return decision;
}

export function requireFinalApproval({ final_approval }, draft) {
  const expected = {
    client_id: draft.client_id,
    article_id: draft.article_id,
    run_id: draft.run_id,
    content_version: draft.content_version,
  };
  return requireApprovedDecision(final_approval, { ...expected, stage: "FINAL_APPROVAL" });
}

export class InMemoryApprovalLedger {
  #records = new Map();

  record(input) {
    const decision = normalizeApprovalDecision(input);
    const key = [decision.client_id, decision.article_id, decision.stage, decision.content_version].join("|");
    const previous = this.#records.get(key);
    if (previous) {
      const identical = previous.approval_status === decision.approval_status
        && previous.approver_user_id === decision.approver_user_id
        && previous.approver_role === decision.approver_role;
      if (identical) return Object.freeze({ accepted: false, reason: "ALREADY_RECORDED", decision: previous });
      throw new Error(`APPROVAL_ALREADY_FINAL:${decision.stage}`);
    }
    this.#records.set(key, decision);
    return Object.freeze({ accepted: true, decision });
  }
}
