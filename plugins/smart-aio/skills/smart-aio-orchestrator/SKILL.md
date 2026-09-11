---
name: smart-aio-orchestrator
description: Smart AIOの会話用入口として、複数クライアントの記事企画、KW調査、骨子、本文、画像、段階別AIレビュー、重複防止、内部リンク、一次情報、ニュース提案、Skill改善、承認、Google Drive・Sheets出力を既存Skillsへ振り分ける。利用者がSmart AIO、記事作成、記事更新、品質確認、Skill改善、画像作成、ニュース収集、順位確認、成果物保存を依頼したときに使う。
---

# Smart AIO 統括

このSkillをSmart AIOの唯一の会話用入口にする。OpenAI APIは呼ばず、現在のCodexまたはChatGPTの会話で制作し、個別処理はSmart AIOプラグイン内のSkillsと同梱ランタイムだけを使う。

## 必須ルール

Smart AIOに関する作業では、ファイル作成、ブラウザ操作、外部保存を始める前に、このSkillと振り分け先の全Skillを読み、使用するSkill名と担当工程を明示する。該当Skillの標準フローを手作業で代替してはならない。必要なSkillを実行していない、または実行証拠を残せない場合は `BLOCKED_SKILL_NOT_EXECUTED` として停止する。

1. 最初に `$smart-aio-intake` で依頼を整理する。新規クライアントはクライアント名と公式サイトURLだけを利用者の必須入力とする。システムは `prepare-client-onboarding` の前に、SMARTAIO直下クライアントフォルダー、候補Drive項目ごとの `trashed` 真偽、廃止済み記事IDを取得する。`trashed=true` のID・URLは現行登録とみなさず、新しいレコード・フォルダー・記事へ再利用しない。通常運用では廃止済み記事IDを採番予約へ含めるが、利用者が「フォルダーを削除して最初から」「一から通常フローで実行」と明示し、現行シート内に有効記事IDがない全作り直しでは `article_id_sequence_mode=RESET_FROM_ONE_AFTER_EXPLICIT_REBUILD` と `explicit_full_rebuild_confirmed=true` を使い、廃止済みIDを採番計算から外して `ID-00001` から開始してよい。証拠が揃い `NEW_ACTIVE_REGISTRATION` になった場合だけ、SMARTAIO本番Drive直下へクライアントフォルダーを作成し、`prepare-client-source-register`、公式サイト取得、`validate-basic-info`、`validate-site-title` の順で空の一次情報台帳、基本情報、プロフィールウィジェット用の著者情報、サイトタイトル案、`企画確認` タブを自動作成する。記事制作シートを作成した後は、基本情報、プロフィールウィジェット用の著者情報、カテゴリ・ピラー、サイトタイトル3案を利用者へ提示し、方向性とサイトタイトルの確認が取れるまで記事企画へ進めない。確認後は記事企画へ進む前に `prepare-news-settings-template` を実行し、`06_ニュース` に `enabled=false` のニュース設定ひな型を作成する。ひな型作成証拠がない場合は `NEWS_SETTINGS_TEMPLATE_REQUIRED` として停止する。記事企画を作ったら、参照シート型の `企画確認` タブへ `制作順`、`確認ID`、`記事トピック`、`種別`、`ピラー`、`クラスター`、`記事タイトル案`、`対策キーワード`、`検索意図`、`AI引用戦略`、`記事カテゴリ`、`ハッシュタグ` を出し、クライアントが `確認ステータス` を `承認` / `OK` / `APPROVED` にした行を読み戻すまで本文作成へ進めない。`種別` は `ピラー` または `クラスター` のみとし、ピラーは親テーマ、クラスターは親テーマから派生する子テーマとして扱う。一次情報は自動記入せず、顧客から受領後に登録する。その他の項目は自動取得後に必要なものだけ確認する。
2. `$client-context` で対象クライアントの情報と権限を確認する。別クライアントの資料、ニュース、記事は混ぜない。新規・既存を問わず、SMARTAIO本番Drive直下の対象クライアントフォルダーと制作シートの設定から、そのクライアント専用シートを開く。担当者が操作する記事の正本は専用シートの `記事一覧` とし、中央の `記事台帳` は索引・監査用に限る。
3. Google Driveへフォルダー、Docs、Sheets、JSON、画像を作成または移動する前に、SMARTAIO本番Drive URL、対象クライアントフォルダーURL、記事制作シートURL、`03_記事/{記事ID}` までの親階層、Drive候補の `trashed=false` を確認する。`root`、My Drive直下、親未指定アップロード、SMARTAIO本番Drive外フォルダーを一時保存先や作成先にしてはならない。ネイティブ変換でMy Drive親が付く場合は完成扱いの前に顧客フォルダー配下へ移動し、My Drive親が残っていないDriveメタデータを `drive_scope_evidence` として残す。
4. 基本情報、サイトタイトル、記事企画、記事本文、記事画像は必ず `$content-prompts` を使う。最初にSHA-256を検証し、原文と `assembly-rules.json` の組み立て順を変更しない。記事企画だけは、`article-ideas` 正本を組み立てた後へ、利用者承認済みの `title-refinement-v1` を別バージョンとして追加し、タイトルを5案から内部選定する。
5. 記事企画と本文は `$article-production`、一次情報は `$source-retrieval`、検査は `$article-quality-review`、保存は `$drive-sheets-output` へ渡す。
6. 顧客別ニュース、毎日の収集、記事提案、Ahrefs準備は `$news-opportunity` へ渡す。新規登録時のニュース設定は収集開始ではなく、無効状態の初期設定作成までを必須にする。Ahrefs設定がない間は取得せず準備状態だけを返す。
7. 記事の企画、骨子、本文、品質確認、内部リンク網、構造化マークアップ、画像、図解、仕上げはAIが段階管理する。本文作成へ進む前に、記事の方向性、検索意図、責任ラベル、種別、ピラー、クラスター、タイトル、記事カテゴリ、ハッシュタグ、今回作成する記事内容を `企画確認` タブへ出し、クライアント承認行のURL、行番号、承認ステータス、確認者、確認日を証拠として読み戻す。会話内の了承だけ、または未承認・差し戻し行だけでは本文作成へ進めない。記事作成依頼が来たら `select-next-approved-plan` で `確認ステータス` が `承認` / `OK` / `APPROVED`、`制作状態` が未完了、`記事URL` が空の行を `制作順` 昇順で1件だけ選ぶ。選択後に、タイトル、記事カテゴリ、ハッシュタグ、種別、ピラー、クラスター、メインKW、サブKW、検索意図、責任ラベル、今回作成する記事内容を会話内で提示し、「この内容で1記事を作成してよいですか？」と確認する。利用者が `OK` / `承認` / `この内容で作成` などで明示了承するまでは、本文、画像、図解、Drive保存、Sheets更新を開始せず、`AWAITING_ARTICLE_CREATION_USER_CONFIRMATION` として停止する。利用者の明示了承後に同じ候補を `user_confirmed_article_creation=true` で再選択し、`article_creation_user_confirmation.confirmed=true` を証拠にしてから制作へ進む。選択後に `validate-plan-confirmation-candidates` で同一顧客の `記事一覧`、`クラスター`、`企画確認` 既存行、公式サイト公開記事との重複を検査し、`BLOCKED` または公式サイト重複の判断待ちがある場合は本文作成へ進めない。50案すべての制作が完了し追加依頼が来たら `prepare-additional-plan-confirmation-ideas` で次の50案を採番・重複判定して `企画確認` へ追記する。内部リンクは同じピラー・クラスター関係を目安に、新記事から既存記事への発リンクと既存記事側への戻しリンク更新計画を作り、別顧客や中央台帳だけの記事を混ぜない。発リンクは本文末尾の「こんな記事も見てね」「関連記事」「あわせて読みたい」型のまとめ枠に置かず、本文中で関連話題が自然に出る段落へ挿入する。構造化マークアップの `Article.author.name` には同じクライアントの基本情報にあるプロフィールウィジェット用の編集部名を入れ、`publisher` は出力しない。図解は本文内の自然な説明段落を `[DIAGRAM]...[/DIAGRAM]` で色付けし、Googleドキュメントではタグ内の元文章を通常本文としてそのまま残した直後に図解画像を置く。図解対象文は記事の流れで違和感なく読める本文にし、「比較項目を確認する。費用項目を確認する。」のような短文・項目の羅列、画像用メモ、キャプションだけを本文にしてはならない。図解元本文は図解の読み方や意図を説明する文ではなく、図解画像にした内容そのものを本文として述べる。元文章を「図解：〜」などのキャプションだけに置き換えず、その本文抜粋に含まれる2〜6個の文言または意味を変えない短いラベルを画像へ入れる。図解画像は元文章を見やすく変換するためだけに作り、本文と図解の項目・順序・意味が一致していることを検証する。図解プロンプトでは人が見やすい図であることを最優先し、企業ロゴ、アニメキャラクターなど著作権のあるもの、本文にない新しい概念・判断項目・追加説明を禁止する。意味のないチェックマークだけの帯や余白埋めの記号列は使わず、背景は白または淡色の不透明背景にする。人へ求める公開承認は完成物に対する `FINAL_APPROVAL` として別に記録する。ただし公式サイトの公開記事と近い候補が見つかった場合は、自動除外せず、公開記事のタイトル・URL・一致理由と「このまま進める」「別記事にする」の2択を提示して選択待ちにする。ニュース起点の記事も同じ重複選択ゲートへ通す。記事削除だけは人の明示指示を必須にし、一度9件まで、完全削除せずGoogle Driveのゴミ箱へ移す計画だけを作る。
8. 保護プロンプト本文の外側で、重複防止、内部リンク、一次情報、承認、監査、冪等制御を行う。
9. 作成役と評価役を分け、方向性、骨子、本文、完成物の各段階でレビューする。同じ `run_id` を作成と評価に使わない。
10. Skill改善とリライト判断は `$skill-planner`、`$skill-evaluator`、`$skill-runtime-evaluator`、`$fix-skill`、`$skill-feedback-curator` へ分ける。記事作成、リライト、順位変動、反応データから改善候補や `prepare-rewrite-plan` の候補を自動抽出してよい。リライト下書き作成は自動化対象にできるが、既存公開記事の更新・WordPress反映、保護プロンプトやSkillへの反映は自動適用せず、管理者承認とテスト後に新バージョンとして公開する。保護プロンプト本文は自動で書き換えない。
11. 本番開始は証拠付きの必須10項目がすべて `PASS` の場合だけ許可する。Ahrefs接続は任意項目とし、未接続を理由に記事制作の本番開始を妨げない。
12. Scheduled Tasksは顧客ごとにニュース収集、順位確認、週次レポート、月次レポートの設定案を作り、認証情報を保存せず、人が有効化するまで外部実行を許可しない。新規クライアント展開時または本番実装時は、`prepare-scheduled-tasks` が返す `activation_prompt` を必ず利用者へ提示し、「有効化する」または同等の明示承認が返るまでCodex Automation、Workspace Agent schedule、外部cronの作成・有効化を行わない。
12-2. 週次・月次レポートは、同じ `client_id` の記事一覧、リライト記録、実行履歴、レビュー、順位・分析、WordPress URLだけを集計し、今週・今月の記事作成数、リライト数、順位上昇/下落、次アクション、改善候補を出す。出力はデフォルトをGoogleドキュメントとし、利用者が指定した場合だけGoogleスプレッドシートへ出す。どちらも顧客フォルダー配下の `07_順位・分析` に保存し、管理台帳へレポートURLを記録する。別顧客のデータが混ざる場合は停止する。レポート作成タスクも人が有効化するまで外部実行しない。
13. `基本情報`、`企画確認`、`記事一覧`、`キーワード`、`クラスター`、`設定` の6シートを表示する。`基本情報` はホーム兼クライアント情報、`企画確認` は初回の記事方向性確認、`記事一覧` は日常の制作確認、`キーワード` は検索語履歴、`クラスター` はクラスター一覧とピラー一覧の同時確認に使う。`設定` は確認可能にするが、保護プロンプト本文はSkills正本から読み込み、シート上で変更・実行しない。
14. 記事完成の報告には、記事本文のGoogleドキュメントURL、記事を格納したGoogle DriveフォルダーURL、タイトル画像1枚・通常画像3枚の画像フォルダーURL、図解画像URL、構造化マークアップ出力物URL、更新したクライアント別記事制作シートURLを必ず併記する。報告前に `audit-client-run` を実行し、SMARTAIO直下クライアントフォルダー、7フォルダー、一次情報台帳、制作シート設定、サイトタイトル確認、ニュース設定ひな型、KW記録、企画確認シート承認、カテゴリ・タグ確認、骨子レビュー、Doc/JSON保存、構造化マークアップ保存・検証、Doc本文のタグ表示、完成物レビュー、画像検証、図解検証、内部リンク網検証、クラスター行、中央記事台帳、実行履歴がすべて `PASS` の場合だけ `prepare-completion-report` へ進む。Googleドキュメントを保存後に再読み込みし、センチネル置換後に読み戻した本文と期待本文の正規化文字数・SHA-256が一致し、同じ文書IDを対象Driveフォルダー内で確認した証拠と `drive_scope_evidence` を `prepare-completion-report` へ渡す。検査に合格するまでは「完成」「格納済み」「シート更新済み」と断定しない。

## 図解視覚品質ゲート

図解は生成直後に作成と異なる `review_run_id` の評価役が評価モデルを記録し、`inspection_method=ORIGINAL_IMAGE_VISUAL_INSPECTION` で原寸確認してID-00012相当の基準画像と比較する。保存対象SHAと評価対象SHAを一致させ、品質点85以上、画面利用率65〜95%、タイトルまたは文脈見出し、補足文、視線誘導、情報階層、読める日本語、誤字なし、判断結果または結論、低密度でない、項目名とアイコンだけの単純列でない、本文忠実性、著作権安全性をすべて合格させる。欠損または不合格が1件でもあれば `IMAGE_PERSISTENCE_DIAGRAM_VISUAL_QUALITY_*` で停止し、別SHAの図解を再生成して再レビューする。合格前にDrive保存、`図解完成` 更新、`FINAL` 合格、完成報告へ進めない。

## 標準フロー

1. 受付: 依頼内容を整理して `CONTEXT_READY` または `BLOCKED` を返す。
2. 顧客確認: 対象顧客の専用制作シートにある基本情報、企画確認、記事一覧、クラスター、設定と、同じ顧客の一次情報、ニュース設定、出力先だけを読む。
3. 新規登録後設定: 新規クライアントではサイトタイトル確認後、記事企画前に `06_ニュース` へ無効状態のニュース設定ひな型を作成し、作成証拠を記録する。顧客ごとの定期処理設定案にはニュース収集、順位確認、週次レポート、月次レポートを含め、`activation_prompt` で「有効化しますか？」を提示する。人が有効化するまで収集や外部実行はしない。
4. KW調査: 検索実測、候補KW、検索上位の構成、読者の疑問を記録する。
5. タイトル・骨子: 検索語、読者課題、具体的価値が一読で伝わるタイトルを5案から内部選定し、独自性、結論、見出し、根拠計画を作る。制作と別のAIによる `OUTLINE` レビューで、タイトルの訴求力と本文整合を含めて合格させる。その後、`企画確認` タブへ確認用の行を作り、記事カテゴリとハッシュタグを含む承認済み行を読み戻してから本文作成へ進む。
6. 制作前確認: `select-next-approved-plan` の `article_creation_user_confirmation.article_summary` を利用者へ提示し、この内容で作成してよいか明示確認する。確認がない場合は制作を開始しない。
7. 制作: SHA-256が一致した保護プロンプトを一字も変えず、骨子に沿って記事または画像を作る。
8. 検品: 作成と別の評価実行で、機械判定、数値・固有名詞のWeb照合、AI採点を行う。
9. 仕上げ: 内部リンク網、構造化マークアップ、図解、記事内画像、アイキャッチを整える。`plan-internal-link-graph` で新記事から既存記事へのリンクと既存記事側の戻しリンク更新計画を作り、本文中の自然な設置文を `placement.source_excerpt` として残す。`prepare-internal-link-sheet-output` で本文へ入れる発リンクURL、発リンクを置いた本文中の設置文、戻しリンク予定URL、管理JSON URLを `内部リンク管理URL` に読める形で戻す。`build-structured-markup` で `{記事ID}_schema.jsonld` とWordPressのカスタムHTML等へそのまま貼れる `<script type="application/ld+json">` 付きコピペ用の `{記事ID}_schema_wordpress_copy.txt` を作成し、シート既存列の `構造化URL` はコピペ用を指す。構造化マークアップの `Article.author.name` は基本情報のプロフィールウィジェット用編集部名を使い、`publisher` は含めない。利用者へは「構造化マークアップ出力物」として報告する。図解はGoogleドキュメント本文内の `[DIAGRAM]...[/DIAGRAM]` 色付け範囲を正本にし、画像内テキストはその範囲から抽出した `diagram_source.text_items` と完全一致させる。`1536x1024` のPNGを1記事5枚（`{記事ID}_1.png` は記事タイトルを含むタイトル画像、`_2.png`〜`_4.png` は異なる構図の通常画像、`{記事ID}_diagram_1.png` は図解）現在の会話内の正規画像生成フローで実際に生成し、顧客フォルダー配下の `04_画像/{記事ID}` フォルダーへ保存する。PIL、ImageDraw、Image.new、ローカルPython、`build_articles.py`、テンプレート、プレースホルダー由来の画像は記事画像として扱わず、Driveへ出力済みでも `verify-article-visual-persistence` で不合格にする。画像フォルダーにJSON、Markdown、テキスト、リライトフォルダー、検証フォルダーが混在する場合も不合格にする。タイトル画像1ファイル、通常画像3ファイル、図解1ファイルのDrive再読込、記事一覧の `画像完成`・`画像URL`・`図解完成`・`図解URL`、構造化マークアップの `構造化完成`・`構造化URL`、本文内リンク設置文付きの `内部リンク状態` の再読込が完了するまで `FINISHING` を完了せず、その後に `FINAL`レビューを行う。
9-2. 画像の背景文字抑制: タイトル画像は記事タイトルの文字だけを読める文字として許可し、背景の看板、ポスター、端末画面、装飾、ロゴ風要素などには読める文字をできるだけ入れない。通常画像3枚も、看板、ポスター、端末画面、背景、装飾などに読める文字ができるだけ入らない構図にする。このルールはタイトル画像の背景と本文写真・背景写真に適用し、図解画像には適用しない。
10. 人の最終確認: AIレビュー済みの完成物、出典、内部リンク、画像、公開予定情報をまとめて提示し、同じ記事・版に対する1回の `FINAL_APPROVAL` を待つ。
11. 出力: 顧客専用Driveとクライアント別記事制作シートへ保存し、中央管理台帳には索引・監査情報だけを同じ `run_id` で記録する。
12. 完成報告: `audit-client-run` で標準チェックポイントを確認し、企画確認シート承認、制作前の会話内確認、記事カテゴリ・ハッシュタグの確認、Googleドキュメント本文のタグ表示、Googleドキュメント再読み込み、読み戻し前のセンチネル置換、期待本文との正規化文字数・SHA-256一致、対象Driveフォルダー内の同一文書ID、構造化マークアップ、内部リンク網、図解画像を確認する。続けて `verify-article-document-readback` に、顧客ID、記事ID、文書ID、改訂ID、正規化文字数、SHA-256、構造順、3つの要点、黄色マーカー2〜4箇所、図解元段落1箇所、画像5枚のobject ID・役割・ファイル名・Drive URL・SHA-256・順序、本文内リンクのURL・アンカー・設置文、Q&A 5件、タグ本文、制作用タグ0件を渡す。`prepare-completion-report` はこの証拠を `document_persistence`、`image_persistence`、`internal_link_graph` と照合し、同一成果物と確認できた場合だけ6リンクを返す。更新した制作シート行も読み戻して利用者へ送る。

処理別の呼び分け、停止条件、ランタイム対応は [統括ワークフロー](references/workflow-map.md) に従う。

## 同梱ランタイム

実装の正本はこのPluginの `scripts/` 以下に置き、すべての処理を同梱ランタイムから実行する。

```bash
node scripts/smart_aio_orchestrator.mjs verify
node scripts/smart_aio_orchestrator.mjs <command> input.json
```

主なコマンドは `prepare-client-production-sheet`、`validate-client-production-sheet`、`prepare-plan-confirmation-sheet`、`validate-plan-confirmation-candidates`、`select-next-approved-plan`、`prepare-additional-plan-confirmation-ideas`、`prepare-client-source-register`、`validate-client-source-register`、`prepare-client-article-sheet-update`、`prepare-client-onboarding`、`prepare-news-settings-template`、`prepare-basic-info`、`validate-basic-info`、`prepare-site-title`、`validate-site-title`、`prepare-category-slugs`、`validate-category-slugs`、`prepare-images`、`verify-image-persistence`、`verify-article-visual-persistence`、`plan-internal-link-graph`、`prepare-internal-link-sheet-output`、`verify-internal-link-graph`、`build-structured-markup`、`verify-structured-markup`、`prepare-rewrite-plan`、`prepare-rewrite-artifact-output`、`audit-client-run`、`plan-idea`、`prepare-idea`、`analyze-title`、`validate-ideas`、`finalize-idea`、`prepare-article`、`prepare-article-record-update`、`prepare-document-output`、`verify-article-document-readback`、`prepare-xlsx-export`、`prepare-cluster`、`complete-cluster`、`prepare-batch-notification`、`create-batch`、`batch-next`、`apply-batch-step`、`fail-batch-step`、`stop-batch`、`resume-batch`、`create-article-lifecycle`、`advance-article-lifecycle`、`review-article`、`prepare-stage-review`、`evaluate-stage-review`、`draft-workflow`、`plan-skill`、`evaluate-skill`、`evaluate-skill-run`、`propose-skill-fix`、`curate-skill-feedback`、`authorize-skill-change`、`create-readiness`、`record-readiness`、`evaluate-readiness`、`prepare-scheduled-tasks`、`authorize-scheduled-task`、`create-performance-report`、`create-report-schedule`、`analyze-performance-feedback`、`propose-performance-skill-update`、`news-proposal`、`prepare-ahrefs`、`deletion-plan` である。
画像保存後は `verify-article-visual-persistence`、構造化マークアップ保存後は `verify-structured-markup`、内部リンク設定後は `verify-internal-link-graph`、記事保存後の完成報告は `prepare-completion-report` を使う。画像プロンプトだけ、画像名の記録だけ、アイキャッチ指定だけ、構造化マークアップ案だけ、内部リンク候補だけでは完了にしない。

## 停止条件

- `client_id` が未確定、権限外、またはデータに別顧客が混在している。
- 新規クライアントの記事制作シート・基本情報・カテゴリ・ピラー・サイトタイトル案について、利用者の方向性確認が未完了である。
- `企画確認` タブがない、標準列が一致しない、または対象記事行の `確認ステータス` が `承認` / `OK` / `APPROVED` ではない。
- 新規クライアントのサイトタイトル確認後、`06_ニュース` に `enabled=false` のニュース設定ひな型を作成した証拠がない。
- SMARTAIO本番Drive直下のクライアントフォルダー候補、Drive候補ごとの `trashed` 真偽、廃止済み記事IDのいずれかが未確認、または有効な孤立Drive項目・複数の有効クライアントフォルダーが競合している。
- 保護プロンプトのSHA-256、文字数、対応キーのいずれかが一致しない。
- 企画が制作シート内の重複判定で `BLOCKED`、タイトル品質が70点未満、企画確認シートでのクライアント承認が未完了、記事カテゴリ・ハッシュタグの確認が未完了、公式サイト重複への選択が未回答、一次情報が利用不可、独立AIレビューが不合格、または公開前の `FINAL_APPROVAL` がない。
- 記事作成依頼後に、選定された1件の記事タイトル、カテゴリ、ハッシュタグ、検索意図、作成内容を会話内で提示しておらず、利用者の明示了承を取得していない。
- 保存先が対象顧客配下ではない、または削除の明示確認がない。
- `drive_scope_evidence` がない、`output_location` が `SMARTAIO_DRIVE` ではない、SMARTAIO本番Driveと直下クライアントフォルダーを確認していない、記事フォルダーが対象クライアントDrive配下ではない、My Drive/root親が残っている、または `03_記事/{記事ID}` の親階層を確認していない。
- 使用必須のSkillを読み終えていない、使用工程を明示していない、またはSkillの標準フローを手作業で代替しようとしている。
- 記事本文URL、Drive格納先フォルダーURL、タイトル画像1枚・通常画像3枚の画像フォルダーURL、図解画像URL、構造化マークアップ出力物URL、更新したクライアント別記事制作シートURLのいずれかがない、Google URLではない、または実際の保存・更新を確認できない。
- `audit-client-run` が `STANDARD_CLIENT_RUN_AUDIT_PASS` ではない。設定タブ、ニュース設定、KW記録、カテゴリ・タグ確認、Doc本文のタグ表示、構造化マークアップ、レビュー記録、画像・図解検証、内部リンク網、クラスター行、中央記事台帳、実行履歴のいずれかが未確認のまま完成報告へ進めてはならない。
- 週次・月次レポートまたは改善候補に別顧客のデータ、未計測の順位を計測済みと扱う記述、`07_順位・分析` 以外へのレポート保存、管理台帳へのレポートURL未記録、保護プロンプト本文の自動変更、管理者承認なしのSkill反映が含まれている。
- 顧客展開時または本番実装時に、`activation_prompt` を提示せずに定期処理やAutomationを作成・有効化しようとしている。
- Googleドキュメントの再読み込み、センチネル置換後の本文読み戻し、正規化文字数・SHA-256一致、対象Driveフォルダー内の同一文書ID確認のいずれかがない。
- タイトル画像1枚、通常画像3枚、図解1枚の実画像、所定のファイル名、1536x1024、PNG、1枚目のタイトル表示証跡、各ファイルのSHA-256・Drive URL・`04_画像/{記事ID}` フォルダー所属、記事一覧の `画像完成`・`画像URL`・`図解完成`・`図解URL` の読み戻しのいずれかがない。
- タイトル画像の背景または通常画像3枚について、読める文字をできるだけ避ける指示と確認証拠がない。またはタイトル画像の背景や通常画像に、記事タイトル以外の具体的な日本語・英数字、ロゴ風文字を意図的に入れている。この停止条件は図解画像には適用しない。
- 画像の `source_tool` または `generation_method` が会話内の正規画像生成フローを示さない、またはPIL、ImageDraw、Image.new、ローカルPython、`build_articles.py`、テンプレート、プレースホルダー由来である。
- 画像フォルダー内に5枚のPNG画像以外のJSON、Markdown、テキスト、リライトフォルダー、検証フォルダーが混在している。
- `内部リンク管理URL` に本文へ入れる発リンクURL、発リンクを置いた本文中の設置文、戻しリンク予定URLが人に読める形で記録されていない、または発リンクが本文末尾の関連記事枠に置かれている。
- 図解元本文がGoogleドキュメント本文内で色付けされていない、図解内テキストが本文抜粋由来の概念から外れている、または図解元本文が図解内容そのものではなく図解の説明文になっている。
- シート既存列の `構造化URL` がWordPressへコピペしやすい `{記事ID}_schema_wordpress_copy.txt` を指していない。

停止時は原因、影響する成果物、再開に必要な情報を示し、推測で処理を続けない。
