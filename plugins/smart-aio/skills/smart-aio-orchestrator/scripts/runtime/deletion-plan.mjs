// Canonical Smart AIO Skill runtime. Backend modules only re-export this implementation.
import { createHash, timingSafeEqual } from "node:crypto";
import { resolveArticleSheetColumnMap } from "./article-sheet-layout.mjs";

const TARGET_RULES = Object.freeze({
  ARTICLE: Object.freeze({
    drive_scope: "ARTICLE_FOLDER",
    sheet_headers: Object.freeze(["ピラー", "画像のみ削除"]),
    selection_checkbox_header: "全部削除",
    trashed_mime_types: Object.freeze(["FOLDER_WITH_ALL_CONTENTS"]),
  }),
  DOCUMENTS_AND_IMAGES: Object.freeze({
    drive_scope: "GOOGLE_DOCS_AND_PNG_JPEG",
    sheet_headers: Object.freeze(["記事完成", "画像のみ削除"]),
    selection_checkbox_header: "記事&画像削除",
    trashed_mime_types: Object.freeze(["application/vnd.google-apps.document", "image/jpeg", "image/png"]),
  }),
  IMAGES_ONLY: Object.freeze({
    drive_scope: "PNG_JPEG_ONLY",
    sheet_headers: Object.freeze(["画像完成", "画像のみ削除"]),
    selection_checkbox_header: "画像のみ削除",
    trashed_mime_types: Object.freeze(["image/jpeg", "image/png"]),
  }),
});

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function payloadFor(plan) {
  return [plan.client_id, plan.target_type, plan.parent_drive_url, plan.article_ids.join(","), plan.expires_at].join("|");
}

function tokenFor(plan, secret) {
  return createHash("sha256").update(`${payloadFor(plan)}|${secret}`, "utf8").digest("hex");
}

export function createDeletionPlan(input, { secret = "local-confirmation-only", now = new Date(), ttlMinutes = 15 } = {}) {
  const clientId = requireText(input.client_id, "client_id");
  const targetType = requireText(input.target_type, "target_type");
  const rule = TARGET_RULES[targetType];
  if (!rule) throw new Error("UNKNOWN_DELETION_TARGET_TYPE");
  const rawArticleIds = (input.article_ids || []).map((value) => String(value || "").trim()).filter(Boolean);
  if (rawArticleIds.length === 0) throw new Error("NO_ARTICLES_SELECTED");
  // The deletion limit is based on checked rows, not on unique article IDs.
  if (rawArticleIds.length >= 10) throw new Error("DELETE_LIMIT_EXCEEDED");
  const articleIds = [...new Set(rawArticleIds)];
  const parentDriveUrl = requireText(input.parent_drive_url, "parent_drive_url");
  if (!/^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+/.test(parentDriveUrl)) {
    throw new Error("INVALID_PARENT_DRIVE_URL");
  }
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
  const columnMap = resolveArticleSheetColumnMap(input.article_headers);
  const [clearStartHeader, clearEndHeader] = rule.sheet_headers;
  const unsigned = Object.freeze({
    client_id: clientId,
    target_type: targetType,
    article_ids: Object.freeze(articleIds),
    parent_drive_url: parentDriveUrl,
    drive_scope: rule.drive_scope,
    selection_checkbox_header: rule.selection_checkbox_header,
    selection_checkbox_column: columnMap[rule.selection_checkbox_header],
    trashed_mime_types: rule.trashed_mime_types,
    sheet_headers_to_clear: rule.sheet_headers,
    sheet_columns_to_clear: `${columnMap[clearStartHeader]}:${columnMap[clearEndHeader]}`,
    clear_sheet_content: true,
    clear_data_validations: true,
    processing_order: "BOTTOM_ROW_TO_TOP_ROW",
    operation: "MOVE_TO_GOOGLE_DRIVE_TRASH",
    recoverable: true,
    expires_at: expiresAt,
  });
  return Object.freeze({ ...unsigned, confirmation_token: tokenFor(unsigned, secret), status: "AWAITING_EXPLICIT_CONFIRMATION" });
}

export function authorizeDeletion(plan, confirmation, { secret = "local-confirmation-only", now = new Date() } = {}) {
  if (confirmation?.confirmed !== true) throw new Error("EXPLICIT_CONFIRMATION_REQUIRED");
  if (requireText(confirmation.client_id, "confirmation.client_id") !== plan.client_id) throw new Error("CROSS_CLIENT_DATA_DETECTED:deletion");
  if (now.toISOString() > plan.expires_at) throw new Error("CONFIRMATION_EXPIRED");
  const expected = Buffer.from(tokenFor(plan, secret), "utf8");
  const actual = Buffer.from(String(confirmation.confirmation_token || ""), "utf8");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("INVALID_CONFIRMATION_TOKEN");
  return Object.freeze({
    ...plan,
    status: "READY_FOR_RECOVERABLE_TRASH",
    authorized_by: requireText(confirmation.user_id, "confirmation.user_id"),
    execution_rule: "Before execution, re-read the same client folder, checked rows, and article IDs. Trash only the declared folder or MIME types, then clear both content and data validations in the exact sheet columns. Never permanently delete.",
  });
}
