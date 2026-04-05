# Code Quality (Kairous)

汎用コードスタイルはユーザーレベル rules で定義済み。ここではプロジェクト固有のルールを記載。

- コメントは日本語。Why を書く (What は書かない)
- TODO 禁止。今すぐ解消するか GitHub Issue を作成する
- エラー・警告の握りつぶし禁止
- 同じロジックの重複: 2箇所で検討、3箇所で必須共通化
- 定数は `src/lib/constants.ts` に集約
- 型は `src/lib/types/database.ts` (自動生成) が single source of truth
