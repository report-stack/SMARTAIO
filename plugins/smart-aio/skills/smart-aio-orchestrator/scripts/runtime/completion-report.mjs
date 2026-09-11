import { verifyArticleVisualPersistence } from "./image-persistence.mjs";
import { requireStandardClientRunAudit, verifyArticleDocumentReadbackEvidence } from "./standard-run-audit.mjs";
import { verifyInternalLinkGraph, verifyStructuredMarkupOutput } from "./content-optimization.mjs";
import { requireCurrentSmartAioPluginVersion } from "./version.mjs";

function requireText(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`COMPLETION_REPORT_${field.toUpperCase()}_REQUIRED`);
  return text;
}

function requireGoogleUrl(value, field, pattern) {
  const text = requireText(value, field);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`COMPLETION_REPORT_${field.toUpperCase()}_INVALID`);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "docs.google.com" && parsed.hostname !== "drive.google.com" || !pattern.test(parsed.pathname)) {
    throw new Error(`COMPLETION_REPORT_${field.toUpperCase()}_INVALID`);
  }
  return text;
}

function extractDriveFolderId(folderUrl) {
  const match = new URL(folderUrl).pathname.match(/^\/drive\/folders\/([^/]+)/);
  return match?.[1] || "";
}

function requireDriveScopeEvidence(input, driveFolderUrl, imageFolderUrl, productionSheetUrl, articleId) {
  const evidence = input?.drive_scope_evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_EVIDENCE_REQUIRED");
  }

  if (String(evidence.output_location || "").trim() !== "SMARTAIO_DRIVE") {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_OUTPUT_LOCATION_INVALID");
  }
  if (evidence.smartaio_root_verified !== true) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_SMARTAIO_ROOT_REQUIRED");
  }
  if (evidence.client_folder_directly_under_smartaio !== true) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_CLIENT_FOLDER_UNDER_SMARTAIO_REQUIRED");
  }
  const clientDriveUrl = requireGoogleUrl(evidence.client_drive_url, "drive_scope_client_drive_url", /^\/drive\/folders\//);
  const smartaioRootUrl = requireGoogleUrl(evidence.smartaio_root_url, "drive_scope_smartaio_root_url", /^\/drive\/folders\//);
  const articleFolderUrl = requireGoogleUrl(evidence.article_folder_url, "drive_scope_article_folder_url", /^\/drive\/folders\//);
  const scopedImageFolderUrl = requireGoogleUrl(evidence.image_folder_url, "drive_scope_image_folder_url", /^\/drive\/folders\//);
  const scopedProductionSheetUrl = requireGoogleUrl(evidence.production_sheet_url, "drive_scope_production_sheet_url", /^\/spreadsheets\/d\//);
  if (articleFolderUrl !== driveFolderUrl) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_ARTICLE_FOLDER_MISMATCH");
  }
  if (scopedImageFolderUrl !== imageFolderUrl) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_IMAGE_FOLDER_MISMATCH");
  }
  if (scopedProductionSheetUrl !== productionSheetUrl) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_PRODUCTION_SHEET_MISMATCH");
  }

  if (evidence.article_folder_under_client_drive !== true) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_ARTICLE_FOLDER_PARENT_REQUIRED");
  }
  if (evidence.image_folder_under_client_drive !== true) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_IMAGE_FOLDER_PARENT_REQUIRED");
  }
  if (evidence.created_in_my_drive_root === true || evidence.my_drive_root_parent_present === true) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_MY_DRIVE_ROOT_FORBIDDEN");
  }
  if (evidence.my_drive_root_parent_removed !== true) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_MY_DRIVE_ROOT_REMOVAL_REQUIRED");
  }

  const pathNames = Array.isArray(evidence.folder_path_names)
    ? evidence.folder_path_names.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  if (!pathNames.includes("03_記事") || !pathNames.includes(articleId)) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_FOLDER_PATH_INVALID");
  }
  const imagePathNames = Array.isArray(evidence.image_folder_path_names)
    ? evidence.image_folder_path_names.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  if (!imagePathNames.includes("04_画像") || !imagePathNames.includes(articleId)) {
    throw new Error("COMPLETION_REPORT_DRIVE_SCOPE_IMAGE_FOLDER_PATH_INVALID");
  }

  const clientDriveFolderId = extractDriveFolderId(clientDriveUrl);
  const smartaioRootFolderId = extractDriveFolderId(smartaioRootUrl);
  const articleFolderId = extractDriveFolderId(articleFolderUrl);
  const imageFolderId = extractDriveFolderId(scopedImageFolderUrl);
  return Object.freeze({
    output_location: "SMARTAIO_DRIVE",
    smartaio_root_verified: true,
    smartaio_root_url: smartaioRootUrl,
    smartaio_root_folder_id: smartaioRootFolderId,
    client_folder_directly_under_smartaio: true,
    client_drive_url: clientDriveUrl,
    client_drive_folder_id: clientDriveFolderId,
    article_folder_url: articleFolderUrl,
    article_folder_id: articleFolderId,
    image_folder_url: scopedImageFolderUrl,
    image_folder_id: imageFolderId,
    production_sheet_url: scopedProductionSheetUrl,
    article_folder_under_client_drive: true,
    image_folder_under_client_drive: true,
    my_drive_root_parent_removed: true,
    folder_path_names: Object.freeze(pathNames),
    image_folder_path_names: Object.freeze(imagePathNames),
    verified_at: String(evidence.verified_at || "").trim() || null,
  });
}

function requirePositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`COMPLETION_REPORT_DOCUMENT_PERSISTENCE_${field}_INVALID`);
  }
  return number;
}

function requireSha256(value, field) {
  const hash = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(`COMPLETION_REPORT_DOCUMENT_PERSISTENCE_${field}_INVALID`);
  }
  return hash;
}

function extractGoogleDocumentId(documentUrl) {
  const match = new URL(documentUrl).pathname.match(/^\/document\/d\/([^/]+)/);
  return match?.[1] || "";
}

function requireDocumentPersistence(input, documentUrl) {
  const evidence = input?.document_persistence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("COMPLETION_REPORT_DOCUMENT_PERSISTENCE_REQUIRED");
  }
  if (String(evidence.method || "").trim() !== "RELOAD_AND_READBACK") {
    throw new Error("COMPLETION_REPORT_DOCUMENT_PERSISTENCE_METHOD_INVALID");
  }
  if (evidence.reloaded_after_write !== true) {
    throw new Error("COMPLETION_REPORT_DOCUMENT_PERSISTENCE_RELOAD_REQUIRED");
  }
  if (evidence.sentinel_replaced !== true) {
    throw new Error("COMPLETION_REPORT_DOCUMENT_PERSISTENCE_SENTINEL_REPLACEMENT_REQUIRED");
  }

  const expectedCharacterCount = requirePositiveInteger(evidence.expected_character_count, "EXPECTED_CHARACTER_COUNT");
  const readbackCharacterCount = requirePositiveInteger(evidence.readback_character_count, "READBACK_CHARACTER_COUNT");
  if (expectedCharacterCount !== readbackCharacterCount) {
    throw new Error("COMPLETION_REPORT_DOCUMENT_PERSISTENCE_CHARACTER_COUNT_MISMATCH");
  }

  const expectedSha256 = requireSha256(evidence.expected_sha256, "EXPECTED_SHA256");
  const readbackSha256 = requireSha256(evidence.readback_sha256, "READBACK_SHA256");
  if (expectedSha256 !== readbackSha256) {
    throw new Error("COMPLETION_REPORT_DOCUMENT_PERSISTENCE_SHA256_MISMATCH");
  }

  const documentId = extractGoogleDocumentId(documentUrl);
  if (String(evidence.document_id || "").trim() !== documentId) {
    throw new Error("COMPLETION_REPORT_DOCUMENT_PERSISTENCE_DOCUMENT_ID_MISMATCH");
  }
  if (String(evidence.drive_document_id || "").trim() !== documentId || evidence.document_in_target_folder !== true) {
    throw new Error("COMPLETION_REPORT_DOCUMENT_PERSISTENCE_TARGET_FOLDER_MEMBERSHIP_REQUIRED");
  }

  return Object.freeze({
    method: "RELOAD_AND_READBACK",
    normalization: "NFKC_REMOVE_WHITESPACE",
    reloaded_after_write: true,
    sentinel_replaced: true,
    character_count: readbackCharacterCount,
    sha256: readbackSha256,
    document_id: documentId,
    document_in_target_folder: true,
    verified_at: String(evidence.verified_at || "").trim() || null,
  });
}

export function prepareArticleCompletionReport(input = {}) {
  const smartAioPluginVersion = requireCurrentSmartAioPluginVersion(input.smart_aio_plugin_version ?? input.runtime?.smart_aio_plugin_version);
  const clientId = requireText(input.client_id, "client_id");
  const articleId = requireText(input.article_id, "article_id");
  const title = requireText(input.title, "title");
  const documentUrl = requireGoogleUrl(input.document_url, "document_url", /^\/document\/d\//);
  const documentPersistence = requireDocumentPersistence(input, documentUrl);
  const driveFolderUrl = requireGoogleUrl(input.drive_folder_url, "drive_folder_url", /^\/drive\/folders\//);
  const imageFolderUrl = requireGoogleUrl(input.image_folder_url, "image_folder_url", /^\/drive\/folders\//);
  const imagePersistence = verifyArticleVisualPersistence(input.image_persistence, { client_id: clientId, article_id: articleId });
  if (imagePersistence.image_folder_url !== imageFolderUrl) throw new Error("COMPLETION_REPORT_IMAGE_FOLDER_MISMATCH");
  const structuredMarkup = verifyStructuredMarkupOutput(input.structured_markup, { client_id: clientId, article_id: articleId });
  const internalLinkGraph = verifyInternalLinkGraph(input.internal_link_graph, { client_id: clientId, article_id: articleId });
  const renderedHashtags = requireText(input.hashtags ?? input.rendered_hashtags, "hashtags");
  const articleDocumentReadback = verifyArticleDocumentReadbackEvidence(input.article_document_readback, {
    client_id: clientId,
    article_id: articleId,
    document_id: documentPersistence.document_id,
    normalized_character_count: documentPersistence.character_count,
    readback_sha256: documentPersistence.sha256,
    rendered_hashtags: renderedHashtags,
    embedded_images: [
      ...imagePersistence.images.map((image) => ({ ...image, image_role: image.role })),
      { ...imagePersistence.diagram_image, image_role: "DIAGRAM" },
    ],
    internal_links: internalLinkGraph.outbound_links,
  });
  const productionSheetUrl = requireGoogleUrl(input.updated_sheet_url ?? input.production_sheet_url, "updated_sheet_url", /^\/spreadsheets\/d\//);
  const driveScopeEvidence = requireDriveScopeEvidence(input, driveFolderUrl, imageFolderUrl, productionSheetUrl, articleId);
  const standardRunAudit = requireStandardClientRunAudit(input.standard_run_audit, { client_id: clientId, article_id: articleId });
  const updatedSheetName = String(input.updated_sheet_name || "記事一覧").trim() || "記事一覧";
  const updatedRange = String(input.updated_range || "").trim();
  const workflowStatus = String(input.workflow_status || "AWAITING_FINAL_APPROVAL").trim();
  const updateLabel = updatedRange ? `${updatedSheetName} ${updatedRange}` : updatedSheetName;

  return Object.freeze({
    status: "READY_TO_REPORT_ARTICLE_COMPLETION",
    smart_aio_plugin_version: smartAioPluginVersion,
    client_id: clientId,
    article_id: articleId,
    title,
    document_url: documentUrl,
    drive_folder_url: driveFolderUrl,
    image_folder_url: imageFolderUrl,
    updated_sheet_url: productionSheetUrl,
    updated_sheet_name: updatedSheetName,
    updated_range: updatedRange || null,
    workflow_status: workflowStatus,
    drive_scope_evidence: driveScopeEvidence,
    standard_run_audit: standardRunAudit,
    document_persistence: documentPersistence,
    article_document_readback: articleDocumentReadback,
    image_persistence: imagePersistence,
    structured_markup: structuredMarkup,
    internal_link_graph: internalLinkGraph,
    required_links: Object.freeze({
      article_document: documentUrl,
      drive_storage: driveFolderUrl,
      updated_spreadsheet: productionSheetUrl,
      image_storage: imageFolderUrl,
      structured_markup: structuredMarkup.file_url,
      diagram_image: imagePersistence.diagram_image.file_url,
    }),
    markdown_lines: Object.freeze([
      `記事本文: [${articleId} ${title}](${documentUrl})`,
      `Drive格納先: [${articleId} フォルダー](${driveFolderUrl})`,
      `タイトル画像1枚・通常画像3枚: [${articleId}_1.png〜${articleId}_4.png](${imageFolderUrl})`,
      `図解画像: [${articleId}_diagram_1.png](${imagePersistence.diagram_image.file_url})`,
      `構造化マークアップ: [${articleId}_schema.jsonld](${structuredMarkup.file_url})`,
      `更新した記事制作シート: [${updateLabel}](${productionSheetUrl})`,
    ]),
  });
}
