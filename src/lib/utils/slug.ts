// カスタム手法のスラッグはユーザーIDプレフィックスで名前衝突を防ぐ
export function generateMethodSlug(userId: string, name: string): string {
  const prefix = userId.slice(0, 8);
  const trimmed = name.trim();
  return `custom_${prefix}_${trimmed}`;
}
