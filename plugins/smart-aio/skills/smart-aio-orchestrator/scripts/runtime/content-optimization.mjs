import { createHash } from "node:crypto";
import { requireClientId } from "./client-scope.mjs";

function requireText(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`CONTENT_OPTIMIZATION_${field.toUpperCase()}_REQUIRED`);
  return text;
}

function optionalText(value) {
  return String(value ?? "").trim();
}

function firstNonEmpty(...values) {
  return values.map(optionalText).find(Boolean) || "";
}

function requireUrl(value, field) {
  const text = requireText(value, field);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`CONTENT_OPTIMIZATION_${field.toUpperCase()}_INVALID`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error(`CONTENT_OPTIMIZATION_${field.toUpperCase()}_INVALID`);
  }
  parsed.hash = "";
  return parsed.toString();
}

function requirePublicArticleUrl(value, field) {
  const url = requireUrl(value, field);
  const host = new URL(url).hostname;
  if (host === "drive.google.com" || host === "docs.google.com") {
    throw new Error(`CONTENT_OPTIMIZATION_${field.toUpperCase()}_MUST_BE_PUBLIC_ARTICLE_URL`);
  }
  return url;
}

function resolvePublicArticleUrl(article = {}, field = "public_url") {
  const publicUrl = firstNonEmpty(article.public_url, article["公開URL"]);
  if (publicUrl) return requirePublicArticleUrl(publicUrl, field);
  const compatWordPressUrl = firstNonEmpty(article.wordpress_url, article.WordPressURL, article["WordPressURL"]);
  if (compatWordPressUrl) return requirePublicArticleUrl(compatWordPressUrl, `${field}_compat_wordpress_url`);
  if (firstNonEmpty(article.article_url, article["記事URL"], article.url)) {
    throw new Error(`CONTENT_OPTIMIZATION_${field.toUpperCase()}_ARTICLE_URL_FORBIDDEN`);
  }
  throw new Error("CONTENT_OPTIMIZATION_INTERNAL_LINK_PUBLIC_URL_REQUIRED");
}

function linkStatusLabel(url) {
  return /(^|\.)example(\.|$)/.test(new URL(url).hostname) || url.includes("PENDING_PUBLICATION_URL")
    ? "公開前予定URL"
    : "URL";
}

function requireGoogleDriveFolderUrl(value, field) {
  const url = requireUrl(value, field);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "drive.google.com" || !parsed.pathname.startsWith("/drive/folders/")) {
    throw new Error(`CONTENT_OPTIMIZATION_${field.toUpperCase()}_INVALID`);
  }
  return url;
}

function requireGoogleDriveFileUrl(value, field) {
  const url = requireUrl(value, field);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "drive.google.com" || !parsed.pathname.startsWith("/file/d/")) {
    throw new Error(`CONTENT_OPTIMIZATION_${field.toUpperCase()}_INVALID`);
  }
  return url;
}

function toWordPressJsonLdCopyContent(jsonLdContent) {
  const content = requireText(jsonLdContent, "structured_markup_content");
  return `<script type="application/ld+json">\n${content.trim()}\n</script>\n`;
}

function normalizeDateKey(value, field = "rewrite_date") {
  const text = requireText(value, field);
  const compact = text.replace(/[/-]/g, "");
  if (!/^\d{8}$/.test(compact)) throw new Error(`CONTENT_OPTIMIZATION_${field.toUpperCase()}_INVALID`);
  return compact;
}

function normalizeRewriteSequence(value) {
  const sequence = Number(value ?? 1);
  if (!Number.isInteger(sequence) || sequence <= 0 || sequence > 99) {
    throw new Error("CONTENT_OPTIMIZATION_REWRITE_SEQUENCE_INVALID");
  }
  return sequence;
}

function articleNumberKey(articleId) {
  const match = /^ID-(\d{5,})$/.exec(articleId);
  if (!match) throw new Error("CONTENT_OPTIMIZATION_ARTICLE_ID_INVALID");
  return String(Number(match[1])).padStart(4, "0");
}

function assertClientRecords(records, clientId, label) {
  if (!Array.isArray(records)) throw new TypeError(`${label} must be an array`);
  return Object.freeze(records.map((record, index) => {
    if (String(record?.client_id || "").trim() !== clientId) {
      throw new Error(`CROSS_CLIENT_DATA_DETECTED:${label}[${index}]`);
    }
    return Object.freeze({ ...record, client_id: clientId });
  }));
}

function words(value) {
  return new Set(String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .split(/\s+/)
    .filter((item) => item.length >= 2));
}

function similarity(left, right) {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const item of a) if (b.has(item)) hits += 1;
  return hits / (a.size + b.size - hits);
}

function articleText(article = {}) {
  return [
    article.title,
    article.category,
    article.searchIntent,
    article.basicInfo?.searchIntent,
    article.responsibilityLabel,
    article.summary,
    article.description,
    article.conclusionSummary,
    article.deepDive?.conclusion,
  ].filter(Boolean).join(" ");
}

function normalizeRelatedArticlesPlacement(link = {}) {
  const placement = link.placement && typeof link.placement === "object" && !Array.isArray(link.placement)
    ? link.placement
    : link.related_articles_placement && typeof link.related_articles_placement === "object" && !Array.isArray(link.related_articles_placement)
      ? link.related_articles_placement
      : {};
  const placementType = String(placement.type ?? placement.placement_type ?? link.placement_type ?? "").trim().toUpperCase();
  if (placementType && placementType !== "RELATED_ARTICLES_AFTER_QA") {
    throw new Error("CONTENT_OPTIMIZATION_INTERNAL_LINK_PLACEMENT_TYPE_INVALID");
  }
  if (placement.after_qa !== true && link.after_qa !== true) {
    throw new Error("CONTENT_OPTIMIZATION_RELATED_ARTICLES_AFTER_QA_REQUIRED");
  }
  if (placement.section_label !== undefined && String(placement.section_label).trim() !== "関連記事") {
    throw new Error("CONTENT_OPTIMIZATION_RELATED_ARTICLES_LABEL_REQUIRED");
  }
  if (placement.section_is_heading === true || link.section_is_heading === true) {
    throw new Error("CONTENT_OPTIMIZATION_RELATED_ARTICLES_HEADING_FORBIDDEN");
  }
  return Object.freeze({
    type: "RELATED_ARTICLES_AFTER_QA",
    after_qa: true,
    section_label: "関連記事",
    section_is_heading: false,
    doc_output_policy: "TITLE_NATIVE_LINKS_UNDER_PLAIN_RELATED_ARTICLES_LABEL",
  });
}

function normalizeLink(link = {}, clientId, currentArticleId) {
  const targetArticleId = requireText(link.target_article_id ?? link.article_id, "target_article_id");
  if (targetArticleId === currentArticleId) throw new Error("CONTENT_OPTIMIZATION_SELF_LINK_FORBIDDEN");
  if (String(link.client_id || clientId).trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:internal_links");
  const targetUrl = requirePublicArticleUrl(link.target_url ?? link.public_url ?? link.wordpress_url ?? link.url, "target_url");
  const anchorText = requireText(link.anchor_text ?? link.target_title ?? link.title, "anchor_text");
  return Object.freeze({
    client_id: clientId,
    source_article_id: currentArticleId,
    target_article_id: targetArticleId,
    target_title: requireText(link.target_title ?? link.title, "target_title"),
    target_url: targetUrl,
    anchor_text: anchorText,
    score: Number(link.score ?? 0),
    reason: optionalText(link.reason) || "同一顧客の記事間で検索意図が近い",
    placement: normalizeRelatedArticlesPlacement(link),
  });
}

export function prepareRewriteArtifactOutput(input = {}) {
  const clientId = requireClientId(input.client_id);
  const articleId = requireText(input.article_id, "article_id");
  const rewriteDate = normalizeDateKey(input.rewrite_date ?? input.updated_at ?? input.measured_at);
  const sequence = normalizeRewriteSequence(input.rewrite_sequence ?? input.sequence);
  const articleFolderUrl = requireGoogleDriveFolderUrl(input.article_folder_url ?? input.drive_folder_url, "article_folder_url");
  const prefix = `${articleNumberKey(articleId)}-リライト${String(sequence).padStart(2, "0")}_${rewriteDate}`;
  return Object.freeze({
    status: "REWRITE_ARTIFACT_OUTPUT_READY",
    client_id: clientId,
    article_id: articleId,
    output_parent_policy: "SAME_ORIGINAL_ARTICLE_FOLDER",
    parent_folder_url: articleFolderUrl,
    folder_name: prefix,
    file_names: Object.freeze({
      management_json: `${prefix}.json`,
      article_content: `${prefix}_記事内容`,
      structured_markup: `${prefix}_構造化マークアップ.txt`,
    }),
    artifact_types: Object.freeze({
      management_json: "application/json",
      article_content: "application/vnd.google-apps.document",
      structured_markup: "text/plain",
    }),
    visible_artifact_count: 3,
    visible_artifacts: Object.freeze(["jsonファイル", "記事内容Googleドキュメント", "構造化マークアップデータ（WordPressコピペ用）"]),
    management_json_includes: Object.freeze(["rewrite_plan", "diff_summary", "internal_link_graph", "review_result", "audit_result"]),
    sheet_writeback: Object.freeze({
      rewrite_status_column: "リライト状態",
      rewrite_date_column: "最終リライト日",
      rewrite_url_column: "リライト管理URL",
      rewrite_date: rewriteDate,
    }),
    completion_gate: "rewrite-output-must-be-inside-original-article-folder",
  });
}

export function planInternalLinkGraph(input = {}) {
  const clientId = requireClientId(input.client_id);
  const article = input.article || input.candidate || {};
  const articleId = requireText(article.article_id ?? input.article_id, "article_id");
  if (String(article.client_id || clientId).trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:article");
  const existingArticles = assertClientRecords(input.existing_articles ?? input.existingArticles ?? [], clientId, "existing_articles");
  const currentText = articleText(article);
  const limit = Math.max(1, Math.min(8, Number(input.limit ?? input.internalLinkLimit ?? 5) || 5));
  const candidates = existingArticles
    .filter((item) => String(item.article_id || "").trim() && String(item.article_id).trim() !== articleId)
    .map((item) => {
      const targetUrl = resolvePublicArticleUrl(item, "existing_article_public_url");
      const categoryBoost = article.category && item.category === article.category ? 0.25 : 0;
      const score = Math.min(1, similarity(currentText, articleText(item)) + categoryBoost);
      return Object.freeze({
        client_id: clientId,
        source_article_id: articleId,
        target_article_id: String(item.article_id).trim(),
        target_title: requireText(item.title, "existing_article.title"),
        target_url: targetUrl,
        target_url_source: firstNonEmpty(item.public_url, item["公開URL"]) ? "公開URL" : "WordPressURL",
        anchor_text: optionalText(item.anchor_text) || requireText(item.title, "existing_article.title"),
        score: Number(score.toFixed(3)),
        reason: categoryBoost ? "同一カテゴリの記事として関連" : "検索意図または責任範囲が関連",
        placement_policy: "RELATED_ARTICLES_AFTER_QA_REQUIRED",
        placement: Object.freeze({
          type: "RELATED_ARTICLES_AFTER_QA",
          after_qa: true,
          section_label: "関連記事",
          section_is_heading: false,
        }),
        target_already_links_to_source: Array.isArray(item.internal_links)
          && item.internal_links.some((link) => String(link.target_article_id || "").trim() === articleId || String(link.target_url || "").trim() === firstNonEmpty(article.public_url, article["公開URL"], article.wordpress_url, article.WordPressURL, article["WordPressURL"])),
      });
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.target_article_id.localeCompare(right.target_article_id))
    .slice(0, limit);

  const reciprocalUpdatePlan = candidates
    .filter((item) => !item.target_already_links_to_source)
    .map((item) => Object.freeze({
      client_id: clientId,
      source_article_id: item.target_article_id,
      target_article_id: articleId,
      target_title: requireText(article.title, "article.title"),
      target_url: resolvePublicArticleUrl(article, "article_public_url"),
      target_url_source: firstNonEmpty(article.public_url, article["公開URL"]) ? "公開URL" : "WordPressURL",
      anchor_text: requireText(article.title, "article.title"),
      action: "ADD_RELATED_ARTICLE_LINK_TO_EXISTING_ARTICLE",
      approval_gate: "UPDATE_EXISTING_PUBLISHED_ARTICLE_REQUIRES_FINAL_APPROVAL",
    }));

  return Object.freeze({
    client_id: clientId,
    article_id: articleId,
    status: candidates.length ? "INTERNAL_LINK_GRAPH_READY" : "NO_INTERNAL_LINK_CANDIDATES",
    outbound_links: Object.freeze(candidates),
    reciprocal_update_plan: Object.freeze(reciprocalUpdatePlan),
    existing_article_update_required: reciprocalUpdatePlan.length > 0,
    cross_client_links_allowed: false,
    placement_policy: "Q&Aの直後にHタグなしの「関連記事」ラベルを置き、対象記事タイトルへネイティブリンクを付ける。本文中のテキストリンク、タグ、出典セクションとしては出力しない。",
    completion_gate: "verify-internal-link-graph",
  });
}

export function verifyInternalLinkGraph(input = {}, expected = {}) {
  const clientId = requireClientId(input.client_id ?? expected.client_id);
  const articleId = requireText(input.article_id ?? expected.article_id, "article_id");
  const existingArticleCount = Number(input.existing_article_count ?? input.existingArticles?.length ?? input.existing_articles?.length ?? 0);
  const links = assertClientRecords(input.outbound_links ?? input.internal_links ?? [], clientId, "outbound_links")
    .map((link) => normalizeLink(link, clientId, articleId));
  if (existingArticleCount > 0 && links.length === 0) throw new Error("CONTENT_OPTIMIZATION_INTERNAL_LINK_REQUIRED");
  const reciprocal = assertClientRecords(input.reciprocal_update_plan ?? [], clientId, "reciprocal_update_plan");
  for (const link of links) {
    const alreadyLinked = input.target_already_links_to_source === true || reciprocal.some((item) =>
      String(item.source_article_id || "").trim() === link.target_article_id
      && String(item.target_article_id || "").trim() === articleId);
    if (!alreadyLinked) throw new Error(`CONTENT_OPTIMIZATION_RECIPROCAL_UPDATE_PLAN_REQUIRED:${link.target_article_id}`);
  }
  return Object.freeze({
    status: "VERIFIED_INTERNAL_LINK_GRAPH",
    client_id: clientId,
    article_id: articleId,
    existing_article_count: existingArticleCount,
    outbound_link_count: links.length,
    reciprocal_update_count: reciprocal.length,
    placement_policy: "RELATED_ARTICLES_AFTER_QA_ONLY",
    outbound_links: Object.freeze(links),
    reciprocal_update_plan: Object.freeze(reciprocal),
  });
}

export function prepareInternalLinkSheetOutput(input = {}) {
  const graph = input.internal_link_graph && typeof input.internal_link_graph === "object" ? input.internal_link_graph : input;
  const verified = verifyInternalLinkGraph(graph, input.expected ?? {});
  const managementFileUrl = input.management_file_url || input.file_url ? requireGoogleDriveFileUrl(input.management_file_url ?? input.file_url, "management_file_url") : null;
  const outboundLines = verified.outbound_links.map((link, index) => [
    `関連記事${index + 1}（${linkStatusLabel(link.target_url)}）: ${link.target_title}`,
    `遷移先: ${link.target_url}`,
    "表示位置: Q&A直後の「関連記事」（Hタグなし）",
  ].filter(Boolean).join("\n"));
  const reciprocalLines = verified.reciprocal_update_plan.map((link, index) => {
    const targetUrl = requireUrl(link.target_url, `reciprocal_update_plan_${index + 1}_target_url`);
    return `戻しリンク予定${index + 1}（${linkStatusLabel(targetUrl)}）: ${targetUrl}`;
  });
  const managementLine = managementFileUrl ? [`管理JSON: ${managementFileUrl}`] : [];
  return Object.freeze({
    status: "INTERNAL_LINK_SHEET_OUTPUT_READY",
    client_id: verified.client_id,
    article_id: verified.article_id,
    sheet_column: "内部リンク管理URL",
    sheet_value: [...outboundLines, ...reciprocalLines, ...managementLine].join("\n") || "内部リンク候補なし",
    outbound_urls: Object.freeze(verified.outbound_links.map((link) => link.target_url)),
    reciprocal_urls: Object.freeze(verified.reciprocal_update_plan.map((link, index) => requireUrl(link.target_url, `reciprocal_update_plan_${index + 1}_target_url`))),
    management_file_url: managementFileUrl,
  });
}

function normalizeQuestionAnswer(item = {}) {
  return Object.freeze({
    "@type": "Question",
    name: requireText(item.question ?? item.name, "faq.question"),
    acceptedAnswer: Object.freeze({
      "@type": "Answer",
      text: requireText(item.answer ?? item.text, "faq.answer"),
    }),
  });
}

function normalizeQuestionAnswerText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/^Q[:：]/i, "")
    .replace(/^A[:：]/i, "")
    .trim();
}

function normalizeFaqItems(items = []) {
  if (!Array.isArray(items) || items.length !== 5) {
    throw new Error("CONTENT_OPTIMIZATION_FAQ_EXACTLY_FIVE_REQUIRED");
  }
  return Object.freeze(items.map(normalizeQuestionAnswer));
}

function verifyFaqSync(faqItems, article = {}, input = {}) {
  const bodyFaqItems = article.body_faq_items ?? input.body_faq_items ?? article.document_faq_items ?? input.document_faq_items;
  if (!Array.isArray(bodyFaqItems) || bodyFaqItems.length !== 5) {
    throw new Error("CONTENT_OPTIMIZATION_BODY_FAQ_EXACTLY_FIVE_REQUIRED");
  }
  const normalizedBody = bodyFaqItems.map((item) => ({
    question: normalizeQuestionAnswerText(item.question ?? item.name),
    answer: normalizeQuestionAnswerText(item.answer ?? item.text),
  }));
  const normalizedSchema = faqItems.map((item) => ({
    question: normalizeQuestionAnswerText(item.name),
    answer: normalizeQuestionAnswerText(item.acceptedAnswer?.text),
  }));
  if (JSON.stringify(normalizedBody) !== JSON.stringify(normalizedSchema)) {
    throw new Error("CONTENT_OPTIMIZATION_FAQ_SCHEMA_MUST_MATCH_BODY_QA");
  }
  return true;
}

function normalizeHowToStep(item = {}, index) {
  return Object.freeze({
    "@type": "HowToStep",
    position: index + 1,
    name: requireText(item.name ?? item.title ?? `step-${index + 1}`, "how_to_step.name"),
    text: requireText(item.text ?? item.description, "how_to_step.text"),
  });
}

function resolveStructuredAuthorName({ article = {}, site = {}, input = {} }) {
  return optionalText(article.profile_widget_author_name)
    || optionalText(article.author_name)
    || optionalText(article.author?.name)
    || optionalText(site.profile_widget_author_name)
    || optionalText(site.editorial_team_name)
    || optionalText(input.profile_widget_author_name)
    || optionalText(input.author_name)
    || optionalText(site.name);
}

export function buildStructuredMarkupOutput(input = {}) {
  const clientId = requireClientId(input.client_id);
  const article = input.article || {};
  const articleId = requireText(article.article_id ?? input.article_id, "article_id");
  if (String(article.client_id || clientId).trim() !== clientId) throw new Error("CROSS_CLIENT_DATA_DETECTED:structured_article");
  const site = input.site || {};
  const articleUrl = resolvePublicArticleUrl({
    public_url: firstNonEmpty(article.public_url, article["公開URL"], input.public_url, input["公開URL"]),
    wordpress_url: firstNonEmpty(article.wordpress_url, article.WordPressURL, article["WordPressURL"], input.wordpress_url, input.WordPressURL, input["WordPressURL"]),
    article_url: firstNonEmpty(article.article_url, article["記事URL"], article.url, input.article_url, input["記事URL"], input.url),
  }, "article_public_url");
  const siteUrl = requireUrl(site.url ?? input.site_url, "site_url");
  const title = requireText(article.title ?? input.title, "title");
  const metaDescription = requireText(firstNonEmpty(article.meta_description, article.metaDescription, article["メタディスクリプション"], input.meta_description, input.metaDescription, input["メタディスクリプション"]), "meta_description");
  const suppliedDescription = requireText(article.description ?? input.description ?? metaDescription, "description");
  if (suppliedDescription !== metaDescription) {
    throw new Error("CONTENT_OPTIMIZATION_DESCRIPTION_MUST_MATCH_META_DESCRIPTION_COLUMN");
  }
  const authorName = requireText(resolveStructuredAuthorName({ article, site, input }), "profile_widget_author_name");
  const category = optionalText(article.category);
  const faqItems = normalizeFaqItems(input.faq_items ?? article.faq_items ?? article.qa_items ?? article["Q&A"]);
  verifyFaqSync(faqItems, article, input);
  const howToSteps = Array.isArray(input.how_to_steps ?? article.how_to_steps) ? (input.how_to_steps ?? article.how_to_steps) : [];
  const graph = [
    Object.freeze({
      "@type": "Article",
      "@id": `${articleUrl}#article`,
      mainEntityOfPage: articleUrl,
      headline: title,
      description: metaDescription,
      articleSection: category || undefined,
      author: Object.freeze({ "@type": "Organization", name: authorName }),
      datePublished: optionalText(article.date_published ?? input.date_published) || undefined,
      dateModified: requireText(article.date_modified ?? input.date_modified, "date_modified"),
      inLanguage: optionalText(input.in_language) || "ja",
    }),
    Object.freeze({
      "@type": "BreadcrumbList",
      itemListElement: Object.freeze([
        Object.freeze({ "@type": "ListItem", position: 1, name: optionalText(site.home_label) || "ホーム", item: siteUrl }),
        ...(category ? [Object.freeze({ "@type": "ListItem", position: 2, name: category, item: requireUrl(article.category_url ?? input.category_url, "category_url") })] : []),
        Object.freeze({ "@type": "ListItem", position: category ? 3 : 2, name: title, item: articleUrl }),
      ]),
    }),
  ];
  graph.push(Object.freeze({ "@type": "FAQPage", mainEntity: faqItems }));
  if (howToSteps.length) graph.push(Object.freeze({ "@type": "HowTo", name: title, step: Object.freeze(howToSteps.map(normalizeHowToStep)) }));

  const markup = Object.freeze({
    "@context": "https://schema.org",
    "@graph": Object.freeze(graph),
  });
  const content = `${JSON.stringify(markup, null, 2)}\n`;
  const wordpressCopyContent = toWordPressJsonLdCopyContent(content);
  return Object.freeze({
    status: "STRUCTURED_MARKUP_READY",
    client_id: clientId,
    article_id: articleId,
    file_name: `${articleId}_schema.jsonld`,
    mime_type: "application/ld+json",
    wordpress_copy_file_name: `${articleId}_schema_wordpress_copy.txt`,
    wordpress_copy_mime_type: "text/plain",
    wordpress_copy_content: wordpressCopyContent,
    markup,
    content,
    sha256: createHash("sha256").update(content, "utf8").digest("hex"),
    wordpress_copy_sha256: createHash("sha256").update(wordpressCopyContent, "utf8").digest("hex"),
    output_folder: `03_記事/${articleId}`,
    completion_gate: "verify-structured-markup-output",
  });
}

export function verifyStructuredMarkupOutput(input = {}, expected = {}) {
  const clientId = requireClientId(input.client_id ?? expected.client_id);
  const articleId = requireText(input.article_id ?? expected.article_id, "article_id");
  const fileName = requireText(input.file_name, "file_name");
  if (fileName !== `${articleId}_schema.jsonld`) throw new Error("CONTENT_OPTIMIZATION_STRUCTURED_FILE_NAME_MISMATCH");
  const url = requireUrl(input.file_url ?? input.artifact_url, "file_url");
  const markup = input.markup && typeof input.markup === "object" ? input.markup : JSON.parse(requireText(input.content, "content"));
  if (markup["@context"] !== "https://schema.org") throw new Error("CONTENT_OPTIMIZATION_SCHEMA_CONTEXT_REQUIRED");
  const graph = Array.isArray(markup["@graph"]) ? markup["@graph"] : [];
  const article = graph.find((item) => item?.["@type"] === "Article");
  const breadcrumb = graph.find((item) => item?.["@type"] === "BreadcrumbList");
  const faq = graph.find((item) => item?.["@type"] === "FAQPage");
  if (!article?.headline || !article?.description || !article?.mainEntityOfPage || !article?.dateModified) {
    throw new Error("CONTENT_OPTIMIZATION_ARTICLE_SCHEMA_INCOMPLETE");
  }
  if (!article?.author?.name) throw new Error("CONTENT_OPTIMIZATION_ARTICLE_AUTHOR_REQUIRED");
  if (article.publisher !== undefined) throw new Error("CONTENT_OPTIMIZATION_ARTICLE_PUBLISHER_FORBIDDEN");
  if (article.keywords !== undefined) throw new Error("CONTENT_OPTIMIZATION_ARTICLE_KEYWORDS_FORBIDDEN");
  if (article.image !== undefined) throw new Error("CONTENT_OPTIMIZATION_ARTICLE_IMAGE_FORBIDDEN");
  if (!breadcrumb?.itemListElement?.length) throw new Error("CONTENT_OPTIMIZATION_BREADCRUMB_SCHEMA_REQUIRED");
  if (!Array.isArray(faq?.mainEntity) || faq.mainEntity.length !== 5) throw new Error("CONTENT_OPTIMIZATION_FAQ_EXACTLY_FIVE_REQUIRED");
  if (expected.description && article.description !== String(expected.description).trim()) {
    throw new Error("CONTENT_OPTIMIZATION_DESCRIPTION_MUST_MATCH_META_DESCRIPTION_COLUMN");
  }
  const articleMainEntityUrl = requirePublicArticleUrl(article.mainEntityOfPage, "article_main_entity_of_page");
  const expectedPublicUrl = firstNonEmpty(expected.public_url, expected["公開URL"], expected.wordpress_url, expected.WordPressURL, expected["WordPressURL"]);
  if (expectedPublicUrl) {
    const expectedArticleUrl = resolvePublicArticleUrl(expected, "expected_article_public_url");
    if (articleMainEntityUrl !== expectedArticleUrl) {
      throw new Error("CONTENT_OPTIMIZATION_ARTICLE_MAIN_ENTITY_OF_PAGE_MISMATCH");
    }
  } else if (firstNonEmpty(expected.article_url, expected["記事URL"], expected.url)) {
    throw new Error("CONTENT_OPTIMIZATION_EXPECTED_ARTICLE_PUBLIC_URL_ARTICLE_URL_FORBIDDEN");
  }
  if (expected.body_faq_items) verifyFaqSync(faq.mainEntity, { body_faq_items: expected.body_faq_items });
  if (input.file_in_article_folder !== true) throw new Error("CONTENT_OPTIMIZATION_STRUCTURED_FILE_FOLDER_MEMBERSHIP_REQUIRED");
  const wordpressCopyFileUrl = requireGoogleDriveFileUrl(input.wordpress_copy_file_url ?? input.copy_file_url, "wordpress_copy_file_url");
  if (input.wordpress_copy_file_in_article_folder !== true) throw new Error("CONTENT_OPTIMIZATION_STRUCTURED_WORDPRESS_COPY_FOLDER_MEMBERSHIP_REQUIRED");
  if (input.sheet_persistence?.reloaded_after_write !== true) throw new Error("CONTENT_OPTIMIZATION_STRUCTURED_SHEET_RELOAD_REQUIRED");
  if (!String(input.sheet_persistence?.structured_url_label ?? "").includes("コピペ用")) {
    throw new Error("CONTENT_OPTIMIZATION_STRUCTURED_SHEET_COPY_LABEL_REQUIRED");
  }
  return Object.freeze({
    status: "VERIFIED_STRUCTURED_MARKUP_OUTPUT",
    client_id: clientId,
    article_id: articleId,
    file_name: fileName,
    file_url: url,
    wordpress_copy_file_url: wordpressCopyFileUrl,
    schema_types: Object.freeze(graph.map((item) => item?.["@type"]).filter(Boolean)),
    file_in_article_folder: true,
    wordpress_copy_file_in_article_folder: true,
    sheet_persistence: Object.freeze({ ...input.sheet_persistence, reloaded_after_write: true }),
  });
}

export function prepareRewritePlan(input = {}) {
  const clientId = requireClientId(input.client_id);
  const articles = assertClientRecords(input.articles ?? [], clientId, "articles");
  const rankings = assertClientRecords(input.rankings ?? [], clientId, "rankings");
  const articleById = new Map(articles.map((article) => [String(article.article_id || "").trim(), article]));
  const candidates = rankings
    .map((ranking) => {
      const articleId = requireText(ranking.article_id, "ranking.article_id");
      const article = articleById.get(articleId);
      if (!article) return null;
      const previous = Number(ranking.previous_rank);
      const current = Number(ranking.current_rank);
      const clicksDelta = Number(ranking.clicks_delta ?? 0);
      const impressionsDelta = Number(ranking.impressions_delta ?? 0);
      const rankDrop = Number.isFinite(previous) && Number.isFinite(current) ? current - previous : 0;
      const shouldRewrite = rankDrop >= Number(input.rank_drop_threshold ?? 3)
        || clicksDelta <= -Math.abs(Number(input.click_drop_threshold ?? 5))
        || impressionsDelta <= -Math.abs(Number(input.impression_drop_threshold ?? 20))
        || ranking.search_intent_changed === true;
      if (!shouldRewrite) return null;
      const rewriteDate = normalizeDateKey(input.rewrite_date ?? ranking.measured_at);
      const rewriteSequence = normalizeRewriteSequence(article.rewrite_sequence ?? input.rewrite_sequence ?? 1);
      const artifactPrefix = `${articleNumberKey(articleId)}-リライト${String(rewriteSequence).padStart(2, "0")}_${rewriteDate}`;
      return Object.freeze({
        client_id: clientId,
        article_id: articleId,
        title: requireText(article.title, "article.title"),
        current_url: optionalText(article.url) || null,
        trigger: rankDrop >= 3 ? "RANK_DROP" : ranking.search_intent_changed ? "SEARCH_INTENT_CHANGED" : "TRAFFIC_DROP",
        evidence: Object.freeze({
          keyword: requireText(ranking.keyword, "ranking.keyword"),
          previous_rank: Number.isFinite(previous) ? previous : null,
          current_rank: Number.isFinite(current) ? current : null,
          clicks_delta: clicksDelta,
          impressions_delta: impressionsDelta,
          measured_at: requireText(ranking.measured_at, "ranking.measured_at"),
        }),
        proposed_actions: Object.freeze([
          "検索意図とのズレを確認する",
          "FAQ、比較軸、手順、内部リンクを追加・更新する",
          "古い数値・固有名詞・出典を再確認する",
          "構造化マークアップと図解の不足を補う",
        ]),
        output_parent_policy: "SAME_ORIGINAL_ARTICLE_FOLDER",
        output_required_parent: `03_記事/${articleId}`,
        rewrite_artifact_folder_name: artifactPrefix,
        article_folder_url: optionalText(article.article_folder_url ?? article.drive_folder_url) || null,
      });
    })
    .filter(Boolean);
  return Object.freeze({
    status: candidates.length ? "REWRITE_PLAN_READY" : "NO_REWRITE_NEEDED",
    client_id: clientId,
    candidates: Object.freeze(candidates),
    auto_draft_allowed: candidates.length > 0,
    auto_publish_allowed: false,
    final_approval_required_before_publication: true,
    output_folder_name: "03_記事/{article_id}/{article_number4}-リライト{sequence2}_{yyyymmdd}",
    output_parent_policy: "SAME_ORIGINAL_ARTICLE_FOLDER",
    completion_gate: "rewrite-draft-must-return-to-article-quality-review",
  });
}
