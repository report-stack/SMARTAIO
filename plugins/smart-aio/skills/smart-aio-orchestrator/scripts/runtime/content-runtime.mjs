import {
  getContentPrompt,
  verifyContentPromptRegistry,
} from "../../../content-prompts/scripts/content_prompt_registry.mjs";
import { createHash } from "node:crypto";

const DEFAULT_IMAGE_SIZE = "1536x1024";
const TITLE_IMAGE_COUNT = 1;
const ARTICLE_PHOTO_COUNT = 3;
const STANDARD_IMAGE_COUNT = TITLE_IMAGE_COUNT + ARTICLE_PHOTO_COUNT;

function sha256Text(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function requireText(value, name) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (!text) throw new TypeError(`${name} is required`);
  return text;
}

function optionalText(value) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text || null;
}

function promptResult(item, contentPrompt, extra = {}) {
  const contentPromptSha256 = sha256Text(contentPrompt);
  return Object.freeze({
    prompt_version: "content-v1",
    prompt_key: item.key,
    prompt_sha256: item.sha256,
    prepared_prompt_sha256: contentPromptSha256,
    content_prompt_sha256: contentPromptSha256,
    content_prompt: contentPrompt,
    execution_rule: "Generate in the current Codex/ChatGPT conversation. Do not call the OpenAI API.",
    ...extra,
  });
}

function buildTitleHierarchy(title) {
  const normalized = requireText(title, "title");
  const separators = ["？", "?", "｜", "|", "：", ":"];
  for (const separator of separators) {
    const index = normalized.indexOf(separator);
    if (index > 0 && index < normalized.length - 1) {
      const main = normalized.slice(0, separator === "？" || separator === "?" ? index + 1 : index).trim();
      const sub = normalized.slice(index + 1).trim();
      if (main && sub) return Object.freeze({ main_heading: main, supporting_text: sub });
    }
  }
  if (normalized.length > 24) {
    const splitIndex = Math.min(normalized.length - 8, Math.max(16, Math.round(normalized.length * 0.58)));
    return Object.freeze({
      main_heading: normalized.slice(0, splitIndex).trim(),
      supporting_text: normalized.slice(splitIndex).trim(),
    });
  }
  return Object.freeze({ main_heading: normalized, supporting_text: null });
}

export async function buildStandardBasicInfoPrompt({ url, siteText, text }) {
  await verifyContentPromptRegistry();
  const item = await getContentPrompt("basic-info-research");
  const normalizedUrl = String(url || "").trim();
  const suppliedText = String(siteText ?? text ?? "").trim();
  if (!normalizedUrl && !suppliedText) throw new Error("URL_OR_TEXT_REQUIRED");
  if (normalizedUrl && !suppliedText) throw new Error("SITE_TEXT_REQUIRED_AFTER_URL_RETRIEVAL");

  const inputSource = normalizedUrl
    ? `URL: ${normalizedUrl}\n\n【取得したサイト本文（抜粋）】\n${suppliedText.slice(0, 8000)}`
    : `【テキスト情報】\n${suppliedText}`;

  return promptResult(item, `${item.value}\n\n${inputSource}`, {
    input_mode: normalizedUrl ? "URL_AND_RETRIEVED_TEXT" : "TEXT",
    retrieved_text_limit: normalizedUrl ? 8000 : null,
  });
}

export async function buildStandardSiteTitlePrompt({ serviceName, serviceDescription }) {
  await verifyContentPromptRegistry();
  const item = await getContentPrompt("site-title");
  const name = String(serviceName || "").trim();
  const description = String(serviceDescription || "").trim();
  if (!name && !description) throw new Error("SERVICE_NAME_OR_DESCRIPTION_REQUIRED");

  return promptResult(
    item,
    `${item.value}\n\n【サービス種類】\n${name}\n\n【サービス内容】\n${description}`,
  );
}

export async function buildStandardTitleImagePrompt({
  baseTheme,
  title,
  imageSize = DEFAULT_IMAGE_SIZE,
  themeColor,
  titleHierarchy,
}) {
  await verifyContentPromptRegistry();
  const item = await getContentPrompt("thumbnail-title-image");
  const titleText = requireText(title, "title");
  const hierarchy = titleHierarchy && typeof titleHierarchy === "object" && !Array.isArray(titleHierarchy)
    ? Object.freeze({
      main_heading: requireText(titleHierarchy.main_heading, "titleHierarchy.main_heading"),
      supporting_text: optionalText(titleHierarchy.supporting_text),
    })
    : buildTitleHierarchy(titleText);
  let contentPrompt = `SEOブログ記事のサムネイル画像を作成してください。
記事タイトルを大きく配置した、日本語ブログ用のタイトル入り画像です。

○画像の基本テーマ
${requireText(baseTheme, "baseTheme")}

○記事タイトル（画像内に表示するテキスト）
${titleText}

○タイトル表示階層
主見出し: ${hierarchy.main_heading}
補助見出し: ${hierarchy.supporting_text || "なし"}
※記事タイトル全体の意味を保ったまま、主見出しと補助見出しに分けて読みやすく配置してください。長いタイトルを1つの同じ大きさの文章ブロックとして置かないでください。

○サイズ
${requireText(imageSize, "imageSize")}

○タイトル入り画像の基本ルール
${item.value}`;

  const normalizedColor = String(themeColor || "").trim();
  contentPrompt += normalizedColor
    ? `\n\n○テーマカラー\n${normalizedColor}\n※このカラーコードをアクセントカラーとして使用してください。背景装飾や差し色として活用し、背景自体は白または少し淡い色にしてください。`
    : "\n\n○テーマカラー\n指定なし（記事内容に合った配色を選んでください。ただし背景は白または少し淡い色にしてください。）";

  contentPrompt += "\n\n○背景文字の扱い\n画像内に表示してよい読める文字は、原則として上記の記事タイトルだけです。背景の看板、ポスター、端末画面、装飾、ロゴ風要素などには、読める日本語・英数字をできるだけ入れないでください。背景に文字らしさが必要な場合は、無地または判読不能な抽象表示にしてください。";

  return promptResult(item, contentPrompt, {
    image_size: imageSize,
    image_role: "TITLE_IMAGE",
    title_text: titleText,
    title_hierarchy: hierarchy,
    title_text_required: true,
    title_text_must_match_article_title: true,
    title_text_verification_required: true,
    background_readable_text_should_be_absent: true,
    independent_visual_quality_review_required: true,
  });
}

export async function buildStandardImagePhotoPrompt({
  baseTheme,
  subTheme,
  composition,
  imageSize = DEFAULT_IMAGE_SIZE,
}) {
  await verifyContentPromptRegistry();
  const item = await getContentPrompt("article-image-photo");
  const contentPrompt = `SEOブログ記事で使用するイメージ写真を作成してください。

○画像の基本テーマ
${requireText(baseTheme, "baseTheme")}

○サブテーマ（記事タイトル）
${requireText(subTheme, "subTheme")}

○今回の構図
${requireText(composition, "composition")}

○サイズ
${requireText(imageSize, "imageSize")}

○通常画像の文字ルール
通常画像には、看板、ポスター、端末画面、背景、装飾などに読める文字をできるだけ入れないでください。文字情報が必要な場合でも、具体的な日本語・英数字・ロゴ風文字は避け、無地または判読不能な抽象表示にしてください。このルールは本文写真・背景写真だけに適用し、図解画像には適用しません。

○写真の基本ルール
${item.value}`;

  return promptResult(item, contentPrompt, {
    image_size: imageSize,
    image_role: "ARTICLE_PHOTO",
    readable_text_should_be_absent: true,
    readable_text_rule_excludes_diagram_image: true,
    title_text_allowed: false,
  });
}

export async function buildStandardDiagramImagePrompt({
  baseTheme,
  title,
  diagramContent,
  diagramSource,
  diagramSourceText,
  diagramTextItems,
  imageSize = DEFAULT_IMAGE_SIZE,
}) {
  await verifyContentPromptRegistry();
  const source = diagramSource && typeof diagramSource === "object" && !Array.isArray(diagramSource)
    ? diagramSource
    : { source_text: diagramSourceText, text_items: diagramTextItems };
  const sourceText = requireText(source.source_text, "diagramSource.source_text");
  const textItems = (Array.isArray(source.text_items) ? source.text_items : [])
    .map((item) => requireText(item, "diagramSource.text_items"))
    .filter(Boolean);
  if (textItems.length < 2 || textItems.length > 6) throw new Error("DIAGRAM_SOURCE_TEXT_ITEMS_MUST_BE_2_TO_6");
  const diagramHeading = requireText(
    source.diagram_heading ?? source.section_heading ?? title,
    "diagramSource.diagram_heading",
  );
  const supportingContext = requireText(
    source.supporting_context ?? source.support_text ?? sourceText.slice(0, 90),
    "diagramSource.supporting_context",
  );
  const actionableTakeaway = requireText(
    source.actionable_takeaway ?? source.takeaway ?? textItems?.[textItems.length - 1] ?? sourceText,
    "diagramSource.actionable_takeaway",
  );
  const sourceConceptText = [sourceText, optionalText(source.concept_basis)].filter(Boolean).join("\n");
  for (const item of textItems) {
    if (!sourceConceptText.includes(item) && source.source_derived_labels_verified !== true) {
      throw new Error("DIAGRAM_SOURCE_TEXT_ITEM_NOT_IN_SOURCE_TEXT_OR_VERIFIED_SOURCE_DERIVED_LABEL");
    }
  }
  const contentPrompt = `SEOブログ記事で使用する図解画像を作成してください。

○画像の基本テーマ
${requireText(baseTheme, "baseTheme")}

○記事タイトル
${requireText(title, "title")}

○本文内で色付けする図解元テキスト
${sourceText}

○図解の情報階層
見出し: ${diagramHeading}
補足文: ${supportingContext}
結論・確認ポイント: ${actionableTakeaway}

○図解内に入れる文字
${textItems.map((item, index) => `${index + 1}. ${item}`).join("\n")}

○補足テーマ
${String(diagramContent ?? "").trim() || "上記の本文抜粋を読者が一目で理解できるように配置する"}

○サイズ
${requireText(imageSize, "imageSize")}

○図解画像の基本ルール
- 人が見やすい図であることを最優先する
- 図解内の文字は「図解内に入れる文字」の範囲だけを使う
- 図解は「本文内で色付けする図解元テキスト」を見やすくした画像であり、本文と別内容にしない
- 図解元テキストは図解の読み方や意図の説明文ではなく、図解画像にする内容そのものである
- 図解内の項目、順番、意味は図解元テキストと一致させる
- 本文にない新しい概念、判断項目、説明、キャッチコピー、数値、補足コピーを勝手に追加しない
- 本文または入力の意味を変えない短いラベル化は許可するが、別の内容に見える言い換えはしない
- 2〜6個の要素に整理し、矢印、番号、比較、フローのいずれかで関係性を示す
- 見出し、補足文、結論・確認ポイントを持つ情報階層にする
- 記事本文の理解を助ける実用的な図にする
- 企業のロゴやアニメのキャラクターなど著作権のあるものは一切入れない
- ロゴ、実在ブランドの画面、架空の数値、未確認の順位や効果を入れない
- 意味のないチェックマークだけの帯、文字のない装飾ボックス、余白埋めだけの記号列、内容理解に役立たない飾りは入れない
- 背景は白または淡色の不透明背景にする。透明背景、濃いグラデーション、スポットライト、暗い背景は禁止
- 本文内の色付け範囲と同じ内容を図解化していることが分かる構成にする`;

  const contentPromptSha256 = sha256Text(contentPrompt);
  return Object.freeze({
    prompt_version: "content-v1",
    prompt_key: "article-diagram-image",
    prompt_sha256: null,
    prepared_prompt_sha256: contentPromptSha256,
    content_prompt_sha256: contentPromptSha256,
    content_prompt: contentPrompt,
    execution_rule: "Generate in the current Codex/ChatGPT conversation. Do not call the OpenAI API.",
    image_size: imageSize,
    image_role: "ARTICLE_DIAGRAM",
    diagram_source: Object.freeze({
      source_text: sourceText,
      text_items: Object.freeze(textItems),
      diagram_heading: diagramHeading,
      supporting_context: supportingContext,
      actionable_takeaway: actionableTakeaway,
      highlight_required_in_document: true,
      source_derived_text_required_in_image: true,
      source_text_matches_diagram_content_required: true,
      source_text_must_not_be_diagram_explanation: true,
      exact_text_required_in_image: false,
    }),
  });
}

export function buildStandardCompositionPrompt({ baseTheme, subTheme }) {
  const contentPrompt = `あなたはブログ用イメージ写真のアートディレクターです。
以下のテーマに合う、ブログに差しさわりのない自然なイメージ写真の構図案を3つ考えてください。
3つはそれぞれ別の構図・場面にしてください（似たような写真にしない）。

○画像の基本テーマ
${requireText(baseTheme, "baseTheme")}

○サブテーマ（記事タイトル）
${requireText(subTheme, "subTheme")}

条件：
- 特定の人物・有名人・著作権のあるキャラクターを含めない
- 画像内に読める文字・ロゴ・数字を入れない
- 汎用的すぎず、記事の雰囲気に合った自然な場面にする

出力は必ず以下のJSONのみ。説明文・前置き・Markdown・コードブロックは禁止。
{
  "compositions": ["構図案1（1〜2文）", "構図案2（1〜2文）", "構図案3（1〜2文）"]
}`;

  return Object.freeze({
    prompt_version: "content-v1",
    prompt_key: "image-compositions-fixed",
    prompt_sha256: null,
    content_prompt: contentPrompt,
    expected_count: 3,
    max_retries: 3,
    execution_rule: "Generate in the current Codex/ChatGPT conversation. Do not call the OpenAI API.",
  });
}

export function normalizeStandardCompositions(values) {
  const normalized = (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  while (normalized.length < ARTICLE_PHOTO_COUNT) normalized.push("記事テーマに合った自然なイメージ写真");
  return Object.freeze(normalized.slice(0, ARTICLE_PHOTO_COUNT));
}

export async function prepareStandardImageSet(input) {
  const clientId = requireText(input.client_id, "client_id");
  const articleId = requireText(input.article_id, "article_id");
  const title = requireText(input.title, "title");
  const baseTheme = requireText(input.baseTheme, "baseTheme");
  if (!Array.isArray(input.compositions)) throw new Error("COMPOSITION_GENERATION_RESULT_REQUIRED");
  const compositions = normalizeStandardCompositions(input.compositions);

  const thumbnail = await buildStandardTitleImagePrompt({
    baseTheme,
    title,
    imageSize: input.imageSize,
    themeColor: input.themeColor,
    titleHierarchy: input.titleHierarchy ?? input.title_hierarchy,
  });
  const photos = await Promise.all(compositions.map((composition, index) =>
    buildStandardImagePhotoPrompt({
      baseTheme,
      subTheme: title,
      composition,
      imageSize: input.imageSize,
    }).then((prompt) => Object.freeze({ ...prompt, sequence: index + 2 })),
  ));
  const diagram = await buildStandardDiagramImagePrompt({
    baseTheme,
    title,
    diagramContent: input.diagramContent ?? input.diagram_content ?? "記事の要点、判断基準、流れを読者が一目で理解できる図解",
    diagramSource: input.diagramSource ?? input.diagram_source,
    diagramSourceText: input.diagramSourceText ?? input.diagram_source_text,
    diagramTextItems: input.diagramTextItems ?? input.diagram_text_items,
    imageSize: input.imageSize,
  });

  return Object.freeze({
    client_id: clientId,
    article_id: articleId,
    title_image_count: TITLE_IMAGE_COUNT,
    article_photo_count: ARTICLE_PHOTO_COUNT,
    image_count: STANDARD_IMAGE_COUNT,
    diagram_count: 1,
    total_visual_count: STANDARD_IMAGE_COUNT + 1,
    images: Object.freeze([
      Object.freeze({ ...thumbnail, sequence: 1, file_name: `${articleId}_1.png` }),
      ...photos.map((photo) => Object.freeze({ ...photo, file_name: `${articleId}_${photo.sequence}.png` })),
    ]),
    diagram_image: Object.freeze({ ...diagram, sequence: "diagram_1", file_name: `${articleId}_diagram_1.png` }),
    output_plan: Object.freeze({
      article_folder_url: String(input.article_folder_url || "").trim() || "ARTICLE_FOLDER_URL",
      image_folder_url: String(input.image_folder_url || "").trim() || "IMAGE_FOLDER_URL",
      sheet_updates_after_save: Object.freeze({
        Q: String(input.completed_on || new Date().toISOString().slice(0, 10)).replaceAll("-", "/"),
        R: "IMAGE_FOLDER_URL",
        S: false,
        W: String(input.completed_on || new Date().toISOString().slice(0, 10)).replaceAll("-", "/"),
        X: "DIAGRAM_FILE_URL",
      }),
    }),
    completion_gate: Object.freeze({
      status: "IMAGE_GENERATION_REQUIRED",
      required_title_images: TITLE_IMAGE_COUNT,
      required_article_photos: ARTICLE_PHOTO_COUNT,
      required_actual_files: STANDARD_IMAGE_COUNT,
      required_actual_diagrams: 1,
      required_title_file_names: Object.freeze([`${articleId}_1.png`]),
      required_photo_file_names: Object.freeze([2, 3, 4].map((sequence) => `${articleId}_${sequence}.png`)),
      required_file_names: Object.freeze([1, 2, 3, 4].map((sequence) => `${articleId}_${sequence}.png`)),
      required_diagram_file_names: Object.freeze([`${articleId}_diagram_1.png`]),
      required_dimensions: "1536x1024",
      requires_title_text_in_first_image: true,
      requires_drive_membership_readback: true,
      requires_sheet_q_r_readback: true,
      requires_diagram_sheet_readback: true,
      requires_diagram_source_highlight: true,
      requires_diagram_source_derived_text_verification: true,
      requires_diagram_source_content_match: true,
      requires_diagram_source_not_explanation: true,
      requires_title_image_background_without_readable_text_when_possible: true,
      requires_article_photos_without_readable_text_when_possible: true,
      requires_prepared_prompt_hash_match: true,
      rejects_abbreviated_manual_image_prompts: true,
      requires_generation_call_id: true,
      requires_measured_file_dimensions: true,
      requires_independent_title_visual_quality_review: true,
      requires_title_visual_quality_score_at_least: 85,
      requires_independent_diagram_visual_quality_review: true,
      requires_diagram_visual_quality_score_at_least: 85,
      requires_diagram_canvas_occupancy_percent_between: Object.freeze([65, 95]),
      rejects_low_density_or_labels_only_diagram: true,
      requires_reviewed_diagram_sha256_match: true,
      completion_command: "verify-article-visual-persistence",
    }),
    execution_rule: "Create one title image containing the exact article title while avoiding readable background text whenever possible, three article photos without readable text whenever possible, and one diagram image in the current app conversation; no OpenAI API call is allowed. The no-readable-background-text rule applies to the title image background and article photos, not to the diagram image.",
  });
}
