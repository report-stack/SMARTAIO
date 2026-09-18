const STANDARD_CLIENT_RUN_CHECKPOINTS = Object.freeze([
  Object.freeze({ key: "smartaio_client_folder_direct_child", stage: "ONBOARDING", description: "SMARTAIO本番Drive直下に対象クライアントフォルダーがある" }),
  Object.freeze({ key: "folder_structure_verified", stage: "ONBOARDING", description: "顧客フォルダー7件だけが作成されている" }),
  Object.freeze({ key: "source_register_created_empty", stage: "ONBOARDING", description: "01_一次情報に空の一次情報台帳がある" }),
  Object.freeze({ key: "production_sheet_headers_verified", stage: "ONBOARDING", description: "記事制作シート6タブと標準ヘッダーが一致している" }),
  Object.freeze({ key: "settings_sheet_client_context_populated", stage: "ONBOARDING", description: "設定タブにclient_id、顧客名、Drive URL、一次情報台帳URLが記録されている" }),
  Object.freeze({ key: "site_title_confirmation", stage: "ONBOARDING_CONFIRMATION", description: "基本情報、カテゴリ、ピラー、サイトタイトル案への利用者確認がある" }),
  Object.freeze({ key: "news_settings_template", stage: "POST_ONBOARDING", description: "06_ニュースにenabled=falseのニュース設定ひな型がある" }),
  Object.freeze({ key: "keyword_sheet_populated", stage: "KW_RESEARCH", description: "キーワードシートに候補KWと検索実測または取得不能理由が記録されている" }),
  Object.freeze({ key: "plan_confirmation_sheet_approved", stage: "ARTICLE_PLAN", description: "企画確認シートで記事トピック、種別、ピラー、クラスター、タイトル案、対策キーワード、検索意図、AI引用戦略がクライアント承認済みである" }),
  Object.freeze({ key: "article_plan_user_confirmation", stage: "ARTICLE_PLAN", description: "記事作成依頼後、本文・画像・Drive保存・Sheets更新の前に、タイトル、記事カテゴリ、ハッシュタグ、検索意図、責任ラベル、今回作る記事内容を利用者へ提示し、明示了承を得ている" }),
  Object.freeze({ key: "article_category_and_tags_confirmed", stage: "ARTICLE_PLAN", description: "記事カテゴリとハッシュタグを利用者へ提示し、企画確認に含めている" }),
  Object.freeze({ key: "outline_review_recorded", stage: "OUTLINE_AI_REVIEW", description: "作成と別run_idの骨子レビューが記録されている" }),
  Object.freeze({ key: "article_document_saved", stage: "DRAFT_OUTPUT", description: "記事Googleドキュメントが03_記事/{記事ID}に保存されている" }),
  Object.freeze({ key: "article_document_format_verified", stage: "DRAFT_OUTPUT", description: "記事冒頭の導入文・3項目・要約、本文4000〜6000文字、黄色マーカー2〜4箇所、まとめ、Q&A 5件をGoogleドキュメント再読込で確認している" }),
  Object.freeze({ key: "article_tag_and_source_sections_absent", stage: "DRAFT_OUTPUT", description: "記事Googleドキュメント本文にタグ・出典セクションが表示されず、制作用タグ文字列も可視テキストとして残っていない" }),
  Object.freeze({ key: "article_json_saved", stage: "DRAFT_OUTPUT", description: "記事JSONが03_記事/{記事ID}に保存されている" }),
  Object.freeze({ key: "structured_markup_saved", stage: "DRAFT_OUTPUT", description: "構造化マークアップJSON-LDが03_記事/{記事ID}に保存されている" }),
  Object.freeze({ key: "structured_markup_verified", stage: "DRAFT_OUTPUT", description: "Article、BreadcrumbList、本文Q&A 5件と同期したFAQPage、必要に応じてHowToの構造化マークアップを検証している" }),
  Object.freeze({ key: "final_review_recorded", stage: "QUALITY_REVIEW", description: "作成と別run_idの完成物レビューが記録されている" }),
  Object.freeze({ key: "image_persistence_verified", stage: "FINISHING", description: "タイトル画像1枚と通常画像3枚のPNG、1536x1024、SHA、画像フォルダー所属、シート再読込が検証済みである" }),
  Object.freeze({ key: "diagram_image_verified", stage: "FINISHING", description: "図解PNG、1536x1024、SHA、画像フォルダー所属、シート再読込に加え、同一SHAを原寸確認した独立視覚レビューが85点以上で、必須品質項目が全件合格している" }),
  Object.freeze({ key: "article_images_embedded_in_document", stage: "FINISHING", description: "タイトル画像1枚、通常画像3枚、図解1枚が記事Googleドキュメント内に配置され、図解は色付けした元段落の直後にある" }),
  Object.freeze({ key: "internal_link_graph_verified", stage: "FINISHING", description: "新記事から既存記事への内部リンクと、既存記事側の戻しリンク更新計画が検証済みである" }),
  Object.freeze({ key: "cluster_sheet_updated", stage: "OUTPUT", description: "クラスターシートに対象記事行が追加されている" }),
  Object.freeze({ key: "central_article_index_updated", stage: "OUTPUT", description: "中央の記事台帳に対象記事の索引・監査行がある" }),
  Object.freeze({ key: "audit_log_recorded", stage: "AUDIT", description: "実行履歴にrun_id、client_id、article_id、結果が記録されている" }),
]);

function requireText(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`STANDARD_RUN_AUDIT_${field.toUpperCase()}_REQUIRED`);
  return text;
}

function checkpointPassSet(input = {}) {
  if (Array.isArray(input.actual_checkpoints)) {
    return new Set(input.actual_checkpoints
      .filter((item) => item?.status === "PASS")
      .map((item) => String(item.key || "").trim())
      .filter(Boolean));
  }
  const evidence = input.evidence && typeof input.evidence === "object" ? input.evidence : input;
  return new Set(Object.entries(evidence)
    .filter(([, value]) => value === true || value === "PASS")
    .map(([key]) => key));
}

function requireNonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`ARTICLE_DOCUMENT_READBACK_${field.toUpperCase()}_INVALID`);
  }
  return number;
}

function requirePositiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`ARTICLE_DOCUMENT_READBACK_${field.toUpperCase()}_INVALID`);
  }
  return number;
}

function requireBooleanTrue(value, field) {
  if (value !== true) throw new Error(`ARTICLE_DOCUMENT_READBACK_${field.toUpperCase()}_REQUIRED`);
  return true;
}

function requireSha256(value, field) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) {
    throw new Error(`ARTICLE_DOCUMENT_READBACK_${field.toUpperCase()}_INVALID`);
  }
  return text;
}

function requireExactText(value, expected, field) {
  const text = requireText(value, field);
  if (expected !== undefined && expected !== null && text !== String(expected).trim()) {
    throw new Error(`ARTICLE_DOCUMENT_READBACK_${field.toUpperCase()}_MISMATCH`);
  }
  return text;
}

function normalizeReadbackImages(input, expectedImages, articleId) {
  if (!Array.isArray(input) || input.length !== 5 || !Array.isArray(expectedImages) || expectedImages.length !== 5) {
    throw new Error("ARTICLE_DOCUMENT_READBACK_EMBEDDED_IMAGES_EXACT_SET_REQUIRED");
  }
  const requiredRoles = ["TITLE_IMAGE", "ARTICLE_PHOTO", "ARTICLE_PHOTO", "ARTICLE_PHOTO", "DIAGRAM"];
  const requiredFileNames = [
    `${articleId}_1.png`,
    `${articleId}_2.png`,
    `${articleId}_3.png`,
    `${articleId}_4.png`,
    `${articleId}_diagram_1.png`,
  ];
  const normalizedImages = input.map((image, index) => {
    const expected = expectedImages[index];
    const normalized = Object.freeze({
      sequence: requirePositiveInteger(image?.sequence, `embedded_images_${index + 1}_sequence`),
      image_role: requireExactText(image?.image_role, expected.image_role, `embedded_images_${index + 1}_image_role`),
      file_name: requireExactText(image?.file_name, expected.file_name, `embedded_images_${index + 1}_file_name`),
      file_url: requireExactText(image?.file_url ?? image?.source_file_url, expected.file_url, `embedded_images_${index + 1}_file_url`),
      sha256: requireSha256(image?.sha256, `embedded_images_${index + 1}_sha256`),
      object_id: requireText(image?.object_id, `embedded_images_${index + 1}_object_id`),
    });
    if (normalized.sequence !== index + 1) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_EMBEDDED_IMAGES_${index + 1}_SEQUENCE_MISMATCH`);
    }
    if (normalized.image_role !== requiredRoles[index]) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_EMBEDDED_IMAGES_${index + 1}_IMAGE_ROLE_MISMATCH`);
    }
    if (normalized.file_name !== requiredFileNames[index]) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_EMBEDDED_IMAGES_${index + 1}_FILE_NAME_MISMATCH`);
    }
    if (normalized.sha256 !== expected.sha256) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_EMBEDDED_IMAGES_${index + 1}_SHA256_MISMATCH`);
    }
    return normalized;
  });
  for (const field of ["file_url", "sha256", "object_id"]) {
    if (new Set(normalizedImages.map((image) => image[field])).size !== normalizedImages.length) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_EMBEDDED_IMAGES_${field.toUpperCase()}_UNIQUE_REQUIRED`);
    }
  }
  return Object.freeze(normalizedImages);
}

function normalizeReadbackLinks(input, expectedLinks) {
  if (!Array.isArray(input) || input.length !== expectedLinks.length) {
    throw new Error("ARTICLE_DOCUMENT_READBACK_INTERNAL_LINKS_EXACT_SET_REQUIRED");
  }
  return Object.freeze(input.map((link, index) => {
    const targetUrl = requireExactText(link?.target_url, expectedLinks[index].target_url, `internal_links_${index + 1}_target_url`);
    const anchorText = requireExactText(link?.anchor_text, expectedLinks[index].anchor_text, `internal_links_${index + 1}_anchor_text`);
    if (link?.native_link_verified !== true) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_INTERNAL_LINKS_${index + 1}_NATIVE_LINK_REQUIRED`);
    }
    if (link?.bare_url_visible === true || String(link?.visible_text || "").trim() === targetUrl) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_INTERNAL_LINKS_${index + 1}_BARE_URL_FORBIDDEN`);
    }
    if (!String(link?.visible_text || "").includes(anchorText)) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_INTERNAL_LINKS_${index + 1}_VISIBLE_ANCHOR_TEXT_REQUIRED`);
    }
    if (link?.after_qa !== true) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_INTERNAL_LINKS_${index + 1}_AFTER_QA_REQUIRED`);
    }
    if (String(link?.section_label || "").trim() !== "関連記事") {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_INTERNAL_LINKS_${index + 1}_RELATED_ARTICLES_LABEL_REQUIRED`);
    }
    if (link?.section_is_heading === true) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_INTERNAL_LINKS_${index + 1}_RELATED_ARTICLES_HEADING_FORBIDDEN`);
    }
    return Object.freeze({
      anchor_text: anchorText,
      target_url: targetUrl,
      visible_text: requireText(link?.visible_text, `internal_links_${index + 1}_visible_text`),
      native_link_verified: true,
      bare_url_visible: false,
      section_label: "関連記事",
      after_qa: true,
      section_is_heading: false,
    });
  }));
}

const REQUIRED_WORDPRESS_HIGHLIGHT_BLOCKS = Object.freeze({
  key_points: Object.freeze({ label: "この記事でわかること", count: 1, item_count: 3 }),
  article_summary: Object.freeze({ label: "この記事の要約", count: 1, preserve_line_breaks: true }),
  conclusion_summary: Object.freeze({ label: "この記事のまとめ", count: 1, preserve_line_breaks: true }),
  qa: Object.freeze({ label: "Q&A", count: 5, qa_pair_per_block: true }),
});

function normalizeWordPressHighlightBlocks(input) {
  const source = input?.wordpress_highlight_blocks ?? input?.highlight_blocks ?? input?.colored_blocks;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("ARTICLE_DOCUMENT_READBACK_WORDPRESS_HIGHLIGHT_BLOCKS_REQUIRED");
  }
  const normalized = {};
  for (const [key, rule] of Object.entries(REQUIRED_WORDPRESS_HIGHLIGHT_BLOCKS)) {
    const block = source[key];
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_WORDPRESS_HIGHLIGHT_BLOCK_${key.toUpperCase()}_REQUIRED`);
    }
    const count = requireNonNegativeInteger(block.block_count ?? block.count, `wordpress_highlight_blocks_${key}_block_count`);
    if (count !== rule.count) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_WORDPRESS_HIGHLIGHT_BLOCK_${key.toUpperCase()}_COUNT_MISMATCH`);
    }
    if (rule.item_count !== undefined) {
      const itemCount = requireNonNegativeInteger(block.item_count, `wordpress_highlight_blocks_${key}_item_count`);
      if (itemCount !== rule.item_count) {
        throw new Error(`ARTICLE_DOCUMENT_READBACK_WORDPRESS_HIGHLIGHT_BLOCK_${key.toUpperCase()}_ITEM_COUNT_MISMATCH`);
      }
    }
    if (rule.preserve_line_breaks && block.line_breaks_preserved !== true) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_WORDPRESS_HIGHLIGHT_BLOCK_${key.toUpperCase()}_LINE_BREAKS_REQUIRED`);
    }
    if (rule.qa_pair_per_block && block.qa_pair_per_block !== true) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_WORDPRESS_HIGHLIGHT_BLOCK_${key.toUpperCase()}_PAIR_REQUIRED`);
    }
    if (block.separate_question_answer_blocks === true) {
      throw new Error(`ARTICLE_DOCUMENT_READBACK_WORDPRESS_HIGHLIGHT_BLOCK_${key.toUpperCase()}_QUESTION_ANSWER_SPLIT_FORBIDDEN`);
    }
    normalized[key] = Object.freeze({
      label: rule.label,
      block_count: count,
      item_count: block.item_count === undefined ? null : Number(block.item_count),
      line_breaks_preserved: rule.preserve_line_breaks ? true : block.line_breaks_preserved === true,
      qa_pair_per_block: rule.qa_pair_per_block ? true : block.qa_pair_per_block === true,
      separate_question_answer_blocks: false,
    });
  }
  return Object.freeze(normalized);
}

export function verifyArticleDocumentReadbackEvidence(input, expected = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("ARTICLE_DOCUMENT_READBACK_EVIDENCE_REQUIRED");
  }
  const clientId = requireExactText(input.client_id, expected.client_id, "client_id");
  const articleId = requireExactText(input.article_id, expected.article_id, "article_id");
  const documentId = requireExactText(input.document_id, expected.document_id, "document_id");
  const revisionId = requireText(input.revision_id, "revision_id");
  const normalizedCharacterCount = requirePositiveInteger(input.normalized_character_count, "normalized_character_count");
  if (expected.normalized_character_count !== undefined && normalizedCharacterCount !== expected.normalized_character_count) {
    throw new Error("ARTICLE_DOCUMENT_READBACK_NORMALIZED_CHARACTER_COUNT_MISMATCH");
  }
  const readbackSha256 = requireSha256(input.readback_sha256, "readback_sha256");
  if (expected.readback_sha256 && readbackSha256 !== String(expected.readback_sha256).trim().toLowerCase()) {
    throw new Error("ARTICLE_DOCUMENT_READBACK_SHA256_MISMATCH");
  }
  const markerCount = requireNonNegativeInteger(input.marker_count, "marker_count");
  if (markerCount < 2 || markerCount > 4) throw new Error("ARTICLE_DOCUMENT_READBACK_MARKER_COUNT_MUST_BE_TWO_TO_FOUR");
  const diagramSourceCount = requireNonNegativeInteger(input.diagram_source_count, "diagram_source_count");
  if (diagramSourceCount !== 1) throw new Error("ARTICLE_DOCUMENT_READBACK_DIAGRAM_SOURCE_EXACTLY_ONE_REQUIRED");
  const inlineObjectCount = requireNonNegativeInteger(input.inline_object_count, "inline_object_count");
  if (inlineObjectCount !== 5) throw new Error("ARTICLE_DOCUMENT_READBACK_EXACTLY_FIVE_IMAGES_REQUIRED");
  const existingArticleCount = requireNonNegativeInteger(
    input.existing_article_count ?? expected.existing_article_count ?? 1,
    "existing_article_count",
  );
  const internalLinkCount = requireNonNegativeInteger(input.internal_link_count, "internal_link_count");
  if (existingArticleCount > 0 && internalLinkCount < 1) throw new Error("ARTICLE_DOCUMENT_READBACK_INTERNAL_LINK_REQUIRED");
  if (existingArticleCount === 0 && internalLinkCount !== 0) throw new Error("ARTICLE_DOCUMENT_READBACK_INTERNAL_LINKS_MUST_BE_EMPTY_WITHOUT_CANDIDATES");
  const qaCount = requireNonNegativeInteger(input.qa_count, "qa_count");
  if (qaCount !== 5) throw new Error("ARTICLE_DOCUMENT_READBACK_QA_EXACTLY_FIVE_REQUIRED");
  const visibleTagCount = requireNonNegativeInteger(input.visible_standard_tag_count, "visible_standard_tag_count");
  if (visibleTagCount !== 0) throw new Error("ARTICLE_DOCUMENT_READBACK_RAW_STANDARD_TAGS_FORBIDDEN");
  const visibleMarkdownHeadingCount = requireNonNegativeInteger(input.visible_markdown_heading_count, "visible_markdown_heading_count");
  if (visibleMarkdownHeadingCount !== 0) throw new Error("ARTICLE_DOCUMENT_READBACK_MARKDOWN_HEADINGS_FORBIDDEN");
  const visibleMarkdownTableRowCount = requireNonNegativeInteger(input.visible_markdown_table_row_count, "visible_markdown_table_row_count");
  if (visibleMarkdownTableRowCount !== 0) throw new Error("ARTICLE_DOCUMENT_READBACK_MARKDOWN_TABLE_ROWS_FORBIDDEN");
  const bareUrlParagraphCount = requireNonNegativeInteger(input.bare_url_paragraph_count, "bare_url_paragraph_count");
  if (bareUrlParagraphCount !== 0) throw new Error("ARTICLE_DOCUMENT_READBACK_BARE_URL_PARAGRAPHS_FORBIDDEN");
  const articleLength = requirePositiveInteger(input.article_length, "article_length");
  if (articleLength < 4000 || articleLength > 6000) throw new Error("ARTICLE_DOCUMENT_READBACK_ARTICLE_LENGTH_MUST_BE_4000_TO_6000");
  const keyPointsCount = requireNonNegativeInteger(input.key_points_count, "key_points_count");
  if (keyPointsCount !== 3) throw new Error("ARTICLE_DOCUMENT_READBACK_KEY_POINTS_EXACTLY_THREE_REQUIRED");
  requireBooleanTrue(input.has_key_points_section, "has_key_points_section");
  requireBooleanTrue(input.has_article_summary_section, "has_article_summary_section");
  requireBooleanTrue(input.has_conclusion_section, "has_conclusion_section");
  requireBooleanTrue(input.has_qa_section, "has_qa_section");
  if (input.has_tag_section === true || input.has_source_section === true) {
    throw new Error("ARTICLE_DOCUMENT_READBACK_TAG_OR_SOURCE_SECTION_FORBIDDEN");
  }
  if (existingArticleCount > 0) requireBooleanTrue(input.has_related_articles_section, "has_related_articles_section");
  if (existingArticleCount > 0 && input.related_articles_section_is_heading === true) {
    throw new Error("ARTICLE_DOCUMENT_READBACK_RELATED_ARTICLES_HEADING_FORBIDDEN");
  }
  requireBooleanTrue(input.heading_order_verified, "heading_order_verified");
  requireBooleanTrue(input.native_heading_styles_verified, "native_heading_styles_verified");
  requireBooleanTrue(input.native_bullets_verified, "native_bullets_verified");
  requireBooleanTrue(input.marker_text_style_verified, "marker_text_style_verified");
  requireBooleanTrue(input.diagram_source_background_verified, "diagram_source_background_verified");
  if (existingArticleCount > 0) {
    requireBooleanTrue(input.internal_links_native_hyperlinks_verified, "internal_links_native_hyperlinks_verified");
  }
  requireBooleanTrue(input.diagram_immediately_after_source, "diagram_immediately_after_source");
  requireBooleanTrue(input.image_order_verified, "image_order_verified");
  requireBooleanTrue(input.reloaded_after_write, "reloaded_after_write");
  const expectedImages = expected.embedded_images || input.embedded_images || [];
  const embeddedImages = normalizeReadbackImages(input.embedded_images, expectedImages, articleId);
  if (inlineObjectCount !== embeddedImages.length) {
    throw new Error("ARTICLE_DOCUMENT_READBACK_INLINE_OBJECT_COUNT_MISMATCH");
  }
  const expectedLinks = expected.internal_links || input.internal_links || [];
  const internalLinks = normalizeReadbackLinks(input.internal_links, expectedLinks);
  if (internalLinkCount !== internalLinks.length) {
    throw new Error("ARTICLE_DOCUMENT_READBACK_INTERNAL_LINK_COUNT_MISMATCH");
  }
  const wordpressHighlightBlocks = normalizeWordPressHighlightBlocks(input);
  return Object.freeze({
    status: "VERIFIED_ARTICLE_DOCUMENT_READBACK",
    client_id: clientId,
    article_id: articleId,
    document_id: documentId,
    revision_id: revisionId,
    normalized_character_count: normalizedCharacterCount,
    readback_sha256: readbackSha256,
    marker_count: markerCount,
    diagram_source_count: diagramSourceCount,
    inline_object_count: inlineObjectCount,
    existing_article_count: existingArticleCount,
    internal_link_count: internalLinkCount,
    qa_count: qaCount,
    visible_standard_tag_count: visibleTagCount,
    visible_markdown_heading_count: visibleMarkdownHeadingCount,
    visible_markdown_table_row_count: visibleMarkdownTableRowCount,
    bare_url_paragraph_count: bareUrlParagraphCount,
    article_length: articleLength,
    key_points_count: keyPointsCount,
    has_key_points_section: true,
    has_article_summary_section: true,
    has_conclusion_section: true,
    has_qa_section: true,
    has_tag_section: false,
    has_source_section: false,
    has_related_articles_section: existingArticleCount > 0,
    related_articles_section_is_heading: false,
    heading_order_verified: true,
    native_heading_styles_verified: true,
    native_bullets_verified: true,
    marker_text_style_verified: true,
    diagram_source_background_verified: true,
    internal_links_native_hyperlinks_verified: existingArticleCount > 0,
    diagram_immediately_after_source: true,
    image_order_verified: true,
    embedded_images: embeddedImages,
    internal_links: internalLinks,
    wordpress_highlight_blocks: wordpressHighlightBlocks,
    reloaded_after_write: true,
  });
}

export function auditStandardClientRun(input = {}) {
  const clientId = requireText(input.client_id, "client_id");
  const articleId = requireText(input.article_id, "article_id");
  const passed = checkpointPassSet(input);
  const missing = STANDARD_CLIENT_RUN_CHECKPOINTS.filter((item) => !passed.has(item.key));
  return Object.freeze({
    status: missing.length ? "STANDARD_CLIENT_RUN_AUDIT_REQUIRED" : "STANDARD_CLIENT_RUN_AUDIT_PASS",
    client_id: clientId,
    article_id: articleId,
    required_checkpoints: STANDARD_CLIENT_RUN_CHECKPOINTS,
    missing_checkpoints: Object.freeze(missing),
    completion_report_allowed: missing.length === 0,
    failure_stage: missing[0]?.stage || null,
  });
}

export function requireStandardClientRunAudit(input = {}, expected = {}) {
  const hasRawEvidence = Array.isArray(input?.actual_checkpoints)
    || (input?.evidence && typeof input.evidence === "object" && !Array.isArray(input.evidence));
  if (!hasRawEvidence) throw new Error("COMPLETION_REPORT_STANDARD_RUN_AUDIT_EVIDENCE_REQUIRED");
  const audit = auditStandardClientRun(input);
  const clientId = requireText(expected.client_id ?? audit.client_id, "client_id");
  const articleId = requireText(expected.article_id ?? audit.article_id, "article_id");
  if (String(audit.client_id || "").trim() !== clientId) throw new Error("STANDARD_RUN_AUDIT_CLIENT_SCOPE_MISMATCH");
  if (String(audit.article_id || "").trim() !== articleId) throw new Error("STANDARD_RUN_AUDIT_ARTICLE_SCOPE_MISMATCH");
  if (audit.status !== "STANDARD_CLIENT_RUN_AUDIT_PASS" || audit.completion_report_allowed !== true) {
    const missing = (audit.missing_checkpoints || []).map((item) => item.key).join(",");
    throw new Error(`COMPLETION_REPORT_STANDARD_RUN_AUDIT_REQUIRED:${missing}`);
  }
  return Object.freeze({
    status: "STANDARD_CLIENT_RUN_AUDIT_PASS",
    client_id: clientId,
    article_id: articleId,
    required_checkpoints: audit.required_checkpoints || STANDARD_CLIENT_RUN_CHECKPOINTS,
    missing_checkpoints: Object.freeze([]),
    completion_report_allowed: true,
    failure_stage: null,
  });
}

export { STANDARD_CLIENT_RUN_CHECKPOINTS };
