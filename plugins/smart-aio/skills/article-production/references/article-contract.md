# 記事制作契約

## 記事企画入力

必須項目は `client_id`、`production_sheet_url`、`basicInfo`、`serviceName`、`pillarKeywords`、`existingArticles`、`articleCategories`、`retired_article_ids`。`retired_article_ids` は同一顧客のゴミ箱内成果物で使用済みの記事IDを含む配列とし、0件でも空配列を明示する。任意項目は `specifiedTopic`、`currentYear`。

`articleCategories` は `基本情報` に登録済みのカテゴリ名とカテゴリスラッグの組を20件すべて渡す。形式は `[{"name":"料金・費用ガイド","slug":"price-guide"}, ...]`。20件未満、空欄、カテゴリ名またはスラッグの重複、英小文字・数字・ハイフン以外のスラッグは記事企画の入口で停止する。生成された `articleCategory` は `name` と完全一致させる。一致しない場合は `記事カテゴリ不一致` として再生成し、類似名への推測変換は行わない。

生成された `hashtags` は1件以上を必須とし、先頭の `#` は保存時に除去してカンマ区切りで正規化する。本文作成前の企画確認では、方向性、検索意図、責任ラベル、種別、ピラー、クラスター、タイトル、今回作成する記事内容に加えて、記事カテゴリとハッシュタグを必ず提示し、確認記録にも同じカテゴリとハッシュタグを含める。`種別` は `ピラー` または `クラスター` のみとし、ピラーは親テーマ、クラスターはピラーから派生する子テーマを示す。確認記録のカテゴリまたはハッシュタグが企画と一致しない場合は本文作成へ進めない。

## 本文作成入力

必須項目は `client_id`、`production_sheet_url`、`article`、`content_version`、`plan_review`。`article` は `client_id`、`article_id`、`title`、`category`、`responsibilityLabel`、`basicInfo`、`deepDive` を持つ。`plan_review` は同じ `client_id`、`article_id`、`content_version` を持ち、`review_type=OUTLINE`、`result=PASS`、評価AI、作成と異なる評価 `run_id`、評価日時を必須とする。人の承認は完成物に対する `FINAL_APPROVAL` の1回だけとする。

任意項目は `existingArticles`、`publishedSiteArticles`、`site_duplicate_decision`、`sources`、`asOf`、`internalLinkLimit`、`rankingSnapshots`。過去記事、公式サイト公開記事、一次情報、順位データの全レコードに同じ `client_id` を必須とする。

`production_sheet_url` はSMARTAIO本番Drive直下クライアントフォルダーの同じ `client_id` に登録されたGoogle Sheets URLと一致させる。`existingArticles` と内部リンク候補はそのシートの `記事一覧` だけから作り、別顧客や中央管理台帳の記事行で補完しない。内部リンクは `plan-internal-link-graph` で新記事から既存記事への発リンクと、既存記事側から新記事へ戻す `reciprocal_update_plan` を作る。既存記事があるのに有効な内部リンクが0件、または戻しリンク計画がない場合は `verify-internal-link-graph` を不合格にする。

`finalize-idea` は通常運用では記事一覧、クラスター、`retired_article_ids` の最大番号より大きい記事IDだけを採番する。`retired_article_ids` が未指定、配列でない、または `ID-00001` 形式でない場合は停止し、ゴミ箱内の記事IDを再利用しない。

利用者が「フォルダーを削除して最初から」「一から通常フローで実行」など、過去成果物を破棄した検証・全作り直しを明示した場合だけ、`article_id_sequence_mode=RESET_FROM_ONE_AFTER_EXPLICIT_REBUILD` と `explicit_full_rebuild_confirmed=true` を入力できる。このモードでは `retired_article_ids` は再利用防止の履歴として保持するが、採番計算からは除外し、新しい制作シート内の有効記事IDだけを基準にする。新しい制作シートに有効記事IDがなければ最初の記事は `ID-00001` とする。通常運用でこのモードを使ってはならない。

`publishedSiteArticles` は同じクライアントの公式サイトで公開済みの記事だけを持ち、最低限 `client_id`、`title`、`url` を必須とする。ここで近い記事が見つかった場合は自動除外せず、`SITE_DUPLICATE_DECISION_REQUIRED` と次の2択を返す。

- `PROCEED_AS_NEW`（このまま進める）: 公式サイトとの近さと選択履歴を残し、新規記事として続行する。
- `CREATE_ALTERNATIVE`（別記事にする）: `ALTERNATIVE_ARTICLE_REQUIRED` を返し、検索意図・責任範囲を変えた企画へ戻す。

`site_duplicate_decision` がない間は本文生成を開始しない。クライアント別記事制作シート内の完全重複は常に `BLOCKED` とし、この選択では解除しない。

## 責任ラベル

形式は `短縮タイトル｜主責任｜深責任1,深責任2,深責任3,深責任4｜補助責任1,補助責任2`。主責任1個、深責任4個、補助責任2個を必須とし、同一記事内または既存記事との完全一致を許可しない。

## 記事タイトル

タイトル生成は `article-ideas` プロンプト正本を維持し、その後ろへ新システムの `title-refinement-v1` を追加して行う。検索意図、対象読者、主責任、結論から異なる5案を内部比較し、最良の1案だけを既存の `title` フィールドへ出力する。出力JSONの列・キーは増やさない。

機械判定は、22〜58文字、メインキーワードまたは自然な同義語、読者課題、具体的価値、責任範囲との一致、根拠のない煽り表現の不使用を確認する。70点未満または重大違反は `RETRY_REQUIRED` とし、`retry_errors` を次回の企画プロンプトへそのまま渡す。

## 出力

`content_prompt` は `assembly-rules.json` の `article-writing` 規則で組み立てる。`context_packet` は新システムの一次情報、内部リンク候補、重複判定、公式サイト重複に対する利用者の選択であり、保護プロンプト本文へ結合しない。

`finalize-idea` は `publication_plan` に登録済み記事カテゴリ、カテゴリスラッグ、記事スラッグを返す。`publication_site_url` と `permalink_structure` がある場合だけ想定URLを組み立てる。サイトURLが未設定なら `PUBLICATION_SITE_URL_REQUIRED`、パーマリンク構造が未設定なら `PERMALINK_STRUCTURE_REQUIRED` とし、推測URLを作らない。WordPress投稿後の正式URLを最終的な正本とする。ハッシュタグは記事制作シートの `ハッシュタグ` と記事ID JSONの `basicInfo.hashtags` で一致させ、Googleドキュメント本文には「タグ」「出典」「参考情報」セクションを出さない。Googleドキュメント本文はWordPressコピペ用の装飾済み本文として作り、制作用の `[H1]`、`[P]`、`[UL]`、`[LI]`、`[MARK]`、`[DIAGRAM]` などのタグ文字列を可視テキストとして残してはならない。Markdown本文をそのまま貼った `##` 見出し、Markdown表、URLだけの段落、裸URLの内部リンク、通常段落の番号リストだけで作った疑似箇条書きも禁止する。Q&A直後にはHタグなしの「関連記事」ラベルを置き、対象記事タイトルへネイティブリンクを付ける。`[DIAGRAM]` はタグ内の元文章を本文にそのまま残し、図解化した箇所として背景色で示す。図解元は通常の本文段落として自然に読める文章にし、短文・項目の羅列や「図解：〜」などのキャプションだけへ置き換えてはならない。図解元本文は図解の読み方や意図の説明文ではなく、図解画像にした内容そのものを本文として述べ、本文と図解の項目・順序・意味を一致させる。

記事本文・JSON・Googleドキュメントに加えて、`build-structured-markup` で `{記事ID}_schema.jsonld` を作成し、`03_記事/{記事ID}` へ保存する。構造化マークアップは `Article`、`BreadcrumbList`、本文Q&A 5件と同じ順序・同じ内容の `FAQPage` を必須にし、手順記事の場合は `HowTo` を追加する。`Article.description` は記事一覧の `メタディスクリプション` と完全一致させ、`Article.mainEntityOfPage` は記事一覧の `公開URL` と完全一致させる。`Article.author` は `@type=Organization` とし、`name` には基本情報のプロフィールウィジェット用編集部名を入れる。`publisher`、`keywords`、アイキャッチ画像用の `image` は含めない。`verify-structured-markup` でファイル名、Drive URL、記事フォルダー所属、シート再読込を確認できない場合は完成報告へ進めない。

リライトは `prepare-rewrite-plan` で順位低下、クリック減、表示回数減、検索意図変化から候補を自動抽出する。候補抽出と下書き作成は自動化対象にできるが、既存公開記事の更新・WordPress反映は `FINAL_APPROVAL` または別途の更新承認がある場合だけ許可する。順位データがない記事を計測済みとして扱わず、別顧客の順位データを使わない。

## 5段階ライフサイクル

| 段階 | 必須成果物 | 完了条件 |
|---|---|---|
| `KW_RESEARCH` | KW候補、検索実測、読者の疑問 | 実測日と根拠がある |
| `OUTLINE_AI_REVIEW` | 独自性、結論、見出し、根拠計画 | 作成と別のAIによる`OUTLINE`レビュー合格 |
| `DRAFTING` | 本文、保護プロンプト版・SHA-256、タグ・出典セクション0件 | `DRAFT`レビュー合格、Doc出力前検査でタグ・出典セクションが出力されず、Google Docs出力時に制作用タグがネイティブ装飾へ変換され、Markdown見出し・Markdown表・裸URL段落が0件である |
| `FACT_CHECK` | 数値・固有名詞・主張の確認、出典 | 作成と別の実行で未確認主張0件 |
| `FINISHING` | 関連記事リンク、構造化マークアップ、図解画像、タイトル画像1枚、記事内写真3枚 | `verify-internal-link-graph`、`verify-structured-markup`、タイトル画像1枚・通常画像3枚のPNG・1536x1024・`{記事ID}_1.png`〜`{記事ID}_4.png` と図解PNG・1536x1024・`{記事ID}_diagram_1.png` を実生成し、内部リンクはQ&A直後のHタグなし「関連記事」配下の記事タイトルリンクとして検証し、構造化マークアップに `keywords` とアイキャッチ画像用 `image` がなく、タイトル画像は記事タイトル文字を許可しつつ背景の読める文字をできるだけ避け、通常画像3枚も読める文字をできるだけ避ける指示と確認証拠を持ち、この文字抑制ルールは図解画像に適用せず、図解元が自然な本文段落としてDoc内で色付けされ、その本文が図解内容そのものであり、その直後に図解画像が置かれ、本文と図解の項目・順序・意味の一致証拠、1枚目のタイトル表示証跡を持ち、Driveと記事一覧の `画像完成`・`画像URL`・`図解完成`・`図解URL` を再読込した `image_persistence` が合格し、作成と別のAIによる`FINAL`レビュー合格 |
| `AWAITING_FINAL_APPROVAL` | 完成物、AIレビュー結果、公開予定情報 | 人が同じ記事・版へ`FINAL_APPROVAL`を記録 |

`FINISHING` の図解は、作成と異なる評価 `run_id` と評価モデルを記録し、`inspection_method=ORIGINAL_IMAGE_VISUAL_INSPECTION` で原寸確認する。保存対象SHA一致、ID-00012相当の基準比較、品質85点以上、画面利用65〜95%、タイトルまたは文脈見出し、補足文、視線誘導、情報階層、読める日本語、誤字なし、判断結果または結論、低密度でない、単純ラベル列でない、本文忠実性、著作権安全性をすべて合格させる。未達時は `FINISHING` に留め、別SHAへ再生成する。

`FINAL_APPROVAL` が記録された場合だけ `READY_TO_PUBLISH` へ進める。公開操作を行う場合も、この最終承認記録を再利用し、途中承認や別の公開承認は求めない。
