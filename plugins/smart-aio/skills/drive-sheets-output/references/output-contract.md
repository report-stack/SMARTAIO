# 出力契約

必須項目は `client_id`、`production_sheet_url`、`article_id`、`run_id`、`artifact_type`、`artifact_url`、`content_version`、`workflow_status`、`updated_by`、`updated_at`。

保存順序は「実行ロック取得 → ファイル保存 → クライアント別記事制作シート更新 → 中央管理台帳の索引・監査更新 → 実行履歴記録 → ロック解放」。公開は別操作として扱う。

## 記事完成報告

`記事一覧` の更新は列文字を固定せず、直前に読み戻したヘッダー行から対象列を解決する。標準32列、または既存互換として先頭に空列が1つある33列配置だけを受け入れる。

記事完成報告の必須項目は `client_id`、`article_id`、`smart_aio_plugin_version`、`title`、`document_url`、`drive_folder_url`、`image_folder_url`、`production_sheet_url`、`updated_sheet_name`、必要に応じて `updated_range`、および `drive_scope_evidence`、`document_persistence`、`image_persistence`、`structured_markup`、`internal_link_graph`。`smart_aio_plugin_version` は現在インストールされているSmart AIO版と完全一致させ、過去版のレビューJSONや監査記録を完成報告へ流用しない。`document_url` はGoogleドキュメント、`drive_folder_url` は `03_記事/{記事ID}` の記事本文フォルダー、`image_folder_url` は `04_画像/{記事ID}` の画像フォルダー、`production_sheet_url` は実際に更新したクライアント別記事制作シートを示す。

`drive_scope_evidence` は保存先がSMARTAIO本番Drive直下の対象クライアントフォルダーから辿れることを示す必須証拠である。`output_location=SMARTAIO_DRIVE`、`smartaio_root_verified=true`、`smartaio_root_url`、`client_folder_directly_under_smartaio=true`、顧客フォルダーの `client_drive_url`、記事フォルダーの `article_folder_url`、画像フォルダーの `image_folder_url`、更新対象の `production_sheet_url`、`article_folder_under_client_drive=true`、`image_folder_under_client_drive=true`、`my_drive_root_parent_removed=true`、`folder_path_names` に `03_記事` と対象記事ID、`image_folder_path_names` に `04_画像` と対象記事IDを含める。Google Driveの `root`、My Drive直下、親未指定アップロード、SMARTAIO本番Drive外フォルダー、またはMy Drive親が残ったネイティブ変換ファイルは完成報告の証拠に使えない。

`document_persistence` は `method=RELOAD_AND_READBACK`、`reloaded_after_write=true`、`sentinel_replaced=true`、期待本文と読み戻し本文の正規化文字数、両本文のSHA-256、`document_id`、Driveフォルダー内で確認した `drive_document_id`、`document_in_target_folder=true` を持つ。正規化は `NFKC` 後に空白を除く。Googleドキュメント入力直後の画面、保存表示、入力前のクリップボード内容だけを保存証拠にしない。

記事本文のGoogleドキュメントには「タグ」「出典」「参考情報」セクションを表示しない。ハッシュタグや出典管理情報は記事制作シート・記事ID JSON・一次情報台帳側に残してよいが、WordPressへコピーする本文には出さない。記事本文用GoogleドキュメントはWordPressへコピーできる装飾済み本文であり、制作用の `[H1]`、`[H2]`、`[H3]`、`[P]`、`[UL]`、`[LI]`、`[MARK]`、`[B]`、`[DIAGRAM]` などのタグ文字列を可視テキストとして残してはならない。これらはGoogle Docs上で見出し、段落、ネイティブ箇条書き、マーカー、太字、図解元色付けへ変換する。Markdown原稿をそのまま貼ったような `##` 見出し、`| --- |` 表、URLだけの段落、アンカーテキスト化されていない裸URL、通常段落の番号リストだけで作った疑似箇条書きも完成物として禁止する。Q&Aの直後にはHタグなしの通常ラベル「関連記事」を置き、対象記事タイトルへネイティブリンクを付ける。`[DIAGRAM]` はタグを外した元文章をそのまま本文に残し、図解対象箇所だと分かる背景色を付ける。図解元文章は、前後の本文と自然につながる通常の説明段落にする。短文・項目の羅列、画像生成用メモ、「図解：〜」などのキャプション、見出し、要約文だけに置き換えてはならない。図解元文章は図解の説明文ではなく、図解画像にした内容そのものとして書き、本文と図解の項目・順序・意味を一致させる。図解画像はこの色付け段落の直後に置く。`[LI]` 内の説明改行は1項目内の内容として扱い、Google Docs上で別の箇条書き項目に分裂させない。

`structured_markup` はAIO/SEO向けの構造化マークアップ出力物で、正本ファイル名を `{記事ID}_schema.jsonld`、MIMEを `application/ld+json` とし、`03_記事/{記事ID}` に保存する。あわせてWordPressのカスタムHTML等へそのまま貼り付けやすい `<script type="application/ld+json">` 付きコピペ用ファイル `{記事ID}_schema_wordpress_copy.txt` を同じ `03_記事/{記事ID}` に保存し、記事一覧の既存列 `構造化URL` はこのコピペ用ファイルを `構造化JSON-LD コピペ用` の表示名で指す。利用者へは `構造化URL` ではなく「構造化マークアップ出力物」として報告する。`Article`、`BreadcrumbList`、本文Q&A 5件と同じ順序・同じ内容の `FAQPage` を必須にし、手順記事の場合は `HowTo` を追加する。`Article.description` は記事一覧の `メタディスクリプション`、`Article.mainEntityOfPage` は記事一覧の `公開URL` と完全一致させる。`Article.author` は `@type=Organization` とし、`name` は同じクライアントの基本情報にあるプロフィールウィジェット用編集部名を使う。`publisher`、`keywords`、アイキャッチ画像用の `image` は出力しない。保存後は正本JSON-LDのDriveファイルURL、コピペ用ファイルURL、対象記事フォルダー所属、記事一覧の `構造化完成`・`構造化URL` の再読込証拠を持つ。未確認の効果、順位、口コミ、数値を構造化データへ入れてはならない。

`internal_link_graph` は同一顧客の記事制作シート内の記事だけを対象にする。新記事から既存記事への内部リンクだけでなく、既存記事側から新記事へ戻す `reciprocal_update_plan` を必須にする。発リンクは本文中のテキストリンクにせず、Q&Aの直後にHタグなしの「関連記事」ラベルを置き、対象記事タイトルのネイティブリンクとして表示する。各発リンクは `placement.type=RELATED_ARTICLES_AFTER_QA`、`placement.after_qa=true`、`placement.section_label=関連記事`、`placement.section_is_heading=false`、`anchor_text`、`target_url` を持つ。Googleドキュメント本文ではURLだけの段落や裸URLを出さず、記事タイトルへネイティブリンクを付ける。`article_document_readback.internal_links` では `visible_text` に対象記事タイトルが含まれ、`native_link_verified=true`、`bare_url_visible=false`、`after_qa=true`、`section_label=関連記事`、`section_is_heading=false`、`target_url` が検証済みでなければならない。記事一覧の `内部リンク管理URL` は管理JSONへのリンク名だけにせず、関連記事として出す記事タイトル、遷移先URL、既存記事側へ追加予定の戻しリンクURL、管理JSON URLを人がセル上で読める形で記録する。既存記事が公開済みの場合、戻しリンクの反映は既存公開記事の更新にあたるため、完成物の `FINAL_APPROVAL` または別途の更新承認なしに公開反映してはならない。別顧客の記事、中央台帳だけの行、ゴミ箱済み記事、URL未確認の記事は候補にしない。

`plan_confirmation_queue` は `企画確認` タブを記事制作前の正本キューとして扱う。`種別` は `ピラー` または `クラスター` のみとし、ピラー行は親テーマを網羅する記事、クラスター行はピラーから派生した細かい子テーマの記事として扱う。行には `ピラー` と `クラスター` を必ず持たせ、内部リンク候補の目安にも使う。記事作成依頼時は `確認ステータス` が `承認` / `OK` / `APPROVED`、`制作状態` が未完了、`記事URL` が空の行だけを対象にし、`制作順` 昇順で1件だけ選ぶ。選択前に `validate-plan-confirmation-candidates` を通し、同じクライアントの `記事一覧`、`クラスター`、既存の `企画確認` 行、公式サイト公開記事との重複が `BLOCKED` の場合は本文作成に進めない。制作完了時は同じ行へ `制作状態`、`記事ID`、`記事URL`、`最終更新日` を戻す。50案すべてが完了した後に追加依頼があれば、`prepare-additional-plan-confirmation-ideas` で既存企画・既存記事を入力にし、次の50件を重複判定付きで追記する。

`image_persistence` はタイトル画像1枚、通常画像3枚、図解画像1枚を必須とする。1枚目は記事タイトルを画像内に含むタイトル画像、2〜4枚目は構図の異なる記事内写真で、すべてPNG・1536x1024・`{記事ID}_1.png`〜`{記事ID}_4.png` とする。各画像は `prepare-images` が返した `content_prompt` を短縮・要約せずそのまま生成へ渡し、`generation_call_id`、準備済みプロンプトSHA、実生成プロンプトSHA、プロンプト完全一致証拠、実ファイルから測定した寸法証拠を記録する。タイトル画像は記事タイトルと一致する `title_text` と、画像内にそのタイトルが表示されていることを示す `title_text_in_image=true` または `title_text_verified=true` を記録する。タイトル画像は記事タイトルを主見出しと補助見出しに分けて読みやすく配置し、背景の読める文字をできるだけ入れない。通常画像3枚も背景・看板・端末画面などの読める文字をできるだけ入れない。この文字抑制ルールは図解画像には適用しない。タイトル画像は作成と異なる評価役による `ORIGINAL_IMAGE_VISUAL_INSPECTION`、SHA一致、ID-00016相当の基準比較、85点以上、タイトル階層・日本語可読性・背景文字抑制・著作権安全性のPASSを必須にする。図解画像はPNG・1536x1024・`{記事ID}_diagram_1.png` とし、本文の理解を助けるフロー、比較、判断基準、手順のいずれかを可視化する。人が見やすい図であることを最優先し、企業ロゴ、アニメキャラクターなど著作権のあるものは一切入れない。図解対象の本文はGoogleドキュメント用本文内で `[DIAGRAM]...[/DIAGRAM]` により色付けし、タグを外した元文章を本文中にそのまま残したうえで、図解画像の `diagram_source.source_text` として保存する。図解元文章は、読者が画像を見なくても本文として自然に読める段落にし、短文・項目の羅列や画像生成用メモを禁止する。図解元文章は図解の読み方・目的・見方を説明する文章ではなく、図解画像にした内容そのものを本文として記載する。図解内に表示する文言は `diagram_source.text_items` の2〜6項目だけを使い、各項目は本文抜粋に含まれる文言または意味を変えない短いラベルに限定する。本文にない新しい概念・判断項目・追加説明・数値を勝手に加えない。`diagram_source.doc_highlighted=true`、`diagram_source.source_text_visible_in_doc=true`、`diagram_source.source_text_is_natural_body_paragraph=true`、`diagram_source.source_text_matches_diagram_content=true`、`diagram_source.source_text_is_not_diagram_explanation=true`、`diagram_source.source_derived_labels_verified=true` または `diagram_source.exact_text_verified=true`、`diagram_source.section_heading`、`diagram_source.supporting_context`、`diagram_source.actionable_takeaway`、必要に応じて `rendered_text_items` を保存し、本文抜粋と図解内テキストの関係および項目・順序・意味の一致を検証できるようにする。図解は意味のないチェックマークだけの帯、文字のない装飾ボックス、余白埋めだけの記号列を使わず、白または淡色の不透明背景で作る。各画像のDriveファイルURL、サイズ、SHA-256、会話内での実生成、`source_tool` または `generation_method`、`04_画像/{記事ID}` フォルダー所属、画像フォルダーの実ファイル一覧を記録する。画像フォルダーには5枚のPNG画像だけを置き、JSON、Markdown、テキスト、リライトフォルダー、検証フォルダーを入れてはならない。PIL、ImageDraw、Image.new、ローカルPython、`build_articles.py`、テンプレート、プレースホルダー由来の画像は、PNG・1536x1024・Drive保存済みでも記事画像の完了証拠にしない。タイトル画像1枚、通常画像3枚、図解1枚の保存後に記事一覧の `画像完成`・`画像URL`、`図解完成`・`図解URL` を書き、シートを再読込した証拠を持つ。画像プロンプトやファイル名の計画だけを完了証拠にしない。

`rewrite_artifact_output` は既存記事のリライト成果物を元記事と同じ `03_記事/{記事ID}` フォルダーへ追加する。保存前に `prepare-rewrite-artifact-output` へ `client_id`、`article_id`、`article_folder_url`、`rewrite_sequence`、`rewrite_date` を渡し、返された `{article_number4}-リライト{sequence2}_{YYYYMMDD}` 形式のフォルダー名を使う。例は `ID-00001` の1回目なら `0001-リライト01_20260828`。リライトフォルダーの表に出す成果物は、`{prefix}.json`、Googleドキュメントの `{prefix}_記事内容`、`{prefix}_構造化マークアップ.txt` の3つだけにする。通常の記事作成と同じく、記事内容は開いて確認・編集できるGoogleドキュメントで出す。3つ目はWordPressのカスタムHTML等へそのまま貼れる `<script type="application/ld+json">` 付きの構造化マークアップデータとする。リライト計画、差分、内部リンク、レビュー、監査の詳細は個別ファイル化せず、1つ目のJSONへ内包する。リライト成果物を `03_記事` 直下の別フォルダー、`07_順位・分析`、My Drive直下、SMARTAIO本番Drive外フォルダーへ保存してはならない。記事一覧の `リライト状態`、`最終リライト日`、`リライト管理URL` は、この元記事フォルダー内のリライトフォルダーまたは同配下の `{prefix}.json` を指す。

完成判定の直前に `verify-article-document-readback` を実行し、顧客ID、記事ID、文書ID、改訂ID、正規化文字数、SHA-256、記事構造、タグ・出典セクション0件、制作用タグ0件、Markdown見出し0件、Markdown表0件、裸URL段落0件、ネイティブ見出し・箇条書き・マーカー・図解元背景色・Q&A直後の関連記事リンク、5画像のDrive URL・SHA-256・配置順・object IDを再読込証拠として固定する。`prepare-completion-report` はこの証拠を文書永続化、画像永続化、内部リンク網の検証結果と照合する。標準監査は生のチェックポイントから毎回再計算し、既成のPASSオブジェクトを信用しない。

`prepare-completion-report` を通し、利用者へ次の6リンクを送る。

- 記事本文のGoogleドキュメントURL
- Google Driveの記事格納先フォルダーURL
- 画像フォルダー内のタイトル画像1枚と通常画像3枚
- 図解画像
- 構造化マークアップJSON-LD
- 更新したクライアント別記事制作シートURL

いずれかが欠ける、Google URLとして不正、SMARTAIO本番Drive直下の対象クライアントフォルダー配下を確認できない、My Drive/root親が残っている、文書を再読み込みしていない、センチネルが置換されない、正規化文字数・SHA-256が一致しない、同じ文書IDを対象Driveフォルダーで確認できない、Doc本文にタグ・出典セクションが表示されている、Doc本文に制作用タグ文字列が残っている、Q&A直後のHタグなし関連記事リンクと戻しリンク更新計画を検証できない、構造化マークアップの実体・記事フォルダー所属・シート再読込を確認できない、タイトル画像1枚・通常画像3枚・図解1枚の実体・寸法・ファイル名・タイトル表示証跡・正規画像生成フロー由来・`04_画像/{記事ID}` フォルダー所属・図解元本文の色付け・図解元本文が図解内容そのものであること・図解内テキストが本文由来であることを確認できない、またはシートの `画像完成`・`画像URL`・`図解完成`・`図解URL` の更新を確認できない場合は `BLOCKED` とし、「完成」と報告しない。WordPress URLは公開後に別項目として追加し、上記リンクの代わりにはしない。

クライアント別記事制作シートは `基本情報`、`企画確認`、`記事一覧`、`キーワード`、`クラスター`、`設定` の6シートを持つ。`基本情報` はプロフィールウィジェット用のサイト名、編集部名、編集チーム説明を持ち、同一シート内の記事で同じ著者情報を使う。`企画確認`、`記事一覧`、`キーワード`、`クラスター` はシステム契約で定義した列名・列順でなければならない。`企画確認` は初回の記事方向性確認に使い、列は `制作順`、`確認ID`、`記事トピック`、`種別`、`ピラー`、`クラスター`、`記事タイトル案`、`対策キーワード`、`検索意図`、`AI引用戦略`、`記事カテゴリ`、`ハッシュタグ`、`確認ステータス`、`確認者`、`確認日`、`修正コメント`、`制作状態`、`記事ID`、`記事URL`、`最終更新日` とする。本文作成前に、対象行の `確認ステータス` が `承認` / `OK` / `APPROVED` のいずれかであること、確認者と確認日が記録されていること、シートURLと行番号を読み戻したことを証拠化する。プロンプト文字列をシートから実行せず、保護された `$content-prompts` の正本をSHA-256一致時だけ使う。シート埋め込みスクリプトとOpenAI APIは使用しない。

クライアント別一次情報台帳は `01_一次情報` フォルダーへ `${client_id}_${クライアント名}_一次情報台帳` という名前のGoogleスプレッドシートで保存する。シート名と16列の列順を検証し、`client_id` が異なる行を1件でも検出した場合は読み書きを停止する。記事へ渡せるのは `利用可否=利用可`、確認者が記録済み、かつ有効期限内の行だけとする。

新規クライアントの一次情報台帳は `assets/Smart_AIO_一次情報台帳_テンプレート.xlsx` をGoogleスプレッドシートへ変換して作る。変換できない場合は停止し、空のGoogleスプレッドシートへの手入力や別シートの複製で代替してはならない。初期データ行は0件とし、作成後にxlsxで再出力して、タイトル、顧客情報欄、セル結合、色、罫線、フォント、列幅、行高、入力規則、テーブル範囲、16列の列順、テーブル名 `SourceRegister${client_id}` を検証する。`creation_method=IMPORT_TEMPLATE_XLSX`、`format_preserved=true`、全 `format_checks`、正しい `table_name`、空の初期状態が揃わない場合は `validate-client-source-register` を不合格とする。

記事IDは最初の書き込み後に企画タイトルと責任ラベルへ固定する。既存IDへ異なるタイトルまたは責任ラベルを書こうとした場合は `ARTICLE_ID_REBIND_FORBIDDEN` で停止し、別の新規IDを発行する。

クライアントフォルダーは `00_基本情報`、`01_一次情報`、`03_記事`、`04_画像`、`06_ニュース`、`07_順位・分析`、`99_アーカイブ` の7件を正本とする。記事企画、作業状態、内部リンクはスプレッドシートで管理し、`02_記事企画`、`05_内部リンク`、`90_作業中` は作成しない。

新規クライアントでは、サイトタイトル確認後かつ記事企画前に `06_ニュース` へニュース設定ひな型を保存する。初期行は `client_id`、`feed_id`、`industry`、`source_url`、`include_keywords`、`enabled` を持ち、`enabled=false` に固定する。保存後は対象顧客の `06_ニュース` 配下であること、全行の `client_id` が対象顧客であること、初期行が無効状態であることを読み戻して証拠化する。

完成報告前には `audit-client-run` を通し、SMARTAIO直下クライアントフォルダー、7フォルダー、一次情報台帳、制作シート設定、サイトタイトル確認、ニュース設定ひな型、KW記録、企画確認シート承認、カテゴリ・タグ確認、骨子レビュー、Doc/JSON保存、Doc本文にタグ・出典セクションがないこと、Doc本文に制作用タグ文字列が残っていないこと、完成物レビュー、画像検証、クラスター行、中央記事台帳、実行履歴がすべて `PASS` であることを確認する。未達が1件でもある場合は、記事本文や画像ファイルが存在していても完成報告へ進めない。

6シートを表示する。`基本情報` の上部をホーム画面として使い、`企画確認` は参照シート型の承認一覧として1行目に標準ヘッダーを置く。`記事一覧`、`キーワード`、`クラスター` は1行目へ一覧名、2行目へシステム契約のヘッダーを置く。`クラスター` の右側に `基本情報` のピラー一覧を参照表示する。`設定` は確認可能にするが、プロンプト本文はシートから実行せずSkills内の保護正本を使う。

## 図解視覚品質証拠

図解の `image_persistence` には `visual_quality_review` を持たせ、作成と異なる `review_run_id`、`reviewer_model`、`inspection_method=ORIGINAL_IMAGE_VISUAL_INSPECTION`、保存対象と一致する `reviewed_diagram_sha256`、ID-00012相当の基準画像、85点以上の品質点、65〜95%の画面利用率、タイトルまたは文脈見出し、補足文、視線誘導、情報階層、読める日本語、誤字なし、判断結果または結論、低密度でない、単純ラベル列でない、本文忠実性、著作権安全性をすべて合格させる。欠損または不合格が1件でもあれば保存完了とシート更新を禁止する。

## 段階レビュー記録

`review_id`、`client_id`、`article_id`、`stage`、`producer_run_id`、`review_run_id`、`result`、`total_score`、`critical_violation`、`issues`、`final_approval_required`、`reviewed_at` を保存する。

## Skill改善記録

`proposal_id`、`skill_name`、`current_version`、`source_run_ids`、`proposed_changes`、`protected_changes`、`status`、`approved_by`、`approved_at` を保存する。変更提案は自動適用せず、承認前は `PENDING_ADMIN_APPROVAL` とする。
