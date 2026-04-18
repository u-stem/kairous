import { format, parseISO } from "date-fns";
import type { Locale } from "date-fns";
import { JST_OFFSET_MS } from "@/lib/constants";

// UTC の Date を JST に変換して YYYY-MM-DD 文字列を返す。
// date-fns-tz は Edge Function (Deno) で使えないため、手動オフセットで統一する
export function toJstDateString(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.toISOString().split("T")[0];
}

// YYYY-MM-DD 形式の日付文字列を local TZ として解釈して指定パターンで format する。
// `new Date("YYYY-MM-DD")` は ES spec で UTC 午前 0 時扱いとなり、JST では 1 日前倒しで
// 表示されるバグ (#330 / #318 code-review で発覚) の再発防止のため集約する。
// ISO 8601 timestamp (`2026-04-18T10:00:00Z` 等) にはこの関数を使わず `new Date()` を使うこと
// (timestamp には既に TZ 情報が含まれているため、parseISO による local 解釈は二重変換になる)。
//
// 引数名 `dateStr` は「YYYY-MM-DD 限定」という意図を伝えるための命名
// (ISO 8601 full timestamp を連想させる `iso` は避ける)
export function formatDateString(
  dateStr: string,
  pattern = "yyyy/M/d",
  options?: { locale?: Locale },
): string {
  return format(parseISO(dateStr), pattern, options);
}
