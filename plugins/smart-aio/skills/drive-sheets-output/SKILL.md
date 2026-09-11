---
name: drive-sheets-output
description: Smart AIOの企画書、記事、画像、レビュー結果を顧客別Google Driveへ保存し、管理台帳へURL、状態、実行IDを記録する。成果物が完成し、所定の保存先へ出力するときに使う。
---

# Drive・Sheets出力

ファイルと管理台帳を同じ実行単位で更新し、保存先不明や二重出力を防ぐ。

## 手順

1. `client_id`、`article_id`、`run_id`、成果物種別、承認状態を確認する。
2. SMARTAIO本番Drive直下の対象クライアントフォルダー以外へ出力しない。クライアントフォルダー内または対象クライアント制作シートの `設定` から `記事制作シートURL` を確認し、記事の操作・状態・成果物URLはそのクライアント専用制作シートへ記録する。一次情報は `01_一次情報` 内の `${client_id}_${クライアント名}_一次情報台帳`、ニュースは `06_ニュース` へ保存する。
   - Google Driveの `root`、My Drive直下、親フォルダー未指定のアップロード、またはSMARTAIO本番Drive直下の対象クライアントフォルダーから辿れないフォルダーへは一時保存を含めて出力しない。ネイティブGoogle Docs/Sheets変換で一時的にMy Drive親が付いた場合は、利用者へ完成報告する前に対象顧客フォルダーへ移動し、My Drive親が残っていないことをDriveメタデータで確認する。
   - 保存前に、SMARTAIO本番Drive URL、対象クライアントフォルダーURL、記事制作シートURL、対象記事フォルダーまでの親階層、各候補の `trashed=false` を確認し、`drive_scope_evidence.output_location=SMARTAIO_DRIVE` として記録する。クライアントフォルダーがSMARTAIO直下ではない、または証拠が揃わない場合は `BLOCKED_DRIVE_SCOPE_UNVERIFIED` で停止する。
   - 新規クライアントの一次情報台帳は、必ず `assets/Smart_AIO_一次情報台帳_テンプレート.xlsx` をGoogleスプレッドシートへ変換して作成する。変換できない場合は代替版を作らず、接続回復後に再開する。
   - 空のGoogleスプレッドシートへ項目や値を直接入力して代替しない。タイトル、顧客情報欄、セル結合、色、罫線、フォント、列幅、行高、入力規則、テーブル範囲を保持し、テーブル名を `SourceRegister${client_id}` に変更する。
   - 初期データ行は0件とし、公式サイトを一次情報として自動登録しない。作成後はGoogleスプレッドシートをxlsxで再出力し、前項の書式、16列の列順、空の初期状態、テーブル名を検証してから `validate-client-source-register` を実行する。
3. 新規クライアントでは7フォルダー（`00_基本情報`、`01_一次情報`、`03_記事`、`04_画像`、`06_ニュース`、`07_順位・分析`、`99_アーカイブ`）だけを作る。`02_記事企画`、`05_内部リンク`、`90_作業中` は作らない。サイトタイトル確認後、記事企画前に `06_ニュース` へ `enabled=false` のニュース設定ひな型を保存し、保存先・`client_id`・`enabled=false` を読み戻して証拠化する。記事企画・状態・内部リンクはクライアント別記事制作シートで管理し、初回の方向性確認は `企画確認` タブで行う。
4. 記事は独立AIレビューに合格し、`企画確認` タブでクライアントが方向性・検索意図・責任ラベル・種別・ピラー・クラスター・タイトル・記事カテゴリ・ハッシュタグを確認した企画を参照する。承認証跡として、対象行のシートURL、行番号、`確認ステータス`、`確認者`、`確認日` を読み戻す。構造化マークアップ出力物は `03_記事/{記事ID}` に `{記事ID}_schema.jsonld` として保存し、`Article.author.name` には基本情報のプロフィールウィジェット用編集部名を入れ、`publisher` は出力しない。画像は `04_画像/{記事ID}` フォルダーへ保存する。1記事につきタイトル画像1枚と記事内写真3枚、図解画像1枚を `1536x1024` のPNGで、現在の会話内の正規画像生成フローにより作り、`{記事ID}_1.png`〜`{記事ID}_4.png` と `{記事ID}_diagram_1.png` とする。PIL、ImageDraw、Image.new、ローカルPython、`build_articles.py`、テンプレート、プレースホルダー由来の画像はDriveへ保存済みでも記事画像の完了証拠にしない。リライト成果物は `prepare-rewrite-artifact-output` を通し、元記事と同じ `03_記事/{記事ID}` フォルダー内に `{article_number4}-リライト{sequence2}_{YYYYMMDD}` のフォルダー名で保存する。リライトフォルダーの表に出す成果物は、JSONファイル、記事内容Googleドキュメント、WordPressにコピペできる構造化マークアップデータの3つだけにし、リライト計画、差分、内部リンク、レビュー、監査の詳細は個別ファイル化せずJSONへ内包する。記事企画の確認後は、執筆・品質確認・内部リンク・構造化マークアップ・画像・仕上げの途中で追加承認を求めない。
5. 記事本文は `$article-quality-review` の重大違反が0、総合80点以上、作成と異なるAIの `FINAL` レビュー合格を確認する。公開操作は同じ `client_id`、`article_id`、`run_id`、`content_version` に対する人の `FINAL_APPROVAL` を必須とし、不一致なら停止する。
6. ファイル保存後にクライアント別記事制作シートの所定列へURLと完了状態を記録する。構造化マークアップ出力物は正本の `{記事ID}_schema.jsonld` とWordPressのカスタムHTML等へそのまま貼れる `<script type="application/ld+json">` 付きコピペ用の `{記事ID}_schema_wordpress_copy.txt` を同じ `03_記事/{記事ID}` に保存し、`構造化完成` へ完了日、シート既存列の `構造化URL` へコピペ用ファイルURLを `構造化JSON-LD コピペ用` の表示名で記録して再読込する。利用者へは「構造化マークアップ出力物」として報告する。画像は4ファイルと図解1ファイルをDriveで読み戻し、画像フォルダーの実ファイル一覧が5枚のPNGだけであることを確認してから、`画像完成` へ完了日、`画像URL` へ `04_画像/{記事ID}` の画像フォルダーURL、`画像のみ削除` へ未選択チェックボックスを記録し、図解は `図解完成` へ完了日、`図解URL` へ図解ファイルURLを記録して再読込する。図解は、本文内で `[DIAGRAM]...[/DIAGRAM]` により色付けした本文抜粋、図解内で使った本文由来テキストまたは意味を変えない短いラベル、本文にない概念を追加していない証拠をJSONと検証入力へ保存する。図解元本文は図解の説明文ではなく、図解画像にした内容そのものとして保存し、本文と図解の項目・順序・意味が一致している証拠も残す。内部リンクは `内部リンク状態` へ検証結果、`内部リンク最終確認日` へ確認日、`内部リンク管理URL` へ本文中に自然挿入した発リンクURL、発リンクを置いた本文中の設置文、戻しリンク予定URL、管理JSON URLを人がセル上で読める形で記録する。本文末尾の「こんな記事も見てね」「関連記事」「あわせて読みたい」型のまとめ枠に置いたリンクは完了証拠にしない。リライトは `リライト状態` へ計画または実施状態、`最終リライト日` へ作成・実施日、`リライト管理URL` へ元記事フォルダー内の `{article_number4}-リライト{sequence2}_{YYYYMMDD}` フォルダーまたは同配下の `{prefix}.json` を記録する。中央管理台帳や顧客マスターは任意の索引・監査だけに使い、フォルダー作成先の正本にしない。制作シートURL、状態、版、制作AI、レビューAI、最終承認者、更新日時、`run_id` などの索引・監査情報だけを記録する。
   - `記事URL` はGoogleドキュメントURL、`タイトルスラッグ` は記事ごとの英語スラッグ、`WordPressURL` はWordPressが投稿後に返した正式URLとして混同しない。
   - 記事カテゴリは `基本情報` の登録名と完全一致させ、対応するカテゴリスラッグを解決できない記事は出力前に停止する。
   - ハッシュタグは記事一覧の `ハッシュタグ`、記事ID JSON、Googleドキュメント本文の「タグ」セクションで一致させる。Doc本文にタグセクション表示がない、または一致しない場合は完成報告へ進めない。Googleドキュメント本文に `[H1]`、`[H2]`、`[H3]`、`[P]`、`[UL]`、`[LI]`、`[MARK]`、`[B]`、`[DIAGRAM]` などの制作用タグ文字列をそのまま表示した成果物は、WordPressコピペ用の記事本文として不合格にする。
   - Googleドキュメント本文に `##` 形式のMarkdown見出し、`| --- |` などのMarkdown表、URLだけの段落、裸URLの内部リンク、通常段落の番号リストだけで作った疑似箇条書きが残る場合は完成報告へ進めない。H1/H2/H3はGoogle Docsのネイティブ見出し、箇条書きはネイティブリスト、内部リンクはアンカーテキスト付きリンク、表が必要な場合はネイティブ表へ変換する。本文TXTに `[[IMAGE:...]]` が残っていても、Googleドキュメント側で画像5枚・装飾・リンク・タグセクションの読み戻し証拠が揃わなければ完成扱いにしない。
7. 同じ冪等キーの処理が成功済みなら再出力せず、既存URLを返す。
8. ファイル保存か台帳更新の片方だけ失敗した場合は `BLOCKED` とし、再実行方法を残す。
9. 記事出力では `prepare-document-output` の検査を通し、返された `render_plan` と `google_doc_output_requirements` の順序・装飾範囲でGoogleドキュメントを作る。文書名を `{client_id}_{article_id}_{記事タイトル}`、保存先を記事IDフォルダー、完了日を `記事完成`、文書URLを `記事URL`、再作成チェックを `記事&画像削除` として扱う。H1/H2/H3はGoogle Docsの見出しスタイル、本文は通常段落、箇条書きはネイティブ箇条書き、`[MARK]` は黄色マーカー、`[B]` は太字、`[DIAGRAM]` の対象箇所は図解元として元文章をそのまま残し、図解化した箇所だと分かる背景色で色付けする。`[DIAGRAM]` の中身は前後の本文と自然につながる通常段落にし、短文・項目の羅列、画像生成用メモ、見出し、キャプション、要約文へ置き換えてはならない。図解元本文は図解の読み方や意図の説明文ではなく、図解画像にした内容そのものを本文として述べる。図解画像はこの色付けされた元文章を画像化したものとして扱い、Doc本文では図解元段落の直後に置く。Doc本文には必ず元文章と図解画像の両方が残り、両者の項目・順序・意味が一致している状態にする。`[LI]` 内の改行は1項目内の説明として扱い、別の箇条書き項目に分裂させない。H1/H2/H3、本文、箇条書きグループ、太字、マーカー、タグセクション、見出し前余白を自己判断で変えない。
10. 現在シートのExcel出力依頼は `prepare-xlsx-export` で `export?format=xlsx&gid=` URLを作る。
10-2. 週次・月次レポートは `create-performance-report` の `output_format` に従って、デフォルトはGoogleドキュメント、指定時はGoogleスプレッドシートで作成する。保存先は対象顧客フォルダー配下の `07_順位・分析` とし、管理台帳へレポートURL、対象期間、レポート種別、作成日時、`client_id` を記録する。保存先や記録先がSMARTAIO本番Drive直下の対象クライアントフォルダーから辿れない場合は完成扱いにしない。
11. 記事案の会話編集は `prepare-article-record-update` と `prepare-client-article-sheet-update` を使い、対象クライアントの `記事一覧` の `ピラー`・`記事タイトル`・`責任ラベル`・`記事詳細` と記事ID JSONを同じ処理で更新する。中央の `記事台帳` を入力先にしない。
12. 削除は `deletion-plan` と `authorize-deletion` の結果に従い、M/P/Sの選択列、D:T/N:S/Q:Sのクリア範囲、対象MIMEタイプを変更しない。セル内容とデータ入力規則を両方クリアし、永久削除はしない。
13. Googleドキュメントへの入力直後の画面、保存表示、入力前のクリップボード内容だけを保存証拠にしない。保存表示を待って文書を再読み込みし、クリップボードを毎回異なるセンチネル値へ置換してから本文を全選択・コピーする。期待本文と読み戻し本文を `NFKC` 正規化後に空白を除いてSHA-256と文字数で照合し、センチネルが置換されたことを確認する。さらにDriveの対象記事IDフォルダー内に、`document_url` と同じ文書IDが存在することを確認する。
14. 画像保存後に `verify-article-visual-persistence` へタイトル画像1ファイル、通常画像3ファイル、図解1ファイルのURL、PNG、1536x1024、サイズ、SHA-256、`generated_in_current_conversation=true`、`source_tool` または `generation_method`、`04_画像/{記事ID}` フォルダー所属、図解元本文の色付け証拠、図解内テキストが本文由来である証拠、画像フォルダーの実ファイル一覧、`画像完成`・`画像URL`・`図解完成`・`図解URL` の再読込証拠を渡す。1枚目のタイトル画像は、記事タイトルと一致する `title_text` と、画像内にそのタイトルが表示されていることを示す `title_text_in_image=true` または `title_text_verified=true` を必須にする。構造化マークアップ保存後は `verify-structured-markup` へ正本JSON-LDとWordPressコピペ用ファイルの両URLを渡す。内部リンク設定後は本文中の自然な設置文を持つ `verify-internal-link-graph` を通し、`prepare-internal-link-sheet-output` で作成した実URL・設置文一覧を `内部リンク管理URL` に記録する。リライト成果物の保存前は `prepare-rewrite-artifact-output` に合格させ、元記事フォルダー以外への保存、命名不一致、3成果物を超える表出ファイルを停止する。記事の保存とクライアント別記事制作シートの更新が完了したら、`audit-client-run` で設定タブ、ニュース設定、KW記録、企画確認シート承認、カテゴリ・タグ確認、骨子レビュー、Doc/JSON保存、構造化マークアップ保存、Doc本文のタグセクション表示、Doc本文に制作用タグ文字列が残っていないこと、完成物レビュー、画像・図解検証、内部リンク網、クラスター行、中央記事台帳、実行履歴が揃っていることを確認し、`prepare-completion-report` へ記事本文フォルダーURL、画像フォルダーURL、更新したシート名・範囲、前項の `document_persistence`、`image_persistence`、`structured_markup`、`internal_link_graph` 証拠を渡す。利用者への完成報告には、必ず「記事本文のGoogleドキュメントURL」「Google Driveの記事格納先フォルダーURL」「タイトル画像1枚・通常画像3枚の画像フォルダーURL」「図解画像URL」「構造化マークアップ出力物URL」「更新したクライアント別記事制作シートURL」をクリック可能なリンクで載せる。1件でも取得・確認できない場合は記事完成と報告せず、未反映箇所と再開条件を示す。
    - `prepare-completion-report` には現在インストールされているSmart AIOの `smart_aio_plugin_version` を必ず渡す。過去版で作られたレビューJSON、途中成果物、監査メモの `smart_aio_plugin_version` が現在版と一致しない場合は、同じ記事IDでも完成報告に流用せず、新版の手順で再検査・再出力する。
    - `prepare-completion-report` には `drive_scope_evidence` を必ず渡す。`output_location=SMARTAIO_DRIVE`、`smartaio_root_verified=true`、`smartaio_root_url`、`client_folder_directly_under_smartaio=true`、`article_folder_under_client_drive=true`、`image_folder_under_client_drive=true`、`my_drive_root_parent_removed=true`、`folder_path_names` に `03_記事` と対象記事ID、`image_folder_path_names` に `04_画像` と対象記事IDが含まれることを満たさない場合は完成報告しない。
    - `prepare-completion-report` には `standard_run_audit` の生の `actual_checkpoints` または `evidence` を必ず渡す。`status=STANDARD_CLIENT_RUN_AUDIT_PASS` と `completion_report_allowed=true` の自己申告だけを証拠にせず、全チェックポイントを毎回再計算する。
    - `prepare-completion-report` には `verify-article-document-readback` で作った `article_document_readback` を必ず渡す。顧客ID、記事ID、文書ID、改訂ID、正規化文字数、SHA-256、記事構造、タグ本文、画像5枚の役割・ファイル名・Drive URL・SHA-256・順序・object ID、本文内リンクのURL・アンカー・設置文を、同時に検証した `document_persistence`、`image_persistence`、`internal_link_graph` と完全一致させる。さらに `visible_markdown_heading_count=0`、`visible_markdown_table_row_count=0`、`bare_url_paragraph_count=0`、`native_heading_styles_verified=true`、`native_bullets_verified=true`、`marker_text_style_verified=true`、`diagram_source_background_verified=true`、`internal_links_native_hyperlinks_verified=true` を必須にする。省略、件数差、順序差、別顧客・別記事・別文書・別画像・別URL、Markdown風の可視テキスト、裸URL、ネイティブ装飾未確認は完成報告しない。

## 図解品質の保存ゲート

図解のDrive保存と記事一覧の `図解完成` 更新には、作成と異なる評価run_id、評価モデル、`inspection_method=ORIGINAL_IMAGE_VISUAL_INSPECTION`、原寸確認対象SHA、ID-00012相当の基準画像、85点以上の品質点、65〜95%の画面利用率、タイトルまたは文脈見出し、補足文、視線誘導、情報階層、読める日本語、誤字なし、判断結果または結論、低密度でない、単純ラベル列でない、本文忠実性、著作権安全性の全件合格証拠を必須とする。1件でも欠ける場合は `verify-article-visual-persistence` が停止し、Drive保存済みを完成証拠にせず、別SHAへ再生成・再レビューする。

## 確認

- 保存先が対象顧客配下である。
- 保存先がSMARTAIO本番Drive直下の対象クライアントフォルダー配下であり、My Drive直下、`root`、親未指定アップロード、またはSMARTAIO本番Drive外フォルダーが作成・保存先・完成報告リンクに含まれていない。
- 一次情報、ニュース、記事提案の全レコードが同じ `client_id` である。
- 新規クライアントで、ニュース設定ひな型の保存先が `06_ニュース` ではない、`client_id` が違う、または初期行が `enabled=false` ではない。
- 一次情報台帳が検証済みテンプレートの変換で作られ、初期データ行が0件で、書式とテーブル名 `SourceRegister${client_id}` の確認が完了している。
- URLを権限のある担当者が開ける。
- クライアント別記事制作シートと実行履歴に同じ `run_id` がある。中央管理台帳の記事情報は索引・監査用である。
- `audit-client-run` が `STANDARD_CLIENT_RUN_AUDIT_PASS` である。
- 記事カテゴリとハッシュタグが企画確認に含まれ、記事一覧・JSON・Googleドキュメント本文でハッシュタグが一致している。
- 完成報告の6リンクが実際に開け、記事本文フォルダー、画像フォルダー、図解画像、構造化マークアップ、更新したシート行が同じ成果物を示す。
- Googleドキュメントを再読み込みした後の読み戻し本文が期待本文と同じ正規化文字数・SHA-256であり、読み戻し前のセンチネルが残っていない。
- 公開操作は完成物に対する人の `FINAL_APPROVAL` がある場合だけ行う。承認者の氏名・権限・日時を監査記録へ残す。
- タイトル画像1枚、通常画像3枚、図解1枚は `04_画像/{記事ID}` にあり、`画像URL` は記事本文フォルダーではなく画像フォルダーを指している。画像フォルダー内にJSON、Markdown、テキスト、リライトフォルダー、検証フォルダーが混在していない。
- 詳細は [出力契約](references/output-contract.md) に従う。
