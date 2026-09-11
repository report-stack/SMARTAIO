# 受付データ契約

必須項目は `client_id`、`request_type`、`purpose`、`deliverables`、`requested_by`。任意項目は `target_reader`、`keyword`、`due_date`、`approver`、`output_location`。

状態は `REQUESTED`、`CONTEXT_READY`、`BLOCKED` のいずれか。必須項目不足または顧客不明の場合は `BLOCKED` とし、不足理由を1文で残す。
