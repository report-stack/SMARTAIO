# 顧客別ニュース契約

ニュース設定の必須項目は `client_id`、`feed_id`、`industry`、`source_url`、`include_keywords`、`enabled`。

新規クライアント登録時は、サイトタイトル確認後かつ記事企画前に、`06_ニュース` へ上記項目を持つニュース設定ひな型を作成する。初期行は必ず `enabled=false` とし、`client_id` は対象クライアントだけに固定する。人が収集元と検索条件を確認して有効化するまで、Scheduled Tasksや外部収集へ渡してはならない。

ニュース受信箱の必須項目は `client_id`、`news_id`、`feed_id`、`title`、`canonical_url`、`obtained_at`、`content_fingerprint`、`relevance_score`、`client_relevance_reason`、`status`。

記事提案の識別子は `client_id + proposal_id`。関連する `news_id`、`article_id` も同じ `client_id` に属することを保存前に検査する。

同じURLでもクライアントが違えば、検索条件、関連理由、提案結果を別レコードとして管理する。
