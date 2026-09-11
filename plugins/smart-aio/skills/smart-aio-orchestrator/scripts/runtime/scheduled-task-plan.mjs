// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.
import { parseDailySchedule } from "./news-ranking-scheduler.mjs";
import { createReportSchedulePlan } from "./performance-reporting.mjs";

const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|password|credential)/i;

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function assertNoSecrets(value, path = "input") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key) && child !== undefined && child !== null && String(child).trim()) {
      throw new Error(`SECRET_MUST_NOT_BE_STORED:${path}.${key}`);
    }
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function validateFeeds(clientId, feeds) {
  if (!Array.isArray(feeds)) throw new TypeError("news.feeds must be an array");
  return Object.freeze(feeds.map((feed, index) => {
    if (String(feed.client_id || "").trim() !== clientId) throw new Error(`CROSS_CLIENT_DATA_DETECTED:news.feeds[${index}]`);
    return Object.freeze({
      client_id: clientId,
      feed_id: requireText(feed.feed_id, `news.feeds[${index}].feed_id`),
      source_url: requireText(feed.source_url, `news.feeds[${index}].source_url`),
      industry: requireText(feed.industry, `news.feeds[${index}].industry`),
      include_keywords: Object.freeze((feed.include_keywords || []).map((keyword) => requireText(keyword, "include_keyword"))),
      exclude_keywords: Object.freeze((feed.exclude_keywords || []).map((keyword) => requireText(keyword, "exclude_keyword"))),
      enabled: feed.enabled !== false,
    });
  }));
}

function taskRecord({ clientId, type, scheduleExpression, timeZone, status, reason, payload }) {
  parseDailySchedule(scheduleExpression);
  return Object.freeze({
    task_id: `${clientId}_${type.toLowerCase()}`,
    client_id: clientId,
    task_type: type,
    schedule_expression: scheduleExpression,
    timezone: timeZone,
    status,
    reason,
    payload: Object.freeze(payload),
    external_execution_allowed: false,
    human_enable_required: true,
  });
}

function reportTaskRecord({ clientId, reportTask, timeZone, status }) {
  return Object.freeze({
    task_id: reportTask.task_id,
    client_id: clientId,
    task_type: reportTask.task_type,
    schedule_expression: reportTask.schedule_expression,
    timezone: timeZone,
    status,
    reason: "週次・月次レポートは顧客別データだけを集計し、未接続データは未取得として出力する",
    payload: Object.freeze({
      output_format: reportTask.output_format,
      output_folder_name: reportTask.output_folder_name,
      output: "PERFORMANCE_REPORT",
      required_sources: Object.freeze(["記事一覧", "実行履歴", "レビュー", "順位・分析", "WordPressURL"]),
      record_index_in_management_sheet: true,
    }),
    external_execution_allowed: false,
    human_enable_required: true,
  });
}

function buildEnableConfirmationPrompt({ clientId, tasks }) {
  const readyTasks = tasks.filter((task) => task.status === "READY_TO_ENABLE");
  const lines = readyTasks.map((task) => `- ${task.task_type}: ${task.schedule_expression}`);
  return [
    `${clientId} の定期処理設定案を作成しました。以下の定期処理を有効化しますか？`,
    ...lines,
    "有効化する場合は「有効化する」と明示してください。まだ有効化しない場合は設定案だけ保存し、外部実行は開始しません。",
  ].join("\n");
}

export function createScheduledTaskPlan(input = {}) {
  assertNoSecrets(input);
  const clientId = requireText(input.client_id, "client_id");
  const timeZone = requireText(input.timezone || "Asia/Tokyo", "timezone");
  const newsSchedule = requireText(input.news?.schedule_expression || "daily@07:00", "news.schedule_expression");
  const rankingSchedule = requireText(input.ranking?.schedule_expression || "daily@08:00", "ranking.schedule_expression");
  const feeds = validateFeeds(clientId, input.news?.feeds || []);
  const enabledFeeds = feeds.filter((feed) => feed.enabled);
  const newsStatus = enabledFeeds.length > 0 ? "READY_TO_ENABLE" : "NEEDS_CLIENT_INPUT";
  const rankingEnabled = input.ranking?.enabled === true;
  const rankingProvider = String(input.ranking?.provider || "").trim();
  const rankingConnected = input.ranking?.provider_connected === true;
  const rankingStatus = rankingEnabled && rankingProvider && rankingConnected ? "READY_TO_ENABLE" : "PREPARATION_ONLY";
  const reportSchedule = createReportSchedulePlan({
    client_id: clientId,
    output_format: input.report?.output_format || input.report?.outputFormat || "GOOGLE_DOC",
    weekly_day: input.report?.weekly_day || "MON",
    weekly_time: input.report?.weekly_time || "09:00",
    monthly_day: input.report?.monthly_day || 1,
    timezone: timeZone,
    generated_at: input.generated_at || new Date().toISOString(),
  });
  const reportStatus = input.report?.enabled === false ? "PREPARATION_ONLY" : "READY_TO_ENABLE";
  const tasks = Object.freeze([
    taskRecord({
      clientId,
      type: "DAILY_NEWS_COLLECTION",
      scheduleExpression: newsSchedule,
      timeZone,
      status: newsStatus,
      reason: newsStatus === "READY_TO_ENABLE" ? "顧客別ニュース取得条件が揃っている" : "ニュース取得元とキーワードの登録が必要",
      payload: { feeds: enabledFeeds, output: "NEWS_INBOX", duplicate_policy: "CLIENT_SCOPED_CANONICAL_URL_AND_FINGERPRINT" },
    }),
    taskRecord({
      clientId,
      type: "DAILY_RANKING_CHECK",
      scheduleExpression: rankingSchedule,
      timeZone,
      status: rankingStatus,
      reason: rankingStatus === "READY_TO_ENABLE" ? "順位取得サービスの接続確認済み" : "Ahrefs等の接続情報が揃うまで実行しない",
      payload: {
        provider: rankingProvider || null,
        domain: String(input.ranking?.domain || "").trim() || null,
        keywords: Object.freeze((input.ranking?.keywords || []).map((keyword) => requireText(keyword, "ranking.keyword"))),
        output: "RANKING_SNAPSHOT",
      },
    }),
    ...reportSchedule.tasks.map((reportTask) => reportTaskRecord({
      clientId,
      reportTask,
      timeZone,
      status: reportStatus,
    })),
  ]);
  return Object.freeze({
    plan_id: requireText(input.plan_id || `automation_${clientId}`, "plan_id"),
    client_id: clientId,
    timezone: timeZone,
    tasks,
    ready_task_count: tasks.filter((task) => task.status === "READY_TO_ENABLE").length,
    requires_human_enable: true,
    activation_confirmation_required: true,
    activation_prompt_required_before_app_setup: true,
    activation_prompt: buildEnableConfirmationPrompt({ clientId, tasks }),
    activation_choices: Object.freeze(["有効化する", "まだ有効化しない"]),
    stores_secrets: false,
    generated_at: requireText(input.generated_at || new Date().toISOString(), "generated_at"),
  });
}

export function authorizeScheduledTask(plan, authorization = {}) {
  if (!plan?.client_id || !Array.isArray(plan.tasks)) throw new Error("INVALID_SCHEDULED_TASK_PLAN");
  if (String(authorization.client_id || "").trim() !== plan.client_id) throw new Error("CROSS_CLIENT_DATA_DETECTED:scheduled_task_authorization");
  const taskId = requireText(authorization.task_id, "task_id");
  const task = plan.tasks.find((candidate) => candidate.task_id === taskId);
  if (!task) throw new Error(`UNKNOWN_SCHEDULED_TASK:${taskId}`);
  if (task.status !== "READY_TO_ENABLE") throw new Error(`SCHEDULED_TASK_NOT_READY:${taskId}`);
  if (authorization.approval_status !== "APPROVED") throw new Error("SCHEDULED_TASK_APPROVAL_REQUIRED");
  const role = requireText(authorization.approver_role, "approver_role").toUpperCase();
  if (!new Set(["OPERATIONS_OWNER", "WORKSPACE_ADMIN", "WORKSPACE_OWNER"]).has(role)) throw new Error("SCHEDULED_TASK_APPROVER_ROLE_REQUIRED");
  return Object.freeze({
    ...task,
    status: "AUTHORIZED_FOR_APP_SETUP",
    authorization: Object.freeze({
      approver_user_id: requireText(authorization.approver_user_id, "approver_user_id"),
      approver_role: role,
      approved_at: requireText(authorization.approved_at || new Date().toISOString(), "approved_at"),
    }),
    external_execution_allowed: false,
  });
}
