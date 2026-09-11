# Smart AIO 統括ワークフロー

## 呼び分け

| 利用者の依頼 | 必須Skill | 統括ランタイム |
|---|---|---|
| クライアント別記事制作シートの作成・検査 | `$client-context`、`$drive-sheets-output` | `prepare-client-production-sheet`、`validate-client-production-sheet` |
| クライアント別一次情報台帳の作成・検査 | `$source-retrieval`、`$drive-sheets-output` | `prepare-client-source-register`、`validate-client-source-register` |
| 新規顧客の自動登録 | `$smart-aio-intake`、`$source-retrieval`、`$client-context`、`$content-prompts`、`$news-opportunity` | `prepare-client-onboarding`、`validate-basic-info`、`validate-site-title`、`AWAITING_SITE_TITLE_CONFIRMATION`、`prepare-news-settings-template`、`NEWS_SETTINGS_TEMPLATE_REQUIRED` |
| 基本情報の作成 | `$smart-aio-intake`、`$client-context`、`$content-prompts` | `prepare-basic-info`、`validate-basic-info` |
| サイトタイトルの作成 | `$smart-aio-intake`、`$content-prompts` | `prepare-site-title`、`validate-site-title` |
| 記事案・本文 | `$article-production`、`$source-retrieval`、`$content-prompts` | `create-article-lifecycle`、`advance-article-lifecycle`、`plan-idea`、`prepare-idea`、`validate-ideas`、`AWAITING_ARTICLE_PLAN_CONFIRMATION`、`finalize-idea`、`prepare-article` |
| 記事カテゴリ・タグ・想定公開URL | `$article-production`、`$drive-sheets-output` | `resolve-article-category`、`validate-ideas`、`prepare-document-output`、`build-expected-article-url` |
| 公式サイト公開記事との重複 | `$source-retrieval`、`$article-production` | `SITE_DUPLICATE_DECISION_REQUIRED`、`PROCEED_AS_NEW`、`CREATE_ALTERNATIVE` |
| 段階別記事チェック | `$article-quality-review` | `prepare-stage-review`、`evaluate-stage-review`、`review-article`、`draft-workflow` |
| Skill設計 | `$skill-planner` | `plan-skill` |
| Skill事前検査 | `$skill-evaluator` | `evaluate-skill` |
| Skill実行後評価 | `$skill-runtime-evaluator` | `evaluate-skill-run` |
| Skill修正案 | `$fix-skill` | `propose-skill-fix`、`authorize-skill-change` |
| 学びの反映候補 | `$skill-feedback-curator` | `curate-skill-feedback` |
| 記事・リライト・順位の週次/月次レポート | `$smart-aio-orchestrator`、`$drive-sheets-output` | `create-performance-report`、`create-report-schedule`、Googleドキュメント出力、指定時のみGoogleスプレッドシート出力 |
| 分析結果からのSkill改善候補 | `$skill-runtime-evaluator`、`$skill-feedback-curator`、`$fix-skill` | `analyze-performance-feedback`、`propose-performance-skill-update`、`authorize-skill-change` |
| 本番開始判定 | `$smart-aio-orchestrator` | `create-readiness`、`record-readiness`、`evaluate-readiness` |
| Scheduled Tasks設定案 | `$news-opportunity`、`$smart-aio-orchestrator` | `prepare-scheduled-tasks`、`activation_prompt` の提示、`authorize-scheduled-task` |
| タイトル・記事内画像・図解画像 | `$content-prompts`、`$drive-sheets-output` | `prepare-images`、`verify-article-visual-persistence` |
| 内部リンク網・構造化マークアップ | `$article-production`、`$drive-sheets-output` | `plan-internal-link-graph`、`verify-internal-link-graph`、`build-structured-markup`、`verify-structured-markup` |
| 順位起点の自動リライト候補 | `$article-production`、`$drive-sheets-output` | `prepare-rewrite-plan`、`review-article`、`FINAL_APPROVAL` |
| 複数記事・穴埋め | `$article-production` | `create-batch`、`batch-next`、`apply-batch-step`、`fail-batch-step`、`stop-batch`、`resume-batch` |
| クラスター一覧 | `$article-production`、`$content-prompts` | `prepare-cluster`、`complete-cluster` |
| 記事案の会話編集 | `$article-production`、`$drive-sheets-output` | `prepare-article-record-update` |
| Googleドキュメント出力 | `$drive-sheets-output` | `prepare-document-output` |
| 現在シートのExcel化 | `$drive-sheets-output` | `prepare-xlsx-export` |
| 手動編集カテゴリのスラッグ | `$content-prompts`、`$drive-sheets-output` | `prepare-category-slugs`、`validate-category-slugs` |
| バッチ完了通知 | `$smart-aio-orchestrator` | `prepare-batch-notification`（Chatwork接続時だけ送信） |
| ニュース収集・記事提案 | `$news-opportunity` | `prepare-news-inbox`、`news-proposal` |
| Ahrefs順位取得の準備 | `$news-opportunity` | `prepare-ahrefs` |
| Drive・Sheets保存 | `$drive-sheets-output` | 保存前の承認・冪等確認、`audit-client-run`、`prepare-completion-report` |
| 記事関連データの削除 | `$smart-aio-orchestrator`、`$drive-sheets-output` | `deletion-plan`、`authorize-deletion` |

## 正本として固定する範囲

- `content-v1/prompts.json` の6プロンプト原文
- プロンプトごとのSHA-256と文字数
- `assembly-rules.json` の変数置換と末尾追記、タイトル画像1枚、通常画像3枚、図解画像1枚、複数記事の行優先順位
- タイトル画像1枚、通常画像3枚、図解1枚の内訳、1536x1024、PNG、`{記事ID}_1.png`〜`_4.png`、`{記事ID}_diagram_1.png`、`04_画像/{記事ID}` 保存、1枚目のタイトル表示証跡、`画像完成`・`画像URL`・`図解完成`・`図解URL`・`画像のみ削除` の更新
- 構造化マークアップJSON-LD、`{記事ID}_schema.jsonld`、`Article`、`BreadcrumbList`、必要に応じた `FAQPage` と `HowTo`
- 一度に削除対象へできる記事は9件まで

## Skillランタイムの制御

- 顧客分離と利用者権限
- 重複記事、責任ラベル、内部リンク網、既存記事側の戻しリンク更新計画
- 一次情報の利用可否と期限
- 骨子・本文・完成物の独立AIレビュー、企画確認シートでのクライアント承認、完成物に対する1回の人の`FINAL_APPROVAL`。ただし公式サイト公開記事との重複だけは「このまま進める」「別記事にする」の選択を先に求める
- `article-ideas` 正本の後ろへ別バージョンで追加する `title-refinement-v1` と、タイトルの長さ・具体性・信頼性・読者便益の検査
- 登録済み記事カテゴリとの完全一致、カテゴリスラッグ解決、記事タグの企画確認、Doc本文へのタグ表示、明示されたパーマリンク構造だけによる想定公開URL生成
- 実行ロック、冪等キー、監査イベント
- 新規顧客登録時の無効ニュース設定ひな型と、顧客別ニュース・順位設定
- Driveのゴミ箱移動だけを許可する削除確認
- 方向性、骨子、本文、完成物の独立レビュー
- KW調査からAI仕上げまでの自動ゲートと、人による最終確認・最終承認
- Skill改善の設計、事前検査、実行後評価、修正案、反復学習
- 記事作成、リライト、順位変動、反応データを週次/月次で集計し、レポートはデフォルトGoogleドキュメント、指定時のみGoogleスプレッドシートとして `07_順位・分析` に保存する。繰り返し確認できた学びだけを改善候補にし、保護プロンプトとSkillの本番反映は管理者承認とテスト後だけ許可
- 証拠付きの本番開始判定と、必須項目未完了時の自動停止
- 完成報告前の標準実行監査。設定タブ、ニュース設定、KW記録、カテゴリ・タグ確認、Doc本文のタグ表示、構造化マークアップ、レビュー記録、画像・図解検証、内部リンク網、クラスター行、中央記事台帳、実行履歴が未達なら停止
- 顧客別Scheduled Tasks設定案、認証情報の非保存、`activation_prompt` による「有効化しますか？」確認、人による有効化
- クライアント別記事制作シートを担当者用の正本とし、中央管理台帳は索引・監査だけに限定
- 6シートを表示し、企画確認は参照シート型の初回承認一覧として使い、記事一覧・キーワード・クラスターのタイトル行とシステム契約のヘッダー行を使い、クラスター画面でピラー一覧も同時表示

6プロンプトの保護正本とSHA-256は変更しない。タイトル強化だけは利用者の明示指示に基づく別レイヤーとして、`article-ideas` の組み立て後へ `title-refinement-v1` を追加し、正本とは別にバージョン管理する。
