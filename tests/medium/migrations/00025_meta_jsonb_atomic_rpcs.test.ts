import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getAdminClient,
  createTestUser,
  deleteTestUser,
} from "../../shared/db";
import {
  createTestSubject,
  createTestMaterial,
  cleanupTestData,
} from "../../shared/helpers";

// Issue #321: meta JSONB の read-modify-write を原子化する RPC の DB 層契約を検証する。
// 本ファイルは practice_log_*系 の 2 関数のみ。project_*系は別 PR で同じ方針で追加予定。

type PracticeLogMeta = {
  entry_schema?: string;
  entries?: Array<{ date: string; value: number | string; note?: string }>;
};

async function setupPracticeLogMaterial(userId: string) {
  const category = await createTestSubject(userId, `RPC-PL-${Date.now()}`);
  const material = await createTestMaterial(category.id, userId, "practice_log-rpc");
  const { error } = await getAdminClient()
    .from("materials")
    .update({
      type: "practice_log",
      meta: { entry_schema: "reps", entries: [] },
      unit_label: "回",
    })
    .eq("id", material.id);
  expect(error).toBeNull();
  return material;
}

async function readMeta(materialId: string) {
  const { data, error } = await getAdminClient()
    .from("materials")
    .select("meta, completed_units")
    .eq("id", materialId)
    .single();
  expect(error).toBeNull();
  return data as {
    meta: Record<string, unknown>;
    completed_units: number;
  };
}

describe("migration 00025: practice_log atomic RPCs", () => {
  let userId: string;

  beforeAll(async () => {
    userId = await createTestUser();
  });

  afterAll(async () => {
    await cleanupTestData(userId);
    await deleteTestUser(userId);
  });

  describe("practice_log_append_entry", () => {
    it("entries に 1 件追加し completed_units を length に揃える", async () => {
      const material = await setupPracticeLogMaterial(userId);
      const { error } = await getAdminClient().rpc("practice_log_append_entry", {
        p_material_id: material.id,
        p_entry: { date: "2026-04-18", value: 30, note: "朝練" },
      });
      expect(error).toBeNull();

      const row = await readMeta(material.id);
      const meta = row.meta as PracticeLogMeta;
      expect(meta.entries?.length).toBe(1);
      expect(meta.entries?.[0]?.value).toBe(30);
      expect(row.completed_units).toBe(1);
    });

    it("同一教材への concurrent append で entries が失われない (原子性)", async () => {
      const material = await setupPracticeLogMaterial(userId);
      // 10 並列で entry 追加。client 側 read-modify-write では最終 length < 10 に
      // 倒れるのが典型。RPC で 10 件全て保持されること
      const tasks = Array.from({ length: 10 }, (_, i) =>
        getAdminClient().rpc("practice_log_append_entry", {
          p_material_id: material.id,
          p_entry: { date: "2026-04-18", value: i },
        }),
      );
      const results = await Promise.all(tasks);
      for (const r of results) expect(r.error).toBeNull();

      const row = await readMeta(material.id);
      expect((row.meta as PracticeLogMeta).entries?.length).toBe(10);
      expect(row.completed_units).toBe(10);
    });

    it("practice_log 以外の type では例外になる", async () => {
      const category = await createTestSubject(userId, `RPC-WT-${Date.now()}`);
      const material = await createTestMaterial(category.id, userId, "wrong-type");
      const { error } = await getAdminClient().rpc("practice_log_append_entry", {
        p_material_id: material.id,
        p_entry: { date: "2026-04-18", value: 1 },
      });
      expect(error?.message).toMatch(/not practice_log/);
    });

    it("p_entry が JSON 配列の場合は型チェックで拒否する", async () => {
      const material = await setupPracticeLogMaterial(userId);
      const { error } = await getAdminClient().rpc("practice_log_append_entry", {
        p_material_id: material.id,
        // 配列が渡されると `||` が配列結合に倒れて複数要素同時追加になるため
        // RPC 側で jsonb_typeof チェックして拒否する
        p_entry: [{ date: "2026-04-18", value: 1 }],
      });
      expect(error?.message).toMatch(/must be a JSON object/);
    });
  });

  describe("practice_log_delete_entry", () => {
    it("指定 index の entry を削除し completed_units を再計算する", async () => {
      const material = await setupPracticeLogMaterial(userId);
      for (const v of [1, 2, 3]) {
        await getAdminClient().rpc("practice_log_append_entry", {
          p_material_id: material.id,
          p_entry: { date: "2026-04-18", value: v },
        });
      }

      const { error } = await getAdminClient().rpc("practice_log_delete_entry", {
        p_material_id: material.id,
        p_entry_index: 1,
      });
      expect(error).toBeNull();

      const row = await readMeta(material.id);
      const entries = (row.meta as PracticeLogMeta).entries ?? [];
      expect(entries.length).toBe(2);
      expect(entries.map((e) => e.value)).toEqual([1, 3]);
      expect(row.completed_units).toBe(2);
    });

    it("範囲外 index では例外になる", async () => {
      const material = await setupPracticeLogMaterial(userId);
      const { error } = await getAdminClient().rpc("practice_log_delete_entry", {
        p_material_id: material.id,
        p_entry_index: 99,
      });
      expect(error?.message).toMatch(/out of range/);
    });
  });
});
