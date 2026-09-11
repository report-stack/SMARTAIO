---
name: skill-evaluator
description: Smart AIO Skillの実行前検査として、責任範囲、必須入力、出力、停止条件、評価基準、矛盾、曖昧な指示、顧客分離、保護プロンプト保護を確認する。Skillの新規作成、修正、配布版更新の前に使う。
---

# Smart AIO Skill事前検査

Skillを実行・配布する前に、抜け、矛盾、曖昧さを検出する。

## 手順

1. `$skill-planner` の設計契約と対象Skillを受け取る。
2. 主責任が一つか、入力・出力・停止条件が具体的か確認する。
3. 「適切に」「いい感じに」など判定不能な指示を指摘する。
4. 顧客分離、人の承認、冪等制御、保護プロンプト保護を確認する。
5. `evaluate-skill` で `PASS` または `REVISE` を返す。`REVISE` のまま配布しない。

検査項目は [事前検査表](references/preflight-checklist.md) を使う。
