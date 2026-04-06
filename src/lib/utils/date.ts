import { JST_OFFSET_MS } from "@/lib/constants";

// UTC の Date を JST に変換して YYYY-MM-DD 文字列を返す。
// date-fns-tz は Edge Function (Deno) で使えないため、手動オフセットで統一する
export function toJstDateString(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  return jst.toISOString().split("T")[0];
}
