# Library Policy (Kairous)

## Use Libraries Over Custom Code

- バリデーション: zod (Server Action / Edge Function の入力スキーマ定義)
- 日付操作: date-fns (軽量、tree-shakeable)
- UI: 必要に応じて Radix UI primitives (BottomSheet, Dialog 等のアクセシブルなプリミティブ)
- FSRS: ts-fsrs (FSRS-5アルゴリズムの参照実装。自作しない)
- アイコン: lucide-react (一貫したアイコンセット)
- 自作するのは、既存ライブラリがないか、ドメイン固有のロジックのみ

## Code Reuse & Constants

- 同じ概念の値は定数として `src/lib/constants.ts` に集約する
- 学習手法のスラッグは `src/lib/constants.ts` で union type + 定数オブジェクトとして定義
- 同じようなロジックが2箇所に出現したら共通化を検討する (3箇所なら必須)
- Supabase クライアント生成は `src/lib/supabase/` の関数のみを使用。各ファイルで直接 `createClient` しない
- 型定義は `src/lib/types/database.ts` (自動生成) を single source of truth とする。手動の型定義で上書きしない
