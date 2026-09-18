import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  loadContentPromptRegistry,
  verifyContentPromptRegistry,
} from "../skills/content-prompts/scripts/content_prompt_registry.mjs";
import {
  STANDARD_ARTICLE_SHEET_COLUMNS,
  STANDARD_CLIENT_WORKBOOK_SHEETS,
  STANDARD_CLUSTER_SHEET_COLUMNS,
  STANDARD_KEYWORD_SHEET_COLUMNS,
  STANDARD_PLAN_CONFIRMATION_SHEET_COLUMNS,
  prepareClientNewsSettingsTemplate,
  prepareClientProductionSheet,
  prepareClientSourceRegister,
  prepareStandardArticleRecordUpdate,
  prepareStandardDocumentOutput,
  prepareStandardClientOnboarding,
  resolveActiveClientRegistration,
  validateClientProductionSheet,
  validateClientSourceRegister,
  validateStandardBasicInfoOutput,
  validateStandardSiteTitleOutput,
} from "../skills/smart-aio-orchestrator/scripts/runtime/system-contract.mjs";
import {
  allocateStandardArticleId,
  finalizeStandardArticleIdeaOutput,
  prepareArticleRun,
  selectInternalLinkCandidates,
  validateStandardArticleIdeaOutput,
} from "../skills/article-production/scripts/article_workflow.mjs";
import { normalizeApprovalDecision } from "../skills/smart-aio-orchestrator/scripts/runtime/approval-gate.mjs";
import { ARTICLE_PRODUCTION_STAGES } from "../skills/smart-aio-orchestrator/scripts/runtime/article-production-lifecycle.mjs";
import { prepareArticleCompletionReport } from "../skills/smart-aio-orchestrator/scripts/runtime/completion-report.mjs";
import { createDeletionPlan } from "../skills/smart-aio-orchestrator/scripts/runtime/deletion-plan.mjs";
import { SMART_AIO_PLUGIN_VERSION } from "../skills/smart-aio-orchestrator/scripts/runtime/version.mjs";
import {
  evaluateStageReview,
  prepareStageReview,
} from "../skills/smart-aio-orchestrator/scripts/runtime/quality-lifecycle.mjs";
import { auditStandardClientRun, verifyArticleDocumentReadbackEvidence } from "../skills/smart-aio-orchestrator/scripts/runtime/standard-run-audit.mjs";
import { createScheduledTaskPlan } from "../skills/smart-aio-orchestrator/scripts/runtime/scheduled-task-plan.mjs";
import { createPerformanceReport, createReportSchedulePlan } from "../skills/smart-aio-orchestrator/scripts/runtime/performance-reporting.mjs";
import {
  prepareAdditionalPlanConfirmationIdeas,
  preparePlanConfirmationSheet,
  selectNextApprovedPlan,
  validatePlanConfirmationCandidates,
} from "../skills/smart-aio-orchestrator/scripts/runtime/plan-confirmation-queue.mjs";
import { prepareStandardImageSet } from "../skills/smart-aio-orchestrator/scripts/runtime/content-runtime.mjs";
import { analyzePerformanceFeedback, proposePerformanceSkillUpdate } from "../skills/smart-aio-orchestrator/scripts/runtime/performance-feedback-loop.mjs";
import {
  buildStructuredMarkupOutput,
  planInternalLinkGraph,
  prepareInternalLinkSheetOutput,
  prepareRewriteArtifactOutput,
  prepareRewritePlan,
  verifyInternalLinkGraph,
  verifyStructuredMarkupOutput,
} from "../skills/smart-aio-orchestrator/scripts/runtime/content-optimization.mjs";
import { verifyArticleVisualPersistence } from "../skills/smart-aio-orchestrator/scripts/runtime/image-persistence.mjs";
import { reviewArticle } from "../skills/article-quality-review/scripts/review_article.mjs";

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const blockedExpressions = [
  String.fromCharCode(108, 101, 103, 97, 99, 121),
  String.fromCharCode(26087),
  String.fromCharCode(84, 79, 82, 65, 73, 90),
  String.fromCharCode(12488, 12521, 12452, 12474),
  Buffer.from("Ym91bmQgZ2Fz", "base64").toString("utf8"),
  Buffer.from("c3RhbmRhcmQgZ2Fz", "base64").toString("utf8"),
  Buffer.from("aW1hZ2UtY29tcG9zaXRpb25zLWZpeGVkLWdhcw==", "base64").toString("utf8"),
  Buffer.from("c291cmNlX3NwcmVhZHNoZWV0X2lk", "base64").toString("utf8"),
  Buffer.from("c291cmNlX3NoZWV0", "base64").toString("utf8"),
  Buffer.from("U21hcnQgQUlP5qiZ5rqW", "base64").toString("utf8"),
  Buffer.from("5Yi25L2c6KaP5YmH", "base64").toString("utf8"),
];

async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    const info = await stat(path);
    if (info.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
}

function planConfirmationSheetEvidence(overrides = {}) {
  return {
    sheet_name: "企画確認",
    production_sheet_url: "https://docs.google.com/spreadsheets/d/example/edit",
    row: 3,
    confirmation_status: "承認",
    confirmed_by: "client-1",
    confirmed_at: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

test("protected prompt registry and assembly rules verify", async () => {
  const result = await verifyContentPromptRegistry();
  assert.equal(result.version, "content-v1");
  assert.equal(result.promptCount, 6);
  assert.equal(result.assemblyRuleCount, 6);
  assert.equal(result.sourceFileCount, 2);
});

test("protected prompt registry exposes only current-system metadata", async () => {
  const registry = await loadContentPromptRegistry();
  assert.deepEqual(Object.keys(registry).sort(), ["prompts", "version"]);
  for (const item of Object.values(registry.prompts)) {
    assert.deepEqual(Object.keys(item).sort(), ["length", "sha256", "value"]);
  }
});

test("production sheet contract rejects embedded sheet scripts", () => {
  const plan = prepareClientProductionSheet({
    client_id: "C001",
    client_name: "C001_Example",
    client_drive_url: "https://drive.google.com/drive/folders/example",
  });
  assert.deepEqual(plan.script_policy, {
    embedded_sheet_scripts: false,
    openai_api_calls: false,
    operation: "SMART_AIO_SKILLS_ONLY",
  });
  assert.equal(plan.smartaio_root_url, "https://drive.google.com/drive/folders/0AJAK01qgUBq4Uk9PVA");
  assert.equal(plan.client_folder_parent_url, plan.smartaio_root_url);
  assert.notEqual(plan.client_drive_url, plan.smartaio_root_url);
  assert.throws(() => prepareClientProductionSheet({
    client_id: "C001",
    client_name: "C001_Example",
    client_drive_url: "https://drive.google.com/drive/folders/0AJAK01qgUBq4Uk9PVA",
  }), /CLIENT_DRIVE_FOLDER_MUST_NOT_BE_SMARTAIO_ROOT/);
  const validation = validateClientProductionSheet({
    client_id: "C001",
    production_sheet_url: "https://docs.google.com/spreadsheets/d/example/edit",
    sheet_names: plan.operator_view.visible_sheets,
    article_headers: plan.sheets.記事一覧.columns,
    plan_confirmation_headers: plan.sheets.企画確認.columns,
    keyword_headers: plan.sheets.キーワード.columns,
    cluster_headers: plan.sheets.クラスター.columns,
    uses_embedded_sheet_scripts: true,
  });
  assert.ok(validation.errors.includes("EMBEDDED_SHEET_SCRIPTS_NOT_ALLOWED"));
});

test("article sheet tracks rewrite and internal link state with dates and management URLs", () => {
  assert.ok(STANDARD_ARTICLE_SHEET_COLUMNS.includes("メタディスクリプション"));
  assert.ok(STANDARD_ARTICLE_SHEET_COLUMNS.includes("公開URL"));
  assert.ok(STANDARD_ARTICLE_SHEET_COLUMNS.indexOf("公開URL") < STANDARD_ARTICLE_SHEET_COLUMNS.indexOf("WordPressURL"));
  assert.deepEqual(STANDARD_ARTICLE_SHEET_COLUMNS.slice(-6), [
    "内部リンク状態",
    "内部リンク最終確認日",
    "内部リンク管理URL",
    "リライト状態",
    "最終リライト日",
    "リライト管理URL",
  ]);
  const plan = prepareClientProductionSheet({
    client_id: "C001",
    client_name: "C001_Example",
    client_drive_url: "https://drive.google.com/drive/folders/example",
  });
  assert.deepEqual(plan.sheets.記事一覧.columns, STANDARD_ARTICLE_SHEET_COLUMNS);

  const workbookPath = join(pluginRoot, "assets", "Smart_AIO_クライアント別記事制作シート_テンプレート.xlsx");
  const articleSheetXml = execFileSync("unzip", ["-p", workbookPath, "xl/worksheets/sheet3.xml"], { encoding: "utf8" });
  assert.match(articleSheetXml, /sqref="B3:B102"/);
  assert.doesNotMatch(articleSheetXml, /sqref="C3:C102"/);
  assert.doesNotMatch(articleSheetXml, /sqref="H3:H102"/);
});

test("article sheet writes resolve by header for the live leading-blank layout", async () => {
  const liveHeaders = ["", ...STANDARD_ARTICLE_SHEET_COLUMNS];
  const confirmedInput = validArticleIdeaInput({
    article_headers: liveHeaders,
    completed_on: "2026-09-16",
    article_plan_confirmation: {
      confirmed: true,
      client_id: "C001",
      title: "AIO対策は診断から始める｜企業サイト改善の7つの確認項目",
      article_category: "AIO対策",
      hashtags: "#AIO対策 #AI検索対策",
      user_id: "user-1",
      plan_confirmation_sheet: planConfirmationSheetEvidence(),
    },
  });
  const validation = validateStandardArticleIdeaOutput(confirmedInput);
  const finalized = await finalizeStandardArticleIdeaOutput({ ...confirmedInput, validation });
  assert.equal(finalized.sheet_updates.D, "ID-00001");
  assert.equal(finalized.sheet_updates.H, confirmedInput.ideas[0].summary);
  assert.equal(finalized.sheet_updates.I, confirmedInput.ideas[0].summary);
  assert.equal(finalized.sheet_updates.U, confirmedInput.ideas[0].slug);

  const validationResult = validateClientProductionSheet({
    client_id: "C001",
    production_sheet_url: "https://docs.google.com/spreadsheets/d/example/edit",
    sheet_names: STANDARD_CLIENT_WORKBOOK_SHEETS,
    article_headers: liveHeaders,
    plan_confirmation_headers: STANDARD_PLAN_CONFIRMATION_SHEET_COLUMNS,
    keyword_headers: STANDARD_KEYWORD_SHEET_COLUMNS,
    cluster_headers: STANDARD_CLUSTER_SHEET_COLUMNS,
  });
  assert.equal(validationResult.status, "CLIENT_PRODUCTION_SHEET_VALID");

  const deletion = createDeletionPlan({
    client_id: "C001",
    target_type: "DOCUMENTS_AND_IMAGES",
    article_ids: ["ID-00001"],
    parent_drive_url: "https://drive.google.com/drive/folders/example",
    article_headers: liveHeaders,
  });
  assert.equal(deletion.selection_checkbox_column, "Q");
  assert.equal(deletion.sheet_columns_to_clear, "O:T");
});

test("production sheet includes client plan confirmation gate", () => {
  const plan = prepareClientProductionSheet({
    client_id: "C001",
    client_name: "C001_Example",
    client_drive_url: "https://drive.google.com/drive/folders/example",
  });
  assert.deepEqual(plan.operator_view.visible_sheets, ["基本情報", "企画確認", "記事一覧", "キーワード", "クラスター", "設定"]);
  assert.deepEqual(plan.sheets.企画確認.columns, STANDARD_PLAN_CONFIRMATION_SHEET_COLUMNS);
  assert.equal(plan.sheets.企画確認.required_before_article_writing, true);

  const valid = validateClientProductionSheet({
    client_id: "C001",
    production_sheet_url: "https://docs.google.com/spreadsheets/d/example/edit",
    sheet_names: plan.operator_view.visible_sheets,
    article_headers: plan.sheets.記事一覧.columns,
    plan_confirmation_headers: plan.sheets.企画確認.columns,
    keyword_headers: plan.sheets.キーワード.columns,
    cluster_headers: plan.sheets.クラスター.columns,
  });
  assert.equal(valid.status, "CLIENT_PRODUCTION_SHEET_VALID");

  const invalid = validateClientProductionSheet({
    client_id: "C001",
    production_sheet_url: "https://docs.google.com/spreadsheets/d/example/edit",
    sheet_names: ["基本情報", "記事一覧", "キーワード", "クラスター", "設定"],
    article_headers: plan.sheets.記事一覧.columns,
    keyword_headers: plan.sheets.キーワード.columns,
    cluster_headers: plan.sheets.クラスター.columns,
  });
  assert.ok(invalid.errors.includes("MISSING_SHEETS:企画確認"));
  assert.ok(invalid.errors.includes("PLAN_CONFIRMATION_HEADERS_DO_NOT_MATCH_STANDARD"));
});

function planQueueRow(order, overrides = {}) {
  return {
    row: order + 1,
    "制作順": order,
    "確認ID": `C001-PLAN-${String(order).padStart(3, "0")}`,
    "記事トピック": `決済端末 テーマ${order}`,
    "種別": "クラスター",
    "ピラー": "決済端末",
    "クラスター": `決済端末 テーマ${order}`,
    "記事タイトル案": `決済端末テーマ${order}の確認ガイド｜導入前に見る実務ポイント`,
    "対策キーワード": `決済端末 テーマ${order}／PAYGATE テーマ${order}`,
    "検索意図": `決済端末テーマ${order}について導入前の判断材料を知りたい。`,
    "AI引用戦略": `決済端末テーマ${order}の公式情報と店舗運用上の確認点を整理し、判断基準として引用されやすい構成にする。`,
    "記事カテゴリ": "導入前チェック",
    "ハッシュタグ": `決済端末,テーマ${order},PAYGATE,キャッシュレス決済`,
    "確認ステータス": "確認待ち",
    "確認者": "",
    "確認日": "",
    "修正コメント": "",
    "制作状態": "未着手",
    "記事ID": "",
    "記事URL": "",
    "最終更新日": "",
    ...overrides,
  };
}

test("plan confirmation queue is prepared as the client-facing article source", () => {
  const plan = preparePlanConfirmationSheet({
    client_id: "C001",
    production_sheet_url: "https://docs.google.com/spreadsheets/d/example/edit",
  });
  assert.equal(plan.status, "READY_FOR_PLAN_CONFIRMATION_SHEET");
  assert.equal(plan.default_row_count, 50);
  assert.deepEqual(plan.columns, STANDARD_PLAN_CONFIRMATION_SHEET_COLUMNS);
  assert.deepEqual(plan.type_values, ["ピラー", "クラスター"]);
  assert.ok(plan.queue_policy.includes("制作順"));
  assert.ok(plan.approval_status_values.includes("OK"));
});

test("plan confirmation validates every row against duplicate risk before client approval", () => {
  const rows = Array.from({ length: 50 }, (_, index) => planQueueRow(index + 1));
  const clear = validatePlanConfirmationCandidates({
    client_id: "C001",
    plan_confirmation_rows: rows,
    existingArticles: [],
    publishedSiteArticles: [],
  });
  assert.equal(clear.status, "PLAN_CONFIRMATION_CANDIDATES_CLEAR");
  assert.equal(clear.checked_count, 50);

  const duplicate = validatePlanConfirmationCandidates({
    client_id: "C001",
    plan_confirmation_rows: [
      planQueueRow(1, {
        "記事タイトル案": "決済端末テーマ1の確認ガイド｜導入前に見る実務ポイント",
        "対策キーワード": "決済端末 テーマ1",
      }),
    ],
    existingArticles: [{
      client_id: "C001",
      article_id: "ID-00001",
      title: "決済端末テーマ1の確認ガイド｜導入前に見る実務ポイント",
      category: "決済端末 テーマ1",
      responsibilityLabel: "決済端末テーマ1の確認｜決済端末 テーマ1の判断｜決済端末 テーマ1,PAYGATE テーマ1,導入前チェック,条件確認｜導入前チェック,決済端末 テーマ1",
      searchIntent: "決済端末テーマ1について導入前の判断材料を知りたい。",
    }],
    publishedSiteArticles: [],
  });
  assert.equal(duplicate.status, "PLAN_CONFIRMATION_DUPLICATE_BLOCKED");
  assert.equal(duplicate.blocked_count, 1);
});

test("article creation selects the first approved unfinished plan only", () => {
  const pending = selectNextApprovedPlan({
    client_id: "C001",
    production_sheet_url: "https://docs.google.com/spreadsheets/d/example/edit",
    plan_confirmation_rows: [
      planQueueRow(1, { "確認ステータス": "確認待ち" }),
      planQueueRow(2, { "確認ステータス": "OK", "制作状態": "制作済み", "記事URL": "https://example.com/done/" }),
      planQueueRow(3, { "確認ステータス": "承認", "確認者": "client", "確認日": "2026/09/04" }),
      planQueueRow(4, { "確認ステータス": "OK", "確認者": "client", "確認日": "2026/09/04" }),
    ],
    existingArticles: [],
    publishedSiteArticles: [],
  });
  assert.equal(pending.status, "AWAITING_ARTICLE_CREATION_USER_CONFIRMATION");
  assert.equal(pending.next_plan.production_order, 3);
  assert.equal(pending.article_creation_user_confirmation.confirmed, false);
  assert.equal(pending.article_creation_user_confirmation.article_summary.title, pending.article_candidate.title);
  assert.ok(pending.article_creation_user_confirmation.prompt.includes("この内容"));
  assert.ok(pending.article_creation_user_confirmation.prompt.includes("1記事"));
  assert.ok(pending.article_creation_user_confirmation.prompt.includes("作成してよいですか"));

  const selected = selectNextApprovedPlan({
    client_id: "C001",
    production_sheet_url: "https://docs.google.com/spreadsheets/d/example/edit",
    user_confirmed_article_creation: true,
    plan_confirmation_rows: [
      planQueueRow(1, { "確認ステータス": "確認待ち" }),
      planQueueRow(2, { "確認ステータス": "OK", "制作状態": "制作済み", "記事URL": "https://example.com/done/" }),
      planQueueRow(3, { "確認ステータス": "承認", "確認者": "client", "確認日": "2026/09/04" }),
      planQueueRow(4, { "確認ステータス": "OK", "確認者": "client", "確認日": "2026/09/04" }),
    ],
    existingArticles: [],
    publishedSiteArticles: [],
  });
  assert.equal(selected.status, "NEXT_APPROVED_PLAN_READY");
  assert.equal(selected.next_plan.production_order, 3);
  assert.equal(selected.article_creation_user_confirmation.confirmed, true);
  assert.equal(selected.article_plan_confirmation.confirmed, true);
  assert.equal(selected.article_plan_confirmation.plan_confirmation_sheet.row, 4);
});

test("additional plan confirmation request appends the next fifty after existing rows", () => {
  const existingRows = Array.from({ length: 50 }, (_, index) => planQueueRow(index + 1, {
    "制作状態": "制作済み",
    "記事ID": `ID-${String(index + 1).padStart(5, "0")}`,
    "記事URL": `https://example.com/articles/${index + 1}/`,
  }));
  const seedTopics = Array.from({ length: 50 }, (_, index) => ({
    topic: `追加テーマ${index + 1}`,
    pillar: "決済端末",
    cluster: `追加テーマ${index + 1}`,
    title: `追加テーマ${index + 1}の決済端末ガイド｜導入前に確認する実務ポイント`,
    keywords: `追加テーマ${index + 1}／PAYGATE 追加テーマ${index + 1}`,
    article_category: "導入前チェック",
    hashtags: `追加テーマ${index + 1},PAYGATE,決済端末`,
  }));
  const plan = prepareAdditionalPlanConfirmationIdeas({
    client_id: "C001",
    production_sheet_url: "https://docs.google.com/spreadsheets/d/example/edit",
    existing_plan_confirmation_rows: existingRows,
    seed_topics: seedTopics,
    existingArticles: [],
    publishedSiteArticles: [],
  });
  assert.equal(plan.status, "READY_TO_APPEND_PLAN_CONFIRMATION_IDEAS");
  assert.equal(plan.append_start_order, 51);
  assert.equal(plan.append_count, 50);
  assert.equal(plan.rows[0]["制作順"], 51);
  assert.equal(plan.rows[0]["種別"], "クラスター");
  assert.equal(plan.rows[0]["ピラー"], "決済端末");
  assert.equal(plan.rows[0]["クラスター"], "追加テーマ1");
  assert.equal(plan.rows[49]["制作順"], 100);
  assert.equal(plan.duplicate_validation.checked_count, 50);
});

test("all static relative module imports resolve inside the plugin", async () => {
  const files = (await walk(pluginRoot)).filter((path) => extname(path) === ".mjs");
  const importPattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["'](\.[^"']+)["']/g;
  for (const path of files) {
    const source = await readFile(path, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const target = resolve(dirname(path), match[1]);
      assert.ok(target.startsWith(`${pluginRoot}${sep}`), `${path} imports outside plugin: ${match[1]}`);
      const info = await stat(target);
      assert.ok(info.isFile(), `${path} import does not resolve: ${match[1]}`);
    }
  }
});

test("new source register starts empty and has one creation route", () => {
  const plan = prepareClientSourceRegister({ client_id: "C001", client_name: "C001_Example" });
  assert.deepEqual(plan.creation_method_order, ["IMPORT_TEMPLATE_XLSX"]);
  assert.deepEqual(plan.initial_rows, []);
  assert.equal(plan.initial_data_row_count, 0);
  assert.equal(plan.initialization_mode, "HEADER_ONLY");
  assert.equal("initial_source" in plan, false);

  const validation = validateClientSourceRegister({
    client_id: "C001",
    source_register_url: "https://docs.google.com/spreadsheets/d/example/edit",
    sheet_name: "一次情報台帳",
    sheet_client_id: "C001",
    parent_folder_name: "01_一次情報",
    headers: plan.columns,
    creation_method: "IMPORT_TEMPLATE_XLSX",
    format_preserved: true,
    table_name: "SourceRegisterC001",
    format_checks: plan.required_format_checks,
    row_client_ids: [],
    initialization_mode: true,
    data_row_count: 0,
  });
  assert.equal(validation.status, "CLIENT_SOURCE_REGISTER_VALID");
});

test("basic information output stores unified profile widget author fields", async () => {
  const output = {
    big_word: "看護師転職",
    service_name: "看護師転職サービス",
    service_description: "看護師転職サービスは、看護師が希望条件に合う職場を探すための求人紹介や相談支援を行うサービスです。",
    target_users: "転職を検討している看護師",
    user_concerns: "・職場環境が合うか不安",
    important_points: "・求人の質",
    anxieties: "・転職後のミスマッチ",
    competitors: "求人サイト、転職エージェント",
    industry_terms: "・夜勤\n・病棟",
    client_strengths: "・看護師転職支援に強い",
    avoid_expressions: "・必ず成功する：断定表現のため",
    client_philosophy: "看護師が納得して職場を選べる情報提供を重視する。",
    profile_widget_site_name: "看護師転職ナビ",
    profile_widget_author_name: "看護師転職ナビ編集部",
    profile_widget_description: "看護師転職業界の調査・比較・取材を専門とする編集チーム。求人情報や職場選びの判断材料を中立的に発信します。",
    seo_categories: Array.from({ length: 20 }, (_, index) => ({ name: `カテゴリ${index + 1}`, slug: `category-${index + 1}` })),
    pillar_keywords: Array.from({ length: 50 }, (_, index) => ({ keyword: `転職テーマ${index + 1}`, description: "看護師転職に関する記事群。各記事で重複しない切り口に分けて扱う。" })),
  };
  const validation = await validateStandardBasicInfoOutput({
    client_id: "NURSE",
    client_name: "NURSE_ナースパワー",
    official_url: "https://example.com/",
    output: JSON.stringify(output),
    existing_basic_info: {},
  });
  assert.equal(validation.status, "BASIC_INFO_VALID");
  assert.equal(validation.sheet_updates.basic_info.C22, "看護師転職ナビ");
  assert.equal(validation.sheet_updates.basic_info.C23, "看護師転職ナビ編集部");
  assert.equal(validation.sheet_updates.basic_info.C24, output.profile_widget_description);
});

test("new onboarding ignores trashed artifacts and reserves their IDs and URLs", async () => {
  const result = await prepareStandardClientOnboarding({
    client_id: "CLUTCH",
    client_name: "株式会社clutch",
    official_url: "https://www.clutch.ne.jp/",
    site_text: "株式会社clutchの公式サイト",
    active_client_master_matches: [],
    drive_candidates: [
      {
        client_id: "CLUTCH",
        id: "trashed-folder-id",
        url: "https://drive.google.com/drive/folders/trashed-folder-id",
        trashed: true,
      },
    ],
    retired_article_ids: ["ID-00001"],
  });
  assert.equal(result.status, "READY_FOR_BASIC_INFO_GENERATION");
  assert.equal(result.registration_resolution.status, "NEW_ACTIVE_REGISTRATION");
  assert.deepEqual(result.registration_resolution.forbidden_artifact_ids, ["trashed-folder-id"]);
  assert.deepEqual(result.registration_resolution.forbidden_artifact_urls, ["https://drive.google.com/drive/folders/trashed-folder-id"]);
  assert.deepEqual(result.article_id_allocation_input.retired_article_ids, ["ID-00001"]);
  assert.equal(result.human_confirmation_policy.site_title_confirmation_required, true);
  assert.equal(result.human_confirmation_policy.news_settings_template_required, true);
  assert.equal(result.news_settings_template.status, "READY_FOR_DISABLED_NEWS_SETTINGS_TEMPLATE");
  assert.equal(result.news_settings_template.creation_timing, "AFTER_SITE_TITLE_CONFIRMATION_BEFORE_ARTICLE_PLANNING");
  assert.equal(result.news_settings_template.feeds[0].client_id, "CLUTCH");
  assert.equal(result.news_settings_template.feeds[0].enabled, false);
});

test("site title validation requires user confirmation before onboarding completes", () => {
  const base = {
    client_id: "C001",
    client_name: "C001_Example",
    output: JSON.stringify({
      titles: [
        { title: "C001", subtitle: "相談前に強みがわかる公式サイト" },
        { title: "C001サービス", subtitle: "課題整理から導入判断まで支援" },
        { title: "C001公式", subtitle: "はじめての検討をわかりやすく" },
      ],
    }),
  };
  const waiting = validateStandardSiteTitleOutput(base);
  assert.equal(waiting.status, "AWAITING_SITE_TITLE_CONFIRMATION");
  assert.equal(waiting.write_allowed, false);
  assert.equal(waiting.confirmation_required, true);

  const confirmed = validateStandardSiteTitleOutput({
    ...base,
    site_title_confirmation: { confirmed: true, client_id: "C001", user_id: "user-1" },
  });
  assert.equal(confirmed.status, "NEWS_SETTINGS_TEMPLATE_REQUIRED");
  assert.equal(confirmed.write_allowed, true);
  assert.equal(confirmed.article_planning_allowed, false);
  assert.equal(confirmed.news_settings_template_required, true);

  const newsTemplate = prepareClientNewsSettingsTemplate({
    client_id: "C001",
    client_name: "C001_Example",
    official_url: "https://example.com/",
    service_name: "Example Service",
  });
  const complete = validateStandardSiteTitleOutput({
    ...base,
    site_title_confirmation: { confirmed: true, client_id: "C001", user_id: "user-1" },
    news_settings_template_created: true,
    news_settings_template: newsTemplate,
  });
  assert.equal(complete.status, "CLIENT_ONBOARDING_COMPLETE");
  assert.equal(complete.article_planning_allowed, true);
  assert.equal(complete.news_settings_template_required, false);
});

test("new client news settings template is disabled and client scoped", () => {
  const plan = prepareClientNewsSettingsTemplate({
    client_id: "SMAREGI",
    client_name: "株式会社スマレジ",
    official_url: "https://smaregi.jp/payment/",
    service_name: "スマレジ・PAYGATE",
    big_word: "キャッシュレス決済",
    pillar_keywords: [{ keyword: "店舗決済端末" }, { keyword: "POSレジ連携" }],
  });
  assert.equal(plan.status, "READY_FOR_DISABLED_NEWS_SETTINGS_TEMPLATE");
  assert.equal(plan.target_folder_name, "06_ニュース");
  assert.equal(plan.external_execution_allowed, false);
  assert.equal(plan.human_enable_required, true);
  assert.deepEqual(plan.required_columns, ["client_id", "feed_id", "industry", "source_url", "include_keywords", "enabled"]);
  assert.equal(plan.feeds.length, 1);
  assert.equal(plan.feeds[0].client_id, "SMAREGI");
  assert.equal(plan.feeds[0].enabled, false);
  assert.equal(plan.feeds[0].source_url, "https://smaregi.jp/payment/");
  assert.ok(plan.feeds[0].include_keywords.includes("スマレジ・PAYGATE"));
});

test("onboarding blocks Drive candidates whose trash state is unknown", async () => {
  const result = await prepareStandardClientOnboarding({
    client_id: "CLUTCH",
    client_name: "株式会社clutch",
    official_url: "https://www.clutch.ne.jp/",
    site_text: "株式会社clutchの公式サイト",
    active_client_master_matches: [],
    drive_candidates: [{ client_id: "CLUTCH", id: "unverified-folder-id" }],
    retired_article_ids: [],
  });
  assert.equal(result.status, "DRIVE_TRASH_STATE_REQUIRED");
  assert.deepEqual(result.registration_resolution.unverified_candidate_ids, ["unverified-folder-id"]);
});

test("onboarding no longer requires a client master file", () => {
  const registration = resolveActiveClientRegistration({
    client_id: "CLUTCH",
    client_name: "株式会社clutch",
    drive_candidates: [],
    retired_article_ids: [],
  });
  assert.equal(registration.status, "NEW_ACTIVE_REGISTRATION");
  assert.equal(registration.lookup_policy, "SMARTAIO_DIRECT_CLIENT_FOLDER_AND_EXPLICIT_DRIVE_TRASH_STATE_ONLY");
});

test("onboarding blocks active registry duplicates and active orphan artifacts", () => {
  const activeRegistration = resolveActiveClientRegistration({
    client_id: "CLUTCH",
    client_name: "株式会社clutch",
    active_client_master_matches: [{ client_id: "CLUTCH", production_sheet_url: "https://docs.google.com/spreadsheets/d/active/edit" }],
    drive_candidates: [],
    retired_article_ids: [],
  });
  assert.equal(activeRegistration.status, "ACTIVE_CLIENT_REGISTRATION_EXISTS");

  const orphan = resolveActiveClientRegistration({
    client_id: "CLUTCH",
    client_name: "株式会社clutch",
    active_client_master_matches: [],
    drive_candidates: [{ client_id: "CLUTCH", id: "active-folder-id", trashed: false }],
    retired_article_ids: [],
  });
  assert.equal(orphan.status, "ACTIVE_CLIENT_ARTIFACT_CONFLICT");
});

test("article ID allocation is monotonic across active and retired IDs", () => {
  assert.equal(allocateStandardArticleId({
    start_row: 3,
    existing_article_ids: ["ID-00003"],
    retired_article_ids: ["ID-00001", "ID-00007"],
  }), "ID-00008");
  assert.throws(() => allocateStandardArticleId({ start_row: 3 }), /retired_article_ids must be an array/);
  assert.throws(() => allocateStandardArticleId({ start_row: 3, retired_article_ids: ["old-1"] }), /STANDARD_RETIRED_ARTICLE_ID_REQUIRED/);
});

test("explicit full rebuild can restart article IDs from one while normal runs reserve retired IDs", () => {
  assert.equal(allocateStandardArticleId({
    start_row: 3,
    existing_article_ids: [],
    retired_article_ids: ["ID-00001", "ID-00002"],
    article_id_sequence_mode: "RESET_FROM_ONE_AFTER_EXPLICIT_REBUILD",
    explicit_full_rebuild_confirmed: true,
  }), "ID-00001");
  assert.equal(allocateStandardArticleId({
    start_row: 4,
    previous_article_id: "ID-00001",
    existing_article_ids: ["ID-00001"],
    retired_article_ids: ["ID-00007"],
    article_id_sequence_mode: "RESET_FROM_ONE_AFTER_EXPLICIT_REBUILD",
    explicit_full_rebuild_confirmed: true,
  }), "ID-00002");
  assert.throws(
    () => allocateStandardArticleId({
      start_row: 3,
      existing_article_ids: [],
      retired_article_ids: ["ID-00001"],
      article_id_sequence_mode: "RESET_FROM_ONE_AFTER_EXPLICIT_REBUILD",
    }),
    /ARTICLE_ID_RESET_EXPLICIT_REBUILD_CONFIRMATION_REQUIRED/,
  );
});

function validArticleIdeaInput(overrides = {}) {
  const idea = {
    client_id: "C001",
    category: "AIO対策",
    articleCategory: "AIO対策",
    title: "AIO対策は診断から始める｜企業サイト改善の7つの確認項目",
    summary: "企業サイトのAIO対策を始める前に、情報整理、出典更新、FAQ構造、AI引用計測を確認する記事です。",
    slug: "aio-site-diagnosis-checklist",
    responsibilityLabel: "AIO初期診断｜AIO準備度判断｜情報明確性確認,出典更新確認,FAQ構造確認,AI引用計測｜SEO役割整理,改善順位設定",
    articleType: "チェックリスト",
    searchIntent: "AIO対策を始める前に、自社サイトの不足と改善優先順位を判断したい。",
    mainKeyword: "AIO対策",
    subKeywords: "AI検索対策,AIに引用されるコンテンツ",
    readerChange: "施策名で迷う状態から、診断項目ごとに改善順を決められる状態へ変わる。",
    keyPoints: "情報明確性、出典更新、FAQ構造、AI引用計測を中心に扱う。",
    differentiation: "施策羅列ではなく、初期診断として改善優先順位を整理する。",
    hashtags: "#AIO対策,#AI検索対策",
    conclusion: "AIO対策は施策追加より先に現状診断を行うべきです。",
    specificContents: "情報の明確性、出典更新、FAQ構造、AI引用計測の確認。",
    deepDivePoints: "情報明確性確認,出典更新確認,FAQ構造確認,AI引用計測",
    tableContent: "表は使わずチェックリストで整理する。",
    diagramContent: "診断項目を4領域に分ける。",
    originalViewpoint: "AI検索の前にSEO基盤と運用体制を確認する。",
  };
  return {
    client_id: "C001",
    ideas: [idea],
    existingArticles: [],
    publishedSiteArticles: [],
    pillarKeywords: [{ keyword: "AIO対策", description: "AI検索対策" }],
    articleCategories: [{ name: "AIO対策", slug: "aio" }],
    currentYear: 2026,
    retired_article_ids: [],
    start_row: 3,
    ...overrides,
  };
}

test("article idea validation and article preparation require user plan confirmation", async () => {
  const waiting = validateStandardArticleIdeaOutput(validArticleIdeaInput());
  assert.equal(waiting.status, "AWAITING_ARTICLE_PLAN_CONFIRMATION");
  assert.equal(waiting.confirmation_required, true);
  await assert.rejects(() => finalizeStandardArticleIdeaOutput(validArticleIdeaInput()), /ARTICLE_IDEA_VALIDATION_REQUIRED/);

  const confirmedInput = validArticleIdeaInput({
    article_plan_confirmation: {
      confirmed: true,
      client_id: "C001",
      title: "AIO対策は診断から始める｜企業サイト改善の7つの確認項目",
      article_category: "AIO対策",
      hashtags: "#AIO対策 #AI検索対策",
      user_id: "user-1",
      plan_confirmation_sheet: planConfirmationSheetEvidence(),
    },
  });
  const validation = validateStandardArticleIdeaOutput(confirmedInput);
  assert.equal(validation.status, "VALID");
  assert.equal(validation.plan_confirmation.article_category, "AIO対策");
  assert.equal(validation.plan_confirmation.hashtags, "AIO対策,AI検索対策");
  assert.equal(validation.plan_confirmation.confirmation_source, "PLAN_CONFIRMATION_SHEET");
  const finalized = await finalizeStandardArticleIdeaOutput({ ...confirmedInput, validation });
  assert.equal(finalized.status, "READY_FOR_ARTICLE_ID_FOLDER_AND_JSON_OUTPUT");
  assert.equal(finalized.sheet_updates.C, "ID-00001");
  assert.equal(finalized.sheet_updates.D, "AIO対策");
  assert.equal(finalized.sheet_updates.E, confirmedInput.ideas[0].title);
  assert.equal(finalized.sheet_updates.F, confirmedInput.ideas[0].responsibilityLabel);
  assert.equal(finalized.sheet_updates.G, confirmedInput.ideas[0].summary);
  assert.equal(finalized.sheet_updates.H, confirmedInput.ideas[0].summary);
  assert.equal(finalized.sheet_updates.J, "AIO対策,AI検索対策");
  const finalizedJson = JSON.parse(finalized.json_content);
  assert.equal(finalizedJson.article_detail, confirmedInput.ideas[0].summary);
  assert.equal(finalizedJson.meta_description, confirmedInput.ideas[0].summary);

  const article = {
    client_id: "C001",
    article_id: "ID-00001",
    title: "AIO対策は診断から始める｜企業サイト改善の7つの確認項目",
    category: "AIO対策",
    responsibilityLabel: "AIO初期診断｜AIO準備度判断｜情報明確性確認,出典更新確認,FAQ構造確認,AI引用計測｜SEO役割整理,改善順位設定",
    basicInfo: {
      mainKeyword: "AIO対策",
      searchIntent: "AIO対策を始める前に、自社サイトの不足と改善優先順位を判断したい。",
      articleCategory: "AIO対策",
      hashtags: "AIO対策,AI検索対策",
    },
    deepDive: { conclusion: "AIO対策は施策追加より先に現状診断を行うべきです。" },
  };
  const prepareInput = {
    client_id: "C001",
    article,
    content_version: "v1",
    plan_review: {
      client_id: "C001",
      article_id: "ID-00001",
      content_version: "v1",
      review_type: "OUTLINE",
      result: "PASS",
      reviewed_by: "Smart AIO独立レビューAI",
      producer_run_id: "producer-1",
      reviewer_run_id: "reviewer-1",
      reviewed_at: "2026-08-25T00:00:00.000Z",
    },
    sources: [{ client_id: "C001", usage_status: "利用可", reviewer: "reviewer-1" }],
  };
  await assert.rejects(() => prepareArticleRun(prepareInput), /ARTICLE_PLAN_CONFIRMATION_REQUIRED/);
  assert.throws(
    () => validateStandardArticleIdeaOutput(validArticleIdeaInput({
      article_plan_confirmation: { confirmed: true, client_id: "C001", title: "AIO対策は診断から始める｜企業サイト改善の7つの確認項目", user_id: "user-1", plan_confirmation_sheet: planConfirmationSheetEvidence() },
    })),
    /ARTICLE_PLAN_CONFIRMATION_CATEGORY_REQUIRED/,
  );
  assert.throws(
    () => validateStandardArticleIdeaOutput(validArticleIdeaInput({
      article_plan_confirmation: {
        confirmed: true,
        client_id: "C001",
        title: "AIO対策は診断から始める｜企業サイト改善の7つの確認項目",
        article_category: "AIO対策",
        hashtags: "AIO対策,AI検索対策",
        user_id: "user-1",
      },
    })),
    /ARTICLE_PLAN_CONFIRMATION_SHEET_URL_REQUIRED/,
  );
  const prepared = await prepareArticleRun({
    ...prepareInput,
    article_plan_confirmation: {
      confirmed: true,
      client_id: "C001",
      article_id: "ID-00001",
      title: article.title,
      article_category: "AIO対策",
      hashtags: "AIO対策,AI検索対策",
      user_id: "user-1",
      plan_confirmation_sheet: planConfirmationSheetEvidence(),
    },
  });
  assert.equal(prepared.status, "READY_FOR_CHAT_GENERATION");
});

test("article record updates keep article detail and meta description identical", () => {
  const detail = "AIO対策の基本と確認手順を整理した記事。";
  const responsibilityLabel = "AIO基本｜AIO理解｜基礎確認,検索意図,引用設計,運用確認｜関連記事,公開確認";
  const updated = prepareStandardArticleRecordUpdate({
    client_id: "C001",
    article_id: "ID-00001",
    sheet_data: {
      category: "AIO対策",
      title: "AIO対策の基本",
      responsibilityLabel,
      article_detail: detail,
      meta_description: detail,
    },
    json_data: { id: "ID-00001" },
  });
  assert.deepEqual(updated.sheet_values_by_header, {
    "ピラー": "AIO対策",
    "記事タイトル": "AIO対策の基本",
    "責任ラベル": responsibilityLabel,
    "記事詳細": detail,
    "メタディスクリプション": detail,
  });
  assert.deepEqual(updated.sheet_updates, { D: "AIO対策", E: "AIO対策の基本", F: responsibilityLabel, G: detail, H: detail });

  const liveUpdated = prepareStandardArticleRecordUpdate({
    client_id: "C001",
    article_id: "ID-00001",
    article_headers: ["", ...STANDARD_ARTICLE_SHEET_COLUMNS],
    sheet_data: {
      category: "AIO対策",
      title: "AIO対策の基本",
      responsibilityLabel,
      articleDetail: detail,
      metaDescription: detail,
    },
  });
  assert.equal(liveUpdated.sheet_updates.E, "AIO対策");
  assert.equal(liveUpdated.sheet_updates.H, detail);
  assert.equal(liveUpdated.sheet_updates.I, detail);
  assert.equal(JSON.parse(updated.json_content).meta_description, detail);
  assert.throws(() => prepareStandardArticleRecordUpdate({
    client_id: "C001",
    article_id: "ID-00001",
    sheet_data: {
      category: "AIO対策",
      title: "AIO対策の基本",
      responsibilityLabel,
      article_detail: "記事詳細",
      meta_description: "異なる説明",
    },
  }), /ARTICLE_DETAIL_META_DESCRIPTION_MUST_MATCH/);
});

function validTaggedArticleContent({ includeTags = true } = {}) {
  const bodyParagraph = "表示料率だけで結論を出さず、適用条件、対象外条件、契約画面の実際の料率、月次請求まで順番に確認すると、店舗に合う費用判断を進めやすくなります。";
  const body = Array.from({ length: 48 }, () => `[P]${bodyParagraph}[/P]`).join("\n");
  return `[H1]PAYGATEの手数料を見る前に確認する条件｜料率だけで選ばない判断軸[/H1]
[P]PAYGATEの手数料は、表示された料率だけでは自店の負担を判断できません。適用条件や対象外業種、契約後の確認項目まで先に整理すると、導入前後の想定違いを減らせます。この記事では、忙しい店舗担当者が短時間で確認できる順番を具体的にまとめます。[/P]
[H3]この記事でわかること[/H3]
[UL]
[LI]・表示料率と自店の契約料率を分ける確認手順[/LI]
[LI]・中小事業者向け料率の適用条件と対象外業種[/LI]
[LI]・契約後の管理画面と月次請求で見る費用項目[/LI]
[/UL]
[H2]この記事の要約[/H2]
[UL]
[LI]表示料率は適用条件と対象外業種を確認したうえで、自店の契約料率として扱えるか判断します。[/LI]
[LI]契約後は管理画面の手数料率や取引関連費用を毎月確認し、想定と実際の請求差を管理します。[/LI]
[/UL]
[H2]表示料率と適用条件を分けて確認する[/H2]
[P][MARK]表示料率だけで判断せず、自店に適用される契約条件まで確認することが重要です。[/MARK][/P]
${body}
[H2]手数料確認を5段階で進める[/H2]
[P][DIAGRAM]表示料率、適用条件、対象外業種、契約情報、月次確認の順に確認すると、導入前後の費用判断を一つの流れで整理できます。[/DIAGRAM][/P]
[P][MARK]契約後も管理画面と請求内容を毎月照合し、想定した費用との差を確認してください。[/MARK][/P]
[H2]この記事のまとめ[/H2]
[UL]
[LI]表示料率と適用条件を分けて確認します。[/LI]
[LI]対象外業種と契約条件を先に整理します。[/LI]
[LI]契約後は管理画面と請求を毎月照合します。[/LI]
[/UL]
[H2]Q&A[/H2]
[P][B]Q：表示料率がそのまま自店に適用されますか？[/B]
A：適用条件や業種、契約内容によって異なるため、公式情報と契約時の案内を確認してください。[/P]
[P][B]Q：対象外業種はどこで確認しますか？[/B]
A：公式ページの適用条件を確認し、境界に近い業態は問い合わせで確認してください。[/P]
[P][B]Q：契約後に確認する費用は何ですか？[/B]
A：決済手数料率、PAYGATE手数料率、取引関連費用、振込関連費用を確認します。[/P]
[P][B]Q：手数料はいつ確認すべきですか？[/B]
A：導入前の比較時に加え、契約後も管理画面と毎月の請求内容を照合してください。[/P]
[P][B]Q：複数店舗では何を決めておくべきですか？[/B]
A：店舗ごとの契約情報、請求確認の担当者、確認頻度、差額発生時の問い合わせ先を決めます。[/P]
${includeTags ? "[H2]タグ[/H2]\n[P]#AIO対策 #AI検索対策[/P]" : ""}`;
}

test("article idea and document output require the complete article format", () => {
  const missingTags = validateStandardArticleIdeaOutput(validArticleIdeaInput({
    ideas: [{ ...validArticleIdeaInput().ideas[0], hashtags: "" }],
  }));
  assert.equal(missingTags.status, "RETRY_REQUIRED");
  assert.ok(missingTags.retry_errors.some((error) => error.includes("ハッシュタグ未入力")));

  const baseDocument = {
    client_id: "C001",
    article_id: "ID-00001",
    title: "AIO対策は診断から始める｜企業サイト改善の7つの確認項目",
    article_folder_url: "https://drive.google.com/drive/folders/article-folder",
    hashtags: "AIO対策,AI検索対策",
  };
  const withoutTags = prepareStandardDocumentOutput({
    ...baseDocument,
    tagged_content: validTaggedArticleContent({ includeTags: false }),
  });
  assert.equal(withoutTags.status, "READY_FOR_GOOGLE_DOC_OUTPUT");

  const withTags = prepareStandardDocumentOutput({
    ...baseDocument,
    tagged_content: validTaggedArticleContent(),
  });
  assert.equal(withTags.status, "RETRY_REQUIRED");
  assert.ok(withTags.errors.includes("VISIBLE_TAG_OR_SOURCE_SECTION_FORBIDDEN"));
  const withReferenceHeading = prepareStandardDocumentOutput({
    ...baseDocument,
    tagged_content: `${validTaggedArticleContent({ includeTags: false })}\n[H2]参考文献[/H2]\n[P]非表示にすべき出典情報[/P]`,
  });
  assert.ok(withReferenceHeading.errors.includes("VISIBLE_TAG_OR_SOURCE_SECTION_FORBIDDEN"));
  assert.equal(withoutTags.article_metadata.hashtags, "AIO対策,AI検索対策");
  assert.equal(withoutTags.article_metadata.rendered_hashtags, "");
  assert.equal(withoutTags.article_metadata.tag_section_required, false);
  assert.equal(withoutTags.article_metadata.tag_section_visible_forbidden, true);
  assert.deepEqual(withoutTags.article_metadata.diagram_source_sections, ["表示料率、適用条件、対象外業種、契約情報、月次確認の順に確認すると、導入前後の費用判断を一つの流れで整理できます。"]);
  assert.equal(withoutTags.article_metadata.marker_count, 2);
  assert.equal(withoutTags.article_metadata.qa_count, 5);
  assert.ok(withoutTags.article_metadata.article_length >= 4000 && withoutTags.article_metadata.article_length <= 6000);
  assert.equal(withoutTags.render_plan.diagram_source_color, "#d9ead3");
  assert.ok(withoutTags.render_plan.blocks.some((block) => block.decorations?.some((decoration) => decoration.type === "DIAGRAM_SOURCE")));
  const keyPointList = withoutTags.render_plan.blocks.find((block, index, blocks) =>
    block.type === "LI_GROUP" && blocks[index - 1]?.text === "この記事でわかること");
  assert.ok(keyPointList.items.every((item) => !item.text.startsWith("・")));

  const invalidStructure = prepareStandardDocumentOutput({
    ...baseDocument,
    tagged_content: validTaggedArticleContent({ includeTags: false })
      .replace("[P]PAYGATEの手数料は", "[H2]誤った冒頭[/H2]\n[P]PAYGATEの手数料は")
      .replace(/\[MARK\][\s\S]*?\[\/MARK\]/g, "マーカーなし"),
  });
  assert.equal(invalidStructure.status, "RETRY_REQUIRED");
  assert.ok(invalidStructure.errors.includes("ARTICLE_OPENING_ORDER_REQUIRED"));
  assert.ok(invalidStructure.errors.includes("ARTICLE_MARKER_COUNT_MUST_BE_TWO_TO_FOUR"));
});

test("stage review requires related articles and tag/source absence for final output", () => {
  const base = {
    client_id: "C001",
    article_id: "ID-00001",
    producer_run_id: "producer-1",
    review_run_id: "reviewer-1",
  };
  const directionPlan = prepareStageReview({
    ...base,
    stage: "DIRECTION",
    artifacts: {
      target_reader: "AIO対策を検討するWeb担当者",
      search_intent: "施策前に自社サイトの改善点を把握したい",
      article_goal: "診断観点を整理する",
      article_category: "AIO対策",
      hashtags: "AIO対策,AI検索対策",
    },
  });
  assert.equal(directionPlan.status, "PENDING_AI_REVIEW");
  assert.equal(directionPlan.mechanical_check_scope.includes("tag_section"), false);

  const finalInput = {
    ...base,
    stage: "FINAL",
    artifacts: {
      content: "完成本文",
      sources_used: ["https://example.com/source"],
      internal_links: ["https://example.com/internal"],
      visual_assets: { title_image: "ID-00001_1.png" },
      article_category: "AIO対策",
      hashtags: "AIO対策,AI検索対策",
      related_articles_section: "関連記事",
    },
    mechanical_checks: [
      { key: "typos", passed: true },
      { key: "numbers", passed: true },
      { key: "proper_nouns", passed: true },
      { key: "prohibited_expressions", passed: true },
      { key: "format", passed: true },
      { key: "source_and_link_existence", passed: true },
    ],
    qualitative_scores: {
      factuality: 25,
      completeness: 18,
      consistency: 12,
      readability: 15,
      visual_quality: 10,
      internal_links: 10,
      output_format: 5,
      article_metadata: 5,
    },
  };
  const finalResult = evaluateStageReview(finalInput);
  assert.equal(finalResult.status, "REVISE");
  assert.ok(finalResult.missing_mechanical_checks.includes("related_articles_section"));
  assert.ok(finalResult.missing_mechanical_checks.includes("tag_and_source_sections_absent"));
});

test("source register rejects populated initialization and alternate creation", () => {
  const plan = prepareClientSourceRegister({ client_id: "C001", client_name: "C001_Example" });
  const validation = validateClientSourceRegister({
    client_id: "C001",
    source_register_url: "https://docs.google.com/spreadsheets/d/example/edit",
    sheet_name: "一次情報台帳",
    sheet_client_id: "C001",
    parent_folder_name: "01_一次情報",
    headers: plan.columns,
    creation_method: "COPY_SHEET",
    format_preserved: true,
    table_name: "SourceRegisterC001",
    format_checks: plan.required_format_checks,
    initialization_mode: true,
    data_row_count: 1,
  });
  assert.ok(validation.errors.includes("SOURCE_REGISTER_CREATION_METHOD_INVALID"));
  assert.ok(validation.errors.includes("SOURCE_REGISTER_MUST_START_EMPTY"));
});

test("article approval accepts FINAL_APPROVAL only", () => {
  const base = {
    client_id: "C001",
    article_id: "A001",
    run_id: "run-1",
    approval_status: "APPROVED",
    approver_user_id: "reviewer-1",
    approver_role: "reviewer",
    content_version: "v1",
    approved_at: "2026-08-21T00:00:00.000Z",
  };
  assert.equal(normalizeApprovalDecision({ ...base, stage: "FINAL_APPROVAL" }).stage, "FINAL_APPROVAL");
  assert.throws(() => normalizeApprovalDecision({ ...base, stage: "PLAN" }), /UNKNOWN_APPROVAL_STAGE/);
  assert.deepEqual(ARTICLE_PRODUCTION_STAGES, [
    "KW_RESEARCH",
    "OUTLINE_AI_REVIEW",
    "DRAFTING",
    "FACT_CHECK",
    "FINISHING",
    "AWAITING_FINAL_APPROVAL",
    "READY_TO_PUBLISH",
  ]);
});

function completionReportFixture(overrides = {}) {
  const articleId = "ID-00002";
  const documentId = "doc123";
  const articleFolderUrl = "https://drive.google.com/drive/folders/article-folder";
  const imageFolderUrl = "https://drive.google.com/drive/folders/image-folder";
  const productionSheetUrl = "https://docs.google.com/spreadsheets/d/sheet123/edit";
  const faqItems = Array.from({ length: 5 }, (_, index) => ({
    question: `Q${index + 1}：AIO対策の確認項目${index + 1}は何ですか？`,
    answer: `A${index + 1}：確認項目${index + 1}を本文の責任範囲内で整理し、公開前に根拠と表現を見直します。`,
  }));
  return {
    client_id: "CLUTCH",
    article_id: articleId,
    smart_aio_plugin_version: SMART_AIO_PLUGIN_VERSION,
    title: "AIO対策は施策より先に診断",
    meta_description: "AIO対策の初期診断記事",
    public_url: "https://example.com/aio-diagnosis/",
    public_url_sheet_readback: {
      reloaded_after_write: true,
      column_name: "公開URL",
      value: "https://example.com/aio-diagnosis/",
    },
    body_faq_items: faqItems,
    document_url: `https://docs.google.com/document/d/${documentId}/edit`,
    drive_folder_url: articleFolderUrl,
    image_folder_url: imageFolderUrl,
    updated_sheet_url: productionSheetUrl,
    document_persistence: {
      method: "RELOAD_AND_READBACK",
      reloaded_after_write: true,
      sentinel_replaced: true,
      expected_character_count: 4300,
      readback_character_count: 4300,
      expected_sha256: "a".repeat(64),
      readback_sha256: "a".repeat(64),
      document_id: documentId,
      drive_document_id: documentId,
      document_in_target_folder: true,
    },
    article_document_readback: {
      client_id: "CLUTCH",
      article_id: articleId,
      document_id: documentId,
      revision_id: "revision-1",
      normalized_character_count: 4300,
      readback_sha256: "a".repeat(64),
      marker_count: 3,
      diagram_source_count: 1,
      inline_object_count: 5,
      internal_link_count: 1,
      qa_count: 5,
      visible_standard_tag_count: 0,
      visible_markdown_heading_count: 0,
      visible_markdown_table_row_count: 0,
      bare_url_paragraph_count: 0,
      article_length: 4300,
      key_points_count: 3,
      has_key_points_section: true,
      has_article_summary_section: true,
      has_conclusion_section: true,
      has_qa_section: true,
      has_tag_section: false,
      has_source_section: false,
      has_related_articles_section: true,
      related_articles_section_is_heading: false,
      heading_order_verified: true,
      native_heading_styles_verified: true,
      native_bullets_verified: true,
      marker_text_style_verified: true,
      diagram_source_background_verified: true,
      internal_links_native_hyperlinks_verified: true,
      diagram_immediately_after_source: true,
      image_order_verified: true,
      embedded_images: [
        ...[1, 2, 3, 4].map((sequence) => ({
          sequence,
          image_role: sequence === 1 ? "TITLE_IMAGE" : "ARTICLE_PHOTO",
          file_name: `${articleId}_${sequence}.png`,
          file_url: `https://drive.google.com/file/d/image${sequence}/view`,
          sha256: String(sequence).repeat(64),
          object_id: `inline-image-${sequence}`,
        })),
        {
          sequence: 5,
          image_role: "DIAGRAM",
          file_name: `${articleId}_diagram_1.png`,
          file_url: "https://drive.google.com/file/d/diagram1/view",
          sha256: "d".repeat(64),
          object_id: "inline-image-diagram",
        },
      ],
      internal_links: [{
        anchor_text: "AIO対策の基礎",
        target_url: "https://example.com/aio-basic/",
        visible_text: "AIO対策の基礎",
        native_link_verified: true,
        bare_url_visible: false,
        section_label: "関連記事",
        after_qa: true,
        section_is_heading: false,
      }],
      wordpress_highlight_blocks: {
        key_points: { block_count: 1, item_count: 3 },
        article_summary: { block_count: 1, line_breaks_preserved: true },
        conclusion_summary: { block_count: 1, line_breaks_preserved: true },
        qa: { block_count: 5, qa_pair_per_block: true, separate_question_answer_blocks: false },
      },
      reloaded_after_write: true,
    },
    drive_scope_evidence: {
      output_location: "SMARTAIO_DRIVE",
      smartaio_root_verified: true,
      smartaio_root_url: "https://drive.google.com/drive/folders/0AJAK01qgUBq4Uk9PVA",
      client_folder_directly_under_smartaio: true,
      client_drive_url: "https://drive.google.com/drive/folders/client-folder",
      article_folder_url: articleFolderUrl,
      image_folder_url: imageFolderUrl,
      production_sheet_url: productionSheetUrl,
      article_folder_under_client_drive: true,
      image_folder_under_client_drive: true,
      created_in_my_drive_root: false,
      my_drive_root_parent_present: false,
      my_drive_root_parent_removed: true,
      folder_path_names: ["SMARTAIO", "CLUTCH_株式会社clutch", "03_記事", articleId],
      image_folder_path_names: ["SMARTAIO", "CLUTCH_株式会社clutch", "04_画像", articleId],
    },
    image_persistence: {
      client_id: "CLUTCH",
      article_id: articleId,
      article_title: "AIO対策は施策より先に診断",
      image_folder_url: imageFolderUrl,
      images: [1, 2, 3, 4].map((sequence) => ({
        sequence,
        image_role: sequence === 1 ? "TITLE_IMAGE" : "ARTICLE_PHOTO",
        ...(sequence === 1 ? {
          title_text: "AIO対策は施策より先に診断",
          title_text_in_image: true,
          readable_background_text_absent_or_minimized: true,
          visual_quality_review: {
            status: "PASS",
            producer_run_id: "CLUTCH-ID-00002-PRODUCER",
            review_run_id: "CLUTCH-ID-00002-TITLE-REVIEW",
            reviewer_model: "independent-vision-reviewer",
            inspection_method: "ORIGINAL_IMAGE_VISUAL_INSPECTION",
            reviewed_title_sha256: String(sequence).repeat(64),
            benchmark_asset_id_or_url: "ID-00016-title-quality-baseline",
            visual_quality_score: 91,
            canvas_occupancy_percent: 76,
            checks: {
              original_image_inspected: true,
              benchmark_compared: true,
              title_text_readable: true,
              title_hierarchy_clear: true,
              article_title_preserved: true,
              background_readable_text_absent_or_minimized: true,
              professional_blog_thumbnail_quality: true,
              japanese_text_readable: true,
              no_text_errors: true,
              copyright_safe: true,
            },
            reviewed_at: "2026-09-11T00:10:00+09:00",
          },
        } : {}),
        ...(sequence !== 1 ? {
          readable_text_absent_or_minimized: true,
        } : {}),
        file_name: `${articleId}_${sequence}.png`,
        file_url: `https://drive.google.com/file/d/image${sequence}/view`,
        mime_type: "image/png",
        width: 1536,
        height: 1024,
        measured_width: 1536,
        measured_height: 1024,
        measurement_method: "sips-readback",
        size_bytes: 1000 + sequence,
        sha256: String(sequence).repeat(64),
        generated_in_current_conversation: true,
        source_tool: "image_gen",
        generation_method: "conversation_image_generation",
        generation_call_id: `imagegen-call-${sequence}`,
        prepared_prompt_sha256: String.fromCharCode(96 + sequence).repeat(64),
        generation_prompt_sha256: String.fromCharCode(96 + sequence).repeat(64),
        prompt_text_exact_match_verified: true,
        file_in_image_folder: true,
        })),
      diagram_image: {
        file_name: `${articleId}_diagram_1.png`,
        file_url: "https://drive.google.com/file/d/diagram1/view",
        mime_type: "image/png",
        width: 1536,
        height: 1024,
        measured_width: 1536,
        measured_height: 1024,
        measurement_method: "sips-readback",
        size_bytes: 2000,
        sha256: "d".repeat(64),
        generated_in_current_conversation: true,
        source_tool: "image_gen",
        generation_method: "conversation_image_generation",
        generation_call_id: "imagegen-call-diagram",
        prepared_prompt_sha256: "e".repeat(64),
        generation_prompt_sha256: "e".repeat(64),
        prompt_text_exact_match_verified: true,
        file_in_image_folder: true,
        diagram_source: {
          source_text: "AIO対策は施策追加より先に現状診断を行います。情報明確性を確認します。出典更新を確認します。FAQ構造を確認します。AI引用計測を確認します。",
          text_items: ["情報明確性を確認します。", "出典更新を確認します。", "FAQ構造を確認します。", "AI引用計測を確認します。"],
          rendered_text_items: ["情報明確性を確認します。", "出典更新を確認します。", "FAQ構造を確認します。", "AI引用計測を確認します。"],
          doc_highlighted: true,
          exact_text_verified: true,
          source_text_matches_diagram_content: true,
          source_text_is_not_diagram_explanation: true,
          section_heading: "AIO対策の初期診断",
          supporting_context: "施策追加より先に現状診断を行う流れを整理する",
          actionable_takeaway: "AI引用計測を確認します。",
        },
        visual_quality_review: {
          status: "PASS",
          producer_run_id: "CLUTCH-ID-00002-PRODUCER",
          review_run_id: "CLUTCH-ID-00002-DIAGRAM-REVIEW",
          reviewer_model: "independent-vision-reviewer",
          inspection_method: "ORIGINAL_IMAGE_VISUAL_INSPECTION",
          reviewed_diagram_sha256: "d".repeat(64),
          benchmark_asset_id_or_url: "1PBFt9bGocgp33tclzhXRe8cN0bn7Os7H",
          visual_quality_score: 92,
          canvas_occupancy_percent: 82,
          checks: {
            original_image_inspected: true,
            benchmark_compared: true,
            topic_or_context_heading_present: true,
            supporting_context_present: true,
            reading_order_clear: true,
            information_hierarchy_clear: true,
            canvas_usage_balanced: true,
            japanese_text_readable: true,
            no_text_errors: true,
            actionable_takeaway_present: true,
            not_low_density: true,
            not_labels_only: true,
            source_fidelity_preserved: true,
            copyright_safe: true,
          },
          reviewed_at: "2026-09-11T00:15:00+09:00",
        },
      },
      image_folder_files: [
        ...[1, 2, 3, 4].map((sequence) => ({
          file_name: `${articleId}_${sequence}.png`,
          mime_type: "image/png",
          file_or_folder: "file",
        })),
        {
          file_name: `${articleId}_diagram_1.png`,
          mime_type: "image/png",
          file_or_folder: "file",
        },
      ],
      sheet_persistence: {
        completed_on: "2026/08/25",
        image_folder_url: imageFolderUrl,
        reloaded_after_write: true,
        diagram_completed_on: "2026/08/25",
        diagram_reloaded_after_write: true,
      },
    },
    structured_markup: {
      client_id: "CLUTCH",
      article_id: articleId,
      file_name: `${articleId}_schema.jsonld`,
      file_url: "https://drive.google.com/file/d/schema1/view",
      wordpress_copy_file_url: "https://drive.google.com/file/d/schema-copy/view",
      file_in_article_folder: true,
      wordpress_copy_file_in_article_folder: true,
      sheet_persistence: {
        reloaded_after_write: true,
        structured_url_label: "構造化JSON-LD コピペ用",
      },
      markup: {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Article",
            headline: "AIO対策は施策より先に診断",
            description: "AIO対策の初期診断記事",
            mainEntityOfPage: "https://example.com/aio-diagnosis/",
            author: {
              "@type": "Organization",
              name: "AIO対策ナビ編集部",
            },
            dateModified: "2026-08-25",
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [{ "@type": "ListItem", position: 1, name: "ホーム", item: "https://example.com/" }],
          },
          {
            "@type": "FAQPage",
            mainEntity: faqItems.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: item.answer,
              },
            })),
          },
        ],
      },
    },
    internal_link_graph: {
      client_id: "CLUTCH",
      article_id: articleId,
      existing_article_count: 1,
      outbound_links: [{
        client_id: "CLUTCH",
        target_article_id: "ID-00001",
        target_title: "AIO対策の基礎",
        target_url: "https://example.com/aio-basic/",
        anchor_text: "AIO対策の基礎",
        score: 0.82,
        placement: {
          type: "RELATED_ARTICLES_AFTER_QA",
          after_qa: true,
          section_label: "関連記事",
          section_is_heading: false,
        },
      }],
      reciprocal_update_plan: [{
        client_id: "CLUTCH",
        source_article_id: "ID-00001",
        target_article_id: articleId,
        target_title: "AIO対策は施策より先に診断",
        target_url: "https://example.com/aio-diagnosis/",
      }],
    },
    standard_run_audit: {
      client_id: "CLUTCH",
      article_id: articleId,
      actual_checkpoints: [
        "smartaio_client_folder_direct_child",
        "folder_structure_verified",
        "source_register_created_empty",
        "production_sheet_headers_verified",
        "settings_sheet_client_context_populated",
        "site_title_confirmation",
        "news_settings_template",
        "keyword_sheet_populated",
        "plan_confirmation_sheet_approved",
        "article_plan_user_confirmation",
        "article_category_and_tags_confirmed",
        "outline_review_recorded",
        "article_document_saved",
        "article_document_format_verified",
        "article_tag_and_source_sections_absent",
        "article_json_saved",
        "structured_markup_saved",
        "structured_markup_verified",
        "final_review_recorded",
        "image_persistence_verified",
        "diagram_image_verified",
        "article_images_embedded_in_document",
        "internal_link_graph_verified",
        "cluster_sheet_updated",
        "central_article_index_updated",
        "audit_log_recorded",
      ].map((key) => ({ key, status: "PASS" })),
    },
    ...overrides,
  };
}

test("completion report requires SMARTAIO Drive scope evidence", () => {
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({ smart_aio_plugin_version: "0.1.8+codex.outdated" })),
    /SMART_AIO_PLUGIN_VERSION_MISMATCH/,
  );
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({ drive_scope_evidence: undefined })),
    /COMPLETION_REPORT_DRIVE_SCOPE_EVIDENCE_REQUIRED/,
  );
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({
      drive_scope_evidence: {
        output_location: "MY_DRIVE",
        smartaio_root_verified: false,
        smartaio_root_url: "https://drive.google.com/drive/folders/smartaio-root",
        client_folder_directly_under_smartaio: false,
        client_drive_url: "https://drive.google.com/drive/folders/client-folder",
        article_folder_url: "https://drive.google.com/drive/folders/article-folder",
        image_folder_url: "https://drive.google.com/drive/folders/image-folder",
        production_sheet_url: "https://docs.google.com/spreadsheets/d/sheet123/edit",
        article_folder_under_client_drive: false,
        image_folder_under_client_drive: false,
        created_in_my_drive_root: true,
        my_drive_root_parent_present: true,
        my_drive_root_parent_removed: false,
        folder_path_names: ["My Drive", "CLUTCH_株式会社clutch_再作成_20260825", "ID-00002"],
        image_folder_path_names: ["My Drive", "CLUTCH_株式会社clutch_再作成_20260825", "ID-00002"],
      },
    })),
    /COMPLETION_REPORT_DRIVE_SCOPE_OUTPUT_LOCATION_INVALID/,
  );
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({
      standard_run_audit: {
        client_id: "CLUTCH",
        article_id: "ID-00002",
        evidence: {
          smartaio_client_folder_direct_child: true,
          folder_structure_verified: true,
          source_register_created_empty: true,
          production_sheet_headers_verified: true,
          site_title_confirmation: true,
          article_document_saved: true,
          article_json_saved: true,
          central_article_index_updated: true,
        },
      },
    })),
    /COMPLETION_REPORT_STANDARD_RUN_AUDIT_REQUIRED/,
  );
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({
      drive_scope_evidence: {
        ...completionReportFixture().drive_scope_evidence,
        smartaio_root_url: "https://drive.google.com/drive/folders/wrong-root",
      },
    })),
    /COMPLETION_REPORT_DRIVE_SCOPE_SMARTAIO_ROOT_URL_MISMATCH/,
  );
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({
      drive_scope_evidence: {
        ...completionReportFixture().drive_scope_evidence,
        client_drive_url: "https://drive.google.com/drive/folders/0AJAK01qgUBq4Uk9PVA",
      },
    })),
    /COMPLETION_REPORT_DRIVE_SCOPE_CLIENT_FOLDER_MUST_NOT_BE_SMARTAIO_ROOT/,
  );

  const result = prepareArticleCompletionReport(completionReportFixture());
  assert.equal(result.status, "READY_TO_REPORT_ARTICLE_COMPLETION");
  assert.equal(result.smart_aio_plugin_version, SMART_AIO_PLUGIN_VERSION);
  assert.equal(result.article_document_readback.status, "VERIFIED_ARTICLE_DOCUMENT_READBACK");
  assert.equal(result.drive_scope_evidence.output_location, "SMARTAIO_DRIVE");
  assert.equal(result.drive_scope_evidence.smartaio_root_verified, true);
  assert.equal(result.drive_scope_evidence.client_folder_directly_under_smartaio, true);
  assert.equal(result.standard_run_audit.status, "STANDARD_CLIENT_RUN_AUDIT_PASS");
  assert.equal(result.drive_scope_evidence.my_drive_root_parent_removed, true);
  assert.equal(result.required_links.image_storage, "https://drive.google.com/drive/folders/image-folder");
});

test("completion report requires Google Doc readback markers images and links", () => {
  const fixture = completionReportFixture();
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({ public_url_sheet_readback: undefined })),
    /COMPLETION_REPORT_PUBLIC_URL_SHEET_READBACK_REQUIRED/,
  );
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({ article_document_readback: undefined })),
    /ARTICLE_DOCUMENT_READBACK_EVIDENCE_REQUIRED/,
  );
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({
      article_document_readback: {
        ...fixture.article_document_readback,
        marker_count: 1,
      },
    })),
    /ARTICLE_DOCUMENT_READBACK_MARKER_COUNT_MUST_BE_TWO_TO_FOUR/,
  );
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({
      article_document_readback: {
        ...fixture.article_document_readback,
        inline_object_count: 0,
      },
    })),
    /ARTICLE_DOCUMENT_READBACK_EXACTLY_FIVE_IMAGES_REQUIRED/,
  );
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({
      article_document_readback: {
        ...fixture.article_document_readback,
        visible_markdown_heading_count: 6,
      },
    })),
    /ARTICLE_DOCUMENT_READBACK_MARKDOWN_HEADINGS_FORBIDDEN/,
  );
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({
      article_document_readback: {
        ...fixture.article_document_readback,
        bare_url_paragraph_count: 3,
      },
    })),
    /ARTICLE_DOCUMENT_READBACK_BARE_URL_PARAGRAPHS_FORBIDDEN/,
  );
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({
      article_document_readback: {
        ...fixture.article_document_readback,
        native_heading_styles_verified: false,
      },
    })),
    /ARTICLE_DOCUMENT_READBACK_NATIVE_HEADING_STYLES_VERIFIED_REQUIRED/,
  );
  const verified = verifyArticleDocumentReadbackEvidence(completionReportFixture().article_document_readback);
  assert.equal(verified.inline_object_count, 5);
  assert.equal(verified.internal_link_count, 1);
  assert.equal(verified.visible_markdown_heading_count, 0);
  assert.equal(verified.internal_links_native_hyperlinks_verified, true);
  assert.equal(verified.wordpress_highlight_blocks.key_points.block_count, 1);
  assert.equal(verified.wordpress_highlight_blocks.key_points.item_count, 3);
  assert.equal(verified.wordpress_highlight_blocks.article_summary.line_breaks_preserved, true);
  assert.equal(verified.wordpress_highlight_blocks.conclusion_summary.line_breaks_preserved, true);
  assert.equal(verified.wordpress_highlight_blocks.qa.block_count, 5);
  assert.equal(verified.wordpress_highlight_blocks.qa.qa_pair_per_block, true);

  const firstArticle = verifyArticleDocumentReadbackEvidence({
    ...fixture.article_document_readback,
    existing_article_count: 0,
    internal_link_count: 0,
    internal_links: [],
    has_related_articles_section: false,
    related_articles_section_is_heading: false,
    internal_links_native_hyperlinks_verified: false,
  });
  assert.equal(firstArticle.existing_article_count, 0);
  assert.equal(firstArticle.internal_link_count, 0);
  assert.equal(firstArticle.has_related_articles_section, false);
});

test("completion report rejects forged audit pass without raw checkpoint evidence", () => {
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({
      standard_run_audit: {
        status: "STANDARD_CLIENT_RUN_AUDIT_PASS",
        completion_report_allowed: true,
        client_id: "CLUTCH",
        article_id: "ID-00002",
      },
    })),
    /COMPLETION_REPORT_STANDARD_RUN_AUDIT_EVIDENCE_REQUIRED/,
  );
});

test("article document readback is bound to client article document and persistence digest", () => {
  const fixture = completionReportFixture();
  for (const [field, value, pattern] of [
    ["client_id", "SMAREGI", /ARTICLE_DOCUMENT_READBACK_CLIENT_ID_MISMATCH/],
    ["article_id", "ID-99999", /ARTICLE_DOCUMENT_READBACK_ARTICLE_ID_MISMATCH/],
    ["document_id", "other-doc", /ARTICLE_DOCUMENT_READBACK_DOCUMENT_ID_MISMATCH/],
    ["readback_sha256", "b".repeat(64), /ARTICLE_DOCUMENT_READBACK_SHA256_MISMATCH/],
  ]) {
    assert.throws(
      () => prepareArticleCompletionReport(completionReportFixture({
        article_document_readback: { ...fixture.article_document_readback, [field]: value },
      })),
      pattern,
    );
  }
});

test("article document readback requires absent tag/source sections, exact image identities, and related links", () => {
  const fixture = completionReportFixture();
  const missingTagCount = { ...fixture.article_document_readback };
  delete missingTagCount.visible_standard_tag_count;
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({ article_document_readback: missingTagCount })),
    /ARTICLE_DOCUMENT_READBACK_VISIBLE_STANDARD_TAG_COUNT_INVALID/,
  );

  const wrongImage = structuredClone(fixture.article_document_readback);
  wrongImage.embedded_images[2].sha256 = "f".repeat(64);
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({ article_document_readback: wrongImage })),
    /ARTICLE_DOCUMENT_READBACK_EMBEDDED_IMAGES_3_SHA256_MISMATCH/,
  );

  const wrongRole = structuredClone(fixture.article_document_readback);
  wrongRole.embedded_images[0].image_role = "ARTICLE_PHOTO";
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({ article_document_readback: wrongRole })),
    /ARTICLE_DOCUMENT_READBACK_EMBEDDED_IMAGES_1_IMAGE_ROLE_MISMATCH/,
  );

  const missingImageEvidence = structuredClone(fixture.article_document_readback);
  missingImageEvidence.embedded_images.pop();
  assert.throws(
    () => verifyArticleDocumentReadbackEvidence(missingImageEvidence),
    /ARTICLE_DOCUMENT_READBACK_EMBEDDED_IMAGES_EXACT_SET_REQUIRED/,
  );

  const duplicateObject = structuredClone(fixture.article_document_readback);
  duplicateObject.embedded_images[1].object_id = duplicateObject.embedded_images[0].object_id;
  assert.throws(
    () => verifyArticleDocumentReadbackEvidence(duplicateObject),
    /ARTICLE_DOCUMENT_READBACK_EMBEDDED_IMAGES_OBJECT_ID_UNIQUE_REQUIRED/,
  );

  const wrongLink = structuredClone(fixture.article_document_readback);
  wrongLink.internal_links[0].target_url = "https://example.com/wrong/";
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({ article_document_readback: wrongLink })),
    /ARTICLE_DOCUMENT_READBACK_INTERNAL_LINKS_1_TARGET_URL_MISMATCH/,
  );

  const bareUrlLink = structuredClone(fixture.article_document_readback);
  bareUrlLink.internal_links[0].visible_text = "https://example.com/aio-basic/";
  bareUrlLink.internal_links[0].bare_url_visible = true;
  assert.throws(
    () => prepareArticleCompletionReport(completionReportFixture({ article_document_readback: bareUrlLink })),
    /ARTICLE_DOCUMENT_READBACK_INTERNAL_LINKS_1_BARE_URL_FORBIDDEN/,
  );

  const splitKeyPoints = structuredClone(fixture.article_document_readback);
  splitKeyPoints.wordpress_highlight_blocks.key_points.block_count = 3;
  assert.throws(
    () => verifyArticleDocumentReadbackEvidence(splitKeyPoints),
    /ARTICLE_DOCUMENT_READBACK_WORDPRESS_HIGHLIGHT_BLOCK_KEY_POINTS_COUNT_MISMATCH/,
  );

  const splitQa = structuredClone(fixture.article_document_readback);
  splitQa.wordpress_highlight_blocks.qa.block_count = 10;
  splitQa.wordpress_highlight_blocks.qa.separate_question_answer_blocks = true;
  assert.throws(
    () => verifyArticleDocumentReadbackEvidence(splitQa),
    /ARTICLE_DOCUMENT_READBACK_WORDPRESS_HIGHLIGHT_BLOCK_QA_COUNT_MISMATCH/,
  );
});

test("standard client run audit catches skipped operational checkpoints", () => {
  const result = auditStandardClientRun({
    client_id: "SMAREGI",
    article_id: "ID-00002",
    evidence: {
      smartaio_client_folder_direct_child: true,
      folder_structure_verified: true,
      source_register_created_empty: true,
      production_sheet_headers_verified: true,
      site_title_confirmation: true,
      article_plan_user_confirmation: true,
      article_document_saved: true,
      article_json_saved: true,
      image_persistence_verified: true,
      central_article_index_updated: true,
    },
  });
  assert.equal(result.status, "STANDARD_CLIENT_RUN_AUDIT_REQUIRED");
  assert.equal(result.failure_stage, "ONBOARDING");
  assert.deepEqual(
    result.missing_checkpoints.map((item) => item.key),
    [
      "settings_sheet_client_context_populated",
      "news_settings_template",
      "keyword_sheet_populated",
      "plan_confirmation_sheet_approved",
      "article_category_and_tags_confirmed",
      "outline_review_recorded",
      "article_document_format_verified",
      "article_tag_and_source_sections_absent",
      "structured_markup_saved",
      "structured_markup_verified",
      "final_review_recorded",
      "diagram_image_verified",
      "article_images_embedded_in_document",
      "internal_link_graph_verified",
      "cluster_sheet_updated",
      "audit_log_recorded",
    ],
  );
});

test("weekly and monthly report plans summarize client-scoped production outcomes", () => {
  const report = createPerformanceReport({
    client_id: "C001",
    report_type: "WEEKLY",
    period_start: "2026-08-24",
    period_end: "2026-08-30",
    articles: [{
      client_id: "C001",
      article_id: "ID-00001",
      title: "AIO対策は診断から始める",
      action_type: "NEW_ARTICLE",
      status: "AI_REVIEW_PASSED_AWAITING_HUMAN_APPROVAL",
    }],
    rewrites: [{
      client_id: "C001",
      article_id: "ID-00002",
      title: "既存記事の改善",
      reason: "検索意図にFAQを追加",
    }],
    rankings: [{
      client_id: "C001",
      article_id: "ID-00001",
      keyword: "AIO対策",
      previous_rank: 12,
      current_rank: 8,
      measured_at: "2026-08-30",
      source: "Ahrefs",
    }],
  });
  assert.equal(report.status, "READY_FOR_REPORT_OUTPUT");
  assert.equal(report.sections.articles.length, 1);
  assert.equal(report.sections.rewrites.length, 1);
  assert.equal(report.sections.rankings[0].trend, "UP");
  assert.equal(report.output_format, "GOOGLE_DOC");
  assert.equal(report.output_mime_type, "application/vnd.google-apps.document");
  assert.equal(report.output_folder_name, "07_順位・分析");
  assert.equal(report.output_contract.primary_artifact, "GOOGLE_DOC");
  assert.equal(report.output_contract.primary_link_label, "レポートGoogleドキュメント");
  assert.equal(report.output_contract.record_index_in_management_sheet, true);
  assert.ok(report.required_sources.includes("公開URL"));
  assert.ok(!report.required_sources.includes("WordPressURL"));
  assert.ok(report.markdown_lines.some((line) => line.includes("記事作成: 1件")));
  assert.ok(report.markdown_lines.some((line) => line.includes("出力形式: レポートGoogleドキュメント")));

  const sheetReport = createPerformanceReport({
    client_id: "C001",
    report_type: "MONTHLY",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    output_format: "GOOGLE_SHEET",
  });
  assert.equal(sheetReport.output_format, "GOOGLE_SHEET");
  assert.equal(sheetReport.output_mime_type, "application/vnd.google-apps.spreadsheet");
  assert.equal(sheetReport.output_contract.primary_link_label, "レポートGoogleスプレッドシート");

  assert.throws(() => createPerformanceReport({
    client_id: "C001",
    report_type: "MONTHLY",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    articles: [{ client_id: "C002", article_id: "ID-00001", title: "別顧客記事" }],
  }), /CROSS_CLIENT_DATA_DETECTED/);
  assert.throws(() => createPerformanceReport({
    client_id: "C001",
    report_type: "MONTHLY",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    output_format: "PDF",
  }), /UNKNOWN_REPORT_OUTPUT_FORMAT/);

  const schedule = createReportSchedulePlan({ client_id: "C001", weekly_day: "MON", weekly_time: "09:00", monthly_day: 1 });
  assert.equal(schedule.tasks.length, 2);
  assert.equal(schedule.requires_human_enable, true);
  assert.equal(schedule.tasks[0].external_execution_allowed, false);
  assert.equal(schedule.tasks[0].output_format, "GOOGLE_DOC");
  assert.equal(schedule.tasks[0].output_folder_name, "07_順位・分析");
  assert.equal(schedule.tasks[1].output_format, "GOOGLE_DOC");

  const sheetSchedule = createReportSchedulePlan({ client_id: "C001", output_format: "GOOGLE_SHEET" });
  assert.equal(sheetSchedule.tasks[0].output_format, "GOOGLE_SHEET");
  assert.equal(sheetSchedule.tasks[1].output_format, "GOOGLE_SHEET");
});

test("standard scheduled task plan includes reports for any new client", () => {
  const plan = createScheduledTaskPlan({
    client_id: "C999",
    timezone: "Asia/Tokyo",
    news: {
      feeds: [{
        client_id: "C999",
        feed_id: "official",
        source_url: "https://example.com/",
        industry: "B2B SaaS",
        include_keywords: ["Example"],
        enabled: true,
      }],
    },
    ranking: {
      enabled: false,
    },
  });
  assert.equal(plan.client_id, "C999");
  assert.equal(plan.tasks.length, 4);
  assert.deepEqual(plan.tasks.map((task) => task.task_type), [
    "DAILY_NEWS_COLLECTION",
    "DAILY_RANKING_CHECK",
    "WEEKLY_PERFORMANCE_REPORT",
    "MONTHLY_PERFORMANCE_REPORT",
  ]);
  assert.equal(plan.tasks[2].task_id, "C999_weekly_report");
  assert.equal(plan.tasks[2].status, "READY_TO_ENABLE");
  assert.equal(plan.tasks[2].payload.output_format, "GOOGLE_DOC");
  assert.equal(plan.tasks[2].payload.output_folder_name, "07_順位・分析");
  assert.equal(plan.tasks[2].payload.record_index_in_management_sheet, true);
  assert.ok(plan.tasks[2].payload.required_sources.includes("公開URL"));
  assert.ok(!plan.tasks[2].payload.required_sources.includes("WordPressURL"));
  assert.equal(plan.tasks[3].task_id, "C999_monthly_report");
  assert.equal(plan.tasks[3].status, "READY_TO_ENABLE");
  assert.equal(plan.tasks[3].external_execution_allowed, false);
  assert.equal(plan.tasks[3].human_enable_required, true);
  assert.equal(plan.activation_confirmation_required, true);
  assert.equal(plan.activation_prompt_required_before_app_setup, true);
  assert.ok(plan.activation_prompt.includes("C999 の定期処理設定案を作成しました"));
  assert.ok(plan.activation_prompt.includes("以下の定期処理を有効化しますか？"));
  assert.ok(plan.activation_prompt.includes("WEEKLY_PERFORMANCE_REPORT"));
  assert.ok(plan.activation_prompt.includes("MONTHLY_PERFORMANCE_REPORT"));
  assert.deepEqual(plan.activation_choices, ["有効化する", "まだ有効化しない"]);

  assert.throws(() => createScheduledTaskPlan({
    client_id: "C999",
    api_token: "secret-value",
  }), /SECRET_MUST_NOT_BE_STORED/);
});

test("performance feedback creates approval-gated skill update proposals only", () => {
  const analysis = analyzePerformanceFeedback({
    client_id: "C001",
    minimum_occurrences: 2,
    rankings: [
      { client_id: "C001", keyword: "AIO対策", previous_rank: 14, current_rank: 8, measured_at: "2026-08-30" },
      { client_id: "C001", keyword: "AIO対策", previous_rank: 11, current_rank: 7, measured_at: "2026-09-06" },
    ],
  });
  assert.equal(analysis.status, "READY_FOR_IMPROVEMENT_PROPOSAL");
  assert.equal(analysis.applies_automatically, false);
  assert.ok(analysis.reusable_rules.length >= 1);

  const proposal = proposePerformanceSkillUpdate({
    client_id: "C001",
    current_version: "0.1.0+codex.test",
    proposal_id: "proposal-C001-performance-001",
    analysis,
    source_run_ids: ["run-1", "run-2"],
  });
  assert.equal(proposal.status, "PENDING_ADMIN_APPROVAL");
  assert.equal(proposal.applies_automatically, false);
  assert.equal(proposal.requires_admin_approval, true);
  assert.equal(proposal.protected_prompt_update_policy, "NEVER_AUTO_EDIT_PROTECTED_PROMPTS");

  assert.throws(() => analyzePerformanceFeedback({
    client_id: "C001",
    rankings: [{ client_id: "C002", keyword: "AIO対策", previous_rank: 14, current_rank: 8, measured_at: "2026-08-30" }],
  }), /CROSS_CLIENT_DATA_DETECTED/);
});

test("internal link graph requires same-client links and reciprocal update plans", () => {
  const plan = planInternalLinkGraph({
    client_id: "C001",
    article: {
      client_id: "C001",
      article_id: "ID-00002",
      title: "AIO対策のFAQ設計",
      category: "AIO対策",
      searchIntent: "FAQを使ってAI検索に引用されやすくしたい",
      public_url: "https://example.com/aio-faq/",
    },
    existing_articles: [{
      client_id: "C001",
      article_id: "ID-00001",
      title: "AIO対策の基礎",
      category: "AIO対策",
      searchIntent: "AIO対策の基本を知りたい",
      public_url: "https://example.com/aio-basic/",
      url: "https://docs.google.com/document/d/drive-doc/edit",
    }],
  });
  assert.equal(plan.status, "INTERNAL_LINK_GRAPH_READY");
  assert.equal(plan.outbound_links.length, 1);
  assert.equal(plan.reciprocal_update_plan.length, 1);
  assert.equal(plan.placement_policy, "Q&Aの直後にHタグなしの「関連記事」ラベルを置き、対象記事タイトルへネイティブリンクを付ける。本文中のテキストリンク、タグ、出典セクションとしては出力しない。");

  const verified = verifyInternalLinkGraph({
    client_id: "C001",
    article_id: "ID-00002",
    existing_article_count: 1,
    outbound_links: plan.outbound_links,
    reciprocal_update_plan: plan.reciprocal_update_plan,
  });
  assert.equal(verified.status, "VERIFIED_INTERNAL_LINK_GRAPH");
  assert.equal(verified.placement_policy, "RELATED_ARTICLES_AFTER_QA_ONLY");
  assert.equal(verified.outbound_links[0].placement.doc_output_policy, "TITLE_NATIVE_LINKS_UNDER_PLAIN_RELATED_ARTICLES_LABEL");
  const sheetOutput = prepareInternalLinkSheetOutput({
    internal_link_graph: {
      client_id: "C001",
      article_id: "ID-00002",
      existing_article_count: 1,
      outbound_links: plan.outbound_links,
      reciprocal_update_plan: plan.reciprocal_update_plan,
    },
    management_file_url: "https://drive.google.com/file/d/internal-link-json/view",
  });
  assert.equal(sheetOutput.status, "INTERNAL_LINK_SHEET_OUTPUT_READY");
  assert.ok(sheetOutput.sheet_value.includes("関連記事1（公開前予定URL）: AIO対策の基礎"));
  assert.ok(sheetOutput.sheet_value.includes("表示位置: Q&A直後の「関連記事」（Hタグなし）"));
  assert.ok(sheetOutput.sheet_value.includes("戻しリンク予定1（公開前予定URL）: https://example.com/aio-faq/"));
  assert.throws(() => verifyInternalLinkGraph({
    client_id: "C001",
    article_id: "ID-00002",
    existing_article_count: 1,
    outbound_links: plan.outbound_links.map((link) => ({ ...link, placement: { type: "CONTEXTUAL_BODY", in_body: true } })),
    reciprocal_update_plan: plan.reciprocal_update_plan,
  }), /CONTENT_OPTIMIZATION_INTERNAL_LINK_PLACEMENT_TYPE_INVALID/);
  assert.throws(() => verifyInternalLinkGraph({
    client_id: "C001",
    article_id: "ID-00002",
    existing_article_count: 1,
    outbound_links: [{
      ...plan.outbound_links[0],
      placement: {
        type: "RELATED_ARTICLES_AFTER_QA",
        after_qa: true,
        section_label: "関連記事",
        section_is_heading: true,
      },
    }],
    reciprocal_update_plan: plan.reciprocal_update_plan,
  }), /CONTENT_OPTIMIZATION_RELATED_ARTICLES_HEADING_FORBIDDEN/);
  assert.throws(() => verifyInternalLinkGraph({
    client_id: "C001",
    article_id: "ID-00002",
    existing_article_count: 1,
    outbound_links: [{
      ...plan.outbound_links[0],
      placement: {
        type: "RELATED_ARTICLES_AFTER_QA",
        section_label: "関連記事",
        section_is_heading: false,
      },
    }],
    reciprocal_update_plan: plan.reciprocal_update_plan,
  }), /CONTENT_OPTIMIZATION_RELATED_ARTICLES_AFTER_QA_REQUIRED/);
  assert.throws(() => verifyInternalLinkGraph({
    client_id: "C001",
    article_id: "ID-00002",
    existing_article_count: 1,
    outbound_links: plan.outbound_links,
    reciprocal_update_plan: [],
  }), /CONTENT_OPTIMIZATION_RECIPROCAL_UPDATE_PLAN_REQUIRED/);
  assert.throws(() => planInternalLinkGraph({
    client_id: "C001",
    article: { client_id: "C001", article_id: "ID-00002", title: "AIO対策", category: "AIO対策" },
    existing_articles: [{ client_id: "C002", article_id: "ID-00001", title: "別顧客", url: "https://example.com/other/" }],
  }), /CROSS_CLIENT_DATA_DETECTED/);
  assert.throws(() => planInternalLinkGraph({
    client_id: "C001",
    article: { client_id: "C001", article_id: "ID-00002", title: "AIO対策", category: "AIO対策", public_url: "https://example.com/aio-faq/" },
    existing_articles: [{ client_id: "C001", article_id: "ID-00001", title: "Drive Doc", WordPressURL: "https://docs.google.com/document/d/doc123/edit" }],
  }), /CONTENT_OPTIMIZATION_EXISTING_ARTICLE_PUBLIC_URL_COMPAT_WORDPRESS_URL_MUST_BE_PUBLIC_ARTICLE_URL/);
  assert.throws(() => planInternalLinkGraph({
    client_id: "C001",
    article: { client_id: "C001", article_id: "ID-00002", title: "AIO対策", category: "AIO対策", public_url: "https://example.com/aio-faq/" },
    existing_articles: [{ client_id: "C001", article_id: "ID-00001", title: "Drive Doc", 記事URL: "https://docs.google.com/document/d/doc123/edit" }],
  }), /CONTENT_OPTIMIZATION_EXISTING_ARTICLE_PUBLIC_URL_ARTICLE_URL_FORBIDDEN/);
  assert.throws(() => planInternalLinkGraph({
    client_id: "C001",
    article: { client_id: "C001", article_id: "ID-00002", title: "AIO対策", category: "AIO対策", public_url: "https://example.com/aio-faq/" },
    existing_articles: [{ client_id: "C001", article_id: "ID-00001", title: "公開URL未入力" }],
  }), /CONTENT_OPTIMIZATION_INTERNAL_LINK_PUBLIC_URL_REQUIRED/);
  assert.throws(() => planInternalLinkGraph({
    client_id: "C001",
    article: { client_id: "C001", article_id: "ID-00002", title: "AIO対策", category: "AIO対策", searchIntent: "AIO対策の基本を知りたい", public_url: "https://docs.google.com/document/d/doc123/edit" },
    existing_articles: [{ client_id: "C001", article_id: "ID-00001", title: "AIO対策の基礎", category: "AIO対策", searchIntent: "AIO対策の基本を知りたい", public_url: "https://example.com/aio-basic/" }],
  }), /CONTENT_OPTIMIZATION_ARTICLE_PUBLIC_URL_MUST_BE_PUBLIC_ARTICLE_URL/);
});

test("article preparation internal-link candidates use only public URL columns", () => {
  const candidate = {
    client_id: "C001",
    article_id: "ID-00002",
    title: "AIO対策のFAQ設計",
    category: "AIO対策",
  };
  const links = selectInternalLinkCandidates({
    client_id: "C001",
    candidate,
    existingArticles: [{
      client_id: "C001",
      article_id: "ID-00001",
      title: "AIO対策の基礎",
      category: "AIO対策",
      public_url: "",
      公開URL: "https://example.com/aio-basic/",
      url: "https://docs.google.com/document/d/doc123/edit",
    }],
  });
  assert.equal(links[0].target_url, "https://example.com/aio-basic/");
  assert.equal(links[0].target_url_source, "公開URL");
  assert.deepEqual(links[0].placement, {
    type: "RELATED_ARTICLES_AFTER_QA",
    after_qa: true,
    section_label: "関連記事",
    section_is_heading: false,
  });
  assert.throws(() => selectInternalLinkCandidates({
    client_id: "C001",
    candidate,
    existingArticles: [{
      client_id: "C001",
      article_id: "ID-00001",
      title: "AIO対策の基礎",
      category: "AIO対策",
      記事URL: "https://docs.google.com/document/d/doc123/edit",
    }],
  }), /INTERNAL_LINK_ARTICLE_URL_FORBIDDEN/);
});

test("article review accepts related article title links without visible URLs", () => {
  const base = {
    client_id: "C001",
    article: {
      client_id: "C001",
      article_id: "ID-00002",
      responsibilityLabel: "FAQ設計｜FAQ設計責任｜検索意図確認,質問整理,回答整理,構造化確認｜関連記事確認,公開前確認",
    },
    content: [
      "FAQ設計責任を扱います。",
      "検索意図確認、質問整理、回答整理、構造化確認を本文で扱います。",
      "[H2]見出し[/H2]",
      "[H2]Q&A[/H2]",
      "関連記事",
      "AIO対策の基礎",
    ].join("\n"),
    existingArticles: [],
    sourceCatalog: [{ client_id: "C001", source_id: "S1", status: "approved" }],
    sourcesUsed: [{ client_id: "C001", source_id: "S1" }],
    internalLinksUsed: [{
      client_id: "C001",
      target_article_id: "ID-00001",
      target_title: "AIO対策の基礎",
      target_url: "https://example.com/aio-basic/",
      anchor_text: "AIO対策の基礎",
    }],
    clientRules: { minimumCharacters: 20 },
  };
  const reviewed = reviewArticle(base);
  assert.equal(reviewed.checks.find((check) => check.key === "internal_links").passed, true);

  const misplaced = reviewArticle({
    ...base,
    content: base.content.replace("[H2]Q&A[/H2]\n関連記事", "関連記事\n[H2]Q&A[/H2]"),
  });
  assert.equal(misplaced.checks.find((check) => check.key === "internal_links").passed, false);

  const bareUrlOnly = reviewArticle({
    ...base,
    content: base.content.replace("AIO対策の基礎", "https://example.com/aio-basic/"),
  });
  assert.equal(bareUrlOnly.checks.find((check) => check.key === "internal_links").passed, false);
});

test("structured markup output creates and verifies JSON-LD for article SEO", () => {
  const faqItems = Array.from({ length: 5 }, (_, index) => ({
    question: `FAQは必要ですか？${index + 1}`,
    answer: `検索意図を整理できる場合は有効です。${index + 1}`,
  }));
  const output = buildStructuredMarkupOutput({
    client_id: "C001",
    site: { url: "https://example.com/", name: "Example公式" },
    article: {
      client_id: "C001",
      article_id: "ID-00002",
      title: "AIO対策のFAQ設計",
      description: "AIO対策でFAQを設計する手順を説明します。",
      meta_description: "AIO対策でFAQを設計する手順を説明します。",
      profile_widget_author_name: "AIO対策ナビ編集部",
      category: "AIO対策",
      category_url: "https://example.com/category/aio/",
      public_url: "https://example.com/aio-faq/",
      date_modified: "2026-08-28",
      hashtags: "AIO対策,FAQ",
      faq_items: faqItems,
      body_faq_items: faqItems,
    },
  });
  assert.equal(output.status, "STRUCTURED_MARKUP_READY");
  assert.equal(output.file_name, "ID-00002_schema.jsonld");
  assert.equal(output.wordpress_copy_file_name, "ID-00002_schema_wordpress_copy.txt");
  assert.match(output.wordpress_copy_content, /^<script type="application\/ld\+json">\n/);
  assert.match(output.wordpress_copy_content, /\n<\/script>\n$/);
  assert.ok(output.wordpress_copy_content.includes(output.content.trim()));
  assert.ok(output.markup["@graph"].some((item) => item["@type"] === "FAQPage"));
  const articleSchema = output.markup["@graph"].find((item) => item["@type"] === "Article");
  assert.equal(articleSchema.author.name, "AIO対策ナビ編集部");
  assert.equal("publisher" in articleSchema, false);
  assert.equal("keywords" in articleSchema, false);
  assert.equal("image" in articleSchema, false);
  const verified = verifyStructuredMarkupOutput({
    client_id: "C001",
    article_id: "ID-00002",
    file_name: output.file_name,
    file_url: "https://drive.google.com/file/d/schema-file/view",
    wordpress_copy_file_url: "https://drive.google.com/file/d/schema-copy/view",
    file_in_article_folder: true,
    wordpress_copy_file_in_article_folder: true,
    sheet_persistence: { reloaded_after_write: true, structured_url_label: "構造化JSON-LD コピペ用" },
    markup: output.markup,
  }, { description: "AIO対策でFAQを設計する手順を説明します。", public_url: "https://example.com/aio-faq/", body_faq_items: faqItems });
  assert.equal(verified.status, "VERIFIED_STRUCTURED_MARKUP_OUTPUT");
  assert.ok(verified.schema_types.includes("Article"));
  assert.ok(verified.schema_types.includes("FAQPage"));
  assert.throws(() => verifyStructuredMarkupOutput({
    client_id: "C001",
    article_id: "ID-00002",
    file_name: output.file_name,
    file_url: "https://drive.google.com/file/d/schema-file/view",
    wordpress_copy_file_url: "https://drive.google.com/file/d/schema-copy/view",
    file_in_article_folder: true,
    wordpress_copy_file_in_article_folder: true,
    sheet_persistence: { reloaded_after_write: true, structured_url_label: "構造化JSON-LD コピペ用" },
    markup: output.markup,
  }, { public_url: "https://example.com/another-article/" }), /CONTENT_OPTIMIZATION_ARTICLE_MAIN_ENTITY_OF_PAGE_MISMATCH/);
  assert.throws(() => verifyStructuredMarkupOutput({
    client_id: "C001",
    article_id: "ID-00002",
    file_name: output.file_name,
    file_url: "https://drive.google.com/file/d/schema-file/view",
    wordpress_copy_file_url: "https://drive.google.com/file/d/schema-copy/view",
    file_in_article_folder: true,
    wordpress_copy_file_in_article_folder: true,
    sheet_persistence: { reloaded_after_write: true, structured_url_label: "構造化JSON-LD コピペ用" },
    markup: output.markup,
  }, { body_faq_items: faqItems.map((item, index) => index === 0 ? { ...item, answer: "本文と異なる回答" } : item) }), /CONTENT_OPTIMIZATION_FAQ_SCHEMA_MUST_MATCH_BODY_QA/);
  assert.throws(() => buildStructuredMarkupOutput({
    client_id: "C001",
    site: { url: "https://example.com/", name: "Example公式" },
    article: {
      client_id: "C001",
      article_id: "ID-00002",
      title: "AIO対策のFAQ設計",
      description: "スキーマ側だけ違う説明です。",
      meta_description: "AIO対策でFAQを設計する手順を説明します。",
      profile_widget_author_name: "AIO対策ナビ編集部",
      public_url: "https://example.com/aio-faq/",
      date_modified: "2026-08-28",
      faq_items: faqItems,
      body_faq_items: faqItems,
    },
  }), /CONTENT_OPTIMIZATION_DESCRIPTION_MUST_MATCH_META_DESCRIPTION_COLUMN/);
  assert.throws(() => buildStructuredMarkupOutput({
    client_id: "C001",
    site: { url: "https://example.com/", name: "Example公式" },
    article: {
      client_id: "C001",
      article_id: "ID-00002",
      title: "AIO対策のFAQ設計",
      description: "AIO対策でFAQを設計する手順を説明します。",
      meta_description: "AIO対策でFAQを設計する手順を説明します。",
      profile_widget_author_name: "AIO対策ナビ編集部",
      public_url: "https://docs.google.com/document/d/doc123/edit",
      date_modified: "2026-08-28",
      faq_items: faqItems,
      body_faq_items: faqItems,
    },
  }), /CONTENT_OPTIMIZATION_ARTICLE_PUBLIC_URL_MUST_BE_PUBLIC_ARTICLE_URL/);
  assert.throws(() => buildStructuredMarkupOutput({
    client_id: "C001",
    site: { url: "https://example.com/", name: "Example公式" },
    article: {
      client_id: "C001",
      article_id: "ID-00002",
      title: "AIO対策のFAQ設計",
      description: "AIO対策でFAQを設計する手順を説明します。",
      meta_description: "AIO対策でFAQを設計する手順を説明します。",
      profile_widget_author_name: "AIO対策ナビ編集部",
      public_url: "https://example.com/aio-faq/",
      date_modified: "2026-08-28",
      faq_items: faqItems.slice(0, 4),
      body_faq_items: faqItems,
    },
  }), /CONTENT_OPTIMIZATION_FAQ_EXACTLY_FIVE_REQUIRED/);
  assert.throws(() => verifyStructuredMarkupOutput({
    client_id: "C001",
    article_id: "ID-00002",
    file_name: "ID-00002_schema.jsonld",
    file_url: "https://drive.google.com/file/d/schema-file/view",
    wordpress_copy_file_url: "https://drive.google.com/file/d/schema-copy/view",
    file_in_article_folder: true,
    wordpress_copy_file_in_article_folder: true,
    sheet_persistence: { reloaded_after_write: true, structured_url_label: "構造化JSON-LD コピペ用" },
    markup: { "@context": "https://schema.org", "@graph": [] },
  }), /CONTENT_OPTIMIZATION_ARTICLE_SCHEMA_INCOMPLETE/);
  assert.throws(() => verifyStructuredMarkupOutput({
    client_id: "C001",
    article_id: "ID-00002",
    file_name: "ID-00002_schema.jsonld",
    file_url: "https://drive.google.com/file/d/schema-file/view",
    wordpress_copy_file_url: "https://drive.google.com/file/d/schema-copy/view",
    file_in_article_folder: true,
    wordpress_copy_file_in_article_folder: true,
    sheet_persistence: { reloaded_after_write: true, structured_url_label: "構造化JSON-LD" },
    markup: output.markup,
  }), /CONTENT_OPTIMIZATION_STRUCTURED_SHEET_COPY_LABEL_REQUIRED/);
  assert.throws(() => verifyStructuredMarkupOutput({
    client_id: "C001",
    article_id: "ID-00002",
    file_name: "ID-00002_schema.jsonld",
    file_url: "https://drive.google.com/file/d/schema-file/view",
    wordpress_copy_file_url: "https://drive.google.com/file/d/schema-copy/view",
    file_in_article_folder: true,
    wordpress_copy_file_in_article_folder: true,
    sheet_persistence: { reloaded_after_write: true, structured_url_label: "構造化JSON-LD コピペ用" },
    markup: {
      ...output.markup,
      "@graph": output.markup["@graph"].map((item) => item["@type"] === "Article" ? { ...item, keywords: ["AIO"], image: "https://example.com/eye-catch.png" } : item),
    },
  }), /CONTENT_OPTIMIZATION_ARTICLE_KEYWORDS_FORBIDDEN/);
  assert.throws(() => verifyStructuredMarkupOutput({
    client_id: "C001",
    article_id: "ID-00002",
    file_name: output.file_name,
    file_url: "https://drive.google.com/file/d/schema-file/view",
    wordpress_copy_file_url: "https://drive.google.com/file/d/schema-copy/view",
    file_in_article_folder: true,
    wordpress_copy_file_in_article_folder: true,
    sheet_persistence: { reloaded_after_write: true, structured_url_label: "構造化JSON-LD コピペ用" },
    markup: {
      ...output.markup,
      "@graph": output.markup["@graph"].map((item) => item["@type"] === "Article" ? { ...item, publisher: { "@type": "Organization", name: "Example" } } : item),
    },
  }), /CONTENT_OPTIMIZATION_ARTICLE_PUBLISHER_FORBIDDEN/);
  assert.throws(() => verifyStructuredMarkupOutput({
    client_id: "C001",
    article_id: "ID-00002",
    file_name: output.file_name,
    file_url: "https://drive.google.com/file/d/schema-file/view",
    wordpress_copy_file_url: "https://drive.google.com/file/d/schema-copy/view",
    file_in_article_folder: true,
    wordpress_copy_file_in_article_folder: true,
    sheet_persistence: { reloaded_after_write: true, structured_url_label: "構造化JSON-LD コピペ用" },
    markup: {
      ...output.markup,
      "@graph": output.markup["@graph"].map((item) => item["@type"] === "Article" ? { ...item, image: "https://example.com/eye-catch.png" } : item),
    },
  }), /CONTENT_OPTIMIZATION_ARTICLE_IMAGE_FORBIDDEN/);
  assert.throws(() => buildStructuredMarkupOutput({
    client_id: "C001",
    site: { url: "https://example.com/", name: "Example公式" },
    article: {
      client_id: "C001",
      article_id: "ID-00002",
      title: "AIO対策のFAQ設計",
      description: "AIO対策でFAQを設計する手順を説明します。",
      meta_description: "AIO対策でFAQを設計する手順を説明します。",
      profile_widget_author_name: "AIO対策ナビ編集部",
      article_url: "https://example.com/old-article-url/",
      date_modified: "2026-08-28",
      faq_items: faqItems,
      body_faq_items: faqItems,
    },
  }), /CONTENT_OPTIMIZATION_ARTICLE_PUBLIC_URL_ARTICLE_URL_FORBIDDEN/);
});

test("standard image set plans one title image, three article photos, and one diagram", async () => {
  const plan = await prepareStandardImageSet({
    client_id: "CLUTCH",
    article_id: "ID-00002",
    title: "AIO対策は施策より先に診断",
    baseTheme: "AIO診断サービス",
    compositions: ["診断表を見る担当者", "会議で方針を決める場面", "改善チェックリスト"],
    diagramContent: "診断項目を4領域に分ける。",
    diagramSource: {
      source_text: "AIO対策は施策追加より先に現状診断を行います。情報明確性を確認します。出典更新を確認します。FAQ構造を確認します。AI引用計測を確認します。",
      text_items: ["情報明確性を確認します。", "出典更新を確認します。", "FAQ構造を確認します。", "AI引用計測を確認します。"],
    },
  });
  assert.equal(plan.title_image_count, 1);
  assert.equal(plan.article_photo_count, 3);
  assert.equal(plan.image_count, 4);
  assert.equal(plan.total_visual_count, 5);
  assert.equal(plan.output_plan.sheet_updates_after_save.Y.length, 10);
  assert.equal(plan.output_plan.sheet_updates_after_save.Z, "DIAGRAM_FILE_URL");
  assert.equal(plan.output_plan.sheet_updates_after_save.W, undefined);
  assert.equal(plan.output_plan.sheet_updates_after_save.X, undefined);
  assert.equal(plan.images[0].image_role, "TITLE_IMAGE");
  assert.equal(plan.images[0].title_text, "AIO対策は施策より先に診断");
  assert.match(plan.images[0].prepared_prompt_sha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.images[0].prepared_prompt_sha256, plan.images[0].content_prompt_sha256);
  assert.equal(plan.images[0].independent_visual_quality_review_required, true);
  assert.equal(plan.images[0].title_hierarchy.main_heading.length > 0, true);
  assert.equal(plan.images[0].title_text_required, true);
  assert.deepEqual(plan.images.slice(1).map((image) => image.image_role), ["ARTICLE_PHOTO", "ARTICLE_PHOTO", "ARTICLE_PHOTO"]);
  assert.equal(plan.completion_gate.requires_title_text_in_first_image, true);
  assert.equal(plan.completion_gate.requires_diagram_source_highlight, true);
  assert.equal(plan.completion_gate.requires_diagram_source_derived_text_verification, true);
  assert.equal(plan.completion_gate.requires_diagram_source_content_match, true);
  assert.equal(plan.completion_gate.requires_diagram_source_not_explanation, true);
  assert.equal(plan.completion_gate.requires_prepared_prompt_hash_match, true);
  assert.equal(plan.completion_gate.rejects_abbreviated_manual_image_prompts, true);
  assert.equal(plan.completion_gate.requires_generation_call_id, true);
  assert.equal(plan.completion_gate.requires_measured_file_dimensions, true);
  assert.equal(plan.completion_gate.requires_independent_title_visual_quality_review, true);
  assert.equal(plan.completion_gate.requires_title_visual_quality_score_at_least, 85);
  assert.equal(plan.completion_gate.requires_independent_diagram_visual_quality_review, true);
  assert.equal(plan.completion_gate.requires_diagram_visual_quality_score_at_least, 85);
  assert.deepEqual(plan.completion_gate.requires_diagram_canvas_occupancy_percent_between, [65, 95]);
  assert.equal(plan.completion_gate.rejects_low_density_or_labels_only_diagram, true);
  assert.equal(plan.completion_gate.requires_reviewed_diagram_sha256_match, true);
  assert.deepEqual(plan.diagram_image.diagram_source.text_items, ["情報明確性を確認します。", "出典更新を確認します。", "FAQ構造を確認します。", "AI引用計測を確認します。"]);
  assert.match(plan.diagram_image.prepared_prompt_sha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.diagram_image.diagram_source.supporting_context.length > 0, true);
  assert.equal(plan.diagram_image.diagram_source.actionable_takeaway.length > 0, true);
  assert.ok(plan.diagram_image.content_prompt.includes("人が見やすい図であることを最優先"));
  assert.ok(plan.diagram_image.content_prompt.includes("本文と別内容にしない"));
  assert.ok(plan.diagram_image.content_prompt.includes("図解画像にする内容そのものである"));
  assert.ok(plan.diagram_image.content_prompt.includes("図解内の項目、順番、意味は図解元テキストと一致"));
  assert.ok(plan.diagram_image.content_prompt.includes("意味を変えない短いラベル化は許可"));
  assert.ok(plan.diagram_image.content_prompt.includes("企業のロゴやアニメのキャラクターなど著作権のあるものは一切入れない"));
  assert.ok(plan.diagram_image.content_prompt.includes("本文にない新しい概念、判断項目、説明、キャッチコピー、数値、補足コピーを勝手に追加しない"));
  assert.ok(plan.diagram_image.content_prompt.includes("意味のないチェックマークだけの帯"));
  assert.ok(plan.diagram_image.content_prompt.includes("透明背景"));
  assert.deepEqual(plan.completion_gate.required_photo_file_names, ["ID-00002_2.png", "ID-00002_3.png", "ID-00002_4.png"]);
});

test("article visual persistence requires one title image, three article photos, and one diagram", () => {
  const base = completionReportFixture().image_persistence;
  const verified = verifyArticleVisualPersistence(base);
  assert.equal(verified.status, "VERIFIED_ARTICLE_VISUAL_SET");
  assert.equal(verified.title_image_count, 1);
  assert.equal(verified.article_photo_count, 3);
  assert.equal(verified.images[0].role, "TITLE_IMAGE");
  assert.equal(verified.images[0].title_text, "AIO対策は施策より先に診断");
  assert.equal(verified.diagram_image.diagram_source.doc_highlighted, true);
  assert.equal(verified.diagram_image.diagram_source.source_text_matches_diagram_content, true);
  assert.equal(verified.diagram_image.diagram_source.source_text_is_not_diagram_explanation, true);
  assert.equal(verified.diagram_image.visual_quality_review.status, "PASS");
  assert.equal(verified.diagram_image.visual_quality_review.inspection_method, "ORIGINAL_IMAGE_VISUAL_INSPECTION");
  assert.equal(verified.diagram_image.visual_quality_review.visual_quality_score, 92);
  assert.deepEqual(verified.diagram_image.diagram_source.text_items, ["情報明確性を確認します。", "出典更新を確認します。", "FAQ構造を確認します。", "AI引用計測を確認します。"]);
  assert.throws(() => verifyArticleVisualPersistence({ ...base, diagram_image: undefined }), /IMAGE_PERSISTENCE_DIAGRAM_FILE_NAME_REQUIRED/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      diagram_source: {
        ...base.diagram_image.diagram_source,
        doc_highlighted: false,
        highlighted_in_document: false,
      },
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_SOURCE_DOCUMENT_HIGHLIGHT_REQUIRED/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      diagram_source: {
        ...base.diagram_image.diagram_source,
        rendered_text_items: ["情報明確性を確認します。", "出典更新を確認します。"],
      },
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_RENDERED_TEXT_MISMATCH/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      diagram_source: {
        ...base.diagram_image.diagram_source,
        source_text_matches_diagram_content: false,
      },
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_SOURCE_CONTENT_MATCH_REQUIRED/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      diagram_source: {
        ...base.diagram_image.diagram_source,
        source_text_is_not_diagram_explanation: false,
      },
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_SOURCE_EXPLANATION_FORBIDDEN/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    image_folder_files: [...base.image_folder_files, { file_name: "rewrite_plan.json", mime_type: "application/json", file_or_folder: "file" }],
  }), /IMAGE_PERSISTENCE_IMAGE_FOLDER_NON_IMAGE_FORBIDDEN/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    image_folder_files: base.image_folder_files.filter((file) => file.file_name !== `${base.article_id}_diagram_1.png`),
  }), /IMAGE_PERSISTENCE_IMAGE_FOLDER_EXPECTED_FILE_MISSING/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    images: base.images.map((image, index) => index === 0
      ? { ...image, title_text_in_image: false }
      : image),
  }), /IMAGE_PERSISTENCE_TITLE_TEXT_PROOF_REQUIRED/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    images: base.images.map((image, index) => index === 0
      ? { ...image, prepared_prompt_sha256: "a".repeat(64), generation_prompt_sha256: "b".repeat(64) }
      : image),
  }), /IMAGE_PERSISTENCE_PREPARED_PROMPT_HASH_MISMATCH/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    images: base.images.map((image, index) => index === 0
      ? { ...image, prompt_text_exact_match_verified: false, prepared_prompt_used_verbatim: false }
      : image),
  }), /IMAGE_PERSISTENCE_PREPARED_PROMPT_EXACT_MATCH_REQUIRED/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    images: base.images.map((image, index) => index === 0
      ? { ...image, measured_width: undefined, measured_height: undefined, file_measurement: undefined }
      : image),
  }), /IMAGE_PERSISTENCE_IMAGE_1_MEASURED_WIDTH_INVALID/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    images: base.images.map((image, index) => index === 0
      ? { ...image, visual_quality_review: undefined }
      : image),
  }), /IMAGE_PERSISTENCE_TITLE_VISUAL_QUALITY_REVIEW_REQUIRED/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    images: base.images.map((image, index) => index === 0
      ? {
        ...image,
        visual_quality_review: {
          ...image.visual_quality_review,
          checks: {
            ...image.visual_quality_review.checks,
            title_hierarchy_clear: false,
          },
        },
      }
      : image),
  }), /IMAGE_PERSISTENCE_TITLE_VISUAL_QUALITY_CHECK_FAILED/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    images: base.images.map((image, index) => index === 0
      ? { ...image, image_role: "ARTICLE_PHOTO" }
      : image),
  }), /IMAGE_PERSISTENCE_TITLE_IMAGE_ROLE_INVALID/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    images: base.images.map((image, index) => index === 0
      ? { ...image, source_tool: "", generation_method: "" }
      : image),
  }), /IMAGE_PERSISTENCE_GENERATION_METHOD_REQUIRED/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    images: base.images.map((image, index) => index === 0
      ? { ...image, generation_method: "PIL ImageDraw build_articles.py template" }
      : image),
  }), /IMAGE_PERSISTENCE_TEMPLATE_IMAGE_FORBIDDEN/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      visual_quality_review: undefined,
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_REVIEW_REQUIRED/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      visual_quality_review: {
        ...base.diagram_image.visual_quality_review,
        reviewed_diagram_sha256: "e".repeat(64),
      },
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_SHA_MISMATCH/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      visual_quality_review: {
        ...base.diagram_image.visual_quality_review,
        review_run_id: base.diagram_image.visual_quality_review.producer_run_id,
      },
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_INDEPENDENT_REVIEW_REQUIRED/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      visual_quality_review: {
        ...base.diagram_image.visual_quality_review,
        inspection_method: "METADATA_ONLY",
      },
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_INSPECTION_METHOD_INVALID/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      visual_quality_review: {
        ...base.diagram_image.visual_quality_review,
        visual_quality_score: 84,
      },
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_SCORE_BELOW_MINIMUM/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      visual_quality_review: {
        ...base.diagram_image.visual_quality_review,
        canvas_occupancy_percent: 48,
      },
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_LOW_DENSITY/);
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      visual_quality_review: {
        ...base.diagram_image.visual_quality_review,
        checks: {
          ...base.diagram_image.visual_quality_review.checks,
          topic_or_context_heading_present: false,
          supporting_context_present: false,
          actionable_takeaway_present: false,
          not_labels_only: false,
        },
      },
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_CHECK_FAILED/);
});

test("diagram visual quality gate rejects an ID-00014-shaped low-density labels-only result", () => {
  const base = completionReportFixture().image_persistence;
  const lowQualityReview = {
    ...base.diagram_image.visual_quality_review,
    status: "PASS",
    visual_quality_score: 89,
    canvas_occupancy_percent: 48,
    checks: {
      ...base.diagram_image.visual_quality_review.checks,
      topic_or_context_heading_present: false,
      supporting_context_present: false,
      actionable_takeaway_present: false,
      not_low_density: false,
      not_labels_only: false,
    },
  };
  assert.throws(() => verifyArticleVisualPersistence({
    ...base,
    diagram_image: {
      ...base.diagram_image,
      visual_quality_review: lowQualityReview,
    },
  }), /IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_LOW_DENSITY/);
});

test("rewrite planning is automatic for drafts but never permits auto publication", () => {
  const plan = prepareRewritePlan({
    client_id: "C001",
    articles: [{
      client_id: "C001",
      article_id: "ID-00003",
      title: "AIO対策の古い記事",
      url: "https://example.com/old-aio/",
      article_folder_url: "https://drive.google.com/drive/folders/article-00003",
    }],
    rankings: [{
      client_id: "C001",
      article_id: "ID-00003",
      keyword: "AIO対策",
      previous_rank: 7,
      current_rank: 13,
      measured_at: "2026-08-28",
      clicks_delta: -10,
    }],
  });
  assert.equal(plan.status, "REWRITE_PLAN_READY");
  assert.equal(plan.auto_draft_allowed, true);
  assert.equal(plan.auto_publish_allowed, false);
  assert.equal(plan.final_approval_required_before_publication, true);
  assert.equal(plan.output_parent_policy, "SAME_ORIGINAL_ARTICLE_FOLDER");
  assert.equal(plan.candidates[0].rewrite_artifact_folder_name, "0003-リライト01_20260828");
  assert.equal(plan.candidates[0].article_folder_url, "https://drive.google.com/drive/folders/article-00003");
  const output = prepareRewriteArtifactOutput({
    client_id: "C001",
    article_id: "ID-00003",
    article_folder_url: "https://drive.google.com/drive/folders/article-00003",
    rewrite_sequence: 2,
    rewrite_date: "2026/08/28",
  });
  assert.equal(output.status, "REWRITE_ARTIFACT_OUTPUT_READY");
  assert.equal(output.output_parent_policy, "SAME_ORIGINAL_ARTICLE_FOLDER");
  assert.equal(output.folder_name, "0003-リライト02_20260828");
  assert.equal(output.visible_artifact_count, 3);
  assert.deepEqual(Object.keys(output.file_names), ["management_json", "article_content", "structured_markup"]);
  assert.equal(output.file_names.management_json, "0003-リライト02_20260828.json");
  assert.equal(output.file_names.article_content, "0003-リライト02_20260828_記事内容");
  assert.equal(output.file_names.structured_markup, "0003-リライト02_20260828_構造化マークアップ.txt");
  assert.equal(output.artifact_types.article_content, "application/vnd.google-apps.document");
  assert.ok(output.management_json_includes.includes("internal_link_graph"));
  assert.throws(() => prepareRewriteArtifactOutput({
    client_id: "C001",
    article_id: "ID-00003",
    article_folder_url: "https://drive.google.com/drive/folders/article-00003",
    rewrite_sequence: 0,
    rewrite_date: "2026-08-28",
  }), /CONTENT_OPTIMIZATION_REWRITE_SEQUENCE_INVALID/);
  assert.throws(() => prepareRewriteArtifactOutput({
    client_id: "C001",
    article_id: "ID-00003",
    article_folder_url: "https://example.com/not-drive-folder",
    rewrite_sequence: 1,
    rewrite_date: "2026-08-28",
  }), /CONTENT_OPTIMIZATION_ARTICLE_FOLDER_URL_INVALID/);
  assert.throws(() => prepareRewritePlan({
    client_id: "C001",
    articles: [{ client_id: "C002", article_id: "ID-00003", title: "別顧客記事" }],
    rankings: [],
  }), /CROSS_CLIENT_DATA_DETECTED/);
});

test("plugin source and workbooks contain no retired expressions", async () => {
  const files = await walk(pluginRoot);
  for (const path of files) {
    const relative = path.slice(pluginRoot.length + 1);
    for (const expression of blockedExpressions) {
      assert.equal(relative.toLowerCase().includes(expression.toLowerCase()), false, `${relative} contains a blocked expression`);
    }
    const content = extname(path) === ".xlsx" ? execFileSync("unzip", ["-p", path]) : await readFile(path);
    const text = content.toString("utf8");
    for (const expression of blockedExpressions) {
      assert.equal(text.toLowerCase().includes(expression.toLowerCase()), false, `${relative} contains a blocked expression`);
    }
  }
});

test("workspace article workflow forbids restart prompts and requires marker evidence", async () => {
  const orchestrator = await readFile(join(pluginRoot, "skills", "smart-aio-orchestrator", "SKILL.md"), "utf8");
  const articleProduction = await readFile(join(pluginRoot, "skills", "article-production", "SKILL.md"), "utf8");
  const articleContract = await readFile(join(pluginRoot, "skills", "article-production", "references", "article-contract.md"), "utf8");
  const combined = `${orchestrator}\n${articleProduction}\n${articleContract}`;

  assert.match(orchestrator, /同じ初回依頼の再送を求めてはならない/);
  assert.match(orchestrator, /「続き」とだけ送れば同じ記事の残工程から再開/);
  assert.doesNotMatch(combined, /同じ依頼をもう一度送ってください/);
  assert.match(combined, /黄色マーカー(?:相当)?[^。\n]*2〜4箇所/);
  assert.match(combined, /保存前と再読込後/);
});
