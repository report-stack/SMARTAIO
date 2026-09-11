#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { verifyContentPromptRegistry } from "../../content-prompts/scripts/content_prompt_registry.mjs";
import {
  analyzeTitleQuality,
  analyzeDuplicateRisk,
  buildExpectedArticleUrl,
  buildStandardArticleIdeaPrompt,
  finalizeStandardArticleIdeaOutput,
  planStandardArticleIdea,
  prepareArticleRun,
  resolveArticleCategory,
  selectInternalLinkCandidates,
  validateStandardArticleIdeaOutput,
} from "../../article-production/scripts/article_workflow.mjs";
import { reviewArticle } from "../../article-quality-review/scripts/review_article.mjs";
import {
  buildStandardBasicInfoPrompt,
  buildStandardSiteTitlePrompt,
  prepareStandardImageSet,
} from "./runtime/content-runtime.mjs";
import { runArticleDraftWorkflow, releaseArticleForPublication } from "./runtime/article-e2e.mjs";
import {
  applyBatchStep,
  createBatchState,
  determineNextBatchStep,
  failBatchStep,
  resumeBatch,
  stopBatch,
} from "./runtime/batch-orchestrator.mjs";
import { createDeletionPlan, authorizeDeletion } from "./runtime/deletion-plan.mjs";
import { createNewsProposal, decideNewsProposal } from "./runtime/news-proposal.mjs";
import { prepareNewsInbox, prepareRankingRequests } from "./runtime/news-ranking-scheduler.mjs";
import { prepareAhrefsConnection } from "./runtime/ahrefs-preparation.mjs";
import { evaluateStageReview, prepareStageReview } from "./runtime/quality-lifecycle.mjs";
import { advanceArticleProductionLifecycle, createArticleProductionLifecycle } from "./runtime/article-production-lifecycle.mjs";
import {
  authorizeSkillChange,
  buildSkillChangeProposal,
  curateSkillFeedback,
  evaluateSkillDefinition,
  evaluateSkillRun,
  planSkillDesign,
} from "./runtime/skill-improvement-loop.mjs";
import {
  createProductionReadinessState,
  evaluateProductionReadiness,
  recordProductionReadinessEvidence,
} from "./runtime/production-readiness.mjs";
import { authorizeScheduledTask, createScheduledTaskPlan } from "./runtime/scheduled-task-plan.mjs";
import { prepareArticleCompletionReport } from "./runtime/completion-report.mjs";
import { verifyArticleVisualPersistence, verifyImagePersistence } from "./runtime/image-persistence.mjs";
import { auditStandardClientRun, verifyArticleDocumentReadbackEvidence } from "./runtime/standard-run-audit.mjs";
import {
  prepareAdditionalPlanConfirmationIdeas,
  preparePlanConfirmationSheet,
  selectNextApprovedPlan,
  validatePlanConfirmationCandidates,
} from "./runtime/plan-confirmation-queue.mjs";
import { createPerformanceReport, createReportSchedulePlan } from "./runtime/performance-reporting.mjs";
import { analyzePerformanceFeedback, proposePerformanceSkillUpdate } from "./runtime/performance-feedback-loop.mjs";
import {
  buildStructuredMarkupOutput,
  planInternalLinkGraph,
  prepareInternalLinkSheetOutput,
  prepareRewriteArtifactOutput,
  prepareRewritePlan,
  verifyInternalLinkGraph,
  verifyStructuredMarkupOutput,
} from "./runtime/content-optimization.mjs";
import {
  completeStandardClusterBatch,
  getSystemFeatures,
  prepareStandardBatchNotification,
  prepareClientArticleSheetUpdate,
  prepareClientNewsSettingsTemplate,
  prepareClientProductionSheet,
  prepareClientSourceRegister,
  prepareStandardCategorySlugGeneration,
  prepareStandardArticleRecordUpdate,
  prepareStandardClientOnboarding,
  prepareStandardClusterBatch,
  prepareStandardDocumentOutput,
  prepareStandardSpreadsheetExport,
  validateStandardBasicInfoOutput,
  validateClientProductionSheet,
  validateClientSourceRegister,
  validateStandardCategorySlugOutput,
  validateStandardSiteTitleOutput,
} from "./runtime/system-contract.mjs";

export const SMART_AIO_CAPABILITIES = Object.freeze([
  "protected-prompt-verification",
  "basic-information",
  "site-title",
  "article-idea-and-writing",
  "reader-attractive-title-refinement-and-validation",
  "registered-article-category-and-permalink-validation",
  "article-category-and-hashtag-confirmation-gate",
  "google-doc-visible-tag-section-gate",
  "duplicate-prevention-and-internal-links",
  "internal-link-graph-and-reciprocal-update-plan",
  "internal-link-sheet-shows-actual-urls",
  "contextual-body-internal-link-placement-gate",
  "ranking-based-auto-rewrite-plan",
  "official-site-duplicate-human-choice",
  "title-image-plus-three-photo-set",
  "diagram-image-output",
  "structured-markup-jsonld-output",
  "structured-markup-wordpress-copy-output",
  "deterministic-and-ai-review",
  "approval-and-idempotency",
  "multi-article-batch",
  "client-scoped-news-and-ranking",
  "recoverable-deletion",
  "four-stage-independent-quality-review",
  "five-stage-article-production-lifecycle",
  "admin-approved-skill-improvement-loop",
  "evidence-based-production-readiness-gate",
  "client-scoped-scheduled-task-planning",
  "minimal-client-onboarding",
  "client-plan-confirmation-sheet-gate",
  "client-plan-confirmation-queue",
  "article-creation-user-confirmation-gate",
  "client-plan-confirmation-duplicate-validation",
  "client-plan-confirmation-additional-50",
  "basic-info-output-validation",
  "article-idea-planning-and-retry",
  "cluster-sheet-generation",
  "article-record-editing",
  "google-doc-output-contract",
  "current-sheet-xlsx-export",
  "manual-category-slug-generation",
  "batch-notification-payload",
  "client-scoped-production-workbook",
  "client-scoped-source-register",
  "new-client-disabled-news-settings-template",
  "standard-client-run-audit-before-completion-report",
  "google-doc-readback-bound-to-document-images-links-and-tags",
  "article-completion-report-with-drive-and-sheet-links",
  "actual-title-image-and-three-photo-persistence-gate",
  "template-and-local-script-image-rejection-gate",
  "image-folder-png-only-gate",
  "actual-diagram-image-persistence-gate",
  "diagram-source-highlight-and-source-derived-text-gate",
  "independent-original-image-diagram-visual-quality-gate",
  "structured-markup-persistence-gate",
  "same-article-folder-rewrite-artifact-output",
  "weekly-and-monthly-performance-reporting",
  "performance-based-skill-improvement-proposals",
  "protected-prompt-auto-update-blocked-by-admin-gate",
]);

export async function verifySmartAioSkillRuntime() {
  const prompts = await verifyContentPromptRegistry();
  return Object.freeze({
    status: "READY",
    runtime: "SMART_AIO_SKILLS_ONLY",
    openai_api_calls: false,
    protected_prompts: prompts,
    capabilities: SMART_AIO_CAPABILITIES,
  });
}

function requireProductionArticleCategoryRegistry(input) {
  const categories = Array.isArray(input?.articleCategories) ? input.articleCategories : [];
  if (categories.length !== 20) throw new Error(`ARTICLE_CATEGORY_REGISTRY_REQUIRES_20:${categories.length}`);
  const names = [];
  const slugs = [];
  for (const category of categories) {
    const name = String(category?.name || "").trim();
    const slug = String(category?.slug || "").trim();
    if (!name) throw new Error("ARTICLE_CATEGORY_NAME_REQUIRED");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`ARTICLE_CATEGORY_SLUG_INVALID:${name}`);
    names.push(name);
    slugs.push(slug);
  }
  if (new Set(names).size !== names.length) throw new Error("ARTICLE_CATEGORY_NAME_DUPLICATED");
  if (new Set(slugs).size !== slugs.length) throw new Error("ARTICLE_CATEGORY_SLUG_DUPLICATED");
  return input;
}

export async function runSmartAioCommand(command, input = {}) {
  switch (command) {
    case "verify": return verifySmartAioSkillRuntime();
    case "system-contract-report": return getSystemFeatures();
    case "prepare-client-production-sheet": return prepareClientProductionSheet(input);
    case "validate-client-production-sheet": return validateClientProductionSheet(input);
    case "prepare-plan-confirmation-sheet": return preparePlanConfirmationSheet(input);
    case "validate-plan-confirmation-candidates": return validatePlanConfirmationCandidates(input);
    case "select-next-approved-plan": return selectNextApprovedPlan(input);
    case "prepare-additional-plan-confirmation-ideas": return prepareAdditionalPlanConfirmationIdeas(input);
    case "prepare-client-source-register": return prepareClientSourceRegister(input);
    case "validate-client-source-register": return validateClientSourceRegister(input);
    case "prepare-client-article-sheet-update": return prepareClientArticleSheetUpdate(input);
    case "prepare-news-settings-template": return prepareClientNewsSettingsTemplate(input);
    case "prepare-client-onboarding": return prepareStandardClientOnboarding(input);
    case "prepare-basic-info": return buildStandardBasicInfoPrompt(input);
    case "validate-basic-info": return validateStandardBasicInfoOutput(input);
    case "prepare-site-title": return buildStandardSiteTitlePrompt(input);
    case "validate-site-title": return validateStandardSiteTitleOutput(input);
    case "prepare-category-slugs": return prepareStandardCategorySlugGeneration(input);
    case "validate-category-slugs": return validateStandardCategorySlugOutput(input);
    case "prepare-images": return prepareStandardImageSet(input);
    case "plan-idea": return planStandardArticleIdea(input);
    case "prepare-idea": return { client_id: input.client_id, ...(await buildStandardArticleIdeaPrompt(requireProductionArticleCategoryRegistry(input))) };
    case "analyze-title": return analyzeTitleQuality(input);
    case "resolve-article-category": return resolveArticleCategory(input);
    case "build-expected-article-url": return buildExpectedArticleUrl(input);
    case "validate-ideas": return validateStandardArticleIdeaOutput(requireProductionArticleCategoryRegistry(input));
    case "finalize-idea": return finalizeStandardArticleIdeaOutput(requireProductionArticleCategoryRegistry(input));
    case "prepare-article": return prepareArticleRun(input);
    case "prepare-article-record-update": return prepareStandardArticleRecordUpdate(input);
    case "prepare-document-output": return prepareStandardDocumentOutput(input);
    case "prepare-completion-report": return prepareArticleCompletionReport(input);
    case "audit-client-run": return auditStandardClientRun(input);
    case "verify-article-document-readback": return verifyArticleDocumentReadbackEvidence(input);
    case "verify-image-persistence": return verifyImagePersistence(input);
    case "verify-article-visual-persistence": return verifyArticleVisualPersistence(input);
    case "plan-internal-link-graph": return planInternalLinkGraph(input);
    case "prepare-internal-link-sheet-output": return prepareInternalLinkSheetOutput(input);
    case "verify-internal-link-graph": return verifyInternalLinkGraph(input);
    case "build-structured-markup": return buildStructuredMarkupOutput(input);
    case "verify-structured-markup": return verifyStructuredMarkupOutput(input);
    case "prepare-rewrite-plan": return prepareRewritePlan(input);
    case "prepare-rewrite-artifact-output": return prepareRewriteArtifactOutput(input);
    case "prepare-xlsx-export": return prepareStandardSpreadsheetExport(input);
    case "prepare-cluster": return prepareStandardClusterBatch(input);
    case "complete-cluster": return completeStandardClusterBatch(input);
    case "prepare-batch-notification": return prepareStandardBatchNotification(input);
    case "analyze-article": return {
      duplicate_check: analyzeDuplicateRisk(input),
      internal_link_candidates: selectInternalLinkCandidates(input),
      internal_link_graph: planInternalLinkGraph(input),
    };
    case "review-article": return reviewArticle(input);
    case "prepare-stage-review": return prepareStageReview(input);
    case "evaluate-stage-review": return evaluateStageReview(input);
    case "draft-workflow": return runArticleDraftWorkflow(input);
    case "release-publication": return releaseArticleForPublication(input.draft, input.approvals || {});
    case "create-batch": return createBatchState(input);
    case "batch-next": return determineNextBatchStep(input.state || input);
    case "apply-batch-step": return applyBatchStep(input.state, input.completed || {}, input.options || {});
    case "fail-batch-step": return failBatchStep(input.state, input.failure || {}, input.options || {});
    case "stop-batch": return stopBatch(input.state || input, input.options || {});
    case "resume-batch": return resumeBatch(input.state || input);
    case "prepare-news-inbox": return prepareNewsInbox(input);
    case "news-proposal": return createNewsProposal(input);
    case "decide-news-proposal": return decideNewsProposal(input.proposal, input.decision);
    case "prepare-ranking-requests": return prepareRankingRequests(input);
    case "prepare-ahrefs": return prepareAhrefsConnection(input);
    case "create-article-lifecycle": return createArticleProductionLifecycle(input);
    case "advance-article-lifecycle": return advanceArticleProductionLifecycle(input.state, input.completion || {});
    case "plan-skill": return planSkillDesign(input);
    case "evaluate-skill": return evaluateSkillDefinition(input);
    case "evaluate-skill-run": return evaluateSkillRun(input);
    case "propose-skill-fix": return buildSkillChangeProposal(input);
    case "curate-skill-feedback": return curateSkillFeedback(input);
    case "authorize-skill-change": return authorizeSkillChange(input.proposal, input.approval || {});
    case "create-readiness": return createProductionReadinessState(input);
    case "record-readiness": return recordProductionReadinessEvidence(input.state, input.update || {});
    case "evaluate-readiness": return evaluateProductionReadiness(input.state || input);
    case "prepare-scheduled-tasks": return createScheduledTaskPlan(input);
    case "authorize-scheduled-task": return authorizeScheduledTask(input.plan, input.authorization || {});
    case "create-performance-report": return createPerformanceReport(input);
    case "create-report-schedule": return createReportSchedulePlan(input);
    case "analyze-performance-feedback": return analyzePerformanceFeedback(input);
    case "propose-performance-skill-update": return proposePerformanceSkillUpdate(input);
    case "deletion-plan": return createDeletionPlan(input, input.options || {});
    case "authorize-deletion": return authorizeDeletion(input.plan, input.confirmation, input.options || {});
    default: throw new Error(`unknown Smart AIO command: ${command || "(missing)"}`);
  }
}

async function main() {
  const command = process.argv[2] || "verify";
  const inputPath = process.argv[3];
  const input = inputPath ? JSON.parse(await readFile(inputPath, "utf8")) : {};
  const output = await runSmartAioCommand(command, input);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
