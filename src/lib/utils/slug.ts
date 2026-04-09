// カスタム手法のスラッグはユーザーIDプレフィックスで名前衝突を防ぐ
// 内部識別子のため URL には使わないが、DB の UNIQUE 制約に使われる
export function generateMethodSlug(userId: string, name: string): string {
  const prefix = userId.slice(0, 8);
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f]/g, "");
  return `custom_${prefix}_${sanitized}`;
}
