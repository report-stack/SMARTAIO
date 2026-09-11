import { verifyArticleVisualPersistence } from "./image-persistence.mjs";
import { verifyInternalLinkGraph, verifyStructuredMarkupOutput } from "./content-optimization.mjs";

const FLOW = Object.freeze(["KW_RESEARCH", "OUTLINE_AI_REVIEW", "DRAFTING", "FACT_CHECK", "FINISHING", "AWAITING_FINAL_APPROVAL", "READY_TO_PUBLISH"]);

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function requireArray(value, name, minimum = 1) {
  if (!Array.isArray(value) || value.length < minimum) throw new Error(`${name}_REQUIRED`);
  return value;
}

function assertScope(state, completion) {
  if (String(completion.client_id || "").trim() !== state.client_id) throw new Error("CROSS_CLIENT_DATA_DETECTED:article_lifecycle");
  if (String(completion.article_id || "").trim() !== state.article_id) throw new Error("ARTICLE_SCOPE_MISMATCH");
  if (String(completion.stage || "").toUpperCase() !== state.current_stage) throw new Error("ARTICLE_STAGE_MISMATCH");
}

function requireApproval(approval, stage, state) {
  if (!approval || approval.approval_status !== "APPROVED") throw new Error(`APPROVAL_REQUIRED:${stage}`);
  if (String(approval.stage || "").toUpperCase() !== stage) throw new Error(`APPROVAL_STAGE_MISMATCH:${stage}`);
  if (String(approval.client_id || "").trim() !== state.client_id || String(approval.article_id || "").trim() !== state.article_id) {
    throw new Error(`APPROVAL_SCOPE_MISMATCH:${stage}`);
  }
}

function validateCompletion(state, completion) {
  switch (state.current_stage) {
    case "KW_RESEARCH":
      requireArray(completion.keywords, "KEYWORDS");
      requireArray(completion.search_insights, "SEARCH_INSIGHTS");
      requireText(completion.measured_at, "measured_at");
      break;
    case "OUTLINE_AI_REVIEW":
      requireText(completion.originality_statement, "originality_statement");
      requireArray(completion.headings, "HEADINGS", 2);
      requireArray(completion.evidence_plan, "EVIDENCE_PLAN");
      if (completion.stage_review?.result !== "PASS" || completion.stage_review?.stage !== "OUTLINE") throw new Error("OUTLINE_AI_REVIEW_REQUIRED");
      requireText(completion.stage_review?.producer_run_id, "stage_review.producer_run_id");
      requireText(completion.stage_review?.reviewer_run_id, "stage_review.reviewer_run_id");
      if (completion.stage_review.producer_run_id === completion.stage_review.reviewer_run_id) throw new Error("INDEPENDENT_PLAN_REVIEW_REQUIRED");
      break;
    case "DRAFTING":
      requireText(completion.content, "content");
      if (completion.prompt_version !== "content-v1" || !completion.prompt_sha256) throw new Error("STANDARD_PROMPT_PROOF_REQUIRED");
      if (completion.stage_review?.result !== "PASS" || completion.stage_review?.stage !== "DRAFT") throw new Error("DRAFT_AI_REVIEW_REQUIRED");
      break;
    case "FACT_CHECK":
      requireArray(completion.facts_checked, "FACTS_CHECKED");
      requireArray(completion.sources_checked, "SOURCES_CHECKED");
      if (completion.unverified_claims?.length) throw new Error("UNVERIFIED_CLAIMS_REMAIN");
      if (!completion.producer_run_id || !completion.reviewer_run_id || completion.producer_run_id === completion.reviewer_run_id) {
        throw new Error("INDEPENDENT_FACT_CHECK_REQUIRED");
      }
      break;
    case "FINISHING":
      requireArray(completion.internal_links, "INTERNAL_LINKS");
      requireArray(completion.visual_assets?.figure_instructions, "FIGURE_INSTRUCTIONS");
      requireText(completion.visual_assets?.eye_catch, "visual_assets.eye_catch");
      verifyInternalLinkGraph(completion.internal_link_graph, state);
      verifyStructuredMarkupOutput(completion.structured_markup, state);
      verifyArticleVisualPersistence(completion.visual_assets?.image_persistence, state);
      if (completion.stage_review?.result !== "PASS" || completion.stage_review?.stage !== "FINAL") throw new Error("FINAL_AI_REVIEW_REQUIRED");
      break;
    case "AWAITING_FINAL_APPROVAL":
      requireApproval(completion.final_approval, "FINAL_APPROVAL", state);
      break;
    default:
      throw new Error(`STAGE_CANNOT_ADVANCE:${state.current_stage}`);
  }
}

export function createArticleProductionLifecycle(input = {}) {
  return Object.freeze({
    client_id: requireText(input.client_id, "client_id"),
    article_id: requireText(input.article_id, "article_id"),
    current_stage: "KW_RESEARCH",
    completed_stages: Object.freeze([]),
    stage_outputs: Object.freeze({}),
    content_prompt_policy: "IMMUTABLE_SHA256_VERIFIED",
    separate_creator_and_evaluator: true,
    final_approval_required: true,
  });
}

export function advanceArticleProductionLifecycle(state, completion = {}) {
  if (!state || !FLOW.includes(state.current_stage)) throw new Error("INVALID_ARTICLE_LIFECYCLE_STATE");
  assertScope(state, completion);
  validateCompletion(state, completion);
  const index = FLOW.indexOf(state.current_stage);
  const nextStage = FLOW[index + 1];
  return Object.freeze({
    ...state,
    current_stage: nextStage,
    completed_stages: Object.freeze([...(state.completed_stages || []), state.current_stage]),
    stage_outputs: Object.freeze({ ...(state.stage_outputs || {}), [state.current_stage]: completion }),
    publish_allowed: nextStage === "READY_TO_PUBLISH",
  });
}

export const ARTICLE_PRODUCTION_STAGES = FLOW;
