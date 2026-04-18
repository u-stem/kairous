import { describe, it, expect, vi, beforeEach } from "vitest";
import { upsertDailyLog } from "@/lib/actions/session-commands/_shared";

// toJstDateString は実装詳細として内部で呼ばれる。日付をテストごとに固定したいので Date をフリーズしない
// (テストの assertion は p_log_date の値そのものではなく呼び出しが 1 度行われたことに焦点を当てる)

type RpcResult = { data: unknown; error: { message: string } | null };

// 実装は from("materials").select("category_id").eq("id", materialId).single() のみ。
// 将来 .eq("user_id", ...) などの追加条件を設けた場合、この builder はそれを素通しするので、
// 仕様変更時はモックも合わせて更新すること。
function buildSupabase(options: {
  materialRow: { category_id: string } | null;
  materialError?: { message: string } | null;
  rpcResult: RpcResult;
}) {
  const singleMaterial = vi.fn().mockResolvedValue({
    data: options.materialRow,
    error: options.materialError ?? null,
  });
  const eqMaterial = vi.fn().mockReturnValue({ single: singleMaterial });
  const selectMaterial = vi.fn().mockReturnValue({ eq: eqMaterial });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "materials") return { select: selectMaterial };
    throw new Error(`予期しないテーブル: ${table}`);
  });

  const rpc = vi.fn().mockResolvedValue(options.rpcResult);

  return { supabase: { from, rpc }, rpc, singleMaterial };
}

describe("upsertDailyLog", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // テストごとに spy を restore してから張り直さないと calls がテスト間で蓄積する
    vi.restoreAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("invokes upsert_daily_log RPC with the material's category_id", async () => {
    const { supabase, rpc } = buildSupabase({
      materialRow: { category_id: "cat-1" },
      rpcResult: { data: null, error: null },
    });

    await upsertDailyLog(supabase as unknown as Parameters<typeof upsertDailyLog>[0], {
      userId: "user-1",
      materialId: "mat-1",
      methodId: "method-1",
      durationSec: 1500,
      actionName: "testAction",
      sessionId: "sess-test",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "upsert_daily_log",
      expect.objectContaining({
        p_user_id: "user-1",
        p_category_id: "cat-1",
        p_method_id: "method-1",
        p_duration_sec: 1500,
        p_cards_reviewed: 0,
      }),
    );
  });

  it("skips the RPC call and logs a warn when the material is not found so orphaned sessions do not write stats", async () => {
    const { supabase, rpc } = buildSupabase({
      materialRow: null,
      rpcResult: { data: null, error: null },
    });

    await upsertDailyLog(supabase as unknown as Parameters<typeof upsertDailyLog>[0], {
      userId: "user-1",
      materialId: "mat-1",
      methodId: "method-1",
      durationSec: 1500,
      actionName: "testAction",
      sessionId: "sess-test",
    });

    expect(rpc).not.toHaveBeenCalled();
    // material 不在 (delete 後の race) は接続断と区別できる warn メッセージで記録される
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("material not found for session sess-test"),
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("skips the RPC call and logs an error when the material fetch fails so contact loss is visible in observability", async () => {
    const { supabase, rpc } = buildSupabase({
      materialRow: null,
      materialError: { message: "connection lost" },
      rpcResult: { data: null, error: null },
    });

    await upsertDailyLog(supabase as unknown as Parameters<typeof upsertDailyLog>[0], {
      userId: "user-1",
      materialId: "mat-1",
      methodId: "method-1",
      durationSec: 1500,
      actionName: "completePomodoroSession",
      sessionId: "sess-err",
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("material fetch failed for session sess-err"),
      expect.objectContaining({ message: "connection lost" }),
    );
    // fetch error 時は not-found の warn は発火しない
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it("logs but does not throw when the RPC returns an error so the session completion succeeds", async () => {
    const { supabase } = buildSupabase({
      materialRow: { category_id: "cat-1" },
      rpcResult: { data: null, error: { message: "db connection lost" } },
    });

    await expect(
      upsertDailyLog(supabase as unknown as Parameters<typeof upsertDailyLog>[0], {
        userId: "user-1",
        materialId: "mat-1",
        methodId: "method-1",
        durationSec: 1500,
        actionName: "completePomodoroSession",
      sessionId: "sess-1",
      }),
    ).resolves.toBeUndefined();

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    // 旧実装と同じ形式 "<actionName> daily_log upsert failed for session <sessionId>:" を保つ
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "completePomodoroSession daily_log upsert failed for session sess-1:",
      expect.anything(),
    );
  });
});
