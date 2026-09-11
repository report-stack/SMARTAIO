const EMPTY_APPEAL = /(徹底解説|完全ガイド|総まとめ|必見)/;
const UNSUPPORTED_HYPE = /(絶対|必ず|劇的|知らないと損|今すぐ|衝撃|誰でも簡単|100%)/i;
const QUESTION_SIGNAL = /(？|\?|なぜ|どう|どれ|いくら|何を|いつ|誰に|できる|べき|向いて)/;
const VALUE_SIGNAL = /(後悔しない|失敗しない|迷わない|判断|選び|改善|伸ば|成果|身につ|続け|使い分け|見極め|解決|実践|準備|変え|変わる|磨く|高め|防ぐ|減ら|克服|話せる|使える|わかる|できる)/;
const SPECIFICITY_SIGNAL = /([0-9０-９]+|基準|ステップ|チェック|比較|事例|コツ|ポイント|手順|選び方|使い分け|対策|項目|ロードマップ|目的別|場面別|タイプ別|予習|復習|トレーニング|レビュー)/;
const ANGLE_SIGNAL = /(ではなく|より先に|目的別|場面別|タイプ別|仕事に直結|総額|原因|違い|両立|習慣|判断軸)/;

export const TITLE_REFINEMENT_VERSION = "title-refinement-v1";

export const TITLE_REFINEMENT_PROMPT = `# 記事タイトル品質強化（新システム追加ルール）

保護プロンプトの出力形式と責任ラベルを維持したまま、titleだけは次の手順で洗練してください。

1. 検索意図・対象読者・主責任・結論から、異なる切り口のタイトル候補を内部で5案作成してください。
2. 「悩みの回避」「得られる結果」「判断基準」「具体的な手順」「意外性のある対比」を検討してください。
3. 検索キーワードまたは自然な同義語を前半に置き、読者が自分向けだと判断できる悩み・場面を示してください。
4. 読後にできる判断・改善・行動・理解のうち1つを具体的に約束してください。
5. 28〜46文字を目安に自然な日本語へ整え、1タイトルの約束は1つに絞ってください。
6. 数字や期間は本文で必ず裏付けられる場合だけ使ってください。
7. 「徹底解説」「完全ガイド」「必見」「知らないと損」「絶対」「必ず」など、具体性のない煽り表現でクリックを誘わないでください。
8. 5案を具体性・信頼性・検索意図・読者便益・本文整合で比較し、最も強い1案だけを既存のtitleへ出力してください。候補一覧や採点過程はJSONへ追加しないでください。

良いタイトルは刺激が強いタイトルではありません。誰のどんな悩みに答え、読むと何が分かるかが一読で伝わるタイトルです。`;

function normalize(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").trim();
}

function keywordTerms(value) {
  return String(value || "")
    .normalize("NFKC")
    .split(/[\s,、/|｜・]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

export function analyzeTitleQuality({ title, mainKeyword = "", responsibilityLabel = "" } = {}) {
  const rawTitle = String(title || "").trim();
  const compact = normalize(rawTitle);
  const length = [...compact].length;
  const terms = keywordTerms(mainKeyword);
  const responsibilityMain = String(responsibilityLabel || "").split("｜")[1] || "";
  const keywordMatched = terms.length === 0 || terms.some((term) => compact.includes(normalize(term)));
  const hasQuestion = QUESTION_SIGNAL.test(rawTitle);
  const hasValue = VALUE_SIGNAL.test(rawTitle);
  const hasSpecificity = SPECIFICITY_SIGNAL.test(rawTitle);
  const hasDistinctAngle = ANGLE_SIGNAL.test(rawTitle) || (responsibilityMain && compact.includes(normalize(responsibilityMain)));
  const hasEmptyAppeal = EMPTY_APPEAL.test(rawTitle);
  const hasUnsupportedHype = UNSUPPORTED_HYPE.test(rawTitle);
  const separatorCount = (rawTitle.match(/[｜|]/g) || []).length;

  const checks = [
    { key: "length", passed: length >= 22 && length <= 58, points: length >= 28 && length <= 46 ? 15 : length >= 22 && length <= 58 ? 8 : 0 },
    { key: "keyword", passed: keywordMatched, points: keywordMatched ? 20 : 0 },
    { key: "reader_intent", passed: hasQuestion || hasValue, points: hasQuestion || hasValue ? 15 : 0 },
    { key: "reader_value", passed: hasValue, points: hasValue ? 20 : 0 },
    { key: "specificity", passed: hasSpecificity, points: hasSpecificity ? 15 : 0 },
    { key: "distinct_angle", passed: Boolean(hasDistinctAngle), points: hasDistinctAngle ? 10 : 0 },
    { key: "credible_expression", passed: !hasEmptyAppeal && !hasUnsupportedHype && separatorCount <= 1, points: !hasEmptyAppeal && !hasUnsupportedHype && separatorCount <= 1 ? 5 : 0 },
  ];
  const score = checks.reduce((sum, check) => sum + check.points, 0);
  const violations = [];
  if (length < 22) violations.push("タイトルが短く、読者の悩みと得られる価値が伝わりません");
  if (length > 58) violations.push("タイトルが長すぎます");
  if (!keywordMatched) violations.push("メインキーワードまたは自然な同義語がタイトルにありません");
  if (!hasValue) violations.push("読後に得られる判断・改善・行動が明確ではありません");
  if (!hasSpecificity) violations.push("基準・手順・数字・利用場面などの具体性が不足しています");
  if (hasEmptyAppeal) violations.push("具体性のない定型訴求を使用しています");
  if (hasUnsupportedHype) violations.push("根拠のない煽り表現を使用しています");
  if (separatorCount > 1) violations.push("区切り記号が多すぎます");

  return Object.freeze({
    version: TITLE_REFINEMENT_VERSION,
    title: rawTitle,
    length,
    score,
    passed: score >= 70 && violations.length === 0,
    critical_violation: hasUnsupportedHype || length < 16 || length > 64,
    checks: Object.freeze(checks.map(Object.freeze)),
    violations: Object.freeze(violations),
  });
}
