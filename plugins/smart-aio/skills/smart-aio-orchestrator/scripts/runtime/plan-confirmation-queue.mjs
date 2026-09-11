import { createHash } from "node:crypto";
import { analyzeDuplicateRisk, normalizeStandardSlug } from "../../../article-production/scripts/article_workflow.mjs";
import { STANDARD_PLAN_CONFIRMATION_SHEET_COLUMNS } from "./system-contract.mjs";

const APPROVED_STATUSES = Object.freeze(["OK", "承認", "APPROVED"]);
const TERMINAL_PRODUCTION_STATUSES = Object.freeze(["制作済み", "完了", "DONE", "COMPLETED", "FINAL_APPROVAL待ち", "最終承認待ち"]);

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function cell(row, key) {
  return String(row?.[key] ?? "").trim();
}

function normalizePlanType(value, fallback = "クラスター") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (text === "ピラー" || /^pillar$/i.test(text)) return "ピラー";
  if (text === "クラスター" || /^cluster$/i.test(text)) return "クラスター";
  return text;
}

function cleanHashtags(value) {
  return String(value || "")
    .split(/[,\s、，#]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
}

function parseKeywords(value) {
  return String(value || "")
    .split(/[／,/、，\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function shortTitle(title) {
  return String(title || "").split(/[｜|]/)[0].trim().slice(0, 16) || "記事企画";
}

function uniqueFour(values, fallbackPrefix) {
  const result = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && !result.includes(text)) result.push(text);
    if (result.length === 4) break;
  }
  for (const suffix of ["条件確認", "運用手順", "注意点整理", "導入判断", "比較軸整理", "改善項目"]) {
    const text = `${fallbackPrefix}${suffix}`;
    if (!result.includes(text)) result.push(text);
    if (result.length === 4) break;
  }
  return result.slice(0, 4);
}

function uniqueTwoExcluding(values, excluded, fallbackPrefix) {
  const blocked = new Set(excluded);
  const result = [];
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && !blocked.has(text) && !result.includes(text)) result.push(text);
    if (result.length === 2) break;
  }
  for (const suffix of ["店舗運用", "費用確認", "スタッフ共有", "導入準備", "運用改善"]) {
    const text = `${fallbackPrefix}${suffix}`;
    if (!blocked.has(text) && !result.includes(text)) result.push(text);
    if (result.length === 2) break;
  }
  return result.slice(0, 2);
}

export function normalizePlanConfirmationRow(raw = {}, index = 0) {
  const rowNumber = Number(raw.row || raw.row_number || raw.sheet_row || index + 2);
  const order = Number(raw["制作順"] ?? raw.production_order ?? raw.order ?? index + 1);
  const title = cell(raw, "記事タイトル案") || cell(raw, "title");
  const topic = cell(raw, "記事トピック") || cell(raw, "topic");
  const pillar = cell(raw, "ピラー") || cell(raw, "pillar") || cell(raw, "pillar_keyword");
  const cluster = cell(raw, "クラスター") || cell(raw, "cluster") || cell(raw, "cluster_keyword") || topic;
  const keywords = cell(raw, "対策キーワード") || cell(raw, "keywords");
  const searchIntent = cell(raw, "検索意図") || cell(raw, "search_intent");
  const aiCitationStrategy = cell(raw, "AI引用戦略") || cell(raw, "ai_citation_strategy");
  const articleCategory = cell(raw, "記事カテゴリ") || cell(raw, "article_category");
  const hashtags = cleanHashtags(cell(raw, "ハッシュタグ") || cell(raw, "hashtags"));
  const status = cell(raw, "確認ステータス") || cell(raw, "confirmation_status");
  const productionStatus = cell(raw, "制作状態") || cell(raw, "production_status");
  const articleId = cell(raw, "記事ID") || cell(raw, "article_id");
  const articleUrl = cell(raw, "記事URL") || cell(raw, "article_url");
  return Object.freeze({
    row: rowNumber,
    production_order: Number.isInteger(order) && order > 0 ? order : index + 1,
    confirmation_id: cell(raw, "確認ID") || cell(raw, "confirmation_id"),
    topic,
    type: normalizePlanType(cell(raw, "種別") || cell(raw, "type"), pillar && !cluster ? "ピラー" : "クラスター"),
    pillar,
    cluster,
    title,
    keywords,
    search_intent: searchIntent,
    ai_citation_strategy: aiCitationStrategy,
    article_category: articleCategory,
    hashtags,
    confirmation_status: status,
    confirmed_by: cell(raw, "確認者") || cell(raw, "confirmed_by"),
    confirmed_at: cell(raw, "確認日") || cell(raw, "confirmed_at"),
    revision_comment: cell(raw, "修正コメント") || cell(raw, "revision_comment"),
    production_status: productionStatus,
    article_id: articleId,
    article_url: articleUrl,
    updated_at: cell(raw, "最終更新日") || cell(raw, "updated_at"),
  });
}

export function planConfirmationRowToCandidate({ client_id, row }) {
  const clientId = requireText(client_id, "client_id");
  const normalized = normalizePlanConfirmationRow(row);
  const title = requireText(normalized.title, "plan_confirmation_row.記事タイトル案");
    const category = requireText(normalized.article_category, "plan_confirmation_row.記事カテゴリ");
    const pillar = requireText(normalized.pillar || normalized.topic || normalized.keywords, "plan_confirmation_row.ピラー");
    const cluster = requireText(normalized.type === "ピラー" ? (normalized.cluster || normalized.pillar) : normalized.cluster, "plan_confirmation_row.クラスター");
    const searchIntent = requireText(normalized.search_intent, "plan_confirmation_row.検索意図");
  const keywords = parseKeywords(normalized.keywords);
  const mainKeyword = keywords[0] || normalized.topic || title;
  const deep = uniqueFour([mainKeyword, ...keywords.slice(1), normalized.topic, category], "");
  const support = uniqueTwoExcluding([category, normalized.topic, keywords[1]], deep, "");
  const responsibilityLabel = [
    shortTitle(title),
    `${mainKeyword}の判断`,
    deep.join(","),
    support.join(","),
  ].join("｜");
  return Object.freeze({
    client_id: clientId,
    article_id: normalized.article_id || normalized.confirmation_id || `PLAN-${normalized.production_order}`,
    title,
    category: cluster || normalized.topic || mainKeyword,
    pillar,
    cluster,
    articleCategory: category,
    responsibilityLabel,
    slug: normalizeStandardSlug(`${mainKeyword}-${shortTitle(title)}`),
    basicInfo: Object.freeze({
      mainKeyword,
      subKeywords: keywords.slice(1).join(","),
      searchIntent,
      articleCategory: category,
      hashtags: normalized.hashtags,
    }),
    deepDive: Object.freeze({
      conclusion: normalized.ai_citation_strategy || searchIntent,
    }),
    searchIntent,
  });
}

function validateRowsScope(rows, clientId) {
  if (!Array.isArray(rows)) throw new TypeError("plan_confirmation_rows must be an array");
  for (const [index, row] of rows.entries()) {
    if (row?.client_id && String(row.client_id).trim() !== clientId) {
      throw new Error(`CROSS_CLIENT_DATA_DETECTED:plan_confirmation_rows[${index}]`);
    }
  }
}

function stableConfirmationId(clientId, seed, sequence) {
  const hash = createHash("sha1").update(`${clientId}:${seed}:${sequence}`, "utf8").digest("hex").slice(0, 8).toUpperCase();
  return `${clientId}-PLAN-${String(sequence).padStart(3, "0")}-${hash}`;
}

const ADDITIONAL_TITLE_VARIANTS = Object.freeze([
  "導入前に確認する実務ポイント",
  "費用と運用負担の見方",
  "店舗で失敗しないチェックリスト",
  "比較検討で見るべき判断軸",
  "スタッフ運用まで含めた準備手順",
  "よくあるつまずきと解決策",
  "小規模店舗が押さえるべき基本",
  "多店舗運用で確認したい条件",
  "導入後に見直す改善ポイント",
  "サービス選定で迷ったときの考え方",
]);

function additionalTitleForSeed(seed, topic, variantIndex) {
  const explicitTitle = String(seed.title || "").trim();
  if (explicitTitle && variantIndex === 0) return explicitTitle;
  const variant = ADDITIONAL_TITLE_VARIANTS[variantIndex % ADDITIONAL_TITLE_VARIANTS.length];
  return `${topic}の${variant}`;
}

function additionalKeywordsForSeed(seed, topic, variantIndex) {
  const explicitKeywords = String(seed.keywords || "").trim();
  if (explicitKeywords && variantIndex === 0) return explicitKeywords;
  const variant = ADDITIONAL_TITLE_VARIANTS[variantIndex % ADDITIONAL_TITLE_VARIANTS.length];
  const normalizedVariant = variant
    .replace(/する/g, "")
    .replace(/の/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${topic} ${normalizedVariant}`;
}

export function validatePlanConfirmationCandidates(input = {}) {
  const clientId = requireText(input.client_id, "client_id");
  const rows = input.plan_confirmation_rows || input.rows || [];
  validateRowsScope(rows, clientId);
  const existingArticles = Array.isArray(input.existingArticles) ? input.existingArticles : [];
  const publishedSiteArticles = Array.isArray(input.publishedSiteArticles) ? input.publishedSiteArticles : [];
  const normalizedRows = rows.map(normalizePlanConfirmationRow);
  const titleSeen = new Map();
  const keywordSeen = new Map();
  const results = normalizedRows.map((row, index) => {
    const errors = [];
    const duplicateWarnings = [];
    for (const key of ["confirmation_id", "type", "pillar", "cluster", "title", "keywords", "search_intent", "ai_citation_strategy", "article_category", "hashtags"]) {
      if (!row[key]) errors.push(`${key}_REQUIRED`);
    }
    if (!["ピラー", "クラスター"].includes(row.type)) errors.push("type_MUST_BE_PILLAR_OR_CLUSTER");
    const titleKey = row.title.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
    const keywordKey = row.keywords.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
    if (titleKey) {
      if (titleSeen.has(titleKey)) errors.push(`DUPLICATE_PLAN_TITLE:${titleSeen.get(titleKey)}`);
      else titleSeen.set(titleKey, row.confirmation_id || `row-${row.row}`);
    }
    if (keywordKey) {
      if (keywordSeen.has(keywordKey)) duplicateWarnings.push(`DUPLICATE_PLAN_KEYWORDS:${keywordSeen.get(keywordKey)}`);
      else keywordSeen.set(keywordKey, row.confirmation_id || `row-${row.row}`);
    }
    let duplicateCheck = null;
    if (!errors.length) {
      const candidate = planConfirmationRowToCandidate({ client_id: clientId, row });
      duplicateCheck = analyzeDuplicateRisk({
        client_id: clientId,
        candidate,
        existingArticles,
        publishedSiteArticles,
        similarityThreshold: Number(input.similarityThreshold || 0.72),
      });
      if (duplicateCheck.status === "BLOCKED") errors.push("DUPLICATE_WITH_PRODUCTION_SHEET");
      if (duplicateCheck.status === "SITE_DUPLICATE_DECISION_REQUIRED") duplicateWarnings.push("OFFICIAL_SITE_DUPLICATE_DECISION_REQUIRED");
      if (duplicateCheck.status === "REVIEW_REQUIRED") duplicateWarnings.push("PRODUCTION_SHEET_SIMILARITY_REVIEW_REQUIRED");
    }
    return Object.freeze({
      row: row.row,
      production_order: row.production_order,
      confirmation_id: row.confirmation_id,
      title: row.title,
      status: errors.length ? "BLOCKED" : duplicateWarnings.length ? "REVIEW_REQUIRED" : "CLEAR",
      errors: Object.freeze(errors),
      warnings: Object.freeze(duplicateWarnings),
      duplicate_check: duplicateCheck,
      can_request_client_confirmation: errors.length === 0,
    });
  });
  const blocked = results.filter((item) => item.status === "BLOCKED");
  const reviewRequired = results.filter((item) => item.status === "REVIEW_REQUIRED");
  return Object.freeze({
    client_id: clientId,
    status: blocked.length ? "PLAN_CONFIRMATION_DUPLICATE_BLOCKED" : reviewRequired.length ? "PLAN_CONFIRMATION_REVIEW_REQUIRED" : "PLAN_CONFIRMATION_CANDIDATES_CLEAR",
    checked_count: results.length,
    blocked_count: blocked.length,
    review_required_count: reviewRequired.length,
    results: Object.freeze(results),
  });
}

export function selectNextApprovedPlan(input = {}) {
  const clientId = requireText(input.client_id, "client_id");
  const productionSheetUrl = requireText(input.production_sheet_url, "production_sheet_url");
  const userConfirmedArticleCreation = input.user_confirmed_article_creation === true;
  const rows = input.plan_confirmation_rows || input.rows || [];
  validateRowsScope(rows, clientId);
  const normalizedRows = rows
    .map(normalizePlanConfirmationRow)
    .sort((left, right) => left.production_order - right.production_order || left.row - right.row);
  const approved = normalizedRows.filter((row) => APPROVED_STATUSES.includes(normalizeStatus(row.confirmation_status)) || APPROVED_STATUSES.includes(row.confirmation_status));
  const next = approved.find((row) => !TERMINAL_PRODUCTION_STATUSES.includes(normalizeStatus(row.production_status)) && !row.article_url);
  if (!next) {
    return Object.freeze({
      client_id: clientId,
      status: approved.length ? "NO_APPROVED_PLAN_REMAINING" : "NO_APPROVED_PLAN_ROWS",
      next_plan: null,
      approved_count: approved.length,
    });
  }
  const duplicateValidation = validatePlanConfirmationCandidates({
    client_id: clientId,
    plan_confirmation_rows: [next],
    existingArticles: input.existingArticles || [],
    publishedSiteArticles: input.publishedSiteArticles || [],
    similarityThreshold: input.similarityThreshold,
  });
  const result = duplicateValidation.results[0];
  if (result.status === "BLOCKED") {
    return Object.freeze({
      client_id: clientId,
      status: "NEXT_APPROVED_PLAN_BLOCKED_BY_DUPLICATE",
      next_plan: next,
      duplicate_validation: result,
    });
  }
  const candidate = planConfirmationRowToCandidate({ client_id: clientId, row: next });
  const creationConfirmation = Object.freeze({
    required: true,
    confirmed: userConfirmedArticleCreation,
    status: userConfirmedArticleCreation ? "ARTICLE_CREATION_USER_CONFIRMATION_CONFIRMED" : "AWAITING_ARTICLE_CREATION_USER_CONFIRMATION",
    prompt: "次の内容で1記事を作成してよいですか？問題なければ「OK」「承認」「この内容で作成」などで回答してください。",
    confirmation_required_before: "ARTICLE_BODY_IMAGE_DRIVE_SHEETS_OUTPUT",
    article_summary: Object.freeze({
      title: candidate.title,
      article_category: candidate.articleCategory,
      hashtags: candidate.basicInfo.hashtags,
      type: next.type,
      pillar: next.pillar,
      cluster: next.cluster,
      main_keyword: candidate.basicInfo.mainKeyword,
      sub_keywords: candidate.basicInfo.subKeywords,
      search_intent: candidate.searchIntent,
      responsibility_label: candidate.responsibilityLabel,
      planned_content: next.ai_citation_strategy || candidate.deepDive.conclusion,
    }),
  });
  return Object.freeze({
    client_id: clientId,
    status: userConfirmedArticleCreation
      ? (result.status === "REVIEW_REQUIRED" ? "NEXT_APPROVED_PLAN_REQUIRES_REVIEW" : "NEXT_APPROVED_PLAN_READY")
      : "AWAITING_ARTICLE_CREATION_USER_CONFIRMATION",
    selection_policy: "APPROVED_ROWS_IN_PRODUCTION_ORDER",
    next_plan: next,
    article_candidate: candidate,
    article_creation_user_confirmation: creationConfirmation,
    article_plan_confirmation: Object.freeze({
      confirmed: true,
      client_id: clientId,
      article_id: next.article_id || "",
      title: next.title,
      article_category: next.article_category,
      hashtags: next.hashtags,
      user_id: next.confirmed_by || "client-confirmation-sheet",
      confirmed_at: next.confirmed_at || null,
      plan_confirmation_sheet: Object.freeze({
        sheet_name: "企画確認",
        production_sheet_url: productionSheetUrl,
        row: next.row,
        confirmation_status: next.confirmation_status,
        confirmed_by: next.confirmed_by || "client-confirmation-sheet",
        confirmed_at: next.confirmed_at || null,
      }),
    }),
    duplicate_validation: result,
  });
}

export function preparePlanConfirmationSheet(input = {}) {
  const clientId = requireText(input.client_id, "client_id");
  const productionSheetUrl = String(input.production_sheet_url || "").trim() || null;
  return Object.freeze({
    client_id: clientId,
    production_sheet_url: productionSheetUrl,
    status: "READY_FOR_PLAN_CONFIRMATION_SHEET",
    sheet_name: "企画確認",
    columns: STANDARD_PLAN_CONFIRMATION_SHEET_COLUMNS,
    header_row: 1,
    data_start_row: 2,
    default_row_count: 50,
    approval_status_values: APPROVED_STATUSES,
    editable_columns: Object.freeze(["確認ステータス", "確認者", "確認日", "修正コメント"]),
    system_columns: Object.freeze(["制作順", "確認ID", "制作状態", "記事ID", "記事URL", "最終更新日"]),
    type_values: Object.freeze(["ピラー", "クラスター"]),
    type_policy: "種別はピラー（親テーマ）またはクラスター（子テーマ）のみ。クラスター行はピラー列で親テーマ、クラスター列で派生テーマを示す。",
    queue_policy: "確認ステータスがOK/承認/APPROVEDで、制作状態が未完了かつ記事URLが空の行を、制作順の昇順で1件ずつ処理する",
  });
}

export function prepareAdditionalPlanConfirmationIdeas(input = {}) {
  const clientId = requireText(input.client_id, "client_id");
  const productionSheetUrl = requireText(input.production_sheet_url, "production_sheet_url");
  const existingRows = (input.existing_plan_confirmation_rows || input.plan_confirmation_rows || []).map(normalizePlanConfirmationRow);
  const requestedCount = Number(input.count ?? 50);
  if (!Number.isInteger(requestedCount) || requestedCount <= 0) throw new TypeError("count must be a positive integer");
  const maxOrder = existingRows.reduce((max, row) => Math.max(max, row.production_order || 0), 0);
  const maxSequence = existingRows.reduce((max, row) => {
    const match = String(row.confirmation_id || "").match(/PLAN-(\d+)/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  const seedTopics = (Array.isArray(input.seed_topics) ? input.seed_topics : [])
    .map((item) => typeof item === "string" ? { topic: item } : item)
    .filter(Boolean);
  if (seedTopics.length === 0) throw new Error("SEED_TOPICS_REQUIRED_FOR_ADDITIONAL_50");
  const existingTitles = new Set(existingRows.map((row) => row.title).filter(Boolean));
  const rows = [];
  let cursor = 0;
  const maxAttempts = Math.max(requestedCount * 4, seedTopics.length * ADDITIONAL_TITLE_VARIANTS.length * 2);
  while (rows.length < requestedCount && cursor < maxAttempts) {
    const seed = seedTopics[cursor % seedTopics.length];
    const variantIndex = Math.floor(cursor / seedTopics.length);
    const sequence = maxSequence + rows.length + 1;
    const order = maxOrder + rows.length + 1;
    const topic = String(seed.topic || seed.keyword || seed.title || "").trim();
    const pillar = String(seed.pillar || seed.pillar_keyword || seed.parent_topic || topic).trim();
    const cluster = String(seed.cluster || seed.cluster_keyword || seed.child_topic || topic).trim();
    const type = normalizePlanType(seed.type, pillar === cluster ? "ピラー" : "クラスター");
    const title = additionalTitleForSeed(seed, topic, variantIndex);
    cursor += 1;
    if (!topic || existingTitles.has(title)) continue;
    existingTitles.add(title);
    rows.push(Object.freeze({
      "制作順": order,
      "確認ID": stableConfirmationId(clientId, title, sequence),
      "記事トピック": topic,
      "種別": type,
      "ピラー": pillar,
      "クラスター": type === "ピラー" ? (cluster || pillar) : cluster,
      "記事タイトル案": title,
      "対策キーワード": additionalKeywordsForSeed(seed, topic, variantIndex),
      "検索意図": String(seed.search_intent || seed.searchIntent || `${topic}について導入前の判断材料を知りたい。`),
      "AI引用戦略": String(seed.ai_citation_strategy || seed.aiCitationStrategy || `${topic}に関する公式情報と店舗運用上の確認点を整理し、判断基準として引用されやすい構成にする。`),
      "記事カテゴリ": String(seed.article_category || seed.articleCategory || "導入前チェック"),
      "ハッシュタグ": cleanHashtags(seed.hashtags || `${topic},PAYGATE,キャッシュレス決済`),
      "確認ステータス": "確認待ち",
      "確認者": "",
      "確認日": "",
      "修正コメント": "追加依頼時に自動追記。OK後、制作順に従って記事制作へ進行。",
      "制作状態": "未着手",
      "記事ID": "",
      "記事URL": "",
      "最終更新日": "",
    }));
  }
  if (rows.length !== requestedCount) throw new Error(`ADDITIONAL_PLAN_IDEAS_INSUFFICIENT:${rows.length}/${requestedCount}`);
  const validation = validatePlanConfirmationCandidates({
    client_id: clientId,
    plan_confirmation_rows: rows,
    existingArticles: input.existingArticles || [],
    publishedSiteArticles: input.publishedSiteArticles || [],
    similarityThreshold: input.similarityThreshold,
  });
  return Object.freeze({
    client_id: clientId,
    production_sheet_url: productionSheetUrl,
    status: validation.status === "PLAN_CONFIRMATION_DUPLICATE_BLOCKED"
      ? "ADDITIONAL_PLAN_CONFIRMATION_IDEAS_BLOCKED"
      : "READY_TO_APPEND_PLAN_CONFIRMATION_IDEAS",
    append_start_order: maxOrder + 1,
    append_count: rows.length,
    sheet_name: "企画確認",
    columns: STANDARD_PLAN_CONFIRMATION_SHEET_COLUMNS,
    rows: Object.freeze(rows),
    duplicate_validation: validation,
  });
}
