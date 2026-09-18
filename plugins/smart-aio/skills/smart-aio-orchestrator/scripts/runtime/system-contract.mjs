// Smart AIOの制作シート、台帳、出力形式を定義する正本ランタイム。
import { createHash } from "node:crypto";
import { buildStandardBasicInfoPrompt, buildStandardSiteTitlePrompt } from "./content-runtime.mjs";
import {
  STANDARD_ARTICLE_SHEET_COLUMNS,
  mapArticleSheetUpdates,
  normalizeArticleSheetHeaders,
  resolveArticleSheetColumnMap,
} from "./article-sheet-layout.mjs";

export { STANDARD_ARTICLE_SHEET_COLUMNS } from "./article-sheet-layout.mjs";

export const SMARTAIO_PRODUCTION_ROOT_URL = "https://drive.google.com/drive/folders/0AJAK01qgUBq4Uk9PVA";

const BASIC_INFO_CELLS = Object.freeze({
  big_word: "C10",
  service_name: "C11",
  service_description: "C12",
  target_users: "C13",
  user_concerns: "C14",
  important_points: "C15",
  anxieties: "C16",
  competitors: "C17",
  industry_terms: "C18",
  client_strengths: "C19",
  avoid_expressions: "C20",
  client_philosophy: "C21",
  profile_widget_site_name: "C22",
  profile_widget_author_name: "C23",
  profile_widget_description: "C24",
});

export const STANDARD_CLIENT_WORKBOOK_SHEETS = Object.freeze(["基本情報", "企画確認", "記事一覧", "キーワード", "クラスター", "設定"]);

export const CLIENT_FOLDER_STRUCTURE = Object.freeze([
  "00_基本情報",
  "01_一次情報",
  "03_記事",
  "04_画像",
  "06_ニュース",
  "07_順位・分析",
  "99_アーカイブ",
]);

export const REMOVED_CLIENT_FOLDERS = Object.freeze(["02_記事企画", "05_内部リンク", "90_作業中"]);

export const SOURCE_REGISTER_HEADERS = Object.freeze([
  "client_id",
  "source_id",
  "情報種別",
  "タイトル",
  "一次情報・事実",
  "出典URL／Drive URL",
  "資料内の場所",
  "公開日",
  "取得日",
  "有効期限",
  "利用可否",
  "機密区分",
  "使用上の注意",
  "登録者",
  "確認者",
  "最終更新日",
]);

export const STANDARD_CLUSTER_SHEET_COLUMNS = Object.freeze([
  "記事ID",
  "ピラー",
  "ピラー概要",
  "クラスター",
  "記事タイトル",
  "メイン対策キーワード",
  "サブ対策キーワード",
  "ユーザー検索意図",
  "AI引用戦略",
]);

export const STANDARD_PLAN_CONFIRMATION_SHEET_COLUMNS = Object.freeze([
  "制作順",
  "確認ID",
  "記事トピック",
  "種別",
  "ピラー",
  "クラスター",
  "記事タイトル案",
  "対策キーワード",
  "検索意図",
  "AI引用戦略",
  "記事カテゴリ",
  "ハッシュタグ",
  "確認ステータス",
  "確認者",
  "確認日",
  "修正コメント",
  "制作状態",
  "記事ID",
  "記事URL",
  "最終更新日",
]);

export const STANDARD_KEYWORD_SHEET_COLUMNS = Object.freeze(["No", "キーワード", "月間検索ボリューム", "難易度"]);

export const SYSTEM_FEATURES = Object.freeze([
  Object.freeze({ id: "client-production-sheet", content_entry: "クライアント別の記事制作シート", command: "prepare-client-production-sheet / validate-client-production-sheet", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "client-source-register", content_entry: "クライアント別の一次情報管理", command: "prepare-client-source-register / validate-client-source-register", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "basic-information", content_entry: "基本情報を作成", command: "prepare-client-onboarding / validate-basic-info", status: "IMPLEMENTED", requires: Object.freeze(["WEB_RETRIEVAL", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "site-title", content_entry: "サイトタイトルを作成", command: "validate-site-title", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "new-client-news-settings-template", content_entry: "新規顧客のニュース設定ひな型を無効状態で作成", command: "prepare-news-settings-template", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "xlsx-export", content_entry: "現在のシートをxlsx出力", command: "prepare-xlsx-export", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_SHEETS_EXPORT"]) }),
  Object.freeze({ id: "client-plan-confirmation-sheet", content_entry: "初回の記事方向性確認シートを作成し、クライアント承認を本文作成前のゲートにする", command: "prepare-client-production-sheet / prepare-plan-confirmation-sheet / validate-client-production-sheet / validate-ideas", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_SHEETS_WRITE", "CLIENT_CONFIRMATION"]) }),
  Object.freeze({ id: "client-plan-confirmation-queue", content_entry: "企画確認でOK/承認された行を上から1記事ずつ選び、正式な重複判定後に本文制作へ渡す", command: "validate-plan-confirmation-candidates / select-next-approved-plan", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_SHEETS_READ", "GOOGLE_SHEETS_WRITE", "CLIENT_CONFIRMATION"]) }),
  Object.freeze({ id: "article-creation-user-confirmation", content_entry: "記事作成依頼ごとにタイトル、カテゴリ、タグ、検索意図、作成内容を提示し、会話内の明示了承後だけ本文・画像・Drive保存へ進む", command: "select-next-approved-plan", status: "IMPLEMENTED", requires: Object.freeze(["USER_CONFIRMATION"]) }),
  Object.freeze({ id: "client-plan-confirmation-additional-50", content_entry: "承認済み50件の制作完了後に、既存案と既存記事を見て次の50件を追記する", command: "prepare-additional-plan-confirmation-ideas", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_SHEETS_READ", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "article-ideas", content_entry: "記事案を作成", command: "plan-idea / validate-ideas / finalize-idea", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "article-document", content_entry: "記事ドキュメントを作成", command: "prepare-document-output", status: "IMPLEMENTED_CONNECTION_REQUIRED", requires: Object.freeze(["GOOGLE_DOCS_WRITE", "GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "article-images", content_entry: "画像を作成", command: "prepare-images", status: "IMPLEMENTED_CONNECTION_REQUIRED", requires: Object.freeze(["APP_IMAGE_GENERATION", "GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "article-image-provenance-gate", content_entry: "PIL・テンプレート由来画像を記事画像として拒否", command: "verify-article-visual-persistence", status: "IMPLEMENTED", requires: Object.freeze(["APP_IMAGE_GENERATION", "GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "article-diagram-image", content_entry: "図解画像を作成", command: "prepare-images / verify-article-visual-persistence", status: "IMPLEMENTED_CONNECTION_REQUIRED", requires: Object.freeze(["APP_IMAGE_GENERATION", "GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "structured-markup-output", content_entry: "構造化マークアップ出力物とWordPressコピペ用ファイルを出力", command: "build-structured-markup / verify-structured-markup", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "internal-link-graph", content_entry: "記事同士の内部リンク網を作成し記事一覧の公開URLを正本にして実URLを表示", command: "plan-internal-link-graph / prepare-internal-link-sheet-output / verify-internal-link-graph", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_SHEETS_READ", "GOOGLE_DRIVE_WRITE"]) }),
  Object.freeze({ id: "ranking-based-auto-rewrite", content_entry: "順位・反応データから自動リライト案を作成", command: "prepare-rewrite-plan", status: "IMPLEMENTED_APPROVAL_GATED", requires: Object.freeze(["RANKING_DATA", "GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "rewrite-artifact-output-policy", content_entry: "リライト成果物を元記事フォルダー内の連番フォルダーで3点管理", command: "prepare-rewrite-artifact-output", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "multi-article-batch", content_entry: "複数記事を一括作成・停止・再開", command: "create-batch / batch-next / apply-batch-step / fail-batch-step / stop-batch / resume-batch", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE", "SCHEDULED_TASK_FOR_UNATTENDED_RUN"]) }),
  Object.freeze({ id: "cluster-sheet", content_entry: "クラスター一覧を作成", command: "prepare-cluster / complete-cluster", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_DRIVE_READ", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "delete-all", content_entry: "ドキュメントと画像を削除", command: "deletion-plan / authorize-deletion", status: "IMPLEMENTED_RECOVERABLE", requires: Object.freeze(["GOOGLE_DRIVE_TRASH", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "delete-documents", content_entry: "ドキュメントを削除", command: "deletion-plan / authorize-deletion", status: "IMPLEMENTED_RECOVERABLE", requires: Object.freeze(["GOOGLE_DRIVE_TRASH", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "delete-images", content_entry: "画像を削除", command: "deletion-plan / authorize-deletion", status: "IMPLEMENTED_RECOVERABLE", requires: Object.freeze(["GOOGLE_DRIVE_TRASH", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "category-slugs", content_entry: "カテゴリスラッグを再生成", command: "prepare-category-slugs / validate-category-slugs", status: "IMPLEMENTED", requires: Object.freeze(["GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "article-record-editor", content_entry: "記事詳細サイドバーで編集", command: "prepare-article-record-update", status: "IMPLEMENTED_AS_CONVERSATION", requires: Object.freeze(["GOOGLE_DRIVE_WRITE", "GOOGLE_SHEETS_WRITE"]) }),
  Object.freeze({ id: "batch-notification", content_entry: "Chatwork完了通知", command: "prepare-batch-notification", status: "IMPLEMENTED_CONNECTOR_OPTIONAL", requires: Object.freeze(["CHATWORK_CONNECTOR_OPTIONAL"]) }),
]);

export function getSystemFeatures() {
  const connectionRequired = SYSTEM_FEATURES.filter((item) => item.requires.length > 0);
  return Object.freeze({
    status: "SMART_AIO_SYSTEM_CONTRACT_READY",
    total: SYSTEM_FEATURES.length,
    missing: Object.freeze(SYSTEM_FEATURES.filter((item) => item.status === "MISSING")),
    code_complete: SYSTEM_FEATURES.every((item) => item.status !== "MISSING"),
    external_connection_required: Object.freeze(connectionRequired),
    live_ready: false,
    operational_note: "The Skill contracts are implemented. Live Google I/O, app image generation, multi-user consistency, and any optional Chatwork notification must be proven with signed-in connections before production readiness can pass.",
    features: SYSTEM_FEATURES,
  });
}

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function requireClient(input) {
  const clientName = requireText(input.client_name ?? input.clientName, "client_name");
  const clientId = String(input.client_id || clientName.match(/^([^_]+)/)?.[1] || "").trim();
  if (!clientId) throw new Error("CLIENT_ID_COULD_NOT_BE_DERIVED");
  return { clientName, clientId };
}

function officialUrl(value) {
  const parsed = new URL(requireText(value, "official_url"));
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error("UNSUPPORTED_OFFICIAL_URL");
  parsed.hash = "";
  return parsed.toString();
}

function parseJsonObject(value, label) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}
  throw new Error(`${label}_MUST_BE_JSON_OBJECT`);
}

function normalizeHumanConfirmation(value, label, clientId) {
  const confirmation = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (confirmation.confirmed !== true) return null;
  if (String(confirmation.client_id || "").trim() !== clientId) {
    throw new Error(`CROSS_CLIENT_DATA_DETECTED:${label}`);
  }
  return Object.freeze({
    confirmed: true,
    client_id: clientId,
    user_id: requireText(confirmation.user_id, `${label}.user_id`),
    confirmed_at: String(confirmation.confirmed_at || "").trim() || null,
    note: String(confirmation.note || "").trim() || null,
  });
}

function normalizeHeaders(values) {
  return Array.isArray(values) ? values.map((value) => String(value ?? "").trim()) : [];
}

function optionalFolderUrl(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = new URL(String(value).trim());
  if (parsed.hostname !== "drive.google.com" || !parsed.pathname.includes("/folders/")) {
    throw new Error(`${label}_MUST_BE_GOOGLE_DRIVE_FOLDER_URL`);
  }
  return parsed.toString();
}

function normalizeKeywordCandidates(values = []) {
  const raw = [];
  for (const value of values.flat()) {
    if (value === undefined || value === null) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      raw.push(value.keyword, value.name, value.title, value.label);
    } else {
      raw.push(value);
    }
  }
  const candidates = raw
    .flatMap((value) => String(value ?? "").split(/[,\n、，／/]+/))
    .map((value) => value.trim())
    .filter(Boolean);
  return Object.freeze([...new Set(candidates)].slice(0, 10));
}

export function prepareClientNewsSettingsTemplate(input = {}) {
  const { clientName, clientId } = requireClient(input);
  const url = officialUrl(input.official_url ?? input.url);
  const industry = String(input.industry ?? input.service_name ?? input.serviceName ?? input.big_word ?? input.bigWord ?? "未設定").trim() || "未設定";
  const includeKeywords = normalizeKeywordCandidates([
    input.include_keywords || [],
    input.service_name,
    input.serviceName,
    input.big_word,
    input.bigWord,
    input.pillar_keywords || [],
    input.categories || [],
  ]);
  const keywords = includeKeywords.length ? includeKeywords : Object.freeze([clientName.replace(`${clientId}_`, ""), industry]);
  return Object.freeze({
    client_id: clientId,
    client_name: clientName,
    status: "READY_FOR_DISABLED_NEWS_SETTINGS_TEMPLATE",
    creation_timing: "AFTER_SITE_TITLE_CONFIRMATION_BEFORE_ARTICLE_PLANNING",
    activation_status: "DISABLED_UNTIL_HUMAN_ENABLE",
    write_required_for_new_client: true,
    external_execution_allowed: false,
    human_enable_required: true,
    target_folder_name: "06_ニュース",
    news_settings_sheet: "ニュース設定",
    news_inbox_sheet: "ニュース受信箱",
    required_columns: Object.freeze(["client_id", "feed_id", "industry", "source_url", "include_keywords", "enabled"]),
    feeds: Object.freeze([
      Object.freeze({
        client_id: clientId,
        feed_id: `${clientId}_official_site`,
        source_type: "OFFICIAL_SITE",
        industry,
        source_url: url,
        include_keywords: keywords,
        exclude_keywords: Object.freeze([]),
        enabled: false,
        note: "新規登録時に作成する無効状態の初期行。人が収集元を確認してから有効化する",
      }),
    ]),
  });
}

function normalizeRetiredArticleIds(values = []) {
  if (!Array.isArray(values)) throw new TypeError("retired_article_ids must be an array");
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].map((articleId) => {
    if (!/^ID-\d{5}$/.test(articleId)) throw new Error(`STANDARD_RETIRED_ARTICLE_ID_REQUIRED:${articleId}`);
    return articleId;
  });
}

export function resolveActiveClientRegistration(input = {}) {
  const { clientId } = requireClient(input);
  const masterMatches = Array.isArray(input.active_client_master_matches) ? input.active_client_master_matches : [];
  const driveCandidates = input.drive_candidates;
  const retiredArticleIds = normalizeRetiredArticleIds(input.retired_article_ids || []);
  const missingEvidence = [];
  if (!Array.isArray(driveCandidates)) missingEvidence.push("drive_candidates");
  if (!Array.isArray(input.retired_article_ids)) missingEvidence.push("retired_article_ids");
  if (missingEvidence.length) {
    return Object.freeze({
      client_id: clientId,
      status: "ACTIVE_REGISTRATION_EVIDENCE_REQUIRED",
      missing_evidence: Object.freeze(missingEvidence),
      active_master_match_count: 0,
      active_drive_candidate_count: 0,
      trashed_candidate_count: 0,
      forbidden_artifact_ids: Object.freeze([]),
      forbidden_artifact_urls: Object.freeze([]),
      retired_article_ids: Object.freeze(retiredArticleIds),
    });
  }

  const normalizedMasterMatches = masterMatches.map((record, index) => {
    if (String(record?.client_id || "").trim() !== clientId) {
      throw new Error(`CROSS_CLIENT_DATA_DETECTED:active_client_master_matches[${index}]`);
    }
    return Object.freeze({ ...record, client_id: clientId });
  });
  const normalizedDriveCandidates = driveCandidates.map((candidate, index) => {
    if (candidate?.client_id && String(candidate.client_id).trim() !== clientId) {
      throw new Error(`CROSS_CLIENT_DATA_DETECTED:drive_candidates[${index}]`);
    }
    return Object.freeze({
      ...candidate,
      client_id: clientId,
      id: String(candidate?.id || "").trim(),
      url: String(candidate?.url || candidate?.webViewLink || "").trim(),
      trashed: candidate?.trashed,
    });
  });
  const unknownTrashState = normalizedDriveCandidates.filter((candidate) => typeof candidate.trashed !== "boolean");
  const trashedCandidates = normalizedDriveCandidates.filter((candidate) => candidate.trashed === true);
  const activeDriveCandidates = normalizedDriveCandidates.filter((candidate) => candidate.trashed === false);
  const forbiddenArtifactIds = [...new Set(trashedCandidates.map((candidate) => candidate.id).filter(Boolean))];
  const forbiddenArtifactUrls = [...new Set(trashedCandidates.map((candidate) => candidate.url).filter(Boolean))];
  const common = {
    client_id: clientId,
    active_master_match_count: normalizedMasterMatches.length,
    active_drive_candidate_count: activeDriveCandidates.length,
    trashed_candidate_count: trashedCandidates.length,
    forbidden_artifact_ids: Object.freeze(forbiddenArtifactIds),
    forbidden_artifact_urls: Object.freeze(forbiddenArtifactUrls),
    retired_article_ids: Object.freeze(retiredArticleIds),
    lookup_policy: "SMARTAIO_DIRECT_CLIENT_FOLDER_AND_EXPLICIT_DRIVE_TRASH_STATE_ONLY",
    reuse_policy: "NEVER_REUSE_TRASHED_IDS_URLS_OR_RETIRED_ARTICLE_IDS",
  };

  if (unknownTrashState.length) {
    return Object.freeze({
      ...common,
      status: "DRIVE_TRASH_STATE_REQUIRED",
      unverified_candidate_ids: Object.freeze(unknownTrashState.map((candidate) => candidate.id).filter(Boolean)),
    });
  }
  if (normalizedMasterMatches.length > 1) {
    return Object.freeze({ ...common, status: "ACTIVE_CLIENT_MASTER_CONFLICT" });
  }
  if (normalizedMasterMatches.length === 1) {
    return Object.freeze({
      ...common,
      status: "ACTIVE_CLIENT_REGISTRATION_EXISTS",
      active_client_record: normalizedMasterMatches[0],
    });
  }
  if (activeDriveCandidates.length) {
    return Object.freeze({
      ...common,
      status: "ACTIVE_CLIENT_ARTIFACT_CONFLICT",
      active_drive_candidates: Object.freeze(activeDriveCandidates),
    });
  }
  return Object.freeze({ ...common, status: "NEW_ACTIVE_REGISTRATION" });
}

export function prepareClientSourceRegister(input) {
  const { clientName, clientId } = requireClient(input);
  const clientDriveUrl = optionalFolderUrl(input.client_drive_url ?? input.drive_url, "client_drive_url");
  const sourceFolderUrl = optionalFolderUrl(input.source_folder_url, "source_folder_url");
  const cleanName = clientName.replace(`${clientId}_`, "");
  return Object.freeze({
    client_id: clientId,
    client_name: clientName,
    status: "READY_FOR_CLIENT_SOURCE_REGISTER",
    workbook_name: `${clientId}_${cleanName}_一次情報台帳`,
    template_asset: "assets/Smart_AIO_一次情報台帳_テンプレート.xlsx",
    creation_method_order: Object.freeze(["IMPORT_TEMPLATE_XLSX"]),
    manual_blank_sheet_forbidden: true,
    table_name: `SourceRegister${clientId}`,
    required_format_checks: Object.freeze([
      "title_and_client_metadata",
      "merged_cells",
      "colors_borders_fonts",
      "column_widths_row_heights",
      "data_validations",
      "table_range",
    ]),
    client_drive_url: clientDriveUrl,
    source_folder_url: sourceFolderUrl,
    target_folder_name: "01_一次情報",
    sheet_name: "一次情報台帳",
    header_row: 8,
    data_start_row: 9,
    columns: SOURCE_REGISTER_HEADERS,
    allowed_usage_status: Object.freeze(["利用可", "要確認", "利用不可"]),
    allowed_confidentiality: Object.freeze(["公開", "社内限定", "顧客限定", "機密"]),
    initialization_mode: "HEADER_ONLY",
    initial_rows: Object.freeze([]),
    initial_data_row_count: 0,
    registration_rule: "検証済みテンプレートをGoogleスプレッドシートへ変換し、ヘッダーだけの空台帳として01_一次情報フォルダーへ保存する。一次情報は顧客から受領後に登録する",
    retrieval_rule: "利用可否が利用可、確認者が要確認以外、client_idが一致し、有効期限内の行だけを記事企画・本文・レビューへ渡す",
  });
}

export function validateClientSourceRegister(input) {
  const clientId = requireText(input.client_id, "client_id");
  const spreadsheetUrl = requireText(input.source_register_url ?? input.spreadsheet_url, "source_register_url");
  const parsed = new URL(spreadsheetUrl);
  if (parsed.hostname !== "docs.google.com" || !parsed.pathname.includes("/spreadsheets/d/")) {
    throw new Error("GOOGLE_SHEETS_URL_REQUIRED");
  }
  const errors = [];
  if (String(input.sheet_name || "").trim() !== "一次情報台帳") errors.push("SOURCE_REGISTER_SHEET_NAME_MISMATCH");
  if (String(input.sheet_client_id || "").trim() !== clientId) errors.push("CROSS_CLIENT_DATA_DETECTED:source_register");
  if (String(input.parent_folder_name || "").trim() !== "01_一次情報") errors.push("SOURCE_REGISTER_FOLDER_MISMATCH");
  if (JSON.stringify(normalizeHeaders(input.headers)) !== JSON.stringify(SOURCE_REGISTER_HEADERS)) errors.push("SOURCE_REGISTER_HEADERS_MISMATCH");
  const allowedCreationMethods = ["IMPORT_TEMPLATE_XLSX"];
  if (!allowedCreationMethods.includes(String(input.creation_method || "").trim())) {
    errors.push("SOURCE_REGISTER_CREATION_METHOD_INVALID");
  }
  if (input.format_preserved !== true) errors.push("SOURCE_REGISTER_FORMAT_NOT_VERIFIED");
  if (String(input.table_name || "").trim() !== `SourceRegister${clientId}`) {
    errors.push("SOURCE_REGISTER_TABLE_NAME_MISMATCH");
  }
  const requiredFormatChecks = [
    "title_and_client_metadata",
    "merged_cells",
    "colors_borders_fonts",
    "column_widths_row_heights",
    "data_validations",
    "table_range",
  ];
  const formatChecks = new Set(normalizeHeaders(input.format_checks));
  if (requiredFormatChecks.some((check) => !formatChecks.has(check))) {
    errors.push("SOURCE_REGISTER_FORMAT_CHECKS_MISSING");
  }
  const rowClientIds = Array.isArray(input.row_client_ids) ? input.row_client_ids : [];
  if (rowClientIds.some((value) => String(value || "").trim() && String(value).trim() !== clientId)) {
    errors.push("CROSS_CLIENT_DATA_DETECTED:source_register_rows");
  }
  if (input.initialization_mode === true && Number(input.data_row_count || 0) !== 0) {
    errors.push("SOURCE_REGISTER_MUST_START_EMPTY");
  }
  return Object.freeze({
    client_id: clientId,
    source_register_url: spreadsheetUrl,
    status: errors.length ? "CLIENT_SOURCE_REGISTER_INVALID" : "CLIENT_SOURCE_REGISTER_VALID",
    errors: Object.freeze(errors),
    read_allowed: errors.length === 0,
    write_allowed: errors.length === 0,
  });
}

export function prepareClientProductionSheet(input) {
  const { clientName, clientId } = requireClient(input);
  const clientDriveUrl = requireText(input.client_drive_url ?? input.drive_url, "client_drive_url");
  const parsedDriveUrl = new URL(clientDriveUrl);
  if (parsedDriveUrl.hostname !== "drive.google.com" || !parsedDriveUrl.pathname.includes("/folders/")) {
    throw new Error("CLIENT_DRIVE_FOLDER_URL_REQUIRED");
  }
  if (clientDriveUrl === SMARTAIO_PRODUCTION_ROOT_URL) {
    throw new Error("CLIENT_DRIVE_FOLDER_MUST_NOT_BE_SMARTAIO_ROOT");
  }
  return Object.freeze({
    client_id: clientId,
    client_name: clientName,
    status: "READY_FOR_CLIENT_PRODUCTION_SHEET",
    workbook_name: `${clientId}_${clientName.replace(`${clientId}_`, "")}_記事制作シート`,
    smartaio_root_url: SMARTAIO_PRODUCTION_ROOT_URL,
    client_folder_parent_url: SMARTAIO_PRODUCTION_ROOT_URL,
    client_drive_url: clientDriveUrl,
    folder_structure: CLIENT_FOLDER_STRUCTURE,
    folders_not_created: REMOVED_CLIENT_FOLDERS,
    source_register: prepareClientSourceRegister({ ...input, client_id: clientId, client_name: clientName, client_drive_url: clientDriveUrl }),
    human_confirmation_policy: Object.freeze({
      after_sheet_creation: Object.freeze([
        "記事制作シートの基本情報・カテゴリ・ピラーが方向性に合っているか",
        "企画確認シートの記事トピック、種別、ピラー、クラスター、記事タイトル案、対策キーワード、検索意図、AI引用戦略が記事制作の方向性に合っているか",
        "サイトタイトル3案のどれを採用するか、または修正するか",
        "06_ニュースにニュース設定ひな型が無効状態で作成されているか",
      ]),
      status_until_confirmed: "AWAITING_ONBOARDING_CONFIRMATION",
      proceed_to_article_planning_without_confirmation: false,
      plan_confirmation_sheet_required_before_article_writing: true,
      news_settings_template_required_before_article_planning: true,
    }),
    operational_source_of_truth: true,
    central_management_role: "INDEX_AUDIT_ONLY",
    operator_view: Object.freeze({
      visible_sheets: STANDARD_CLIENT_WORKBOOK_SHEETS,
      background_sheets: Object.freeze([]),
      home_sheet: "基本情報",
      daily_sheet: "記事一覧",
      initial_confirmation_sheet: "企画確認",
      reference_sheet: "クラスター",
      rule: "6シートを表示し、企画確認で初回の方向性承認を取得してから本文作成へ進み、キーワード履歴を重複防止へ使い、クラスター画面でクラスター一覧とピラー一覧を同時に見せる",
    }),
    sheets: Object.freeze({
      基本情報: Object.freeze({
        content_cells: BASIC_INFO_CELLS,
        title_cells: Object.freeze(["C6", "C7", "C8"]),
        profile_widget_cells: Object.freeze({
          site_name: "C22",
          author_name: "C23",
          description: "C24",
        }),
        category_rows: "E38:F57",
        pillar_rows: "B38:C87",
      }),
      企画確認: Object.freeze({
        title_cell: "A1",
        header_row: 1,
        columns: STANDARD_PLAN_CONFIRMATION_SHEET_COLUMNS,
        reference_origin: "株式会社ＥＧＮＩＴＥ様_記事制作計画シート gid=331054669",
        required_before_article_writing: true,
        client_editable_columns: Object.freeze(["確認ステータス", "確認者", "確認日", "修正コメント"]),
        system_managed_columns: Object.freeze(["制作順", "確認ID", "制作状態", "記事ID", "記事URL", "最終更新日"]),
        type_values: Object.freeze(["ピラー", "クラスター"]),
        type_policy: "種別はピラー（親テーマ）またはクラスター（子テーマ）のみを使い、ピラー列には親テーマ、クラスター列には派生テーマを入れる",
        approved_status_values: Object.freeze(["承認", "OK", "APPROVED"]),
        default_batch_size: 50,
        queue_policy: "確認ステータスが承認/OK/APPROVEDで、制作状態が未完了かつ記事URLが空の行を制作順の昇順で1件ずつ選ぶ",
        append_policy: "全50案の制作完了後に追加依頼があれば、既存企画・記事一覧・クラスター・公式サイト記事との重複判定を通して次の50案を追記する",
      }),
      記事一覧: Object.freeze({ title_cell: "A1", header_row: 2, columns: STANDARD_ARTICLE_SHEET_COLUMNS }),
      キーワード: Object.freeze({ title_cell: "A1", header_row: 3, columns: STANDARD_KEYWORD_SHEET_COLUMNS, duplicate_reference: true }),
      クラスター: Object.freeze({ title_cell: "A1", header_row: 2, columns: STANDARD_CLUSTER_SHEET_COLUMNS, pillar_reference: "L2:M52" }),
      設定: Object.freeze({ runtime_prompt_source: "PROTECTED_SKILL_REGISTRY", editable_prompt_text: false }),
    }),
    prompt_policy: Object.freeze({ unchanged: true, source: "content-prompts", sha256_required: true }),
    script_policy: Object.freeze({ embedded_sheet_scripts: false, openai_api_calls: false, operation: "SMART_AIO_SKILLS_ONLY" }),
  });
}

export function validateClientProductionSheet(input) {
  const clientId = requireText(input.client_id, "client_id");
  const spreadsheetUrl = requireText(input.production_sheet_url ?? input.spreadsheet_url, "production_sheet_url");
  const parsed = new URL(spreadsheetUrl);
  if (parsed.hostname !== "docs.google.com" || !parsed.pathname.includes("/spreadsheets/d/")) {
    throw new Error("GOOGLE_SHEETS_URL_REQUIRED");
  }
  const actualSheets = normalizeHeaders(input.sheet_names);
  const missingSheets = STANDARD_CLIENT_WORKBOOK_SHEETS.filter((name) => !actualSheets.includes(name));
  const articleColumns = normalizeArticleSheetHeaders(input.article_headers);
  const planConfirmationColumns = normalizeHeaders(input.plan_confirmation_headers ?? input.article_plan_confirmation_headers);
  const keywordColumns = normalizeHeaders(input.keyword_headers);
  const clusterColumns = normalizeHeaders(input.cluster_headers);
  const errors = [];
  if (missingSheets.length) errors.push(`MISSING_SHEETS:${missingSheets.join(",")}`);
  if (JSON.stringify(articleColumns) !== JSON.stringify(STANDARD_ARTICLE_SHEET_COLUMNS)) errors.push("ARTICLE_HEADERS_DO_NOT_MATCH_STANDARD");
  if (JSON.stringify(planConfirmationColumns) !== JSON.stringify(STANDARD_PLAN_CONFIRMATION_SHEET_COLUMNS)) errors.push("PLAN_CONFIRMATION_HEADERS_DO_NOT_MATCH_STANDARD");
  if (JSON.stringify(keywordColumns) !== JSON.stringify(STANDARD_KEYWORD_SHEET_COLUMNS)) errors.push("KEYWORD_HEADERS_DO_NOT_MATCH_STANDARD");
  if (JSON.stringify(clusterColumns) !== JSON.stringify(STANDARD_CLUSTER_SHEET_COLUMNS)) errors.push("CLUSTER_HEADERS_DO_NOT_MATCH_STANDARD");
  if (input.uses_embedded_sheet_scripts === true) errors.push("EMBEDDED_SHEET_SCRIPTS_NOT_ALLOWED");
  if (input.uses_openai_api === true) errors.push("OPENAI_API_NOT_ALLOWED");
  return Object.freeze({
    client_id: clientId,
    production_sheet_url: spreadsheetUrl,
    status: errors.length ? "CLIENT_PRODUCTION_SHEET_INVALID" : "CLIENT_PRODUCTION_SHEET_VALID",
    errors: Object.freeze(errors),
    write_allowed: errors.length === 0,
    operational_source_of_truth: errors.length === 0,
    recommended_visible_sheets: STANDARD_CLIENT_WORKBOOK_SHEETS,
    recommended_background_sheets: Object.freeze([]),
  });
}

export function prepareClientArticleSheetUpdate(input) {
  const clientId = requireText(input.client_id, "client_id");
  const spreadsheetUrl = requireText(input.production_sheet_url, "production_sheet_url");
  const articleId = requireText(input.article_id, "article_id");
  const values = input.values || {};
  if (!articleId.startsWith("ID-")) throw new Error("STANDARD_ARTICLE_ID_REQUIRED");
  if (input.sheet_client_id && String(input.sheet_client_id).trim() !== clientId) {
    throw new Error("CROSS_CLIENT_DATA_DETECTED:production_sheet");
  }
  const existingValues = input.existing_values || input.existingValues || null;
  if (existingValues && typeof existingValues === "object") {
    const existingTitle = String(existingValues["記事タイトル"] || existingValues.title || "").trim();
    const incomingTitle = String(values["記事タイトル"] || values.title || "").trim();
    const existingLabel = String(existingValues["責任ラベル"] || existingValues.responsibilityLabel || "").trim();
    const incomingLabel = String(values["責任ラベル"] || values.responsibilityLabel || "").trim();
    if ((existingTitle && incomingTitle && existingTitle !== incomingTitle) || (existingLabel && incomingLabel && existingLabel !== incomingLabel)) {
      throw new Error("ARTICLE_ID_REBIND_FORBIDDEN");
    }
  }
  const columnMap = resolveArticleSheetColumnMap(input.article_headers);
  const leadingBlank = columnMap["ピラー指定"] === "B";
  const row = STANDARD_ARTICLE_SHEET_COLUMNS.map((column) => {
    if (column === "記事ID") return articleId;
    return values[column] ?? null;
  });
  if (leadingBlank) row.unshift(null);
  return Object.freeze({
    client_id: clientId,
    article_id: articleId,
    production_sheet_url: spreadsheetUrl,
    sheet_name: "記事一覧",
    columns: Object.freeze(leadingBlank ? ["", ...STANDARD_ARTICLE_SHEET_COLUMNS] : [...STANDARD_ARTICLE_SHEET_COLUMNS]),
    row: Object.freeze(row),
    central_management_update: "INDEX_AUDIT_ONLY",
    duplicate_check_source: "SAME_CLIENT_PRODUCTION_SHEET_ONLY",
    internal_link_source: "SAME_CLIENT_PRODUCTION_SHEET_ONLY",
    article_id_binding: "IMMUTABLE_AFTER_FIRST_WRITE",
  });
}

export async function prepareStandardClientOnboarding(input) {
  const { clientName, clientId } = requireClient(input);
  const url = officialUrl(input.official_url ?? input.url);
  const siteText = String(input.site_text ?? input.siteText ?? "").trim();
  const registrationResolution = resolveActiveClientRegistration(input);
  const base = {
    client_id: clientId,
    client_name: clientName,
    official_url: url,
    minimum_user_input: Object.freeze(["client_name", "official_url"]),
    optional_user_input_policy: "Ask only for facts that cannot be retrieved or safely inferred after automatic research.",
    folder_structure: CLIENT_FOLDER_STRUCTURE,
    folders_not_created: REMOVED_CLIENT_FOLDERS,
    source_register: prepareClientSourceRegister({ client_id: clientId, client_name: clientName, official_url: url }),
    news_settings_template: prepareClientNewsSettingsTemplate({ ...input, client_id: clientId, client_name: clientName, official_url: url }),
    registration_resolution: registrationResolution,
    new_artifact_requirement: "Create new active record, folders, Sheets, Docs, image files, and URLs; never adopt an ID or URL listed as trashed.",
    article_id_allocation_input: Object.freeze({ retired_article_ids: registrationResolution.retired_article_ids }),
    human_confirmation_policy: Object.freeze({
      after_production_sheet_creation: "記事制作シートを作成した後、基本情報・カテゴリ・ピラー・サイトタイトル案を利用者へ提示し、方向性が合っているか確認する",
      site_title_confirmation_required: true,
      article_planning_allowed_before_confirmation: false,
      news_settings_template_required: true,
      news_settings_template_timing: "サイトタイトル確認後、記事企画前に06_ニュースへ無効状態で作成する",
    }),
  };

  if (registrationResolution.status !== "NEW_ACTIVE_REGISTRATION") {
    return Object.freeze({
      ...base,
      status: registrationResolution.status,
      next_action: registrationResolution.status === "ACTIVE_CLIENT_REGISTRATION_EXISTS"
        ? "Use the active client record instead of creating a duplicate registration."
        : "Verify the active client master and Drive trashed state. Do not create or reuse artifacts until the conflict is resolved.",
    });
  }

  if (!siteText) {
    return Object.freeze({
      ...base,
      status: "SITE_RETRIEVAL_REQUIRED",
      next_action: "Retrieve the public page in the current app, extract visible text, then run this command again with site_text.",
      retrieval: Object.freeze({
        url,
        follow_redirects: true,
        content: "VISIBLE_PAGE_TEXT",
        max_chars_for_content_prompt: 8000,
        fallback: "Ask the user for pasted text only when the public URL cannot be retrieved.",
      }),
    });
  }

  const prompt = await buildStandardBasicInfoPrompt({ url, siteText });
  return Object.freeze({
    ...base,
    status: "READY_FOR_BASIC_INFO_GENERATION",
    retrieved_chars: siteText.length,
    ...prompt,
  });
}

export async function validateStandardBasicInfoOutput(input) {
  const { clientName, clientId } = requireClient(input);
  const url = officialUrl(input.official_url ?? input.url);
  const output = parseJsonObject(input.output, "BASIC_INFO_OUTPUT");
  const errors = [];
  const sheetUpdates = {};
  for (const [key, cell] of Object.entries(BASIC_INFO_CELLS)) {
    if (typeof output[key] !== "string") errors.push(`${key} must be a string`);
    sheetUpdates[cell] = typeof output[key] === "string" ? output[key] : "";
  }

  const categories = Array.isArray(output.seo_categories) ? output.seo_categories : [];
  const pillars = Array.isArray(output.pillar_keywords) ? output.pillar_keywords : [];
  if (categories.length !== 20) errors.push(`seo_categories must contain 20 items (actual ${categories.length})`);
  if (pillars.length !== 50) errors.push(`pillar_keywords must contain 50 items (actual ${pillars.length})`);

  const categorySlugs = new Set();
  const categoryRows = categories.slice(0, 20).map((item, index) => {
    const name = String(item?.name || "").trim();
    const slug = String(item?.slug || "").trim();
    if (!name) errors.push(`seo_categories[${index}].name is required`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.push(`seo_categories[${index}].slug is invalid`);
    if (categorySlugs.has(slug)) errors.push(`seo category slug is duplicated: ${slug}`);
    categorySlugs.add(slug);
    return Object.freeze({ row: 38 + index, name, slug });
  });
  const pillarRows = pillars.slice(0, 50).map((item, index) => {
    const keyword = String(item?.keyword || "").trim();
    const description = String(item?.description || "").trim();
    if (!keyword) errors.push(`pillar_keywords[${index}].keyword is required`);
    if (!description) errors.push(`pillar_keywords[${index}].description is required`);
    return Object.freeze({ row: 38 + index, keyword, description });
  });

  const existingValues = Array.isArray(input.existing_basic_info)
    ? input.existing_basic_info
    : Object.values(input.existing_basic_info || {});
  const hasExistingData = existingValues.some((value) => String(value ?? "").trim() !== "");
  const overwrite = input.overwrite_confirmation || {};
  if (overwrite.confirmed && String(overwrite.client_id || "").trim() !== clientId) {
    throw new Error("CROSS_CLIENT_DATA_DETECTED:basic_info_overwrite");
  }
  if (overwrite.confirmed) requireText(overwrite.user_id, "overwrite_confirmation.user_id");
  const overwriteConfirmed = !hasExistingData || overwrite.confirmed === true;
  const titlePrompt = errors.length || !overwriteConfirmed ? null : await buildStandardSiteTitlePrompt({
    serviceName: output.service_name,
    serviceDescription: output.service_description,
  });

  return Object.freeze({
    client_id: clientId,
    client_name: clientName,
    official_url: url,
    status: errors.length ? "RETRY_REQUIRED" : overwriteConfirmed ? "BASIC_INFO_VALID" : "AWAITING_OVERWRITE_CONFIRMATION",
    errors: Object.freeze(errors),
    retry_limit: 3,
    existing_data_detected: hasExistingData,
    write_allowed: errors.length === 0 && overwriteConfirmed,
    overwrite_confirmation_required: hasExistingData && !overwriteConfirmed,
    sheet_updates: Object.freeze({
      basic_info: Object.freeze(sheetUpdates),
      categories: Object.freeze(categoryRows),
      pillars: Object.freeze(pillarRows),
    }),
    next_prompt: titlePrompt,
  });
}

export function validateStandardSiteTitleOutput(input) {
  const { clientName, clientId } = requireClient(input);
  const output = parseJsonObject(input.output, "SITE_TITLE_OUTPUT");
  const confirmation = normalizeHumanConfirmation(
    input.site_title_confirmation || input.onboarding_confirmation,
    "site_title_confirmation",
    clientId,
  );
  const titles = Array.isArray(output.titles) ? output.titles : [];
  const errors = [];
  if (titles.length !== 3) errors.push(`titles must contain 3 items (actual ${titles.length})`);
  const values = titles.slice(0, 3).map((item, index) => {
    const title = String(item?.title || "").trim();
    const subtitle = String(item?.subtitle || "").trim();
    if (!title || !subtitle) errors.push(`titles[${index}] requires title and subtitle`);
    return `${title}｜${subtitle}`;
  });
  const newsTemplate = input.news_settings_template && typeof input.news_settings_template === "object"
    ? input.news_settings_template
    : null;
  const newsTemplateFeeds = Array.isArray(newsTemplate?.feeds) ? newsTemplate.feeds : [];
  const newsTemplateValid = Boolean(confirmation)
    && input.news_settings_template_created === true
    && String(newsTemplate?.client_id || "").trim() === clientId
    && String(newsTemplate?.target_folder_name || "").trim() === "06_ニュース"
    && newsTemplateFeeds.length > 0
    && newsTemplateFeeds.every((feed) => String(feed?.client_id || "").trim() === clientId && feed.enabled === false);
  const newsTemplateRequired = errors.length === 0 && Boolean(confirmation) && !newsTemplateValid;
  const status = errors.length
    ? "RETRY_REQUIRED"
    : !confirmation
      ? "AWAITING_SITE_TITLE_CONFIRMATION"
      : newsTemplateRequired
        ? "NEWS_SETTINGS_TEMPLATE_REQUIRED"
        : "CLIENT_ONBOARDING_COMPLETE";
  return Object.freeze({
    client_id: clientId,
    client_name: clientName,
    status,
    errors: Object.freeze(errors),
    confirmation_required: errors.length === 0 && !confirmation,
    write_allowed: errors.length === 0 && Boolean(confirmation),
    onboarding_confirmed: errors.length === 0 && Boolean(confirmation),
    news_settings_template_required: newsTemplateRequired,
    article_planning_allowed: status === "CLIENT_ONBOARDING_COMPLETE",
    post_confirmation_required_actions: newsTemplateRequired
      ? Object.freeze([
          Object.freeze({
            action: "CREATE_DISABLED_NEWS_SETTINGS_TEMPLATE",
            required: true,
            before: "ARTICLE_PLANNING",
            command: "prepare-news-settings-template",
            status: "REQUIRED",
            external_execution_allowed: false,
          }),
        ])
      : Object.freeze([]),
    confirmation_prompt: errors.length === 0 && !confirmation
      ? "記事制作シートの基本情報・カテゴリ・ピラー・サイトタイトル3案を確認し、この方向性で記事企画へ進めてよいか回答してください。"
      : null,
    confirmation,
    sheet_updates: Object.freeze({ C6: values[0] || "", C7: values[1] || "", C8: values[2] || "" }),
  });
}

export function prepareStandardSpreadsheetExport(input) {
  let spreadsheetId = String(input.spreadsheet_id || "").trim();
  if (!spreadsheetId) {
    const match = String(input.spreadsheet_url || "").match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
    spreadsheetId = match?.[1] || "";
  }
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID_REQUIRED");
  const urlGid = String(input.spreadsheet_url || "").match(/[?#&]gid=(\d+)/)?.[1];
  const gid = Number(input.gid ?? input.active_sheet_gid ?? urlGid);
  if (!Number.isInteger(gid) || gid < 0) throw new Error("VALID_GID_REQUIRED");
  return Object.freeze({
    status: "READY_FOR_XLSX_EXPORT",
    export_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx&gid=${gid}`,
    execution_rule: "Open this URL in the authenticated Google session or use the connected spreadsheet export capability.",
  });
}

function sanitizeCategorySlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function prepareStandardCategorySlugGeneration(input) {
  const clientId = requireText(input.client_id, "client_id");
  const categoryNames = Array.from({ length: 20 }, (_, index) => String(input.category_names?.[index] || "").trim());
  const nonEmpty = categoryNames.filter(Boolean);
  if (nonEmpty.length === 0) throw new Error("CATEGORY_NAMES_REQUIRED");
  const prompt = "あなたはWordPressサイトの構築に詳しいWeb担当者です。\n" +
    "以下の日本語カテゴリ名それぞれに対して、WordPressのカテゴリURLに使用する英語スラッグを作成してください。\n\n" +
    "ルール：\n" +
    "- スラッグは英小文字・数字・ハイフン（-）のみで構成してください。\n" +
    "- 単語の区切りはハイフンにしてください。\n" +
    "- 1〜3単語程度の短く分かりやすいスラッグにしてください。\n" +
    "- カテゴリの意味を英語で表したスラッグにしてください（ローマ字読みは避ける）。\n" +
    "- スラッグ同士は重複させないでください。\n" +
    "- 入力されたカテゴリと同じ順序・同じ個数で出力してください。\n\n" +
    "以下のJSON形式のみで回答してください。JSON以外のテキストは一切出力しないでください。\n" +
    '{ "slugs": ["slug-1", "slug-2", ...] }\n\n' +
    "【カテゴリ一覧】\n" +
    nonEmpty.map((name, index) => `${index + 1}. ${name}`).join("\n");
  return Object.freeze({
    client_id: clientId,
    status: "READY_FOR_CATEGORY_SLUG_GENERATION",
    category_names: Object.freeze(categoryNames),
    expected_count: nonEmpty.length,
    content_prompt: prompt,
    execution_rule: "Generate in the current conversation; do not call the OpenAI API.",
  });
}

export function validateStandardCategorySlugOutput(input) {
  const clientId = requireText(input.client_id, "client_id");
  if (String(input.plan?.client_id || "") !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:category_slug_plan");
  const output = parseJsonObject(input.output, "CATEGORY_SLUG_OUTPUT");
  const source = Array.isArray(output.slugs) ? output.slugs : [];
  const errors = [];
  if (source.length !== input.plan.expected_count) errors.push(`slugs must contain ${input.plan.expected_count} items (actual ${source.length})`);
  let slugIndex = 0;
  const values = input.plan.category_names.map((name) => name ? sanitizeCategorySlug(source[slugIndex++]) : "");
  const nonEmpty = values.filter(Boolean);
  if (new Set(nonEmpty).size !== nonEmpty.length) errors.push("slugs must be unique");
  return Object.freeze({
    client_id: clientId,
    status: errors.length ? "RETRY_REQUIRED" : "CATEGORY_SLUGS_VALID",
    errors: Object.freeze(errors),
    sheet_column_F_rows_38_to_57: Object.freeze(values),
  });
}

function preArticlePromptData(value) {
  const output = {};
  for (const key of Object.keys(value || {})) {
    if (key === "articlePrompt") break;
    output[key] = value[key];
  }
  return output;
}

function clusterPrompt(title, pillar, preData) {
  return `ピラー（大分類）:「${pillar}」
記事タイトル:「${title}」

記事のメタ情報(JSON):
${JSON.stringify(preData)}

次の2点を考えてください。
1. clusterKeyword: 記事タイトルから、ピラーの一段階下の軸（クラスター）になっているキーワード。タイトルの要点を端的に表す短いフレーズにする。
   例:「英語コーチングで本当に話せるようになる？第二言語習得論にもとづく仕組みをやさしく解説」→「第二言語習得論にもとづく仕組み」
   例:「英語コーチングで挫折しない人の共通点とは？忙しい社会人のための学習継続チェックリスト」→「社会人のための学習継続チェックリスト」
2. aiCitationDesign: 上記メタ情報をふまえ、この記事が生成AIに「どんな時に」「どのように引用」されるよう設計されているかを説明する。「どんな質問・場面で参照されるか（=どんな時に）」と「どのような形・文脈で引用されるか（=どのように）」の両方を必ず含め、1〜2文でまとめる。

出力JSON（他の文字は一切含めない）:
{"clusterKeyword":"...","aiCitationDesign":"..."}`;
}

export function prepareStandardClusterBatch(input) {
  const clientId = requireText(input.client_id, "client_id");
  const articles = Array.isArray(input.articles) ? input.articles : [];
  if (articles.some((article) => String(article?.client_id || "").trim() !== clientId)) {
    throw new Error("CROSS_CLIENT_DATA_DETECTED:cluster_articles");
  }
  const existingRows = Array.isArray(input.existing_cluster_rows) ? input.existing_cluster_rows : [];
  if (existingRows.some((row) => String(row?.client_id || "").trim() !== clientId)) {
    throw new Error("CROSS_CLIENT_DATA_DETECTED:cluster_rows");
  }
  if ((input.pillar_keywords || []).some((item) => item?.client_id && String(item.client_id).trim() !== clientId)) {
    throw new Error("CROSS_CLIENT_DATA_DETECTED:cluster_pillars");
  }
  if (Object.values(input.article_json_by_id || {}).some((item) => item?.client_id && String(item.client_id).trim() !== clientId)) {
    throw new Error("CROSS_CLIENT_DATA_DETECTED:cluster_article_json");
  }
  const lastClusterId = [...existingRows].reverse().find((row) => String(row?.article_id || "").trim())?.article_id || "";
  let startIndex = 0;
  if (lastClusterId) {
    const found = articles.findIndex((article) => String(article.article_id) === String(lastClusterId));
    if (found < 0) return Object.freeze({ client_id: clientId, status: "NO_NEW_ARTICLES", items: Object.freeze([]) });
    startIndex = found + 1;
  }
  const pillarDescriptions = new Map((input.pillar_keywords || []).map((item) => [String(item.keyword || "").trim(), String(item.description || "").trim()]));
  const articleJson = input.article_json_by_id || {};
  const items = articles.slice(startIndex).filter((article) => article.article_id).slice(0, 20).map((article) => {
    const metadata = articleJson[article.article_id] || {};
    const basicInfo = metadata.basicInfo || {};
    const preData = preArticlePromptData(metadata);
    return Object.freeze({
      client_id: clientId,
      article_id: String(article.article_id),
      pillar: String(article.pillar || article.category || "").trim(),
      pillar_description: pillarDescriptions.get(String(article.pillar || article.category || "").trim()) || "",
      title: String(article.title || "").trim(),
      main_keyword: Array.isArray(basicInfo.mainKeyword) ? basicInfo.mainKeyword.join(", ") : String(basicInfo.mainKeyword || ""),
      sub_keywords: Array.isArray(basicInfo.subKeywords) ? basicInfo.subKeywords.join(", ") : String(basicInfo.subKeywords || ""),
      search_intent: Array.isArray(basicInfo.searchIntent) ? basicInfo.searchIntent.join(", ") : String(basicInfo.searchIntent || ""),
      system_instruction: "あなたはSEOの専門家です。出力は必ず指定のJSON形式のみで返してください。",
      generation_settings: Object.freeze({ temperature: 0.3, response_format: "json_object" }),
      prompt: clusterPrompt(String(article.title || "").trim(), String(article.pillar || article.category || "").trim(), preData),
    });
  });
  return Object.freeze({
    client_id: clientId,
    status: items.length ? "READY_FOR_CLUSTER_GENERATION" : "NO_NEW_ARTICLES",
    batch_size: items.length,
    remaining: Math.max(0, articles.slice(startIndex).filter((article) => article.article_id).length - items.length),
    items: Object.freeze(items),
    execution_rule: "Generate each JSON result in the current conversation; do not call the OpenAI API.",
  });
}

export function prepareStandardBatchNotification(input) {
  const clientName = requireText(input.client_name, "client_name");
  const spreadsheetUrl = requireText(input.spreadsheet_url, "spreadsheet_url");
  const totalArticles = Number(input.total_articles);
  const message = `案件名：${clientName}\n${totalArticles === 0 ? "（穴埋めモード）\n" : "\n"}` +
    `記事一覧：${Number(input.ideas_count || 0)}\n` +
    `記事作成：${Number(input.document_count || 0)}\n` +
    `画像作成：${Number(input.images_count || 0)}\n` +
    `が完了しました。\nURL：${spreadsheetUrl}`;
  const mention = String(input.chatwork_to || "").trim();
  return Object.freeze({
    status: "READY_FOR_OPTIONAL_NOTIFICATION",
    channel: "CHATWORK",
    room_id: "436940722",
    message,
    formatted_body: `${mention ? `${mention}\n` : ""}[info][title]SMART_AIO記事自動作成通知[/title]${message}[/info]`,
    execution_rule: "Send only when a Chatwork connector is configured. Never store or request an API token in Skills.",
  });
}

export function completeStandardClusterBatch(input) {
  const clientId = requireText(input.client_id, "client_id");
  const plan = input.plan;
  if (String(plan?.client_id || "") !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:cluster_plan");
  const results = Array.isArray(input.results) ? input.results : [];
  if (results.length !== plan.items.length) throw new Error("CLUSTER_RESULT_COUNT_MISMATCH");
  let previousPillar = null;
  const rows = plan.items.map((item, index) => {
    const result = parseJsonObject(results[index]?.output ?? results[index], "CLUSTER_OUTPUT");
    const clusterKeyword = requireText(result.clusterKeyword, `results[${index}].clusterKeyword`);
    const aiCitationDesign = requireText(result.aiCitationDesign, `results[${index}].aiCitationDesign`);
    const repeated = previousPillar === item.pillar;
    previousPillar = item.pillar;
    return Object.freeze({
      client_id: clientId,
      article_id: item.article_id,
      columns_B_to_J: Object.freeze([
        item.article_id,
        repeated ? "" : item.pillar,
        repeated ? "" : item.pillar_description,
        clusterKeyword,
        item.title,
        item.main_keyword,
        item.sub_keywords,
        item.search_intent,
        aiCitationDesign,
      ]),
    });
  });
  return Object.freeze({ client_id: clientId, status: "CLUSTER_ROWS_READY", rows: Object.freeze(rows) });
}

export function prepareStandardArticleRecordUpdate(input) {
  const clientId = requireText(input.client_id, "client_id");
  const articleId = requireText(input.article_id, "article_id");
  if (!articleId.startsWith("ID-")) throw new Error("STANDARD_ARTICLE_ID_REQUIRED");
  const sheetData = input.sheet_data || {};
  const jsonData = { ...(input.json_data || {}) };
  const articleDetail = requireText(
    sheetData.articleDetail ?? sheetData.article_detail ?? sheetData["記事詳細"] ?? jsonData.article_detail ?? jsonData.summary,
    "article_detail",
  );
  const metaDescription = requireText(
    sheetData.metaDescription ?? sheetData.meta_description ?? sheetData["メタディスクリプション"] ?? jsonData.meta_description ?? articleDetail,
    "meta_description",
  );
  if (articleDetail !== metaDescription) throw new Error("ARTICLE_DETAIL_META_DESCRIPTION_MUST_MATCH");
  const merged = {
    id: String(sheetData.id || articleId),
    category: String(sheetData.category || ""),
    title: String(sheetData.title || ""),
    responsibilityLabel: String(sheetData.responsibilityLabel || ""),
    articleDetail,
    metaDescription,
  };
  Object.assign(jsonData, {
    id: merged.id,
    category: merged.category,
    title: merged.title,
    responsibilityLabel: merged.responsibilityLabel,
    summary: articleDetail,
    article_detail: articleDetail,
    meta_description: metaDescription,
  });
  const sheetValuesByHeader = Object.freeze({
    "ピラー": merged.category,
    "記事タイトル": merged.title,
    "責任ラベル": merged.responsibilityLabel,
    "記事詳細": articleDetail,
    "メタディスクリプション": metaDescription,
  });
  return Object.freeze({
    client_id: clientId,
    article_id: articleId,
    status: "READY_FOR_ARTICLE_RECORD_UPDATE",
    sheet_values_by_header: sheetValuesByHeader,
    sheet_updates: mapArticleSheetUpdates(sheetValuesByHeader, input.article_headers),
    json_file_name: `${articleId}.json`,
    json_content: `${JSON.stringify(jsonData, null, 2)}\n`,
    execution_rule: "Update the row and the JSON file together. Do not change another client or article folder.",
  });
}

const STANDARD_DOC_STYLE = Object.freeze({
  H1: Object.freeze({ paragraph_heading: "TITLE", bold: true, font_size: 18, foreground_color: "#000000" }),
  H2: Object.freeze({ paragraph_heading: "HEADING2", bold: true, font_size: 16, foreground_color: "#cc0000" }),
  H3: Object.freeze({ paragraph_heading: "HEADING3", bold: true, font_size: 14, foreground_color: "#0b5394" }),
  P: Object.freeze({ paragraph_heading: "NORMAL", bold: false, font_size: 11, foreground_color: "#000000" }),
});

function repairStandardSummaryHeading(text) {
  return String(text || "")
    .replace(/\[H2\]\s*この記事の要約[\s\S]*?\[\/H2\]/, "[H2]この記事の要約[/H2]")
    .replace(/\[H2\]\s*この記事の要約\s*(?=\[UL\]|\[LI\]|\n)/, "[H2]この記事の要約[/H2]\n");
}

function normalizeStandardTaggedText(text) {
  const protectedText = repairStandardSummaryHeading(text)
    .replace(/\[P\]([\s\S]*?)\[\/P\]/g, (_, inner) => `[P]${inner.replace(/\n/g, "{{SOFTBREAK}}")}[/P]`)
    .replace(/\[LI\]([\s\S]*?)\[\/LI\]/g, (_, inner) => `[LI]${inner.replace(/\n/g, "{{SOFTBREAK}}")}[/LI]`);
  return protectedText
    .replace(/\[H1\]/g, "\n[H1]").replace(/\[\/H1\]/g, "[/H1]\n")
    .replace(/\[H2\]/g, "\n[H2]").replace(/\[\/H2\]/g, "[/H2]\n")
    .replace(/\[H3\]/g, "\n[H3]").replace(/\[\/H3\]/g, "[/H3]\n")
    .replace(/\[P\]/g, "\n[P]").replace(/\[\/P\]/g, "[/P]\n")
    .replace(/\[UL\]/g, "\n[UL]\n").replace(/\[\/UL\]/g, "\n[/UL]\n")
    .replace(/\[LI\]/g, "\n[LI]").replace(/\[\/LI\]/g, "[/LI]\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeStandardBlockTags(text) {
  return String(text || "")
    .replace(/\[\/?(?:H1|H2|H3|P|UL|LI)\]/g, "")
    .replace(/\[\/?(?:B|MARK|DIAGRAM)\]/g, "")
    .trim();
}

function parseStandardDecorations(content) {
  const regex = /\[B\]([\s\S]*?)\[\/B\]|\[MARK\]([\s\S]*?)\[\/MARK\]|\[DIAGRAM\]([\s\S]*?)\[\/DIAGRAM\]/g;
  let text = "";
  let lastIndex = 0;
  const decorations = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    text += content.slice(lastIndex, match.index);
    const start = text.length;
    const value = match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[3];
    text += value;
    const type = match[1] !== undefined ? "BOLD" : match[2] !== undefined ? "MARKER" : "DIAGRAM_SOURCE";
    decorations.push(Object.freeze({
      type,
      start,
      end: text.length - 1,
      color: type === "MARKER" ? "#fff2cc" : type === "DIAGRAM_SOURCE" ? "#d9ead3" : null,
    }));
    lastIndex = regex.lastIndex;
  }
  text += content.slice(lastIndex);
  return Object.freeze({ text, decorations: Object.freeze(decorations) });
}

export function renderStandardTaggedContent(taggedContent) {
  const normalized = normalizeStandardTaggedText(requireText(taggedContent, "tagged_content"));
  const blocks = [];
  let listItems = [];
  let previousType = null;
  let previousHeadingText = "";

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(Object.freeze({
      type: "LI_GROUP",
      style: STANDARD_DOC_STYLE.P,
      items: Object.freeze(listItems),
      rendering: "ONE_PARAGRAPH_WITH_ZERO_WIDTH_PREFIX_PER_ITEM",
    }));
    listItems = [];
    previousType = "LI";
  };

  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === "[UL]") continue;
    if (line === "[/UL]") { flushList(); continue; }

    const heading = line.match(/^\[(H[123])\]([\s\S]*)\[\/\1\]$/);
    if (heading) {
      flushList();
      const type = heading[1];
      const blankParagraphsBefore = previousType
        ? type === "H2" ? 2 : type === "H3" && previousType !== "H2" ? 1 : 0
        : 0;
      blocks.push(Object.freeze({
        type,
        text: removeStandardBlockTags(heading[2]),
        style: STANDARD_DOC_STYLE[type],
        blank_paragraphs_before: blankParagraphsBefore,
      }));
      previousType = type;
      previousHeadingText = removeStandardBlockTags(heading[2]);
      continue;
    }

    const li = line.match(/^\[LI\]([\s\S]*)\[\/LI\]$/);
    if (li) {
      let text = removeStandardBlockTags(li[1]).replace(/\{\{SOFTBREAK\}\}/g, "\n").replace(/\\n/g, "\n");
      if (previousHeadingText === "この記事でわかること") text = text.replace(/^・\s*/, "");
      const hasColon = text.includes("：");
      if (hasColon) text = text.replace(/^・\s*/, "").replace(/：(?!\n)(.)/g, "：\n$1");
      listItems.push(Object.freeze({
        text,
        blank_lines_before: listItems.length && hasColon ? 1 : 0,
        bold_through_first_colon: hasColon,
      }));
      continue;
    }

    const paragraph = line.match(/^\[P\]([\s\S]*)\[\/P\]$/);
    if (paragraph) {
      flushList();
      const parsed = parseStandardDecorations(paragraph[1].replace(/\{\{SOFTBREAK\}\}/g, "\n").replace(/\\n/g, "\n"));
      blocks.push(Object.freeze({ type: "P", style: STANDARD_DOC_STYLE.P, ...parsed }));
      previousType = "P";
      continue;
    }

    flushList();
    blocks.push(Object.freeze({ type: "P", style: STANDARD_DOC_STYLE.P, text: removeStandardBlockTags(line), decorations: Object.freeze([]), fallback: true }));
    previousType = "P";
  }
  flushList();
  return Object.freeze({
    blocks: Object.freeze(blocks),
    style: STANDARD_DOC_STYLE,
    marker_color: "#fff2cc",
    diagram_source_color: "#d9ead3",
  });
}

function extractDiagramSourceSections(taggedContent) {
  const sections = [];
  const normalized = normalizeStandardTaggedText(String(taggedContent || ""));
  const regex = /\[DIAGRAM\]([\s\S]*?)\[\/DIAGRAM\]/g;
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const text = removeStandardBlockTags(match[1]).replace(/\{\{SOFTBREAK\}\}/g, "\n").replace(/\\n/g, "\n").trim();
    if (text) sections.push(text);
  }
  return Object.freeze(sections);
}

function normalizeStandardHashtags(value) {
  return String(value || "")
    .split(/[,\n、，\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean)
    .join(",");
}

function extractRenderedTagSection(taggedContent) {
  const normalized = normalizeStandardTaggedText(String(taggedContent || ""));
  const paragraphMatch = normalized.match(/\[H2\]タグ\[\/H2\]\s*\n\s*\[P\]([\s\S]*?)\[\/P\]/);
  if (paragraphMatch) return normalizeStandardHashtags(removeStandardBlockTags(paragraphMatch[1]));
  const listMatch = normalized.match(/\[H2\]タグ\[\/H2\]\s*\n\s*\[UL\]([\s\S]*?)\[\/UL\]/);
  if (!listMatch) return "";
  const items = Array.from(listMatch[1].matchAll(/\[LI\]([\s\S]*?)\[\/LI\]/g), (match) => removeStandardBlockTags(match[1]));
  return normalizeStandardHashtags(items.join(","));
}

function hasForbiddenVisibleTagOrSourceSection(taggedContent) {
  const normalized = normalizeStandardTaggedText(String(taggedContent || ""));
  return /\[(?:H2|H3|P)\]\s*(?:タグ(?:一覧)?|出典(?:一覧)?|主な出典|参考(?:情報|文献|資料)|参照元)\s*\[\/(?:H2|H3|P)\]/.test(normalized);
}

function extractStandardListItems(section = "") {
  return Array.from(String(section).matchAll(/\[LI\]([\s\S]*?)\[\/LI\]/g), (match) =>
    removeStandardBlockTags(match[1]).replace(/\{\{SOFTBREAK\}\}/g, "\n").trim());
}

function validateStandardArticleStructure(taggedContent) {
  const content = String(taggedContent || "");
  const normalized = normalizeStandardTaggedText(content);
  const errors = [];
  const opening = normalized.match(/^\[H1\][\s\S]+?\[\/H1\]\s*\[P\]([\s\S]*?)\[\/P\]\s*\[H3\]この記事でわかること\[\/H3\]\s*\[UL\]([\s\S]*?)\[\/UL\]\s*\[H2\]この記事の要約\[\/H2\]\s*\[UL\]([\s\S]*?)\[\/UL\]/);

  if (!opening) {
    errors.push("ARTICLE_OPENING_ORDER_REQUIRED");
  } else {
    const introductionLength = removeStandardBlockTags(opening[1]).replace(/\s/g, "").length;
    if (introductionLength < 100 || introductionLength > 150) errors.push("ARTICLE_INTRODUCTION_LENGTH_INVALID");

    const keyPoints = extractStandardListItems(opening[2]);
    if (keyPoints.length !== 3) errors.push("ARTICLE_KEY_POINTS_EXACTLY_THREE_REQUIRED");
    if (keyPoints.some((item) => !item.startsWith("・"))) errors.push("ARTICLE_KEY_POINTS_BULLET_PREFIX_REQUIRED");
    if (keyPoints.some((item) => {
      const length = item.replace(/^・\s*/, "").replace(/\s/g, "").length;
      return length < 20 || length > 35;
    })) errors.push("ARTICLE_KEY_POINTS_LENGTH_INVALID");

    const summaryItems = extractStandardListItems(opening[3]);
    if (summaryItems.length !== 2) errors.push("ARTICLE_SUMMARY_EXACTLY_TWO_REQUIRED");
  }

  const markerMatches = Array.from(content.matchAll(/\[MARK\]([\s\S]*?)\[\/MARK\]/g));
  if (markerMatches.length < 2 || markerMatches.length > 4) errors.push("ARTICLE_MARKER_COUNT_MUST_BE_TWO_TO_FOUR");
  if (markerMatches.some((match) => !/[。！？]\s*$/.test(removeStandardBlockTags(match[1])))) {
    errors.push("ARTICLE_MARKER_MUST_COVER_COMPLETE_SENTENCE");
  }

  const articleLength = removeStandardBlockTags(content).replace(/\s/g, "").length;
  if (articleLength < 4000 || articleLength > 6000) errors.push("ARTICLE_CHARACTER_COUNT_MUST_BE_4000_TO_6000");

  if (!/\[H2\]この記事のまとめ\[\/H2\][\s\S]*?\[H2\]Q&A\[\/H2\]/.test(normalized)) {
    errors.push("ARTICLE_SUMMARY_QA_ORDER_REQUIRED");
  }
  const qaItems = Array.from(content.matchAll(/\[P\]\s*\[B\]Q：[^\[]+?\[\/B\]\s*\r?\nA：[\s\S]*?\[\/P\]/g));
  if (qaItems.length !== 5) errors.push("ARTICLE_QA_EXACTLY_FIVE_REQUIRED");
  if (!/\[DIAGRAM\][\s\S]+?\[\/DIAGRAM\]/.test(content)) errors.push("ARTICLE_DIAGRAM_SOURCE_REQUIRED");

  return Object.freeze({
    errors: Object.freeze(errors),
    article_length: articleLength,
    marker_count: markerMatches.length,
    qa_count: qaItems.length,
  });
}

export function prepareStandardDocumentOutput(input) {
  const clientId = requireText(input.client_id, "client_id");
  const articleId = requireText(input.article_id, "article_id");
  const title = requireText(input.title, "title");
  const content = requireText(input.tagged_content, "tagged_content");
  const expectedHashtags = normalizeStandardHashtags(input.hashtags ?? input.expected_hashtags ?? input.article?.basicInfo?.hashtags);
  const renderedHashtags = extractRenderedTagSection(content);
  const errors = [];
  const structureValidation = validateStandardArticleStructure(content);
  if (!/\[H1\][\s\S]+?\[\/H1\]/.test(content)) errors.push("H1_TAG_REQUIRED");
  if (!content.includes("[H2]この記事の要約[/H2]")) errors.push("SUMMARY_SECTION_REQUIRED");
  if (!expectedHashtags) errors.push("EXPECTED_HASHTAGS_REQUIRED");
  if (renderedHashtags || hasForbiddenVisibleTagOrSourceSection(content)) errors.push("VISIBLE_TAG_OR_SOURCE_SECTION_FORBIDDEN");
  if (/(^|\n)#{1,6}\s|<\/?(?:h[1-6]|p|ul|li|strong)\b/i.test(content)) errors.push("MARKDOWN_OR_HTML_NOT_ALLOWED");
  errors.push(...structureValidation.errors);
  const renderPlan = renderStandardTaggedContent(content);
  const diagramSourceSections = extractDiagramSourceSections(content);
  return Object.freeze({
    client_id: clientId,
    article_id: articleId,
    status: errors.length ? "RETRY_REQUIRED" : "READY_FOR_GOOGLE_DOC_OUTPUT",
    errors: Object.freeze(errors),
    document_title: `${clientId}_${articleId}_${title}`,
    article_folder_url: requireText(input.article_folder_url, "article_folder_url"),
    sheet_updates_after_save: mapArticleSheetUpdates({
      "記事完成": String(input.completed_on || new Date().toISOString().slice(0, 10)).replaceAll("-", "/"),
      "記事URL": "DOCUMENT_URL",
      "記事&画像削除": false,
    }, input.article_headers),
    style: Object.freeze({ h2_color: "#cc0000", h3_color: "#0b5394", marker_color: "#fff2cc", diagram_source_color: "#d9ead3" }),
    render_plan: renderPlan,
    google_doc_output_requirements: Object.freeze({
      render_native_styles: true,
      raw_standard_tags_visible_forbidden: true,
      wordpress_copy_ready: true,
      heading_tags_to_named_styles: Object.freeze({ H1: "HEADING_1", H2: "HEADING_2", H3: "HEADING_3" }),
      list_groups_to_native_bullets: true,
      li_softbreaks_must_not_become_extra_bullets: true,
      mark_to_background_color: "#fff2cc",
      diagram_source_to_background_color: "#d9ead3",
      diagram_source_original_text_must_remain_visible: true,
      diagram_source_must_be_natural_body_paragraph: true,
      diagram_source_fragment_or_caption_only_forbidden: true,
      diagram_source_caption_replacement_forbidden: true,
      diagram_source_and_image_content_must_match: true,
      diagram_source_must_not_explain_the_diagram: true,
      diagram_image_is_visualization_of_source_text_only: true,
      diagram_image_must_follow_source_paragraph: true,
      bold_to_text_style: true,
      article_opening_order: Object.freeze(["H1", "INTRODUCTION", "THREE_KEY_POINTS", "ARTICLE_SUMMARY"]),
      introduction_character_count: Object.freeze({ min: 100, max: 150 }),
      key_points_count: 3,
      marker_count: Object.freeze({ min: 2, max: 4 }),
      article_character_count: Object.freeze({ min: 4000, max: 6000 }),
      qa_count: 5,
      editorial_ending_order: Object.freeze(["この記事のまとめ", "Q&A", "関連記事"]),
      tag_section_visible_forbidden: true,
      source_section_visible_forbidden: true,
      related_articles_after_qa: Object.freeze({
        label: "関連記事",
        label_must_not_use_heading_style: true,
        links_are_article_titles: true,
        native_links_required: true,
      }),
    }),
    article_metadata: Object.freeze({
      hashtags: expectedHashtags,
      rendered_hashtags: renderedHashtags,
      tag_section_required: false,
      tag_section_visible_forbidden: true,
      source_section_visible_forbidden: true,
      diagram_source_sections: diagramSourceSections,
      article_length: structureValidation.article_length,
      marker_count: structureValidation.marker_count,
      qa_count: structureValidation.qa_count,
    }),
    document_move_rule: "Create the Google Doc, add it to the article folder, then remove its My Drive root membership so the article folder is its only operational location.",
    tagged_content: content,
    content_sha256: createHash("sha256").update(content, "utf8").digest("hex"),
  });
}
