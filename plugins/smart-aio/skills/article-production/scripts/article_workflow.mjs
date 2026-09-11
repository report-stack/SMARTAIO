#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  getContentPrompt,
  verifyContentPromptRegistry,
} from "../../content-prompts/scripts/content_prompt_registry.mjs";
import {
  analyzeTitleQuality,
  TITLE_REFINEMENT_PROMPT,
  TITLE_REFINEMENT_VERSION,
} from "./title_quality.mjs";

export { analyzeTitleQuality, TITLE_REFINEMENT_VERSION } from "./title_quality.mjs";

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function normalizeArticleCategoryRegistry(articleCategories = []) {
  const seen = new Set();
  return (Array.isArray(articleCategories) ? articleCategories : [])
    .map((entry) => typeof entry === "string"
      ? { name: entry.trim(), slug: "" }
      : { name: String(entry?.name || "").trim(), slug: normalizeStandardSlug(entry?.slug) })
    .filter((entry) => entry.name && !seen.has(entry.name) && seen.add(entry.name))
    .map(Object.freeze);
}

function normalizeArticlePlanConfirmation(value, clientId, article = {}) {
  const confirmation = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (confirmation.confirmed !== true) return null;
  if (String(confirmation.client_id || "").trim() !== clientId) {
    throw new Error("CROSS_CLIENT_DATA_DETECTED:article_plan_confirmation");
  }
  const expectedArticleId = String(article.article_id || "").trim();
  if (confirmation.article_id && String(confirmation.article_id).trim() !== expectedArticleId) {
    throw new Error("ARTICLE_PLAN_CONFIRMATION_ARTICLE_MISMATCH");
  }
  const expectedTitle = String(article.title || "").trim();
  if (confirmation.title && String(confirmation.title).trim() !== expectedTitle) {
    throw new Error("ARTICLE_PLAN_CONFIRMATION_TITLE_MISMATCH");
  }
  const expectedCategory = String(article.basicInfo?.articleCategory || article.articleCategory || "").trim();
  if (expectedCategory) {
    const providedCategory = String(confirmation.article_category ?? confirmation.articleCategory ?? "").trim();
    if (!providedCategory) throw new Error("ARTICLE_PLAN_CONFIRMATION_CATEGORY_REQUIRED");
    if (providedCategory !== expectedCategory) throw new Error("ARTICLE_PLAN_CONFIRMATION_CATEGORY_MISMATCH");
  }
  const expectedHashtags = cleanStandardHashtags(article.basicInfo?.hashtags ?? article.hashtags);
  if (expectedHashtags) {
    const providedHashtags = cleanStandardHashtags(confirmation.hashtags ?? confirmation.article_hashtags ?? confirmation.articleHashtags);
    if (!providedHashtags) throw new Error("ARTICLE_PLAN_CONFIRMATION_HASHTAGS_REQUIRED");
    if (providedHashtags !== expectedHashtags) throw new Error("ARTICLE_PLAN_CONFIRMATION_HASHTAGS_MISMATCH");
  }
  const sheetEvidence = confirmation.plan_confirmation_sheet || confirmation.confirmation_sheet || {};
  const sheetName = String(sheetEvidence.sheet_name || sheetEvidence.sheetName || "").trim();
  const sheetUrl = String(sheetEvidence.production_sheet_url || sheetEvidence.spreadsheet_url || sheetEvidence.url || "").trim();
  const status = String(sheetEvidence.confirmation_status || sheetEvidence.status || "").trim().toUpperCase();
  const row = Number(sheetEvidence.row || sheetEvidence.sheet_row || 0);
  const allowedStatuses = new Set(["承認", "OK", "APPROVED"]);
  if (!sheetUrl || !sheetUrl.includes("docs.google.com/spreadsheets/d/")) {
    throw new Error("ARTICLE_PLAN_CONFIRMATION_SHEET_URL_REQUIRED");
  }
  if (sheetName !== "企画確認") throw new Error("ARTICLE_PLAN_CONFIRMATION_SHEET_NAME_REQUIRED");
  if (!Number.isInteger(row) || row < 2) throw new Error("ARTICLE_PLAN_CONFIRMATION_SHEET_ROW_REQUIRED");
  if (!allowedStatuses.has(status) && !allowedStatuses.has(String(sheetEvidence.confirmation_status || sheetEvidence.status || "").trim())) {
    throw new Error("ARTICLE_PLAN_CONFIRMATION_SHEET_APPROVAL_REQUIRED");
  }
  return Object.freeze({
    confirmed: true,
    client_id: clientId,
    article_id: expectedArticleId || null,
    title: expectedTitle || null,
    article_category: expectedCategory || null,
    hashtags: expectedHashtags || null,
    user_id: requireText(confirmation.user_id, "article_plan_confirmation.user_id"),
    confirmed_at: String(confirmation.confirmed_at || "").trim() || null,
    note: String(confirmation.note || "").trim() || null,
    confirmation_source: "PLAN_CONFIRMATION_SHEET",
    plan_confirmation_sheet: Object.freeze({
      sheet_name: sheetName,
      production_sheet_url: sheetUrl,
      row,
      confirmation_status: String(sheetEvidence.confirmation_status || sheetEvidence.status || "").trim(),
      confirmed_by: String(sheetEvidence.confirmed_by || sheetEvidence.approved_by || confirmation.user_id || "").trim(),
      confirmed_at: String(sheetEvidence.confirmed_at || sheetEvidence.approved_at || confirmation.confirmed_at || "").trim() || null,
    }),
  });
}

export function resolveArticleCategory({ articleCategory, articleCategories = [] }) {
  const requested = String(articleCategory || "").trim();
  const registry = normalizeArticleCategoryRegistry(articleCategories);
  if (registry.length === 0) return Object.freeze({ status: "REGISTRY_NOT_PROVIDED", name: requested, slug: "" });
  const exact = registry.find((entry) => entry.name === requested);
  if (!exact) {
    return Object.freeze({
      status: "ARTICLE_CATEGORY_NOT_REGISTERED",
      requested,
      allowed_names: Object.freeze(registry.map((entry) => entry.name)),
    });
  }
  return Object.freeze({ status: "RESOLVED", name: exact.name, slug: exact.slug });
}

export function buildExpectedArticleUrl({ publicationSiteUrl, permalinkStructure, categorySlug, articleSlug }) {
  const site = String(publicationSiteUrl || "").trim();
  if (!site) return Object.freeze({ status: "PUBLICATION_SITE_URL_REQUIRED", expected_url: null });
  const pattern = String(permalinkStructure || "").trim();
  if (!pattern) return Object.freeze({ status: "PERMALINK_STRUCTURE_REQUIRED", expected_url: null });
  const postSlug = normalizeStandardSlug(articleSlug);
  if (!postSlug) return Object.freeze({ status: "ARTICLE_SLUG_REQUIRED", expected_url: null });
  const category = normalizeStandardSlug(categorySlug);
  if (pattern.includes("%category%") && !category) {
    return Object.freeze({ status: "CATEGORY_SLUG_REQUIRED", expected_url: null });
  }
  if (!pattern.includes("%postname%")) {
    return Object.freeze({ status: "POSTNAME_PLACEHOLDER_REQUIRED", expected_url: null });
  }
  const path = pattern
    .replaceAll("%category%", category)
    .replaceAll("%postname%", postSlug)
    .replace(/^\/+|\/+$/g, "");
  const base = new URL(site);
  base.pathname = `${base.pathname.replace(/\/$/, "")}/${path}/`.replace(/\/{2,}/g, "/");
  base.search = "";
  base.hash = "";
  return Object.freeze({ status: "EXPECTED_URL_READY", expected_url: base.toString() });
}

export function requireAiPlanReview(input, expected = {}) {
  if (!input || String(input.result || "").toUpperCase() !== "PASS") throw new Error("PLAN_AI_REVIEW_REQUIRED");
  const normalized = Object.freeze({
    client_id: requireText(input.client_id, "plan_review.client_id"),
    article_id: requireText(input.article_id, "plan_review.article_id"),
    content_version: requireText(input.content_version, "plan_review.content_version"),
    review_type: String(input.review_type || "PLAN").toUpperCase(),
    result: "PASS",
    reviewed_by: requireText(input.reviewed_by, "plan_review.reviewed_by"),
    producer_run_id: requireText(input.producer_run_id, "plan_review.producer_run_id"),
    reviewer_run_id: requireText(input.reviewer_run_id, "plan_review.reviewer_run_id"),
    reviewed_at: requireText(input.reviewed_at, "plan_review.reviewed_at"),
  });
  if (normalized.review_type !== "PLAN" && normalized.review_type !== "OUTLINE") throw new Error("PLAN_AI_REVIEW_TYPE_INVALID");
  if (normalized.producer_run_id === normalized.reviewer_run_id) throw new Error("INDEPENDENT_PLAN_REVIEW_REQUIRED");
  if (expected.client_id && normalized.client_id !== expected.client_id) throw new Error("CROSS_CLIENT_DATA_DETECTED:plan_review");
  if (expected.article_id && normalized.article_id !== expected.article_id) throw new Error("PLAN_REVIEW_ARTICLE_MISMATCH");
  if (expected.content_version && normalized.content_version !== expected.content_version) throw new Error("PLAN_REVIEW_VERSION_MISMATCH");
  if (Number.isNaN(Date.parse(normalized.reviewed_at))) throw new TypeError("plan_review.reviewed_at must be an ISO date-time");
  return normalized;
}

export function assertClientRecords(records, clientId, label = "records") {
  const expected = requireText(clientId, "client_id");
  const values = Array.isArray(records) ? records : [];
  const foreign = values.find((record) => String(record?.client_id || "").trim() !== expected);
  if (foreign) throw new Error(`CROSS_CLIENT_DATA_DETECTED:${label}`);
  return values;
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function ngrams(value, size = 2) {
  const text = normalizeSearchText(value);
  if (!text) return new Set();
  if (text.length <= size) return new Set([text]);
  const result = new Set();
  for (let index = 0; index <= text.length - size; index += 1) {
    result.add(text.slice(index, index + size));
  }
  return result;
}

export function similarity(left, right) {
  const a = ngrams(left);
  const b = ngrams(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function normalizeResponsibilityLabel(label) {
  if (!label) return "";
  return String(label)
    .replace(/\r?\n/g, " ")
    .replace(/\s*｜\s*/g, "｜")
    .replace(/\s*,\s*/g, ",")
    .replace(/、/g, ",")
    .replace(/，/g, ",")
    .trim();
}

export function normalizeStandardSlug(slug) {
  if (!slug) return "";
  return String(slug)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .filter(Boolean)
    .slice(0, 6)
    .join("-");
}

export function parseResponsibilityLabel(label) {
  const normalized = normalizeResponsibilityLabel(label);
  if (!normalized) return { shortTitle: "", main: "", deep: [], support: [], all: [] };
  const parts = normalized.split("｜");
  const shortTitle = (parts[0] || "").trim();
  const main = (parts[1] || "").trim();
  const deep = (parts[2] || "").split(",").map((value) => value.trim()).filter(Boolean);
  const support = (parts[3] || "").split(",").map((value) => value.trim()).filter(Boolean);
  return { shortTitle, main, deep, support, all: [main, ...deep, ...support].filter(Boolean) };
}

export function validateResponsibilityLabel(label) {
  const normalized = normalizeResponsibilityLabel(label);
  const parts = normalized.split("｜");
  const parsed = parseResponsibilityLabel(normalized);
  if (parts.length !== 4) throw new Error("INVALID_RESPONSIBILITY_LABEL_FORMAT");
  if (!parsed.main) throw new Error("RESPONSIBILITY_MAIN_REQUIRED");
  if (parsed.deep.length !== 4) throw new Error("RESPONSIBILITY_DEEP_MUST_BE_4");
  if (parsed.support.length !== 2) throw new Error("RESPONSIBILITY_SUPPORT_MUST_BE_2");
  if (new Set(parsed.all).size !== parsed.all.length) throw new Error("DUPLICATE_RESPONSIBILITY_INSIDE_LABEL");
  return normalized;
}

export function responsibilityIntentGroup(label) {
  const text = String(label || "");
  if (/(適性|向き不向き|向いて|向かない|受講判断|条件整理|申込判断|受講可否|誰に向く|受けるべき|適性条件)/.test(text)) return "適性・受講判断系";
  if (/(仕組み|構造|学習設計|成果が出る|成果設計|プロセス|第二言語習得|PDCA|入出力|インプット|アウトプット)/.test(text)) return "仕組み理解系";
  if (/(挫折|継続|続ける|続かない|習慣|メンタル|継続可能|習慣維持)/.test(text)) return "継続・挫折系";
  if (/(学習時間|時間確保|時間条件|負荷|生活内時間|週間時間|1000時間|最低ライン|成果逆算時間|負荷許容)/.test(text)) return "時間・負荷系";
  if (/(費用|投資|料金|コスト|費用対効果|回収|支払|予算)/.test(text)) return "費用・投資判断系";
  if (/(比較|違い|英会話スクール|オンライン英会話|独学|他サービス|併用|役割分担)/.test(text)) return "比較・違い理解系";
  if (/(無料相談|カウンセリング|相談前|質問項目|体験|問い合わせ)/.test(text)) return "無料相談・申込準備系";
  return "";
}

function articleFingerprint(article) {
  const values = [
    article.title,
    article.basicInfo?.searchIntent || article.searchIntent,
    article.basicInfo?.targetReader || article.targetReader,
    article.deepDive?.conclusion || article.conclusionSummary,
    article.responsibilityLabel,
  ].map(normalizeSearchText).join("|");
  return createHash("sha256").update(values, "utf8").digest("hex");
}

const SITE_DUPLICATE_DECISION_OPTIONS = Object.freeze([
  Object.freeze({
    action: "PROCEED_AS_NEW",
    label: "このまま進める",
    description: "公式サイトの既存記事と近いことを理解したうえで、新規記事として制作を続ける",
  }),
  Object.freeze({
    action: "CREATE_ALTERNATIVE",
    label: "別記事にする",
    description: "重複する主題を避け、検索意図・責任範囲が異なる別企画を作り直す",
  }),
]);

function buildDuplicateMatches({ candidate, articles, candidateParsed, candidateGroup, fingerprint, similarityThreshold, source }) {
  const matches = [];
  const candidateIntent = candidate.basicInfo?.searchIntent || candidate.searchIntent || "";

  for (const article of articles) {
    const existingParsed = parseResponsibilityLabel(article.responsibilityLabel);
    const responsibilityConflicts = candidateParsed.all.filter((label) => existingParsed.all.includes(label));
    const titleSimilarity = similarity(candidate.title, article.title);
    const searchIntentSimilarity = similarity(candidateIntent, article.basicInfo?.searchIntent || article.searchIntent || "");
    const topicSimilarity = similarity(
      [candidate.title, candidateIntent].filter(Boolean).join(" "),
      [article.title, article.basicInfo?.searchIntent || article.searchIntent].filter(Boolean).join(" "),
    );
    const sameIntentGroup = Boolean(
      candidateGroup &&
      candidateGroup === responsibilityIntentGroup(existingParsed.main) &&
      (!candidate.category || !article.category || candidate.category === article.category),
    );
    const sameFingerprint = Boolean(article.fingerprint && article.fingerprint === fingerprint);
    const exactTitle = normalizeSearchText(candidate.title) === normalizeSearchText(article.title);

    if (
      exactTitle ||
      sameFingerprint ||
      responsibilityConflicts.length ||
      sameIntentGroup ||
      titleSimilarity >= similarityThreshold ||
      searchIntentSimilarity >= similarityThreshold ||
      topicSimilarity >= similarityThreshold
    ) {
      matches.push({
        article_id: article.article_id || null,
        title: article.title,
        url: article.url || article.canonical_url || null,
        source,
        exact_title: exactTitle,
        same_fingerprint: sameFingerprint,
        title_similarity: Number(titleSimilarity.toFixed(3)),
        search_intent_similarity: Number(searchIntentSimilarity.toFixed(3)),
        topic_similarity: Number(topicSimilarity.toFixed(3)),
        responsibility_conflicts: responsibilityConflicts,
        same_intent_group: sameIntentGroup,
        intent_group: candidateGroup || null,
      });
    }
  }
  return matches;
}

export function analyzeDuplicateRisk({
  client_id,
  candidate,
  existingArticles = [],
  publishedSiteArticles = [],
  similarityThreshold = 0.72,
}) {
  const clientId = requireText(client_id, "client_id");
  if (String(candidate?.client_id || "").trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:candidate");
  assertClientRecords(existingArticles, clientId, "existingArticles");
  assertClientRecords(publishedSiteArticles, clientId, "publishedSiteArticles");

  const candidateLabel = validateResponsibilityLabel(candidate.responsibilityLabel);
  const candidateParsed = parseResponsibilityLabel(candidateLabel);
  const candidateGroup = responsibilityIntentGroup(candidateParsed.main);
  const fingerprint = articleFingerprint(candidate);
  const productionSheetMatches = buildDuplicateMatches({
    candidate,
    articles: existingArticles,
    candidateParsed,
    candidateGroup,
    fingerprint,
    similarityThreshold,
    source: "PRODUCTION_SHEET",
  });
  const officialSiteMatches = buildDuplicateMatches({
    candidate,
    articles: publishedSiteArticles,
    candidateParsed,
    candidateGroup,
    fingerprint,
    similarityThreshold,
    source: "OFFICIAL_SITE",
  });
  const matches = [...productionSheetMatches, ...officialSiteMatches];
  const blocked = productionSheetMatches.some((match) => match.exact_title || match.same_fingerprint || match.responsibility_conflicts.length > 0);
  const status = blocked
    ? "BLOCKED"
    : officialSiteMatches.length
      ? "SITE_DUPLICATE_DECISION_REQUIRED"
      : productionSheetMatches.length
        ? "REVIEW_REQUIRED"
        : "CLEAR";
  return {
    client_id: clientId,
    fingerprint,
    status,
    matches,
    production_sheet_matches: productionSheetMatches,
    official_site_matches: officialSiteMatches,
    decision_required: status === "SITE_DUPLICATE_DECISION_REQUIRED",
    decision_prompt: status === "SITE_DUPLICATE_DECISION_REQUIRED"
      ? "公式サイトに近い公開記事があります。このまま新規記事として進めますか、それとも別記事にしますか？"
      : null,
    decision_options: status === "SITE_DUPLICATE_DECISION_REQUIRED" ? SITE_DUPLICATE_DECISION_OPTIONS : [],
  };
}

export function resolveSiteDuplicateDecision({ client_id, article_id, duplicateCheck, decision }) {
  const clientId = requireText(client_id, "client_id");
  const articleId = requireText(article_id, "article_id");
  if (duplicateCheck?.status !== "SITE_DUPLICATE_DECISION_REQUIRED") {
    return Object.freeze({ status: duplicateCheck?.status || "CLEAR", decision: null });
  }
  if (!decision) {
    return Object.freeze({
      status: "SITE_DUPLICATE_DECISION_REQUIRED",
      decision: null,
      prompt: duplicateCheck.decision_prompt,
      options: duplicateCheck.decision_options,
      official_site_matches: duplicateCheck.official_site_matches,
    });
  }

  const action = requireText(decision.action, "site_duplicate_decision.action").toUpperCase();
  if (!SITE_DUPLICATE_DECISION_OPTIONS.some((option) => option.action === action)) {
    throw new Error(`UNKNOWN_SITE_DUPLICATE_DECISION:${action}`);
  }
  if (decision.client_id && String(decision.client_id).trim() !== clientId) {
    throw new Error("CROSS_CLIENT_DATA_DETECTED:site_duplicate_decision");
  }
  if (decision.article_id && String(decision.article_id).trim() !== articleId) {
    throw new Error("SITE_DUPLICATE_DECISION_ARTICLE_MISMATCH");
  }

  const normalizedDecision = Object.freeze({
    client_id: clientId,
    article_id: articleId,
    action,
    label: SITE_DUPLICATE_DECISION_OPTIONS.find((option) => option.action === action).label,
    decided_by: decision.decided_by ? String(decision.decided_by).trim() : null,
    decided_at: decision.decided_at ? String(decision.decided_at).trim() : null,
  });
  return Object.freeze({
    status: action === "PROCEED_AS_NEW" ? "PROCEED_AS_NEW_APPROVED" : "ALTERNATIVE_ARTICLE_REQUIRED",
    decision: normalizedDecision,
    official_site_matches: duplicateCheck.official_site_matches,
  });
}

export function selectInternalLinkCandidates({ client_id, candidate, existingArticles = [], limit = 5 }) {
  const clientId = requireText(client_id, "client_id");
  if (String(candidate?.client_id || "").trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:candidate");
  assertClientRecords(existingArticles, clientId, "existingArticles");
  const candidateText = [candidate.title, candidate.category, candidate.basicInfo?.searchIntent, candidate.deepDive?.conclusion].filter(Boolean).join(" ");

  return existingArticles
    .filter((article) => article.article_id !== candidate.article_id && article.url)
    .map((article) => {
      const targetText = [article.title, article.category, article.searchIntent, article.conclusionSummary].filter(Boolean).join(" ");
      const contentScore = similarity(candidateText, targetText);
      const categoryBoost = candidate.category && article.category === candidate.category ? 0.2 : 0;
      return {
        client_id: clientId,
        target_article_id: article.article_id,
        target_title: article.title,
        target_url: article.url,
        anchor_text: article.title,
        score: Number(Math.min(1, contentScore + categoryBoost).toFixed(3)),
        reason: categoryBoost ? "同一カテゴリかつ内容が関連" : "記事内容が関連",
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || String(left.target_article_id).localeCompare(String(right.target_article_id)))
    .slice(0, Math.max(0, Number(limit) || 0));
}

export function isApprovedSource(source = {}, asOf = new Date().toISOString().slice(0, 10)) {
  const approvedValues = new Set(["利用可", "APPROVED", "approved", "可"]);
  const pendingReviewValues = new Set(["", "要確認", "未確認", "PENDING", "pending", "UNREVIEWED", "unreviewed"]);
  const usageStatus = String(source.usage_status || source.approved_usage || source["利用可否"] || "").trim();
  const reviewer = String(source.reviewer || source.confirmed_by || source.review_status || source["確認者"] || "").trim();
  const active = !source.valid_until && !source["有効期限"]
    ? true
    : String(source.valid_until || source["有効期限"]).slice(0, 10) >= asOf;
  return approvedValues.has(usageStatus) && !pendingReviewValues.has(reviewer) && active;
}

export function selectApprovedSources({ client_id, sources = [], asOf = new Date().toISOString().slice(0, 10) }) {
  const clientId = requireText(client_id, "client_id");
  assertClientRecords(sources, clientId, "sources");
  return sources.filter((source) => isApprovedSource(source, asOf));
}

function appendResponsibilityRules(articlePrompt, responsibilityLabel) {
  const label = String(responsibilityLabel || "").trim();
  if (!label) return articlePrompt;
  return `${articlePrompt}

# 最重要：責任ラベル遵守ルール

以下の責任ラベルに従って本文を作成してください。

責任ラベル：
${label}

責任ラベルは以下の形式です。
短縮タイトル｜主責任｜深責任1,深責任2,深責任3,深責任4｜補助責任1,補助責任2

## 主責任
・主責任は、この記事全体が答える中心テーマです。
・本文全体の軸は、必ず主責任に合わせてください。
・主責任から外れた内容を記事の中心にしないでください。

## 深責任
・深責任は、本文で詳しく扱う主要論点です。
・深責任4個は、本文内で必ず扱ってください。
・深責任は原則として[H2]または[H3]で扱ってください。
・深責任は、具体例、判断基準、注意点、比較軸などを使って深掘りしてください。
・ただし、責任ラベル外の論点まで広げないでください。

## 補助責任
・補助責任は、主責任と深責任を支えるために軽く触れる論点です。
・補助責任を[H2]の主軸にしないでください。
・補助責任を独立した大見出しにしないでください。
・補助責任は関連する本文内で100〜300字程度に留めてください。
・補助責任を深掘りしないでください。
・補助責任を表、チェックリスト、大きな比較セクションとして展開しないでください。
・補助責任について詳しい説明が必要な場合は、別記事で扱う前提の短い説明に留めてください。

## 責任外の制限
・責任ラベルに含まれていない論点を、本文の主要見出しとして追加しないでください。
・一般論を広げすぎず、主責任と深責任を中心に構成してください。
・文字数が増えそうな場合は、補助責任と責任外の内容を優先して削ってください。
・迷った場合は、主責任と深責任を優先してください。`;
}

export async function buildStandardArticleIdeaPrompt(input) {
  await verifyContentPromptRegistry();
  const item = await getContentPrompt("article-ideas");
  const currentYear = Number(input.currentYear || new Date().getFullYear());
  const pillarInfo = (input.pillarKeywords || []).map((pillar) => `- ${pillar.keyword}：${pillar.description || ""}（既存${pillar.existingCount || 0}件）`).join("\n");
  const articleCategoryRegistry = normalizeArticleCategoryRegistry(input.articleCategories);
  let prompt = item.value
    .replaceAll("{{currentYear}}", String(currentYear))
    .replaceAll("{{basicInfo}}", input.basicInfo || "")
    .replaceAll("{{serviceName}}", input.serviceName || "")
    .replaceAll("{{pillarKeywords}}", pillarInfo)
    // 制作プロンプトへ渡す既存記事情報はタイトルと責任ラベルだけに限定する。
    // カテゴリと運用メタデータは保護プロンプトの外側で管理する。
    .replaceAll("{{existingArticles}}", JSON.stringify((input.existingArticles || []).map((article) => ({
      title: article?.title || "",
      responsibilityLabel: article?.responsibilityLabel || "",
    })), null, 2))
    .replaceAll("{{articleCategories}}", articleCategoryRegistry.map((entry) => entry.name).join(", "));

  if (input.specifiedTopic) {
    prompt = prompt.replace(/SEO記事案を\d+個作成/, "SEO記事案を1個作成").replace(/必ず\d+件作成/, "必ず1件作成");
    prompt += `\n\n# 最優先指示（他のルールより優先）
以下のトピック・テーマに基づいて記事を1件だけ生成してください。
このトピックの内容を記事タイトル・概要・検索意図・深掘り情報すべてに反映してください。
最も適切なピラーキーワードをcategoryに設定してください。

指定トピック：「${input.specifiedTopic}」`;
  }

  prompt += `\n\n# スラッグ生成（必須）
各記事のJSONに「slug」フィールドを必ず含めてください。
- 記事タイトル（title）の内容を表す英語スラッグにすること
- 半角英小文字の単語をハイフン（-）で繋ぐ形式（例: english-study-time）
- 3〜5単語程度に収め、長くしすぎないこと
- 既存記事のスラッグと重複しても構いません`;

  prompt += `\n\n${TITLE_REFINEMENT_PROMPT}`;

  if (articleCategoryRegistry.length > 0) {
    prompt += `\n\n# 記事カテゴリ整合性（新システム追加ルール）
articleCategoryは、次の登録済みカテゴリ名から完全一致で1つだけ選んでください。表記変更、語順変更、似た別名の作成は禁止です。
${articleCategoryRegistry.map((entry) => `- ${entry.name}${entry.slug ? `（${entry.slug}）` : ""}`).join("\n")}`;
  }

  const retryErrors = Array.isArray(input.retryErrors) ? input.retryErrors.map(String) : [];
  const titleRetryErrors = retryErrors.filter((error) => error.startsWith("記事タイトル品質不足"));
  const responsibilityRetryErrors = retryErrors.filter((error) => !error.startsWith("記事タイトル品質不足"));

  if (responsibilityRetryErrors.length > 0) {
    prompt += "\n\n# 責任ラベル重複エラー（再生成が必要）\n\n";
    prompt += "前回生成した記事案は、既存記事と責任ラベルが重複していたため却下されました。\n";
    prompt += "以下のエラー内容を確認し、重複しない責任ラベルで再生成してください。\n\n";
    responsibilityRetryErrors.forEach((error, index) => {
      prompt += `エラー${index + 1}：${String(error)}\n`;
    });
    prompt += "\n既存記事で使われている責任ラベルとは異なるラベルを必ず使用してください。\n";
    prompt += "ラベル名だけを変えるのではなく、検索意図そのものを別のものにしてください。\n";
  }

  if (titleRetryErrors.length > 0) {
    prompt += "\n\n# 記事タイトル品質エラー（再生成が必要）\n\n";
    prompt += "前回のタイトルは訴求力または信頼性の基準を満たしていません。本文の約束を変えず、タイトルだけを5案から再選定してください。\n";
    titleRetryErrors.forEach((error, index) => {
      prompt += `エラー${index + 1}：${error}\n`;
    });
    prompt += "検索語・読者の悩み・具体的な読後価値を自然な日本語で1つにまとめてください。\n";
  }

  return {
    prompt_version: "content-v1",
    prompt_key: item.key,
    prompt_sha256: item.sha256,
    title_refinement_version: TITLE_REFINEMENT_VERSION,
    content_prompt: prompt,
  };
}

export function planStandardArticleIdea({
  client_id,
  pillarKeywords = [],
  existingArticles = [],
  specifiedPillar,
  specifiedTopic,
}) {
  const clientId = requireText(client_id, "client_id");
  assertClientRecords(existingArticles, clientId, "existingArticles");
  const pillars = pillarKeywords
    .map((pillar) => ({
      keyword: String(pillar?.keyword || "").trim(),
      description: String(pillar?.description || "").trim(),
      existingCount: 0,
    }))
    .filter((pillar) => pillar.keyword);
  if (pillars.length === 0) throw new Error("PILLAR_KEYWORDS_REQUIRED");

  const topic = String(specifiedTopic || "").trim();
  const requestedPillar = String(specifiedPillar || "").trim();
  let targetPillars;
  let mode;

  if (topic) {
    mode = "SPECIFIED_TOPIC";
    targetPillars = pillars;
  } else if (requestedPillar) {
    const matched = pillars.find((pillar) => pillar.keyword === requestedPillar);
    if (!matched) throw new Error(`SPECIFIED_PILLAR_NOT_FOUND:${requestedPillar}`);
    mode = "SPECIFIED_PILLAR";
    targetPillars = [matched];
  } else {
    mode = "ROUND_ROBIN";
    const lastCategory = String(existingArticles.at(-1)?.category || "").trim();
    const found = pillars.findIndex((pillar) => pillar.keyword === lastCategory);
    const startIndex = found >= 0 ? (found + 1) % pillars.length : 0;
    targetPillars = [pillars[startIndex]];
  }

  return Object.freeze({
    client_id: clientId,
    mode,
    specifiedTopic: topic || null,
    targetPillars: Object.freeze(targetPillars.map(Object.freeze)),
    article_count: 1,
  });
}

function collectOldYears(value, currentYear) {
  const matches = JSON.stringify(value).match(/20\d{2}年/g) || [];
  return [...new Set(matches.map((year) => Number(year.replace("年", ""))).filter((year) => year < currentYear))];
}

export function validateStandardArticleIdeaOutput({
  client_id,
  ideas = [],
  existingArticles = [],
  publishedSiteArticles = [],
  plan,
  pillarKeywords = [],
  articleCategories = [],
  article_plan_confirmation,
  currentYear = new Date().getFullYear(),
}) {
  const clientId = requireText(client_id, "client_id");
  assertClientRecords(existingArticles, clientId, "existingArticles");
  assertClientRecords(publishedSiteArticles, clientId, "publishedSiteArticles");
  const values = Array.isArray(ideas) ? ideas.filter(Boolean) : [];
  const errors = [];
  const siteDuplicateDecisions = [];
  const articleCategoryRegistry = normalizeArticleCategoryRegistry(articleCategories);
  if (values.length === 0) errors.push("記事案の生成に失敗しました。");

  const validPillars = (pillarKeywords.length ? pillarKeywords : plan?.targetPillars || [])
    .map((pillar) => String(pillar?.keyword || "").trim())
    .filter(Boolean);
  const forcedCategory = plan?.mode === "SPECIFIED_TOPIC" ? null : String(plan?.targetPillars?.[0]?.keyword || "").trim();

  const normalizedIdeas = values.map((idea, index) => {
    const categoryResolution = resolveArticleCategory({ articleCategory: idea.articleCategory, articleCategories: articleCategoryRegistry });
    const normalized = {
      ...idea,
      client_id: clientId,
      category: forcedCategory || (validPillars.includes(String(idea.category || "").trim())
        ? String(idea.category).trim()
        : validPillars[0] || ""),
      responsibilityLabel: normalizeResponsibilityLabel(idea.responsibilityLabel),
      slug: normalizeStandardSlug(idea.slug),
      articleCategory: categoryResolution.status === "RESOLVED" ? categoryResolution.name : String(idea.articleCategory || "").trim(),
      articleCategorySlug: categoryResolution.status === "RESOLVED" ? categoryResolution.slug : "",
      hashtags: cleanStandardHashtags(idea.hashtags),
    };
    if (articleCategoryRegistry.length > 0 && categoryResolution.status !== "RESOLVED") {
      errors.push(`記事カテゴリ不一致: 「${String(idea.articleCategory || "未入力").trim() || "未入力"}」は登録済みカテゴリではありません。使用可能: ${articleCategoryRegistry.map((entry) => entry.name).join("、")}`);
    }
    if (!normalized.hashtags) {
      errors.push("ハッシュタグ未入力: 記事確認とDoc出力に使うタグを1件以上設定してください。");
    }
    const titleQuality = analyzeTitleQuality({
      title: normalized.title,
      mainKeyword: normalized.mainKeyword || normalized.basicInfo?.mainKeyword,
      responsibilityLabel: normalized.responsibilityLabel,
    });
    normalized.title_quality = titleQuality;
    if (!titleQuality.passed) {
      errors.push(`記事タイトル品質不足（${titleQuality.score}点）: ${titleQuality.violations.join("、")}`);
    }
    try {
      validateResponsibilityLabel(normalized.responsibilityLabel);
      const duplicate = analyzeDuplicateRisk({
        client_id: clientId,
        candidate: { ...normalized, article_id: normalized.article_id || `PENDING-${index + 1}` },
        existingArticles,
        publishedSiteArticles,
      });
      if (duplicate.status === "BLOCKED") {
        errors.push(`既存記事と責任ラベルが重複しています: ${normalized.responsibilityLabel}`);
      } else if (duplicate.status === "SITE_DUPLICATE_DECISION_REQUIRED") {
        siteDuplicateDecisions.push(Object.freeze({
          idea_index: index,
          title: normalized.title,
          prompt: duplicate.decision_prompt,
          options: duplicate.decision_options,
          official_site_matches: duplicate.official_site_matches,
        }));
      } else if (duplicate.production_sheet_matches.some((match) => match.same_intent_group)) {
        errors.push(`主責任の検索意図グループが既存記事と重複しています: ${normalized.responsibilityLabel}`);
      }
    } catch (error) {
      errors.push(String(error.message || error));
    }
    return Object.freeze(normalized);
  });

  const oldYears = collectOldYears(normalizedIdeas, Number(currentYear));
  if (oldYears.length) errors.push(`出力に古い年号が含まれています: ${oldYears.join(", ")}年。`);
  const firstIdea = normalizedIdeas[0] || {};
  const planConfirmation = errors.length || siteDuplicateDecisions.length
    ? null
    : normalizeArticlePlanConfirmation(article_plan_confirmation, clientId, {
      title: firstIdea.title,
      articleCategory: firstIdea.articleCategory,
      hashtags: firstIdea.hashtags,
    });

  return Object.freeze({
    client_id: clientId,
    status: errors.length
      ? "RETRY_REQUIRED"
      : siteDuplicateDecisions.length
        ? "DECISION_REQUIRED"
        : planConfirmation
          ? "VALID"
          : "AWAITING_ARTICLE_PLAN_CONFIRMATION",
    ideas: Object.freeze(normalizedIdeas),
    retry_errors: Object.freeze([...new Set(errors)]),
    site_duplicate_decisions: Object.freeze(siteDuplicateDecisions),
    confirmation_required: errors.length === 0 && siteDuplicateDecisions.length === 0 && !planConfirmation,
    confirmation_prompt: errors.length === 0 && siteDuplicateDecisions.length === 0 && !planConfirmation
      ? "企画確認シートの対象行で、記事トピック、種別、ピラー、クラスター、記事タイトル案、対策キーワード、検索意図、AI引用戦略、記事カテゴリ、ハッシュタグを確認し、確認ステータスを「承認」または「OK」にしてください。承認行の証跡がないまま本文作成へ進めません。"
      : null,
    plan_confirmation: planConfirmation,
    max_retries: 3,
  });
}

export async function buildStandardArticleBasePrompt(input) {
  await verifyContentPromptRegistry();
  const item = await getContentPrompt("article-writing");
  const article = input.article || {};
  const bi = article.basicInfo || {};
  const dd = article.deepDive || {};
  const base = `${item.value}

・記事カテゴリ：
${article.category || ""}

・記事タイトル：
${article.title || ""}

・責任ラベル：
${article.responsibilityLabel || ""}

・記事タイプ：
${bi.articleType || ""}

・検索意図：
${bi.searchIntent || ""}

・メインキーワード：
${bi.mainKeyword || ""}

・サブキーワード：
${bi.subKeywords || ""}

・記事を読んだ読者の状態変化：
${bi.readerChange || ""}

・抑えたいポイント：
${bi.keyPoints || ""}

・この記事の結論：
${dd.conclusion || ""}

・入れるべき具体内容：
${dd.specificContents || ""}

・深掘りすべき論点：
${dd.deepDivePoints || ""}

・表にする内容：
${dd.tableContent || ""}

・図解にする内容：
${dd.diagramContent || ""}

・独自視点：
${dd.originalViewpoint || ""}`;
  return {
    prompt_version: "content-v1",
    prompt_key: item.key,
    prompt_sha256: item.sha256,
    content_prompt: base,
  };
}

export async function buildStandardArticleWritingPrompt(input) {
  const base = await buildStandardArticleBasePrompt(input);
  return {
    ...base,
    // The article JSON stores the protected base prompt. Responsibility rules
    // are appended exactly once, immediately before body generation.
    content_prompt: appendHashtagOutputRules(
      appendResponsibilityRules(base.content_prompt, input.article?.responsibilityLabel),
      input.article?.basicInfo?.hashtags,
    ),
  };
}

function cleanStandardHashtags(value) {
  return String(value || "")
    .split(/[,\n、，\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean)
    .join(",");
}

function formatStandardHashtags(value) {
  const cleaned = cleanStandardHashtags(value);
  return cleaned ? cleaned.split(",").map((tag) => `#${tag}`).join(" ") : "";
}

function appendHashtagOutputRules(prompt, hashtags) {
  const formatted = formatStandardHashtags(hashtags);
  if (!formatted) return prompt;
  return `${prompt}

# 記事タグ表示ルール（新システム追加ルール）
本文の終盤に次のタグセクションを1回だけ入れてください。出典セクションがある場合は、出典の直前に置いてください。

[H2]タグ[/H2]
[P]${formatted}[/P]`;
}

function nextStandardArticleNumber({ start_row, previous_article_id, last_article_id }) {
  const startRow = Number(start_row);
  if (startRow === 3) return 1;
  const source = startRow > 3 ? previous_article_id : last_article_id;
  const match = String(source || "").match(/^ID-(\d+)$/);
  return match ? Number(match[1]) + 1 : 1;
}

function maxKnownArticleNumber(input) {
  const ids = [
    ...(input.existing_article_ids || []),
    ...(input.existingArticles || []).map((article) => article?.article_id),
    ...(input.retired_article_ids || []),
  ];
  return ids.reduce((max, value) => {
    const match = String(value || "").match(/^ID-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

function maxActiveArticleNumber(input) {
  const ids = [
    ...(input.existing_article_ids || []),
    ...(input.existingArticles || []).map((article) => article?.article_id),
    input.previous_article_id,
    input.last_article_id,
  ];
  return ids.reduce((max, value) => {
    const match = String(value || "").match(/^ID-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
}

function isExplicitRebuildSequenceReset(input = {}) {
  const mode = String(input.article_id_sequence_mode || input.articleIdSequenceMode || "").trim().toUpperCase();
  return input.reset_article_id_sequence === true || mode === "RESET_FROM_ONE_AFTER_EXPLICIT_REBUILD";
}

export function allocateStandardArticleId(input = {}) {
  if (!Array.isArray(input.retired_article_ids)) throw new TypeError("retired_article_ids must be an array");
  for (const value of input.retired_article_ids) {
    if (!/^ID-\d{5}$/.test(String(value || "").trim())) {
      throw new Error(`STANDARD_RETIRED_ARTICLE_ID_REQUIRED:${value}`);
    }
  }
  if (isExplicitRebuildSequenceReset(input)) {
    if (input.explicit_full_rebuild_confirmed !== true) {
      throw new Error("ARTICLE_ID_RESET_EXPLICIT_REBUILD_CONFIRMATION_REQUIRED");
    }
    const number = Math.max(nextStandardArticleNumber(input), maxActiveArticleNumber(input) + 1);
    return `ID-${String(number).padStart(5, "0")}`;
  }
  const number = Math.max(nextStandardArticleNumber(input), maxKnownArticleNumber(input) + 1);
  return `ID-${String(number).padStart(5, "0")}`;
}

export async function finalizeStandardArticleIdeaOutput(input) {
  const clientId = requireText(input.client_id, "client_id");
  const validation = input.validation || validateStandardArticleIdeaOutput(input);
  if (String(validation.client_id || "") !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:idea_validation");
  if (validation.status !== "VALID") throw new Error("ARTICLE_IDEA_VALIDATION_REQUIRED");
  const idea = validation.ideas[0];
  if (!idea) throw new Error("ARTICLE_IDEA_REQUIRED");
  const articleId = allocateStandardArticleId(input);
  const cleanedHashtags = cleanStandardHashtags(idea.hashtags);
  if (!cleanedHashtags) throw new Error("ARTICLE_HASHTAGS_REQUIRED");
  const articleCategoryResolution = resolveArticleCategory({ articleCategory: idea.articleCategory, articleCategories: input.articleCategories || [] });
  if ((input.articleCategories || []).length > 0 && articleCategoryResolution.status !== "RESOLVED") {
    throw new Error(`ARTICLE_CATEGORY_NOT_REGISTERED:${idea.articleCategory || ""}`);
  }
  const articleCategory = articleCategoryResolution.status === "RESOLVED" ? articleCategoryResolution.name : String(idea.articleCategory || "");
  const articleCategorySlug = articleCategoryResolution.status === "RESOLVED" ? articleCategoryResolution.slug : String(idea.articleCategorySlug || "");
  const slug = normalizeStandardSlug(idea.slug);
  const jsonData = {
    id: articleId,
    category: idea.category || "",
    title: idea.title || "",
    summary: idea.summary || "",
    slug,
    responsibilityLabel: normalizeResponsibilityLabel(idea.responsibilityLabel),
    basicInfo: {
      articleType: idea.articleType || "",
      searchIntent: idea.searchIntent || "",
      mainKeyword: idea.mainKeyword || "",
      subKeywords: idea.subKeywords || "",
      readerChange: idea.readerChange || "",
      keyPoints: idea.keyPoints || "",
      differentiation: idea.differentiation || "",
      articleCategory,
      hashtags: cleanedHashtags,
    },
    deepDive: {
      conclusion: idea.conclusion || "",
      specificContents: idea.specificContents || "",
      deepDivePoints: idea.deepDivePoints || "",
      tableContent: idea.tableContent || "",
      diagramContent: idea.diagramContent || "",
      originalViewpoint: idea.originalViewpoint || "",
    },
    imagePrompt: {},
  };
  const articlePrompt = await buildStandardArticleBasePrompt({ article: jsonData });
  jsonData.articlePrompt = articlePrompt.content_prompt;
  const completedOn = String(input.completed_on || new Date().toISOString().slice(0, 10)).replaceAll("-", "/");
  const expectedUrl = buildExpectedArticleUrl({
    publicationSiteUrl: input.publication_site_url,
    permalinkStructure: input.permalink_structure,
    categorySlug: articleCategorySlug,
    articleSlug: slug,
  });
  return Object.freeze({
    client_id: clientId,
    article_id: articleId,
    status: "READY_FOR_ARTICLE_ID_FOLDER_AND_JSON_OUTPUT",
    article_folder_name: articleId,
    json_file_name: `${articleId}.json`,
    json_content: `${JSON.stringify(jsonData, null, 2)}\n`,
    sheet_row: Number(input.start_row || 3),
    sheet_updates: Object.freeze({
      D: articleId,
      E: jsonData.category,
      F: jsonData.title,
      G: jsonData.responsibilityLabel,
      H: false,
      I: articleCategory,
      J: cleanedHashtags,
      K: completedOn,
      L: "JSON_FILE_URL",
      M: false,
      T: slug,
    }),
    prompt_version: articlePrompt.prompt_version,
    prompt_key: articlePrompt.prompt_key,
    prompt_sha256: articlePrompt.prompt_sha256,
    publication_plan: Object.freeze({
      article_category: articleCategory,
      category_slug: articleCategorySlug,
      article_slug: slug,
      ...expectedUrl,
    }),
  });
}

export async function prepareArticleRun(input) {
  const clientId = requireText(input.client_id, "client_id");
  const article = input.article || {};
  if (String(article.client_id || "").trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:article");
  const existingArticles = assertClientRecords(input.existingArticles || [], clientId, "existingArticles");
  const publishedSiteArticles = assertClientRecords(input.publishedSiteArticles || [], clientId, "publishedSiteArticles");
  const contentVersion = requireText(input.content_version, "content_version");
  const articlePlanConfirmation = normalizeArticlePlanConfirmation(input.article_plan_confirmation, clientId, article);
  if (!articlePlanConfirmation) throw new Error("ARTICLE_PLAN_CONFIRMATION_REQUIRED");
  const planReview = requireAiPlanReview(input.plan_review, {
    client_id: clientId,
    article_id: requireText(article.article_id, "article_id"),
    content_version: contentVersion,
  });
  const sources = selectApprovedSources({ client_id: clientId, sources: input.sources || [], asOf: input.asOf });
  const duplicateCheck = analyzeDuplicateRisk({ client_id: clientId, candidate: article, existingArticles, publishedSiteArticles });
  const siteDuplicateDecision = resolveSiteDuplicateDecision({
    client_id: clientId,
    article_id: requireText(article.article_id, "article_id"),
    duplicateCheck,
    decision: input.site_duplicate_decision,
  });
  const internalLinks = selectInternalLinkCandidates({ client_id: clientId, candidate: article, existingArticles, limit: input.internalLinkLimit || 5 });
  const prompt = await buildStandardArticleWritingPrompt({ article });
  return {
    client_id: clientId,
    article_id: requireText(article.article_id, "article_id"),
    content_version: contentVersion,
    plan_review: planReview,
    status: duplicateCheck.status === "BLOCKED"
      ? "BLOCKED"
      : siteDuplicateDecision.status === "SITE_DUPLICATE_DECISION_REQUIRED"
        ? "SITE_DUPLICATE_DECISION_REQUIRED"
        : siteDuplicateDecision.status === "ALTERNATIVE_ARTICLE_REQUIRED"
          ? "ALTERNATIVE_ARTICLE_REQUIRED"
          : "READY_FOR_CHAT_GENERATION",
    ...prompt,
    context_packet: {
      approved_sources: sources,
      internal_link_candidates: internalLinks,
      duplicate_check: duplicateCheck,
      site_duplicate_decision: siteDuplicateDecision,
      article_plan_confirmation: articlePlanConfirmation,
    },
    execution_rule: "Generate in the current Codex/ChatGPT conversation. Do not call the OpenAI API.",
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const command = process.argv[2];
  const inputPath = process.argv[3];
  if (!command || !inputPath) throw new Error("usage: article_workflow.mjs <prepare-idea|prepare-article|analyze> <input.json>");
  const input = await readJson(inputPath);
  let output;
  if (command === "prepare-idea") {
    const clientId = requireText(input.client_id, "client_id");
    assertClientRecords(input.existingArticles || [], clientId, "existingArticles");
    output = { client_id: clientId, ...(await buildStandardArticleIdeaPrompt(input)) };
  } else if (command === "prepare-article") {
    output = await prepareArticleRun(input);
  } else if (command === "analyze") {
    output = {
      duplicate_check: analyzeDuplicateRisk(input),
      internal_link_candidates: selectInternalLinkCandidates(input),
    };
  } else {
    throw new Error(`unknown command: ${command}`);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
