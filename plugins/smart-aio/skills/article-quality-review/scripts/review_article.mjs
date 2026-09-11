#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  analyzeDuplicateRisk,
  assertClientRecords,
  isApprovedSource,
  parseResponsibilityLabel,
  validateResponsibilityLabel,
} from "../../article-production/scripts/article_workflow.mjs";
import {
  verifyInternalLinkGraph,
  verifyStructuredMarkupOutput,
} from "../../smart-aio-orchestrator/scripts/runtime/content-optimization.mjs";
import { verifyArticleVisualPersistence } from "../../smart-aio-orchestrator/scripts/runtime/image-persistence.mjs";

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function countHeadings(content) {
  return (String(content).match(/(?:^|\n)(?:\[H2\]|##\s+|<h2\b)/gi) || []).length;
}

function findOldYears(content, currentYear) {
  return [...new Set((String(content).match(/20\d{2}年/g) || []).map((value) => Number(value.replace("年", ""))))]
    .filter((year) => year < currentYear)
    .sort();
}

function verificationCheck(key, enabled, verifier) {
  if (!enabled) return { key, passed: true, critical: false, detail: "NOT_FINAL_STAGE" };
  try {
    verifier();
    return { key, passed: true, critical: false, detail: "VERIFIED" };
  } catch (error) {
    return { key, passed: false, critical: true, detail: error.message };
  }
}

export function reviewArticle(input) {
  const clientId = requireText(input.client_id, "client_id");
  const article = input.article || {};
  const content = requireText(input.content, "content");
  if (String(article.client_id || "").trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:article");

  validateResponsibilityLabel(article.responsibilityLabel);
  const parsed = parseResponsibilityLabel(article.responsibilityLabel);
  const existingArticles = assertClientRecords(input.existingArticles || [], clientId, "existingArticles");
  const sourceCatalog = assertClientRecords(input.sourceCatalog || [], clientId, "sourceCatalog");
  const sourcesUsed = assertClientRecords(input.sourcesUsed || [], clientId, "sourcesUsed");
  const internalLinksUsed = assertClientRecords(input.internalLinksUsed || [], clientId, "internalLinksUsed");
  const duplicateCheck = analyzeDuplicateRisk({ client_id: clientId, candidate: article, existingArticles });
  const currentYear = Number(input.currentYear || new Date().getFullYear());
  const oldYears = findOldYears(content, currentYear);
  const prohibitedExpressions = (input.clientRules?.prohibitedExpressions || []).filter((expression) => expression && content.includes(expression));
  const responsibilityCoverage = [parsed.main, ...parsed.deep].map((label) => ({ label, found: content.includes(label) }));
  const missingResponsibilities = responsibilityCoverage.filter((item) => !item.found).map((item) => item.label);
  const sourceMap = new Map(sourceCatalog.map((source) => [String(source.source_id), source]));
  const invalidSources = sourcesUsed.filter((source) => {
    const catalogItem = sourceMap.get(String(source.source_id));
    return !catalogItem || !isApprovedSource(catalogItem, input.asOf);
  });
  const invalidLinks = internalLinksUsed.filter((link) => !link.target_url || !content.includes(link.target_url));
  const headingCount = countHeadings(content);
  const minimumCharacters = Number(input.clientRules?.minimumCharacters || 1000);
  const characterCount = [...content].length;
  const finalStage = String(input.stage || input.review_stage || "").toUpperCase() === "FINAL";

  const checks = [
    { key: "duplicate", passed: duplicateCheck.status === "CLEAR", critical: duplicateCheck.status === "BLOCKED", detail: duplicateCheck.status },
    { key: "responsibility", passed: missingResponsibilities.length === 0, critical: false, detail: missingResponsibilities },
    { key: "sources", passed: invalidSources.length === 0 && sourcesUsed.length > 0, critical: invalidSources.length > 0, detail: invalidSources.map((source) => source.source_id) },
    { key: "internal_links", passed: invalidLinks.length === 0 && internalLinksUsed.length > 0, critical: false, detail: invalidLinks.map((link) => link.target_article_id) },
    verificationCheck("internal_link_graph", finalStage, () => verifyInternalLinkGraph(input.internal_link_graph, { client_id: clientId, article_id: article.article_id })),
    verificationCheck("structured_markup", finalStage, () => verifyStructuredMarkupOutput(input.structured_markup, { client_id: clientId, article_id: article.article_id })),
    verificationCheck("diagram_visual_quality", finalStage, () => verifyArticleVisualPersistence(input.image_persistence, { client_id: clientId, article_id: article.article_id })),
    { key: "old_years", passed: oldYears.length === 0, critical: oldYears.length > 0, detail: oldYears },
    { key: "prohibited_expressions", passed: prohibitedExpressions.length === 0, critical: prohibitedExpressions.length > 0, detail: prohibitedExpressions },
    { key: "heading_structure", passed: headingCount >= 2, critical: false, detail: headingCount },
    { key: "minimum_length", passed: characterCount >= minimumCharacters, critical: false, detail: { characterCount, minimumCharacters } },
  ];

  const weights = { duplicate: 15, responsibility: 25, sources: 20, internal_links: 10, internal_link_graph: 0, structured_markup: 0, diagram_visual_quality: 0, old_years: 10, prohibited_expressions: 5, heading_structure: 5, minimum_length: 10 };
  const deterministicScore = checks.reduce((score, check) => score + (check.passed ? weights[check.key] : 0), 0);
  const criticalViolation = checks.some((check) => check.critical);
  const passScore = Number(input.passScore || 80);

  return {
    client_id: clientId,
    article_id: requireText(article.article_id, "article_id"),
    deterministic_score: deterministicScore,
    critical_violation: criticalViolation,
    deterministic_result: deterministicScore >= passScore && !criticalViolation ? "PASS" : "REVISE",
    checks,
    ai_review_required: true,
    next_step: criticalViolation ? "重大違反を修正後に再レビュー" : "独立AIレビューを完了し、完成物だけを人の最終承認へ提示",
  };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("usage: review_article.mjs <input.json>");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  process.stdout.write(`${JSON.stringify(reviewArticle(input), null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
