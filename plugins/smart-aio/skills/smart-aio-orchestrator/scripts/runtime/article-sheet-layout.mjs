export const STANDARD_ARTICLE_SHEET_COLUMNS = Object.freeze([
  "ピラー指定",
  "記事作成依頼",
  "記事ID",
  "ピラー",
  "記事タイトル",
  "責任ラベル",
  "記事詳細",
  "メタディスクリプション",
  "記事カテゴリ",
  "ハッシュタグ",
  "JSON完成",
  "JSON_URL",
  "全部削除",
  "記事完成",
  "記事URL",
  "記事&画像削除",
  "画像完成",
  "画像URL",
  "画像のみ削除",
  "タイトルスラッグ",
  "公開URL",
  "WordPressURL",
  "構造化完成",
  "構造化URL",
  "図解完成",
  "図解URL",
  "内部リンク状態",
  "内部リンク最終確認日",
  "内部リンク管理URL",
  "リライト状態",
  "最終リライト日",
  "リライト管理URL",
]);

function normalizeHeaders(values) {
  return Array.isArray(values) ? values.map((value) => String(value ?? "").trim()) : [];
}

function columnLetter(index) {
  let number = index + 1;
  let result = "";
  while (number > 0) {
    number -= 1;
    result = String.fromCharCode(65 + (number % 26)) + result;
    number = Math.floor(number / 26);
  }
  return result;
}

export function normalizeArticleSheetHeaders(values) {
  const headers = normalizeHeaders(values);
  if (!headers.length) return Object.freeze([...STANDARD_ARTICLE_SHEET_COLUMNS]);
  if (headers.length === STANDARD_ARTICLE_SHEET_COLUMNS.length + 1 && headers[0] === "") {
    return Object.freeze(headers.slice(1));
  }
  return Object.freeze(headers);
}

export function resolveArticleSheetColumnMap(values) {
  const rawHeaders = normalizeHeaders(values);
  const headers = rawHeaders.length ? rawHeaders : [...STANDARD_ARTICLE_SHEET_COLUMNS];
  const offset = headers.length === STANDARD_ARTICLE_SHEET_COLUMNS.length + 1 && headers[0] === "" ? 1 : 0;
  const normalized = offset ? headers.slice(1) : headers;
  if (JSON.stringify(normalized) !== JSON.stringify(STANDARD_ARTICLE_SHEET_COLUMNS)) {
    throw new Error("ARTICLE_HEADERS_DO_NOT_MATCH_STANDARD");
  }
  return Object.freeze(Object.fromEntries(
    STANDARD_ARTICLE_SHEET_COLUMNS.map((header, index) => [header, columnLetter(index + offset)]),
  ));
}

export function mapArticleSheetUpdates(values, headers) {
  const columnMap = resolveArticleSheetColumnMap(headers);
  return Object.freeze(Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined)
      .map(([header, value]) => {
        if (!columnMap[header]) throw new Error(`UNKNOWN_ARTICLE_SHEET_HEADER:${header}`);
        return [columnMap[header], value];
      }),
  ));
}
