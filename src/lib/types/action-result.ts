import { z } from "zod";

// Server Action の戻り値型。成功/失敗を型レベルで区別することでハンドリング漏れを防ぐ。
// validations/ ではなく types/ 配下に置く理由: 教材・セッション・通知など
// 全 Server Action で横断的に使う共通契約であり、特定ドメインのバリデーション責務に属さない。
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// zod v4 で ZodError.flatten() が非推奨になったため、トップレベル関数を使う
export function extractFieldErrors(
  error: z.ZodError,
): Record<string, string[]> {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}
