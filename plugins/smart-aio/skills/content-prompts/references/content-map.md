# 保護プロンプト対応表

| 処理 | prompt_key | 組み立て規則 |
|---|---|---|---|
| 基本情報取得 | `basic-info-research` | `assembly-rules.json#basic-info-research` |
| サイトタイトル案 | `site-title` | `assembly-rules.json#site-title` |
| 記事一覧・記事企画 | `article-ideas` | `assembly-rules.json#article-ideas` |
| 記事本文 | `article-writing` | `assembly-rules.json#article-writing` |
| 記事内イメージ写真 | `article-image-photo` | `assembly-rules.json#article-image-photo` |
| タイトル入り画像 | `thumbnail-title-image` | `assembly-rules.json#thumbnail-title-image` |

## assembly-rules.jsonで定義する組み立て

- 基本情報取得: プロンプトの後ろに空行2つと、公式サイト本文または入力テキストを連結する。
- サイトタイトル案: プロンプトの後ろにサービス名とサービス内容を追加する。
- 記事企画: 6入力を置換し、トピック優先指示、スラッグ指示、責任ラベル重複防止を記載順に適用する。
- 記事本文: プロンプトに記事JSONと根拠・内部リンク・顧客ルールを追加し、責任ラベル制御を適用する。
- 画像: プロンプトにテーマ、タイトル、構図、サイズ、テーマカラーを記載順に連結する。

最終判断は `assembly-rules.json` とSkillランタイムに基づく。
