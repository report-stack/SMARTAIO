import { requireClientId } from "./client-scope.mjs";

const REPORT_TYPES = Object.freeze({
  WEEKLY: Object.freeze({ label: "週次", requiredPeriodKey: "week" }),
  MONTHLY: Object.freeze({ label: "月次", requiredPeriodKey: "month" }),
});
const REPORT_OUTPUTS = Object.freeze({
  GOOGLE_DOC: Object.freeze({
    mime_type: "application/vnd.google-apps.document",
    storage_folder: "07_順位・分析",
    primary_link_label: "レポートGoogleドキュメント",
  }),
  GOOGLE_SHEET: Object.freeze({
    mime_type: "application/vnd.google-apps.spreadsheet",
    storage_folder: "07_順位・分析",
    primary_link_label: "レポートGoogleスプレッドシート",
  }),
});

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function normalizeDate(value, name) {
  const text = requireText(value, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`REPORT_${name.toUpperCase()}_INVALID`);
  return text;
}

function normalizeOutputFormat(value) {
  const format = String(value || "GOOGLE_DOC").trim().toUpperCase();
  if (!REPORT_OUTPUTS[format]) throw new Error(`UNKNOWN_REPORT_OUTPUT_FORMAT:${format}`);
  return format;
}

function assertClientItems(items, clientId, label) {
  if (!Array.isArray(items)) throw new TypeError(`${label} must be an array`);
  return Object.freeze(items.map((item, index) => {
    if (String(item?.client_id || "").trim() !== clientId) throw new Error(`CROSS_CLIENT_DATA_DETECTED:${label}[${index}]`);
    return Object.freeze({ ...item, client_id: clientId });
  }));
}

function rankingTrend(current, previous) {
  const now = Number(current);
  const before = Number(previous);
  if (!Number.isFinite(now) || !Number.isFinite(before)) return "UNKNOWN";
  if (now < before) return "UP";
  if (now > before) return "DOWN";
  return "UNCHANGED";
}

function summarizeArticles(articles) {
  return Object.freeze(articles.map((article) => Object.freeze({
    article_id: requireText(article.article_id, "article.article_id"),
    title: requireText(article.title, "article.title"),
    action_type: requireText(article.action_type || article.workflow_type || "NEW_ARTICLE", "article.action_type"),
    status: String(article.status || article.workflow_status || "").trim() || "UNKNOWN",
    document_url: String(article.document_url || article.doc_url || "").trim() || null,
    wordpress_url: String(article.wordpress_url || "").trim() || null,
    published_at: String(article.published_at || "").trim() || null,
    completed_at: String(article.completed_at || article.updated_at || "").trim() || null,
  })));
}

function summarizeRewrites(rewrites) {
  return Object.freeze(rewrites.map((rewrite) => Object.freeze({
    article_id: requireText(rewrite.article_id, "rewrite.article_id"),
    title: requireText(rewrite.title, "rewrite.title"),
    rewrite_type: requireText(rewrite.rewrite_type || "CONTENT_UPDATE", "rewrite.rewrite_type"),
    reason: requireText(rewrite.reason, "rewrite.reason"),
    before_url: String(rewrite.before_url || "").trim() || null,
    after_url: String(rewrite.after_url || rewrite.document_url || "").trim() || null,
    completed_at: String(rewrite.completed_at || rewrite.updated_at || "").trim() || null,
  })));
}

function summarizeRankings(rankings) {
  return Object.freeze(rankings.map((ranking) => {
    const currentRank = Number(ranking.current_rank);
    const previousRank = Number(ranking.previous_rank);
    return Object.freeze({
      article_id: String(ranking.article_id || "").trim() || null,
      keyword: requireText(ranking.keyword, "ranking.keyword"),
      device: String(ranking.device || "desktop").trim(),
      previous_rank: Number.isFinite(previousRank) ? previousRank : null,
      current_rank: Number.isFinite(currentRank) ? currentRank : null,
      trend: rankingTrend(currentRank, previousRank),
      measured_at: requireText(ranking.measured_at, "ranking.measured_at"),
      source: requireText(ranking.source || "ranking-provider", "ranking.source"),
    });
  }));
}

function summarizeInsights({ articles, rewrites, rankings, learnings }) {
  const rankUps = rankings.filter((item) => item.trend === "UP").length;
  const rankDowns = rankings.filter((item) => item.trend === "DOWN").length;
  const articleIdsWithRankings = new Set(rankings.map((item) => item.article_id).filter(Boolean));
  return Object.freeze([
    `${articles.length}件の記事作成、${rewrites.length}件のリライトを記録`,
    `順位計測は${rankings.length}件、上昇${rankUps}件、下落${rankDowns}件`,
    `順位計測済みの記事IDは${articleIdsWithRankings.size}件`,
    ...learnings.map((item) => requireText(item.summary || item.rule || item, "learning")),
  ]);
}

export function createPerformanceReport(input = {}) {
  const clientId = requireClientId(input.client_id);
  const type = requireText(input.report_type || input.type, "report_type").toUpperCase();
  const definition = REPORT_TYPES[type];
  if (!definition) throw new Error(`UNKNOWN_REPORT_TYPE:${type}`);
  const outputFormat = normalizeOutputFormat(input.output_format || input.outputFormat);
  const output = REPORT_OUTPUTS[outputFormat];
  const periodStart = normalizeDate(input.period_start, "period_start");
  const periodEnd = normalizeDate(input.period_end, "period_end");
  if (periodEnd < periodStart) throw new Error("REPORT_PERIOD_INVALID");

  const articles = summarizeArticles(assertClientItems(input.articles || [], clientId, "articles"));
  const rewrites = summarizeRewrites(assertClientItems(input.rewrites || [], clientId, "rewrites"));
  const rankings = summarizeRankings(assertClientItems(input.rankings || [], clientId, "rankings"));
  const learnings = assertClientItems(input.learnings || [], clientId, "learnings");
  const outputFolderUrl = String(input.output_folder_url || "").trim() || null;

  return Object.freeze({
    report_id: requireText(input.report_id || `${clientId}_${type}_${periodStart}_${periodEnd}`, "report_id"),
    client_id: clientId,
    report_type: type,
    report_label: `${definition.label}レポート`,
    period_start: periodStart,
    period_end: periodEnd,
    status: "READY_FOR_REPORT_OUTPUT",
    output_format: outputFormat,
    output_mime_type: output.mime_type,
    output_folder_url: outputFolderUrl,
    output_folder_name: output.storage_folder,
    output_contract: Object.freeze({
      primary_artifact: outputFormat,
      primary_link_label: output.primary_link_label,
      storage_folder: output.storage_folder,
      record_index_in_management_sheet: true,
      client_scope_required: true,
      secrets_allowed: false,
    }),
    sections: Object.freeze({
      articles,
      rewrites,
      rankings,
      insights: summarizeInsights({ articles, rewrites, rankings, learnings }),
      next_actions: Object.freeze((input.next_actions || []).map((item) => requireText(item, "next_action"))),
    }),
    required_sources: Object.freeze(["記事一覧", "実行履歴", "レビュー", "順位・分析", "公開URL"]),
    google_doc_title: `${clientId}_${definition.label}レポート_${periodStart}_${periodEnd}`,
    google_sheet_title: `${clientId}_${definition.label}レポート_${periodStart}_${periodEnd}`,
    stores_secrets: false,
    markdown_lines: Object.freeze([
      `# ${clientId} ${definition.label}レポート（${periodStart}〜${periodEnd}）`,
      `出力形式: ${output.primary_link_label}`,
      `記事作成: ${articles.length}件`,
      `リライト: ${rewrites.length}件`,
      `順位計測: ${rankings.length}件`,
    ]),
  });
}

export function createReportSchedulePlan(input = {}) {
  const clientId = requireClientId(input.client_id);
  const outputFormat = normalizeOutputFormat(input.output_format || input.outputFormat);
  const weeklyDay = requireText(input.weekly_day || "MON", "weekly_day").toUpperCase();
  const weeklyTime = requireText(input.weekly_time || "09:00", "weekly_time");
  const monthlyDay = Number(input.monthly_day || 1);
  if (!/^(MON|TUE|WED|THU|FRI|SAT|SUN)$/.test(weeklyDay)) throw new Error("REPORT_WEEKLY_DAY_INVALID");
  if (!/^\d{2}:\d{2}$/.test(weeklyTime)) throw new Error("REPORT_WEEKLY_TIME_INVALID");
  if (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 28) throw new Error("REPORT_MONTHLY_DAY_INVALID");
  return Object.freeze({
    plan_id: requireText(input.plan_id || `report_schedule_${clientId}`, "plan_id"),
    client_id: clientId,
    timezone: requireText(input.timezone || "Asia/Tokyo", "timezone"),
    tasks: Object.freeze([
      Object.freeze({
        task_id: `${clientId}_weekly_report`,
        client_id: clientId,
        task_type: "WEEKLY_PERFORMANCE_REPORT",
        schedule_expression: `weekly@${weeklyDay}:${weeklyTime}`,
        output_format: outputFormat,
        output_folder_name: REPORT_OUTPUTS[outputFormat].storage_folder,
        external_execution_allowed: false,
        human_enable_required: true,
      }),
      Object.freeze({
        task_id: `${clientId}_monthly_report`,
        client_id: clientId,
        task_type: "MONTHLY_PERFORMANCE_REPORT",
        schedule_expression: `monthly@${monthlyDay}:${weeklyTime}`,
        output_format: outputFormat,
        output_folder_name: REPORT_OUTPUTS[outputFormat].storage_folder,
        external_execution_allowed: false,
        human_enable_required: true,
      }),
    ]),
    requires_human_enable: true,
    stores_secrets: false,
    generated_at: requireText(input.generated_at || new Date().toISOString(), "generated_at"),
  });
}

export const PERFORMANCE_REPORT_OUTPUT_FORMATS = Object.freeze(Object.keys(REPORT_OUTPUTS));
