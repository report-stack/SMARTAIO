---
name: skill-planner
description: Smart AIOの業務手順を実装前に分解し、Skillの責任範囲、入力、出力、評価基準、停止条件、テストシナリオ、版管理方針を設計する。新しい業務をSkill化するとき、既存Skillの責任が重なったとき、レビュー基準を先に決めたいときに使う。
---

# Smart AIO Skill設計

実務を動かすSkillを書く前に、設計契約を作る。保護プロンプトと `references/content-v1/assembly-rules.json` は設計変更の対象外にする。

## 手順

1. 業務の開始条件、終了条件、人の判断点を列挙する。
2. 一つのSkillが一つの主責任を持つように工程を分ける。
3. 各Skillの必須入力、出力、停止条件、評価基準を定義する。
4. 正常系、欠損、別顧客混入、未承認、重複実行のテストを作る。
5. `plan-skill` で設計契約を出力し、`$skill-evaluator` へ渡す。

出力形式と禁止事項は [Skill改善契約](references/improvement-contract.md) に従う。

## 停止条件

- 業務目的または担当者の判断点が不明。
- 保護プロンプトの変更を設計に含めようとしている。
- 評価基準または失敗時の停止条件がない。
