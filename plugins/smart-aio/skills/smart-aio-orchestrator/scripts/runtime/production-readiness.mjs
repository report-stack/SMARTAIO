// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.

const CHECK_DEFINITIONS = Object.freeze([
  { check_id: "LOCAL_RUNTIME_VERIFIED", owner: "SYSTEM", required: true, description: "全テスト、Plugin、Skillsの検証が成功している" },
  { check_id: "STANDARD_PROMPT_INTEGRITY", owner: "SYSTEM", required: true, description: "保護プロンプト原文とSHA-256が一致している" },
  { check_id: "WORKSPACE_PUBLISHED", owner: "WORKSPACE_ADMIN", required: true, description: "Smart AIOが対象Workspaceへ公開されている" },
  { check_id: "GOOGLE_CONNECTION_VERIFIED", owner: "WORKSPACE_ADMIN", required: true, description: "Drive読取、ファイル作成、Sheets更新が確認されている" },
  { check_id: "PRODUCTION_CLIENT_CONFIGURED", owner: "OPERATIONS_OWNER", required: true, description: "本番顧客の基本情報、保存先、一次情報、過去記事、権限が登録されている" },
  { check_id: "ARTICLE_ACCEPTANCE_PASSED", owner: "REVIEWER", required: true, description: "実記事1本がAIによる企画・執筆・品質確認・仕上げ、人の最終承認、Drive・Sheets出力を完了している" },
  { check_id: "MULTI_USER_CONSISTENCY_PASSED", owner: "OPERATIONS_OWNER", required: true, description: "2名以上で同じSkill版、プロンプト、保存先、品質基準が使われている" },
  { check_id: "CLIENT_ISOLATION_PASSED", owner: "SYSTEM", required: true, description: "別顧客の一次情報、記事、ニュースの混入が0件である" },
  { check_id: "SKILL_GOVERNANCE_PASSED", owner: "WORKSPACE_ADMIN", required: true, description: "Skill変更が自動適用されず、保護プロンプト変更案が拒否される" },
  { check_id: "OPERATIONS_OWNER_APPROVED", owner: "OPERATIONS_OWNER", required: true, description: "AI制作役・独立レビュー役と、人は完成物の最終確認・最終承認だけを行う運用ルールを責任者が承認している" },
  { check_id: "DAILY_AUTOMATIONS_PREPARED", owner: "OPERATIONS_OWNER", required: false, description: "顧客別ニュース・順位確認・週次/月次レポートのScheduled Tasks設定案が準備されている" },
  { check_id: "AHREFS_CONNECTED", owner: "WORKSPACE_ADMIN", required: false, description: "Ahrefs接続情報が設定されている" },
]);

const CHECK_INDEX = new Map(CHECK_DEFINITIONS.map((definition) => [definition.check_id, definition]));
const ALLOWED_STATUSES = new Set(["PENDING", "PASS", "FAIL", "BLOCKED", "NOT_APPLICABLE"]);

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function normalizeEvidence(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("READINESS_EVIDENCE_REQUIRED");
  return Object.freeze(value.map((item, index) => Object.freeze({
    evidence_type: requireText(item?.evidence_type || "NOTE", `evidence[${index}].evidence_type`),
    reference: requireText(item?.reference, `evidence[${index}].reference`),
    note: String(item?.note || "").trim(),
  })));
}

export function createProductionReadinessState(input = {}) {
  const clientId = requireText(input.client_id, "client_id");
  const createdAt = requireText(input.created_at || new Date().toISOString(), "created_at");
  return Object.freeze({
    readiness_id: requireText(input.readiness_id || `readiness_${clientId}`, "readiness_id"),
    client_id: clientId,
    skill_version: requireText(input.skill_version, "skill_version"),
    created_at: createdAt,
    updated_at: createdAt,
    checks: Object.freeze(Object.fromEntries(CHECK_DEFINITIONS.map((definition) => [definition.check_id, Object.freeze({
      ...definition,
      status: "PENDING",
      evidence: Object.freeze([]),
      actor_user_id: null,
      actor_role: null,
      observed_at: null,
    })]))),
  });
}

export function recordProductionReadinessEvidence(state, update = {}) {
  if (!state?.client_id || !state?.checks) throw new Error("INVALID_READINESS_STATE");
  if (String(update.client_id || "").trim() !== state.client_id) throw new Error("CROSS_CLIENT_DATA_DETECTED:production_readiness");
  const checkId = requireText(update.check_id, "check_id");
  const definition = CHECK_INDEX.get(checkId);
  if (!definition || !state.checks[checkId]) throw new Error(`UNKNOWN_READINESS_CHECK:${checkId}`);
  const status = requireText(update.status, "status").toUpperCase();
  if (!ALLOWED_STATUSES.has(status) || status === "PENDING") throw new Error(`INVALID_READINESS_STATUS:${status}`);
  if (definition.required && status === "NOT_APPLICABLE") throw new Error(`REQUIRED_CHECK_CANNOT_BE_NOT_APPLICABLE:${checkId}`);
  const actorRole = requireText(update.actor_role, "actor_role").toUpperCase();
  if (status === "PASS" && definition.owner !== "SYSTEM" && actorRole !== definition.owner && actorRole !== "WORKSPACE_OWNER") {
    throw new Error(`READINESS_APPROVER_ROLE_MISMATCH:${checkId}`);
  }
  const observedAt = requireText(update.observed_at || new Date().toISOString(), "observed_at");
  const evidence = normalizeEvidence(update.evidence);
  const nextCheck = Object.freeze({
    ...state.checks[checkId],
    status,
    evidence,
    actor_user_id: requireText(update.actor_user_id, "actor_user_id"),
    actor_role: actorRole,
    observed_at: observedAt,
  });
  return Object.freeze({
    ...state,
    updated_at: observedAt,
    checks: Object.freeze({ ...state.checks, [checkId]: nextCheck }),
  });
}

export function evaluateProductionReadiness(state) {
  if (!state?.client_id || !state?.checks) throw new Error("INVALID_READINESS_STATE");
  const checks = CHECK_DEFINITIONS.map((definition) => state.checks[definition.check_id]);
  const requiredChecks = checks.filter((check) => check.required);
  const passedRequired = requiredChecks.filter((check) => check.status === "PASS");
  const blockers = requiredChecks.filter((check) => check.status !== "PASS").map((check) => Object.freeze({
    check_id: check.check_id,
    status: check.status,
    owner: check.owner,
    description: check.description,
  }));
  const optionalPending = checks.filter((check) => !check.required && !new Set(["PASS", "NOT_APPLICABLE"]).has(check.status)).map((check) => check.check_id);
  return Object.freeze({
    readiness_id: state.readiness_id,
    client_id: state.client_id,
    skill_version: state.skill_version,
    decision: blockers.length === 0 ? "PRODUCTION_READY" : "NOT_READY",
    completion_percent: Math.floor((passedRequired.length / requiredChecks.length) * 100),
    required_passed: passedRequired.length,
    required_total: requiredChecks.length,
    blockers: Object.freeze(blockers),
    optional_pending: Object.freeze(optionalPending),
    evaluated_at: state.updated_at,
  });
}

export const PRODUCTION_READINESS_CHECKS = CHECK_DEFINITIONS;
