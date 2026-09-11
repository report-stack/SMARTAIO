---
name: skill-feedback-curator
description: Smart AIOの複数回の実行、段階レビュー、人の修正指摘から再利用できる学びだけを整理し、顧客別ルールまたは共通Skillの次版候補にする。同じ問題が繰り返されたとき、単発の好みと恒久ルールを分けたいときに使う。
---

# Smart AIO学びの反映

レビュー指摘をそのままSkillへ書き戻さず、再現性のある学びだけを次版候補にする。

## 手順

1. 同じ `client_id`、Skill、段階のフィードバック、記事作成結果、リライト結果、順位変動、反応データを集める。
2. 同一内容が2回以上発生したもの、または順位が明確に改善・悪化した再現性のあるパターンだけを再利用候補にする。
3. 顧客固有ルールと全顧客共通ルールを分ける。
4. `curate-skill-feedback` または `analyze-performance-feedback` で候補を作り、`propose-performance-skill-update` から `$fix-skill` へ渡す。
5. 管理者承認とテスト前にはSkillへ反映しない。保護プロンプト本文は自動で書き換えず、変更が必要な場合も提案止まりにする。

分類方法は [フィードバック整理規則](references/feedback-rules.md) に従う。
