// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.
import { prepareArticleRun } from "../../../article-production/scripts/article_workflow.mjs";
import { reviewArticle } from "../../../article-quality-review/scripts/review_article.mjs";
import { createAuditEvent, InMemoryWorkflowGuard } from "./workflow-guard.mjs";
import { requireFinalApproval } from "./approval-gate.mjs";
import { SMART_AIO_PLUGIN_VERSION } from "./version.mjs";

const AI_SCORE_WEIGHTS = Object.freeze({
  factuality: 25,
  search_intent: 20,
  client_fit: 15,
  responsibility_and_duplication: 15,
  internal_links: 10,
  readability: 10,
  output_format: 5,
});

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function normalizeAiReview(aiReview = {}) {
  const categoryScores = aiReview.category_scores || {};
  const normalized = {};

  for (const [key, maximum] of Object.entries(AI_SCORE_WEIGHTS)) {
    const score = Number(categoryScores[key]);
    if (!Number.isFinite(score) || score < 0 || score > maximum) {
      throw new TypeError(`ai_review.category_scores.${key} must be between 0 and ${maximum}`);
    }
    normalized[key] = score;
  }

  const totalScore = Object.values(normalized).reduce((sum, score) => sum + score, 0);
  return Object.freeze({
    total_score: totalScore,
    category_scores: Object.freeze(normalized),
    issues: Array.isArray(aiReview.issues) ? aiReview.issues : [],
    reviewed_by: requireText(aiReview.reviewed_by, "ai_review.reviewed_by"),
  });
}

export async function runArticleDraftWorkflow(input, { guard = new InMemoryWorkflowGuard(), now = new Date() } = {}) {
  const clientId = requireText(input.client_id, "client_id");
  const articleId = requireText(input.article?.article_id, "article.article_id");
  const contentVersion = requireText(input.content_version, "content_version");
  const userId = requireText(input.user_id, "user_id");
  const role = requireText(input.role, "role");
  const operation = "CREATE_ARTICLE_DRAFT";
  const lock = guard.begin({ clientId, articleId, operation, contentVersion }, { now: now.getTime() });

  if (!lock.accepted) {
    return Object.freeze({
      client_id: clientId,
      article_id: articleId,
      smart_aio_plugin_version: SMART_AIO_PLUGIN_VERSION,
      workflow_status: lock.reason,
      idempotency_key: lock.idempotencyKey,
      previous_run_id: lock.previousRunId || null,
      active_run_id: lock.activeRunId || null,
    });
  }

  try {
    const preparation = await prepareArticleRun(input);
    if (["SITE_DUPLICATE_DECISION_REQUIRED", "ALTERNATIVE_ARTICLE_REQUIRED"].includes(preparation.status)) {
      const decisionRequired = preparation.status === "SITE_DUPLICATE_DECISION_REQUIRED";
      const auditEvent = createAuditEvent({
        runId: lock.runId,
        userId,
        role,
        clientId,
        articleId,
        operation,
        result: decisionRequired ? "DECISION_REQUIRED" : "ALTERNATIVE_REQUIRED",
        summary: decisionRequired
          ? "公式サイトの公開記事と近いため、このまま進めるか別記事にするかの選択待ち"
          : "利用者が別記事を選択したため、検索意図と責任範囲を変えた再企画待ち",
        errorCode: decisionRequired ? "SITE_DUPLICATE_DECISION_REQUIRED" : "ALTERNATIVE_ARTICLE_REQUIRED",
        now,
      });
      guard.release(lock);
      return Object.freeze({
        client_id: clientId,
        article_id: articleId,
        smart_aio_plugin_version: SMART_AIO_PLUGIN_VERSION,
        run_id: lock.runId,
        idempotency_key: lock.idempotencyKey,
        workflow_status: preparation.status,
        preparation,
        duplicate_decision: preparation.context_packet?.site_duplicate_decision || null,
        human_choice_required: decisionRequired,
        publish_allowed: false,
        audit_events: [auditEvent],
      });
    }
    if (preparation.status === "BLOCKED") {
      const auditEvent = createAuditEvent({
        runId: lock.runId,
        userId,
        role,
        clientId,
        articleId,
        operation,
        result: "BLOCKED",
        summary: "重複判定により記事生成を停止",
        errorCode: "DUPLICATE_ARTICLE",
        now,
      });
      guard.complete({ ...lock, result: "SUCCESS" });
      return Object.freeze({
        client_id: clientId,
        article_id: articleId,
        smart_aio_plugin_version: SMART_AIO_PLUGIN_VERSION,
        run_id: lock.runId,
        idempotency_key: lock.idempotencyKey,
        workflow_status: "BLOCKED",
        preparation,
        audit_events: [auditEvent],
      });
    }

    const deterministicReview = reviewArticle({
      client_id: clientId,
      article: input.article,
      content: input.content,
      existingArticles: input.existingArticles || [],
      sourceCatalog: input.sources || [],
      sourcesUsed: input.sources_used || [],
      internalLinksUsed: input.internal_links_used || [],
      clientRules: input.client_rules || {},
      currentYear: input.currentYear,
      passScore: input.pass_score || 80,
    });
    const aiReview = normalizeAiReview(input.ai_review);
    const aiPass = aiReview.total_score >= Number(input.pass_score || 80);
    const passed = deterministicReview.deterministic_result === "PASS" && !deterministicReview.critical_violation && aiPass;
    const workflowStatus = passed ? "AI_REVIEW_PASSED_AWAITING_FINAL_APPROVAL" : "REVISE";
    const auditEvent = createAuditEvent({
      runId: lock.runId,
      userId,
      role,
      clientId,
      articleId,
      operation,
      result: passed ? "SUCCESS" : "REVISE",
      summary: passed
        ? `記事下書きとAIレビューが完了（${aiReview.total_score}点、FINAL_APPROVAL待ち）`
        : `記事下書きは修正が必要（${aiReview.total_score}点）`,
      now,
    });

    guard.complete({ ...lock, result: "SUCCESS" });
    return Object.freeze({
      client_id: clientId,
      article_id: articleId,
      smart_aio_plugin_version: SMART_AIO_PLUGIN_VERSION,
      run_id: lock.runId,
      idempotency_key: lock.idempotencyKey,
      workflow_status: workflowStatus,
      prompt_version: preparation.prompt_version,
      prompt_key: preparation.prompt_key,
      prompt_sha256: preparation.prompt_sha256,
      context_packet: preparation.context_packet,
      plan_review: preparation.plan_review,
      deterministic_review: deterministicReview,
      ai_review: aiReview,
      final_approval_required: true,
      publish_allowed: false,
      content_version: contentVersion,
      sources_used: input.sources_used || [],
      internal_links_used: input.internal_links_used || [],
      audit_events: [auditEvent],
    });
  } catch (error) {
    guard.release(lock);
    throw error;
  }
}

export function releaseArticleForPublication(draft, approvals, { now = new Date() } = {}) {
  if (draft?.workflow_status !== "AI_REVIEW_PASSED_AWAITING_FINAL_APPROVAL") {
    throw new Error("ARTICLE_NOT_READY_FOR_FINAL_APPROVAL");
  }
  if (draft?.deterministic_review?.deterministic_result !== "PASS" || draft?.deterministic_review?.critical_violation) {
    throw new Error("ARTICLE_REVIEW_NOT_PASSED");
  }
  const requiredScore = Number(approvals?.pass_score || 80);
  if (Number(draft?.ai_review?.total_score) < requiredScore) throw new Error("AI_REVIEW_SCORE_TOO_LOW");

  const finalApproval = requireFinalApproval(approvals, draft);
  const publishAudit = createAuditEvent({
    runId: draft.run_id,
    userId: finalApproval.approver_user_id,
    role: finalApproval.approver_role,
    clientId: draft.client_id,
    articleId: draft.article_id,
    operation: "AUTHORIZE_PUBLICATION",
    result: "SUCCESS",
    summary: "FINAL_APPROVALを確認し、公開可能状態へ移行",
    now,
  });

  return Object.freeze({
    ...draft,
    workflow_status: "READY_TO_PUBLISH",
    final_approval_required: false,
    publish_allowed: true,
    approvals: Object.freeze({ final_approval: finalApproval }),
    audit_events: Object.freeze([...(draft.audit_events || []), publishAudit]),
  });
}
