# セキュリティポリシー

## 脆弱性の報告

セキュリティ上の問題を発見した場合は、公開 Issue ではなく以下の方法で報告してください。

- GitHub の [Private vulnerability reporting](https://github.com/u-stem/kairous/security/advisories/new) を使用

## 対応方針

- 報告を受けてから 48 時間以内に確認・返信
- 重大な脆弱性は最優先で対応
- 修正完了後、報告者に通知

## 対象バージョン

| バージョン | サポート |
|---|---|
| main (最新) | 対象 |
| それ以外 | 対象外 |

## セキュリティ対策

本プロジェクトで実施しているセキュリティ対策:

- **認証・認可**: Supabase Auth + RLS (全テーブル)、Server Action で user_id 二重チェック
- **入力バリデーション**: zod による全入力境界でのバリデーション
- **依存関係**: Dependabot security updates 有効、CI で `--frozen-lockfile` 強制
- **シークレット管理**: Secret scanning + push protection 有効
- **CSP**: Content-Security-Policy ヘッダー設定済み
