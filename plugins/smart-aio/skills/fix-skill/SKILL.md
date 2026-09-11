---
name: fix-skill
description: Smart AIO Skillの事前検査または実行後評価で確認された問題から、変更対象、理由、影響、テスト、ロールバックを含む安全な修正案を作る。Skillを直接自動更新せず、管理者承認用の差分提案と次版計画を準備するときに使う。
---

# Smart AIO Skill修正案

評価結果を、管理者が確認できる変更提案へ変換する。自動で本番Skillを書き換えない。

## 手順

1. `$skill-evaluator` または `$skill-runtime-evaluator` の証拠を受け取る。
2. 必要最小限の変更対象、理由、影響、追加テスト、戻し方を整理する。
3. `propose-skill-fix` で提案を作る。
4. 記事作成、リライト、順位変動、反応データに基づく改善は `propose-performance-skill-update` で提案化し、反映範囲、根拠、失敗時の戻し方を含める。
5. 保護対象が含まれる場合は `BLOCKED_PROTECTED_CONTENT` とする。保護プロンプト本文の自動書き換えは禁止する。
6. 管理者承認後だけ `authorize-skill-change` を実行し、テスト合格後に新バージョンを公開する。

保護対象と承認条件は [修正安全規則](references/fix-safety.md) に従う。
