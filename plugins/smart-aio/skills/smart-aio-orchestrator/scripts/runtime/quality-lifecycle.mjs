const BASE_MECHANICAL_CHECKS = Object.freeze(["typos", "numbers", "proper_nouns", "prohibited_expressions", "format", "source_and_link_existence"]);
const FINAL_MECHANICAL_CHECKS = Object.freeze([...BASE_MECHANICAL_CHECKS, "tag_section"]);

const STAGES = Object.freeze({
  DIRECTION: Object.freeze({
    label: "方向性",
    humanApprovalRequired: false,
    categories: Object.freeze({ search_intent: 25, client_fit: 20, article_metadata: 15, originality: 20, feasibility: 20 }),
    requiredArtifacts: Object.freeze(["target_reader", "search_intent", "article_goal", "article_category", "hashtags"]),
    mechanicalChecks: BASE_MECHANICAL_CHECKS,
  }),
  OUTLINE: Object.freeze({
    label: "骨子",
    humanApprovalRequired: false,
    categories: Object.freeze({ logical_structure: 25, responsibility_scope: 20, evidence_plan: 20, article_metadata: 10, originality: 15, internal_link_plan: 10 }),
    requiredArtifacts: Object.freeze(["headings", "conclusion", "evidence_plan", "article_category", "hashtags"]),
    mechanicalChecks: BASE_MECHANICAL_CHECKS,
  }),
  DRAFT: Object.freeze({
    label: "本文・制作",
    humanApprovalRequired: false,
    categories: Object.freeze({ factuality: 30, search_intent: 20, client_fit: 15, readability: 15, responsibility_scope: 10, internal_links: 10 }),
    requiredArtifacts: Object.freeze(["content", "sources_used"]),
    mechanicalChecks: BASE_MECHANICAL_CHECKS,
  }),
  FINAL: Object.freeze({
    label: "完成物",
    humanApprovalRequired: false,
    categories: Object.freeze({ factuality: 25, completeness: 18, consistency: 12, readability: 15, visual_quality: 10, internal_links: 10, output_format: 5, article_metadata: 5 }),
    requiredArtifacts: Object.freeze(["content", "sources_used", "internal_links", "visual_assets", "article_category", "hashtags", "rendered_tag_section"]),
    mechanicalChecks: FINAL_MECHANICAL_CHECKS,
  }),
});

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function assertClientItems(items, clientId, label) {
  for (const item of items || []) {
    if (String(item?.client_id || "").trim() !== clientId) throw new Error(`CROSS_CLIENT_DATA_DETECTED:${label}`);
  }
  return items || [];
}

function hasArtifact(artifacts, key) {
  const value = artifacts?.[key];
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(String(value ?? "").trim());
}

export function prepareStageReview(input = {}) {
  const clientId = requireText(input.client_id, "client_id");
  const articleId = requireText(input.article_id, "article_id");
  const stageKey = requireText(input.stage, "stage").toUpperCase();
  const stage = STAGES[stageKey];
  if (!stage) throw new Error(`UNKNOWN_REVIEW_STAGE:${stageKey}`);
  const producerRunId = requireText(input.producer_run_id, "producer_run_id");
  const reviewRunId = requireText(input.review_run_id, "review_run_id");
  if (producerRunId === reviewRunId) throw new Error("INDEPENDENT_REVIEW_RUN_REQUIRED");

  const artifacts = input.artifacts || {};
  const missingArtifacts = stage.requiredArtifacts.filter((key) => !hasArtifact(artifacts, key));
  const priorFeedback = assertClientItems(input.prior_feedback || [], clientId, "prior_feedback")
    .filter((item) => !item.stage || String(item.stage).toUpperCase() === stageKey)
    .map((item) => ({ feedback_id: item.feedback_id, rule: item.rule, severity: item.severity || "NORMAL" }));

  return Object.freeze({
    client_id: clientId,
    article_id: articleId,
    stage: stageKey,
    stage_label: stage.label,
    producer_run_id: producerRunId,
    review_run_id: reviewRunId,
    review_role: "INDEPENDENT_EVALUATOR",
    status: missingArtifacts.length ? "BLOCKED_MISSING_ARTIFACT" : "PENDING_AI_REVIEW",
    missing_artifacts: missingArtifacts,
    mechanical_check_scope: stage.mechanicalChecks,
    qualitative_categories: stage.categories,
    historical_feedback: priorFeedback,
    final_approval_required: stage.humanApprovalRequired,
  });
}

export function evaluateStageReview(input = {}) {
  const plan = prepareStageReview(input);
  if (plan.missing_artifacts.length) return plan;
  const checks = (input.mechanical_checks || []).map((check) => ({
    key: requireText(check.key, "mechanical_checks.key"),
    passed: check.passed === true,
    critical: check.critical === true,
    detail: check.detail ?? null,
  }));
  const missingMechanicalChecks = plan.mechanical_check_scope.filter((key) => !checks.some((check) => check.key === key));
  const scoreInput = input.qualitative_scores || {};
  const categoryScores = {};
  const invalidScores = [];
  for (const [key, maximum] of Object.entries(plan.qualitative_categories)) {
    const value = Number(scoreInput[key]);
    if (!Number.isFinite(value) || value < 0 || value > maximum) invalidScores.push(key);
    else categoryScores[key] = value;
  }
  const totalScore = Object.values(categoryScores).reduce((sum, score) => sum + score, 0);
  const criticalViolation = checks.some((check) => check.critical && !check.passed);
  const issues = Array.isArray(input.issues) ? input.issues : [];
  const passScore = Number(input.pass_score || 80);
  const complete = missingMechanicalChecks.length === 0 && invalidScores.length === 0;
  const result = complete && !criticalViolation && checks.every((check) => check.passed) && totalScore >= passScore ? "PASS" : "REVISE";

  return Object.freeze({
    ...plan,
    status: result,
    result,
    total_score: totalScore,
    pass_score: passScore,
    critical_violation: criticalViolation,
    mechanical_checks: checks,
    missing_mechanical_checks: missingMechanicalChecks,
    category_scores: categoryScores,
    invalid_score_categories: invalidScores,
    issues,
    feedback_candidates: issues.map((issue, index) => ({
      client_id: plan.client_id,
      article_id: plan.article_id,
      stage: plan.stage,
      feedback_id: issue.feedback_id || `${plan.review_run_id}:${index + 1}`,
      rule: issue.rule || issue.recommendation || issue.reason || String(issue),
      severity: issue.severity || "NORMAL",
    })),
  });
}

export const QUALITY_REVIEW_STAGES = Object.freeze(Object.keys(STAGES));
