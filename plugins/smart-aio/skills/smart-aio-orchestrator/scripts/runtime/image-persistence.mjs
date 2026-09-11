const EXPECTED_TITLE_IMAGE_COUNT = 1;
const EXPECTED_ARTICLE_PHOTO_COUNT = 3;
const EXPECTED_IMAGE_COUNT = EXPECTED_TITLE_IMAGE_COUNT + EXPECTED_ARTICLE_PHOTO_COUNT;
const EXPECTED_DIAGRAM_COUNT = 1;
const EXPECTED_WIDTH = 1536;
const EXPECTED_HEIGHT = 1024;
const MINIMUM_DIAGRAM_VISUAL_QUALITY_SCORE = 85;
const MINIMUM_TITLE_VISUAL_QUALITY_SCORE = 85;
const MINIMUM_DIAGRAM_CANVAS_OCCUPANCY_PERCENT = 65;
const MAXIMUM_DIAGRAM_CANVAS_OCCUPANCY_PERCENT = 95;
const MINIMUM_TITLE_CANVAS_OCCUPANCY_PERCENT = 55;
const MAXIMUM_TITLE_CANVAS_OCCUPANCY_PERCENT = 95;
const REQUIRED_TITLE_VISUAL_CHECKS = Object.freeze([
  "original_image_inspected",
  "benchmark_compared",
  "title_text_readable",
  "title_hierarchy_clear",
  "article_title_preserved",
  "background_readable_text_absent_or_minimized",
  "professional_blog_thumbnail_quality",
  "japanese_text_readable",
  "no_text_errors",
  "copyright_safe",
]);
const REQUIRED_DIAGRAM_VISUAL_CHECKS = Object.freeze([
  "original_image_inspected",
  "benchmark_compared",
  "topic_or_context_heading_present",
  "supporting_context_present",
  "reading_order_clear",
  "information_hierarchy_clear",
  "canvas_usage_balanced",
  "japanese_text_readable",
  "no_text_errors",
  "actionable_takeaway_present",
  "not_low_density",
  "not_labels_only",
  "source_fidelity_preserved",
  "copyright_safe",
]);
const FORBIDDEN_IMAGE_PROVENANCE_PATTERN = /\b(?:pil|pillow|imagedraw|image\.new|template|placeholder|local[-_\s]?script|python|build_articles\.py|script[-_\s]?generated|auto[-_\s]?drawn)\b/i;
const ALLOWED_IMAGE_PROVENANCE_PATTERN = /\b(?:image_gen|imagegen|conversation_image_generation|codex_image_generation|chatgpt_image_generation|image_generation_tool)\b/i;

function requireText(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`IMAGE_PERSISTENCE_${field.toUpperCase()}_REQUIRED`);
  return text;
}

function requirePositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`IMAGE_PERSISTENCE_${field.toUpperCase()}_INVALID`);
  return number;
}

function requireGoogleDriveUrl(value, field, pattern) {
  const text = requireText(value, field);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`IMAGE_PERSISTENCE_${field.toUpperCase()}_INVALID`);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "drive.google.com" || !pattern.test(parsed.pathname)) {
    throw new Error(`IMAGE_PERSISTENCE_${field.toUpperCase()}_INVALID`);
  }
  return text;
}

function requireSha256(value, field) {
  const hash = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error(`IMAGE_PERSISTENCE_${field.toUpperCase()}_INVALID`);
  return hash;
}

function normalizeMeasuredDimensions(input, expectedFileName, fieldPrefix) {
  const measured = input?.file_measurement && typeof input.file_measurement === "object" && !Array.isArray(input.file_measurement)
    ? input.file_measurement
    : input?.measured_dimensions && typeof input.measured_dimensions === "object" && !Array.isArray(input.measured_dimensions)
      ? input.measured_dimensions
      : null;
  const width = requirePositiveInteger(measured?.width ?? input?.measured_width, `${fieldPrefix}_MEASURED_WIDTH`);
  const height = requirePositiveInteger(measured?.height ?? input?.measured_height, `${fieldPrefix}_MEASURED_HEIGHT`);
  const method = requireText(measured?.method ?? input?.measurement_method, `${fieldPrefix}_MEASUREMENT_METHOD`);
  if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
    throw new Error(`IMAGE_PERSISTENCE_MEASURED_DIMENSIONS_MISMATCH:${expectedFileName}`);
  }
  return Object.freeze({ width, height, method });
}

function normalizePromptUseEvidence(image, expectedFileName, fieldPrefix) {
  const generationCallId = requireText(
    image?.generation_call_id ?? image?.image_generation_call_id,
    `${fieldPrefix}_GENERATION_CALL_ID`,
  );
  const preparedPromptSha256 = requireSha256(
    image?.prepared_prompt_sha256 ?? image?.prepared_content_prompt_sha256,
    `${fieldPrefix}_PREPARED_PROMPT_SHA256`,
  );
  const generationPromptSha256 = requireSha256(
    image?.generation_prompt_sha256 ?? image?.used_prompt_sha256,
    `${fieldPrefix}_GENERATION_PROMPT_SHA256`,
  );
  if (preparedPromptSha256 !== generationPromptSha256) {
    throw new Error(`IMAGE_PERSISTENCE_PREPARED_PROMPT_HASH_MISMATCH:${expectedFileName}`);
  }
  if (image?.prompt_text_exact_match_verified !== true && image?.prepared_prompt_used_verbatim !== true) {
    throw new Error(`IMAGE_PERSISTENCE_PREPARED_PROMPT_EXACT_MATCH_REQUIRED:${expectedFileName}`);
  }
  return Object.freeze({
    generation_call_id: generationCallId,
    prepared_prompt_sha256: preparedPromptSha256,
    generation_prompt_sha256: generationPromptSha256,
    prompt_text_exact_match_verified: true,
  });
}

function optionalText(value) {
  return String(value ?? "").trim();
}

function requireNumberInRange(value, field, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`IMAGE_PERSISTENCE_${field.toUpperCase()}_INVALID`);
  }
  return number;
}

function normalizeRole(value) {
  return optionalText(value).toUpperCase();
}

function verifyGenerationProvenance(image, expectedFileName) {
  const sourceTool = String(image?.source_tool ?? image?.generation_tool ?? "").trim();
  const generationMethod = String(image?.generation_method ?? image?.creation_method ?? "").trim();
  const provenanceText = [
    sourceTool,
    generationMethod,
    image?.creator,
    image?.created_by,
    image?.pipeline,
    image?.provenance,
    image?.evidence_type,
  ].map((value) => String(value ?? "")).join(" ");
  if (FORBIDDEN_IMAGE_PROVENANCE_PATTERN.test(provenanceText)) {
    throw new Error(`IMAGE_PERSISTENCE_TEMPLATE_IMAGE_FORBIDDEN:${expectedFileName}`);
  }
  if (!sourceTool && !generationMethod) {
    throw new Error(`IMAGE_PERSISTENCE_GENERATION_METHOD_REQUIRED:${expectedFileName}`);
  }
  if (!ALLOWED_IMAGE_PROVENANCE_PATTERN.test(`${sourceTool} ${generationMethod}`)) {
    throw new Error(`IMAGE_PERSISTENCE_GENERATION_METHOD_INVALID:${expectedFileName}`);
  }
  return Object.freeze({
    source_tool: sourceTool || null,
    generation_method: generationMethod || null,
  });
}

function verifyImageFolderFileListing(files, expectedFileNames) {
  if (!Array.isArray(files)) throw new Error("IMAGE_PERSISTENCE_IMAGE_FOLDER_FILE_LISTING_REQUIRED");
  const expected = new Set(expectedFileNames);
  const seen = new Set();
  for (const [index, file] of files.entries()) {
    const fileName = String(file?.file_name ?? file?.title ?? file?.name ?? "").trim();
    if (!fileName) throw new Error(`IMAGE_PERSISTENCE_IMAGE_FOLDER_FILE_NAME_REQUIRED:${index}`);
    const mimeType = String(file?.mime_type ?? file?.mimeType ?? "").trim().toLowerCase();
    const fileOrFolder = String(file?.file_or_folder ?? file?.type ?? "file").trim().toLowerCase();
    if (fileOrFolder !== "file" || mimeType !== "image/png") {
      throw new Error(`IMAGE_PERSISTENCE_IMAGE_FOLDER_NON_IMAGE_FORBIDDEN:${fileName}`);
    }
    if (!expected.has(fileName)) {
      throw new Error(`IMAGE_PERSISTENCE_IMAGE_FOLDER_UNEXPECTED_FILE:${fileName}`);
    }
    seen.add(fileName);
  }
  for (const fileName of expected) {
    if (!seen.has(fileName)) throw new Error(`IMAGE_PERSISTENCE_IMAGE_FOLDER_EXPECTED_FILE_MISSING:${fileName}`);
  }
  return Object.freeze({
    checked_file_count: files.length,
    expected_file_names: Object.freeze([...expected]),
  });
}

function normalizeTitleVisualQualityReview(reviewInput, titleSha256) {
  if (!reviewInput || typeof reviewInput !== "object" || Array.isArray(reviewInput)) {
    throw new Error("IMAGE_PERSISTENCE_TITLE_VISUAL_QUALITY_REVIEW_REQUIRED");
  }
  const producerRunId = requireText(reviewInput.producer_run_id, "title_visual_quality_producer_run_id");
  const reviewRunId = requireText(reviewInput.review_run_id, "title_visual_quality_review_run_id");
  if (producerRunId === reviewRunId) {
    throw new Error("IMAGE_PERSISTENCE_TITLE_VISUAL_QUALITY_INDEPENDENT_REVIEW_REQUIRED");
  }
  const inspectionMethod = requireText(reviewInput.inspection_method, "title_visual_quality_inspection_method").toUpperCase();
  if (inspectionMethod !== "ORIGINAL_IMAGE_VISUAL_INSPECTION") {
    throw new Error("IMAGE_PERSISTENCE_TITLE_VISUAL_QUALITY_INSPECTION_METHOD_INVALID");
  }
  const reviewedSha256 = requireSha256(reviewInput.reviewed_title_sha256 ?? reviewInput.reviewed_image_sha256, "title_visual_quality_reviewed_sha256");
  if (reviewedSha256 !== titleSha256) {
    throw new Error("IMAGE_PERSISTENCE_TITLE_VISUAL_QUALITY_SHA_MISMATCH");
  }
  const status = requireText(reviewInput.status, "title_visual_quality_status").toUpperCase();
  if (status !== "PASS") throw new Error("IMAGE_PERSISTENCE_TITLE_VISUAL_QUALITY_REVIEW_NOT_PASS");
  const score = requireNumberInRange(reviewInput.visual_quality_score, "title_visual_quality_score", 0, 100);
  if (score < MINIMUM_TITLE_VISUAL_QUALITY_SCORE) {
    throw new Error("IMAGE_PERSISTENCE_TITLE_VISUAL_QUALITY_SCORE_BELOW_MINIMUM");
  }
  const canvasOccupancyPercent = requireNumberInRange(
    reviewInput.canvas_occupancy_percent,
    "title_visual_quality_canvas_occupancy_percent",
    0,
    100,
  );
  if (
    canvasOccupancyPercent < MINIMUM_TITLE_CANVAS_OCCUPANCY_PERCENT ||
    canvasOccupancyPercent > MAXIMUM_TITLE_CANVAS_OCCUPANCY_PERCENT
  ) {
    throw new Error("IMAGE_PERSISTENCE_TITLE_VISUAL_QUALITY_CANVAS_OCCUPANCY_INVALID");
  }
  const checks = reviewInput.checks;
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) {
    throw new Error("IMAGE_PERSISTENCE_TITLE_VISUAL_QUALITY_CHECKS_REQUIRED");
  }
  const failedChecks = REQUIRED_TITLE_VISUAL_CHECKS.filter((key) => checks[key] !== true);
  if (failedChecks.length) {
    throw new Error(`IMAGE_PERSISTENCE_TITLE_VISUAL_QUALITY_CHECK_FAILED:${failedChecks.join(",")}`);
  }
  return Object.freeze({
    status: "PASS",
    producer_run_id: producerRunId,
    review_run_id: reviewRunId,
    reviewer_model: requireText(reviewInput.reviewer_model, "title_visual_quality_reviewer_model"),
    inspection_method: inspectionMethod,
    reviewed_title_sha256: reviewedSha256,
    benchmark_asset_id_or_url: requireText(
      reviewInput.benchmark_asset_id_or_url ?? reviewInput.benchmark_reference,
      "title_visual_quality_benchmark_reference",
    ),
    visual_quality_score: score,
    canvas_occupancy_percent: canvasOccupancyPercent,
    checks: Object.freeze(Object.fromEntries(REQUIRED_TITLE_VISUAL_CHECKS.map((key) => [key, true]))),
    reviewed_at: requireText(reviewInput.reviewed_at, "title_visual_quality_reviewed_at"),
  });
}

function verifyTitleImageMetadata(image, expectedFileName, expectedTitle, titleSha256) {
  const role = normalizeRole(image?.image_role ?? image?.role);
  if (role && role !== "TITLE_IMAGE" && role !== "THUMBNAIL") {
    throw new Error(`IMAGE_PERSISTENCE_TITLE_IMAGE_ROLE_INVALID:${expectedFileName}`);
  }
  const titleText = optionalText(image?.title_text ?? image?.rendered_title ?? image?.article_title);
  if (!titleText) throw new Error(`IMAGE_PERSISTENCE_TITLE_TEXT_REQUIRED:${expectedFileName}`);
  if (expectedTitle && titleText !== expectedTitle) {
    throw new Error(`IMAGE_PERSISTENCE_TITLE_TEXT_MISMATCH:${expectedFileName}`);
  }
  if (image?.title_text_in_image !== true && image?.title_text_verified !== true) {
    throw new Error(`IMAGE_PERSISTENCE_TITLE_TEXT_PROOF_REQUIRED:${expectedFileName}`);
  }
  if (image?.readable_background_text_absent_or_minimized !== true && image?.background_readable_text_absent_or_minimized !== true) {
    throw new Error(`IMAGE_PERSISTENCE_TITLE_BACKGROUND_READABLE_TEXT_REVIEW_REQUIRED:${expectedFileName}`);
  }
  return Object.freeze({
    role: "TITLE_IMAGE",
    title_text: titleText,
    title_text_in_image: true,
    readable_background_text_absent_or_minimized: true,
    visual_quality_review: normalizeTitleVisualQualityReview(
      image?.visual_quality_review ?? image?.title_visual_quality_review,
      titleSha256,
    ),
  });
}

function verifyArticlePhotoMetadata(image, expectedFileName) {
  const role = normalizeRole(image?.image_role ?? image?.role);
  if (role && role !== "ARTICLE_PHOTO") {
    throw new Error(`IMAGE_PERSISTENCE_ARTICLE_PHOTO_ROLE_INVALID:${expectedFileName}`);
  }
  if (image?.readable_text_absent_or_minimized !== true && image?.background_readable_text_absent_or_minimized !== true) {
    throw new Error(`IMAGE_PERSISTENCE_ARTICLE_PHOTO_READABLE_TEXT_REVIEW_REQUIRED:${expectedFileName}`);
  }
  return Object.freeze({ role: "ARTICLE_PHOTO", readable_text_absent_or_minimized: true });
}

function normalizeImage(image, index, articleId, expectedTitle) {
  const sequence = requirePositiveInteger(image?.sequence, `IMAGE_${index + 1}_SEQUENCE`);
  if (sequence !== index + 1) throw new Error("IMAGE_PERSISTENCE_SEQUENCE_MISMATCH");
  const expectedFileName = `${articleId}_${sequence}.png`;
  const fileName = requireText(image?.file_name, `IMAGE_${sequence}_FILE_NAME`);
  if (fileName !== expectedFileName) throw new Error(`IMAGE_PERSISTENCE_FILE_NAME_MISMATCH:${expectedFileName}`);
  if (String(image?.mime_type || "").trim().toLowerCase() !== "image/png") {
    throw new Error(`IMAGE_PERSISTENCE_MIME_TYPE_INVALID:${expectedFileName}`);
  }
  if (image?.generated_in_current_conversation !== true) {
    throw new Error(`IMAGE_PERSISTENCE_GENERATION_PROOF_REQUIRED:${expectedFileName}`);
  }
  const generationProvenance = verifyGenerationProvenance(image, expectedFileName);
  if (image?.file_in_image_folder !== true) {
    throw new Error(`IMAGE_PERSISTENCE_IMAGE_FOLDER_MEMBERSHIP_REQUIRED:${expectedFileName}`);
  }
  const width = requirePositiveInteger(image?.width, `IMAGE_${sequence}_WIDTH`);
  const height = requirePositiveInteger(image?.height, `IMAGE_${sequence}_HEIGHT`);
  if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
    throw new Error(`IMAGE_PERSISTENCE_DIMENSIONS_MISMATCH:${expectedFileName}`);
  }
  const measured_dimensions = normalizeMeasuredDimensions(image, expectedFileName, `IMAGE_${sequence}`);
  const prompt_use_evidence = normalizePromptUseEvidence(image, expectedFileName, `IMAGE_${sequence}`);
  const sha256 = requireSha256(image?.sha256, `IMAGE_${sequence}_SHA256`);
  const roleMetadata = sequence === 1
    ? verifyTitleImageMetadata(image, expectedFileName, expectedTitle, sha256)
    : verifyArticlePhotoMetadata(image, expectedFileName);
  return Object.freeze({
    sequence,
    ...roleMetadata,
    file_name: fileName,
    file_url: requireGoogleDriveUrl(image?.file_url, `IMAGE_${sequence}_FILE_URL`, /^\/(?:file\/d\/|open)/),
    mime_type: "image/png",
    width,
    height,
    size_bytes: requirePositiveInteger(image?.size_bytes, `IMAGE_${sequence}_SIZE_BYTES`),
    sha256,
    measured_dimensions,
    prompt_use_evidence,
    generated_in_current_conversation: true,
    ...generationProvenance,
    file_in_image_folder: true,
  });
}

function normalizeDiagramVisualQualityReview(reviewInput, diagramSha256) {
  if (!reviewInput || typeof reviewInput !== "object" || Array.isArray(reviewInput)) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_REVIEW_REQUIRED");
  }
  const producerRunId = requireText(reviewInput.producer_run_id, "diagram_visual_quality_producer_run_id");
  const reviewRunId = requireText(reviewInput.review_run_id, "diagram_visual_quality_review_run_id");
  if (producerRunId === reviewRunId) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_INDEPENDENT_REVIEW_REQUIRED");
  }
  const reviewerModel = requireText(reviewInput.reviewer_model, "diagram_visual_quality_reviewer_model");
  const inspectionMethod = requireText(reviewInput.inspection_method, "diagram_visual_quality_inspection_method").toUpperCase();
  if (inspectionMethod !== "ORIGINAL_IMAGE_VISUAL_INSPECTION") {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_INSPECTION_METHOD_INVALID");
  }
  const reviewedSha256 = requireSha256(reviewInput.reviewed_diagram_sha256, "diagram_visual_quality_reviewed_sha256");
  if (reviewedSha256 !== diagramSha256) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_SHA_MISMATCH");
  }
  const benchmarkReference = requireText(
    reviewInput.benchmark_asset_id_or_url ?? reviewInput.benchmark_reference,
    "diagram_visual_quality_benchmark_reference",
  );
  const status = requireText(reviewInput.status, "diagram_visual_quality_status").toUpperCase();
  if (status !== "PASS") throw new Error("IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_REVIEW_NOT_PASS");
  const score = requireNumberInRange(reviewInput.visual_quality_score, "diagram_visual_quality_score", 0, 100);
  if (score < MINIMUM_DIAGRAM_VISUAL_QUALITY_SCORE) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_SCORE_BELOW_MINIMUM");
  }
  const canvasOccupancyPercent = requireNumberInRange(
    reviewInput.canvas_occupancy_percent,
    "diagram_visual_quality_canvas_occupancy_percent",
    0,
    100,
  );
  if (canvasOccupancyPercent < MINIMUM_DIAGRAM_CANVAS_OCCUPANCY_PERCENT) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_LOW_DENSITY");
  }
  if (canvasOccupancyPercent > MAXIMUM_DIAGRAM_CANVAS_OCCUPANCY_PERCENT) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_OVER_CROWDED");
  }
  const checks = reviewInput.checks;
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_CHECKS_REQUIRED");
  }
  const failedChecks = REQUIRED_DIAGRAM_VISUAL_CHECKS.filter((key) => checks[key] !== true);
  if (failedChecks.length) {
    throw new Error(`IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_CHECK_FAILED:${failedChecks.join(",")}`);
  }
  return Object.freeze({
    status: "PASS",
    producer_run_id: producerRunId,
    review_run_id: reviewRunId,
    reviewer_model: reviewerModel,
    inspection_method: inspectionMethod,
    reviewed_diagram_sha256: reviewedSha256,
    benchmark_asset_id_or_url: benchmarkReference,
    visual_quality_score: score,
    canvas_occupancy_percent: canvasOccupancyPercent,
    checks: Object.freeze(Object.fromEntries(REQUIRED_DIAGRAM_VISUAL_CHECKS.map((key) => [key, true]))),
    reviewed_at: requireText(reviewInput.reviewed_at, "diagram_visual_quality_reviewed_at"),
  });
}

function normalizeDiagramImage(image, articleId) {
  const expectedFileName = `${articleId}_diagram_1.png`;
  const fileName = requireText(image?.file_name, "diagram_file_name");
  if (fileName !== expectedFileName) throw new Error(`IMAGE_PERSISTENCE_DIAGRAM_FILE_NAME_MISMATCH:${expectedFileName}`);
  if (String(image?.mime_type || "").trim().toLowerCase() !== "image/png") {
    throw new Error(`IMAGE_PERSISTENCE_DIAGRAM_MIME_TYPE_INVALID:${expectedFileName}`);
  }
  if (image?.generated_in_current_conversation !== true) {
    throw new Error(`IMAGE_PERSISTENCE_DIAGRAM_GENERATION_PROOF_REQUIRED:${expectedFileName}`);
  }
  const generationProvenance = verifyGenerationProvenance(image, expectedFileName);
  if (image?.file_in_image_folder !== true) {
    throw new Error(`IMAGE_PERSISTENCE_DIAGRAM_FOLDER_MEMBERSHIP_REQUIRED:${expectedFileName}`);
  }
  const width = requirePositiveInteger(image?.width, "diagram_width");
  const height = requirePositiveInteger(image?.height, "diagram_height");
  if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
    throw new Error(`IMAGE_PERSISTENCE_DIAGRAM_DIMENSIONS_MISMATCH:${expectedFileName}`);
  }
  const measured_dimensions = normalizeMeasuredDimensions(image, expectedFileName, "DIAGRAM");
  const prompt_use_evidence = normalizePromptUseEvidence(image, expectedFileName, "DIAGRAM");
  const sha256 = requireSha256(image?.sha256, "diagram_sha256");
  const diagramSource = normalizeDiagramSource(image?.diagram_source ?? image?.source_excerpt, image);
  const visualQualityReview = normalizeDiagramVisualQualityReview(
    image?.visual_quality_review ?? image?.diagram_visual_quality_review,
    sha256,
    measured_dimensions,
    prompt_use_evidence,
  );
  return Object.freeze({
    sequence: "diagram_1",
    role: "ARTICLE_DIAGRAM",
    file_name: fileName,
    file_url: requireGoogleDriveUrl(image?.file_url, "diagram_file_url", /^\/(?:file\/d\/|open)/),
    mime_type: "image/png",
    width,
    height,
    size_bytes: requirePositiveInteger(image?.size_bytes, "diagram_size_bytes"),
    sha256,
    generated_in_current_conversation: true,
    ...generationProvenance,
    file_in_image_folder: true,
    diagram_source: diagramSource,
    visual_quality_review: visualQualityReview,
  });
}

function normalizeDiagramSource(sourceInput, image = {}) {
  const source = sourceInput && typeof sourceInput === "object" && !Array.isArray(sourceInput)
    ? sourceInput
    : { source_text: sourceInput };
  const sourceText = requireText(source.source_text ?? source.highlighted_text, "diagram_source_text");
  const textItems = (Array.isArray(source.text_items ?? source.diagram_text_items)
    ? source.text_items ?? source.diagram_text_items
    : [])
    .map((item) => requireText(item, "diagram_text_item"));
  if (textItems.length < 2 || textItems.length > 6) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_TEXT_ITEMS_MUST_BE_2_TO_6");
  }
  for (const item of textItems) {
    if (!sourceText.includes(item) && source.source_derived_labels_verified !== true) {
      throw new Error("IMAGE_PERSISTENCE_DIAGRAM_TEXT_ITEM_NOT_IN_SOURCE_TEXT_OR_VERIFIED_SOURCE_DERIVED_LABEL");
    }
  }
  const renderedTextItems = Array.isArray(source.rendered_text_items ?? image.rendered_text_items)
    ? (source.rendered_text_items ?? image.rendered_text_items).map((item) => requireText(item, "diagram_rendered_text_item"))
    : textItems;
  if (JSON.stringify(renderedTextItems) !== JSON.stringify(textItems)) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_RENDERED_TEXT_MISMATCH");
  }
  if (source.doc_highlighted !== true && source.highlighted_in_document !== true) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_SOURCE_DOCUMENT_HIGHLIGHT_REQUIRED");
  }
  if (source.source_derived_labels_verified !== true && source.exact_text_verified !== true && source.diagram_text_exact_match_verified !== true && image.diagram_text_exact_match_verified !== true) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_SOURCE_DERIVED_TEXT_VERIFICATION_REQUIRED");
  }
  if (source.source_text_matches_diagram_content !== true && image.source_text_matches_diagram_content !== true) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_SOURCE_CONTENT_MATCH_REQUIRED");
  }
  if (source.source_text_is_not_diagram_explanation !== true && image.source_text_is_not_diagram_explanation !== true) {
    throw new Error("IMAGE_PERSISTENCE_DIAGRAM_SOURCE_EXPLANATION_FORBIDDEN");
  }
  const sectionHeading = requireText(
    source.diagram_heading ?? source.section_heading,
    "diagram_source_section_heading",
  );
  const supportingContext = requireText(
    source.supporting_context ?? source.support_text,
    "diagram_source_supporting_context",
  );
  const actionableTakeaway = requireText(
    source.actionable_takeaway ?? source.takeaway,
    "diagram_source_actionable_takeaway",
  );
  return Object.freeze({
    source_text: sourceText,
    text_items: Object.freeze(textItems),
    rendered_text_items: Object.freeze(renderedTextItems),
    section_heading: sectionHeading,
    supporting_context: supportingContext,
    actionable_takeaway: actionableTakeaway,
    highlight_method: optionalText(source.highlight_method) || "DIAGRAM_TAG",
    doc_highlighted: true,
    exact_text_verified: source.exact_text_verified === true || source.diagram_text_exact_match_verified === true || image.diagram_text_exact_match_verified === true,
    source_derived_labels_verified: source.source_derived_labels_verified === true,
    source_text_matches_diagram_content: true,
    source_text_is_not_diagram_explanation: true,
  });
}

export function verifyImagePersistence(input = {}, expectedScope = {}) {
  const clientId = requireText(input.client_id ?? expectedScope.client_id, "client_id");
  const articleId = requireText(input.article_id ?? expectedScope.article_id, "article_id");
  const expectedTitle = optionalText(input.article_title ?? input.title ?? expectedScope.article_title ?? expectedScope.title);
  if (expectedScope.client_id && clientId !== String(expectedScope.client_id).trim()) throw new Error("IMAGE_PERSISTENCE_CLIENT_SCOPE_MISMATCH");
  if (expectedScope.article_id && articleId !== String(expectedScope.article_id).trim()) throw new Error("IMAGE_PERSISTENCE_ARTICLE_SCOPE_MISMATCH");
  const imageFolderUrl = requireGoogleDriveUrl(input.image_folder_url, "image_folder_url", /^\/drive\/folders\//);
  if (!Array.isArray(input.images) || input.images.length !== EXPECTED_IMAGE_COUNT) {
    throw new Error(`IMAGE_PERSISTENCE_REQUIRES_${EXPECTED_IMAGE_COUNT}_IMAGES`);
  }
  const images = Object.freeze(input.images.map((image, index) => normalizeImage(image, index, articleId, expectedTitle)));
  if (new Set(images.map((image) => image.sha256)).size !== EXPECTED_IMAGE_COUNT) {
    throw new Error("IMAGE_PERSISTENCE_DUPLICATE_IMAGE_CONTENT");
  }
  const sheet = input.sheet_persistence;
  if (!sheet || typeof sheet !== "object" || Array.isArray(sheet)) throw new Error("IMAGE_PERSISTENCE_SHEET_PERSISTENCE_REQUIRED");
  if (sheet.reloaded_after_write !== true) throw new Error("IMAGE_PERSISTENCE_SHEET_RELOAD_REQUIRED");
  const sheetFolderUrl = requireGoogleDriveUrl(sheet.image_folder_url, "sheet_image_folder_url", /^\/drive\/folders\//);
  if (sheetFolderUrl !== imageFolderUrl) throw new Error("IMAGE_PERSISTENCE_SHEET_FOLDER_URL_MISMATCH");
  const completedOn = requireText(sheet.completed_on, "sheet_completed_on");

  return Object.freeze({
    status: "VERIFIED_IMAGE_SET",
    client_id: clientId,
    article_id: articleId,
    title: expectedTitle || null,
    title_image_count: EXPECTED_TITLE_IMAGE_COUNT,
    article_photo_count: EXPECTED_ARTICLE_PHOTO_COUNT,
    image_count: EXPECTED_IMAGE_COUNT,
    image_folder_url: imageFolderUrl,
    images,
    sheet_persistence: Object.freeze({
      completed_on: completedOn,
      image_folder_url: sheetFolderUrl,
      reloaded_after_write: true,
      verified_at: String(sheet.verified_at || "").trim() || null,
    }),
  });
}

export function verifyArticleVisualPersistence(input = {}, expectedScope = {}) {
  const base = verifyImagePersistence(input, expectedScope);
  const diagramImage = normalizeDiagramImage(input.diagram_image, base.article_id);
  const imageFolderFiles = verifyImageFolderFileListing(input.image_folder_files, [
    ...base.images.map((image) => image.file_name),
    diagramImage.file_name,
  ]);
  const hashes = [...base.images.map((image) => image.sha256), diagramImage.sha256];
  if (new Set(hashes).size !== EXPECTED_IMAGE_COUNT + EXPECTED_DIAGRAM_COUNT) {
    throw new Error("IMAGE_PERSISTENCE_DUPLICATE_VISUAL_CONTENT");
  }
  const sheet = input.sheet_persistence;
  if (sheet.diagram_reloaded_after_write !== true) throw new Error("IMAGE_PERSISTENCE_DIAGRAM_SHEET_RELOAD_REQUIRED");
  const diagramCompletedOn = requireText(sheet.diagram_completed_on, "sheet_diagram_completed_on");
  return Object.freeze({
    status: "VERIFIED_ARTICLE_VISUAL_SET",
    client_id: base.client_id,
    article_id: base.article_id,
    title: base.title,
    title_image_count: EXPECTED_TITLE_IMAGE_COUNT,
    article_photo_count: EXPECTED_ARTICLE_PHOTO_COUNT,
    image_count: EXPECTED_IMAGE_COUNT,
    diagram_count: EXPECTED_DIAGRAM_COUNT,
    total_visual_count: EXPECTED_IMAGE_COUNT + EXPECTED_DIAGRAM_COUNT,
    image_folder_url: base.image_folder_url,
    images: base.images,
    diagram_image: diagramImage,
    image_folder_files: imageFolderFiles,
    sheet_persistence: Object.freeze({
      ...base.sheet_persistence,
      diagram_completed_on: diagramCompletedOn,
      diagram_reloaded_after_write: true,
    }),
  });
}

export const STANDARD_IMAGE_REQUIREMENTS = Object.freeze({
  title_image_count: EXPECTED_TITLE_IMAGE_COUNT,
  article_photo_count: EXPECTED_ARTICLE_PHOTO_COUNT,
  image_count: EXPECTED_IMAGE_COUNT,
  diagram_count: EXPECTED_DIAGRAM_COUNT,
  total_visual_count: EXPECTED_IMAGE_COUNT + EXPECTED_DIAGRAM_COUNT,
  width: EXPECTED_WIDTH,
  height: EXPECTED_HEIGHT,
  allowed_generation_methods: ["image_gen", "conversation_image_generation", "codex_image_generation", "chatgpt_image_generation", "image_generation_tool"],
  forbidden_generation_methods: ["PIL", "ImageDraw", "Image.new", "build_articles.py", "local script", "template", "placeholder"],
  title_image_file_name: "{article_id}_1.png",
  article_photo_file_names: "{article_id}_2.png ... {article_id}_4.png",
  file_names: "{article_id}_1.png ... {article_id}_4.png",
  diagram_file_name: "{article_id}_diagram_1.png",
  diagram_source_highlight_required: true,
  diagram_exact_text_match_required: true,
  diagram_visual_quality_review_required: true,
  diagram_visual_quality_minimum_score: MINIMUM_DIAGRAM_VISUAL_QUALITY_SCORE,
  diagram_visual_quality_canvas_occupancy_percent: Object.freeze({
    minimum: MINIMUM_DIAGRAM_CANVAS_OCCUPANCY_PERCENT,
    maximum: MAXIMUM_DIAGRAM_CANVAS_OCCUPANCY_PERCENT,
  }),
  diagram_visual_quality_required_checks: REQUIRED_DIAGRAM_VISUAL_CHECKS,
  title_visual_quality_review_required: true,
  title_visual_quality_minimum_score: MINIMUM_TITLE_VISUAL_QUALITY_SCORE,
  title_visual_quality_required_checks: REQUIRED_TITLE_VISUAL_CHECKS,
  prepared_prompt_hash_match_required: true,
  generation_call_id_required: true,
  measured_file_dimensions_required: true,
  readable_text_rule_applies_to: ["TITLE_IMAGE_BACKGROUND", "ARTICLE_PHOTO_BACKGROUND"],
  readable_text_rule_excludes: ["ARTICLE_DIAGRAM"],
  title_image_evidence: "The first image must contain title_text matching the article title and title_text_in_image=true or title_text_verified=true.",
});
