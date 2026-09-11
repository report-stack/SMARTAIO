import { buildSkillChangeProposal, curateSkillFeedback } from "./skill-improvement-loop.mjs";
import { requireClientId } from "./client-scope.mjs";

const PROTECTED_PROMPT_PATH = "references/content-v1/prompts.json";

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function assertClientItems(items, clientId, label) {
  if (!Array.isArray(items)) throw new TypeError(`${label} must be an array`);
  return Object.freeze(items.map((item, index) => {
    if (String(item?.client_id || "").trim() !== clientId) throw new Error(`CROSS_CLIENT_DATA_DETECTED:${label}[${index}]`);
    return Object.freeze({ ...item, client_id: clientId });
  }));
}

function rankDelta(item) {
  const previous = Number(item.previous_rank);
  const current = Number(item.current_rank);
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
  return previous - current;
}

function performanceIssue(item) {
  const delta = rankDelta(item);
  if (delta === null) return null;
  if (delta >= 3) return {
    outcome: "POSITIVE",
    rule: `順位改善パターン: ${item.keyword} の成功要因を再利用候補にする。`,
    detail: `${item.previous_rank}位から${item.current_rank}位へ改善`,
  };
  if (delta <= -3) return {
    outcome: "NEGATIVE",
    rule: `順位低下パターン: ${item.keyword} のタイトル、検索意図、本文更新余地を見直す。`,
    detail: `${item.previous_rank}位から${item.current_rank}位へ低下`,
  };
  return null;
}

function buildFeedback({ clientId, rankings, rewriteOutcomes, articleOutcomes }) {
  const rankingFeedback = rankings
    .map(performanceIssue)
    .filter(Boolean)
    .map((item) => ({
      client_id: clientId,
      skill_name: "article-production",
      stage: "PERFORMANCE_ANALYSIS",
      issue: item.rule,
      outcome: item.outcome,
    }));
  const rewriteFeedback = rewriteOutcomes.map((item) => ({
    client_id: clientId,
    skill_name: "article-production",
    stage: "REWRITE_ANALYSIS",
    issue: requireText(item.learning || item.summary || item.reason, "rewrite_outcome.learning"),
    outcome: String(item.outcome || "UNKNOWN").toUpperCase(),
  }));
  const articleFeedback = articleOutcomes.map((item) => ({
    client_id: clientId,
    skill_name: "article-production",
    stage: "ARTICLE_ANALYSIS",
    issue: requireText(item.learning || item.summary || item.reason, "article_outcome.learning"),
    outcome: String(item.outcome || "UNKNOWN").toUpperCase(),
  }));
  return Object.freeze([...rankingFeedback, ...rewriteFeedback, ...articleFeedback]);
}

export function analyzePerformanceFeedback(input = {}) {
  const clientId = requireClientId(input.client_id);
  const rankings = assertClientItems(input.rankings || [], clientId, "rankings");
  const rewriteOutcomes = assertClientItems(input.rewrite_outcomes || [], clientId, "rewrite_outcomes");
  const articleOutcomes = assertClientItems(input.article_outcomes || [], clientId, "article_outcomes");
  const feedback = buildFeedback({ clientId, rankings, rewriteOutcomes, articleOutcomes });
  const curated = curateSkillFeedback({
    skill_name: "article-production",
    minimum_occurrences: Number(input.minimum_occurrences || 2),
    feedback,
  });
  return Object.freeze({
    client_id: clientId,
    status: curated.status === "CHANGE_PROPOSAL_READY" ? "READY_FOR_IMPROVEMENT_PROPOSAL" : "INSUFFICIENT_REPEATED_EVIDENCE",
    feedback,
    reusable_rules: curated.reusable_rules,
    applies_automatically: false,
    next_step: curated.status === "CHANGE_PROPOSAL_READY"
      ? "propose-performance-skill-updateで管理者承認待ちの変更提案を作る"
      : "同じ傾向が2回以上出るまで分析記録を蓄積する",
  });
}

export function proposePerformanceSkillUpdate(input = {}) {
  const clientId = requireClientId(input.client_id);
  const analysis = input.analysis || analyzePerformanceFeedback(input);
  if (analysis.client_id !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:performance_analysis");
  const reusableRules = Array.isArray(analysis.reusable_rules) ? analysis.reusable_rules : [];
  if (!reusableRules.length) throw new Error("REUSABLE_PERFORMANCE_RULE_REQUIRED");
  const changes = reusableRules.map((rule, index) => ({
    path: input.target_path || "skills/article-production/references/article-contract.md",
    reason: `実績分析から再利用可能な制作ルール候補を追加: ${rule.rule}`,
    change_type: "PROPOSE_RULE_APPEND",
    prompt_value_integrity: "SHA256_UNCHANGED",
    proposal_order: index + 1,
  }));
  const proposal = buildSkillChangeProposal({
    proposal_id: requireText(input.proposal_id || `performance_update_${clientId}_${Date.now()}`, "proposal_id"),
    skill_name: "article-production",
    current_version: requireText(input.current_version, "current_version"),
    source_run_ids: input.source_run_ids || [],
    proposed_changes: changes,
  });
  return Object.freeze({
    ...proposal,
    client_id: clientId,
    status: proposal.status,
    analysis_status: analysis.status,
    applies_automatically: false,
    requires_admin_approval: true,
    protected_prompt_update_policy: "NEVER_AUTO_EDIT_PROTECTED_PROMPTS",
    protected_prompt_path: PROTECTED_PROMPT_PATH,
    release_gate: "ADMIN_APPROVAL_AND_TESTS_REQUIRED",
  });
}
