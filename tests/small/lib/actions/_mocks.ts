import { vi } from "vitest";

export type ResolvedValue = { data: unknown; error: unknown };

type ChainOptions = {
  resolvedValue: ResolvedValue;
  onUpdate?: (args: unknown) => void;
};

// Supabase クライアントの chainable API を最小限模倣する。
// update / select / eq は新しい chain を返して繰り返し呼び出し可能にし、
// maybeSingle と then (await 時) で resolvedValue を返す。
// onUpdate は update() 呼び出し直下のみで発火させ、後続 (select/eq) の chain には
// 伝播させない。伝播させると select().eq() 後に update を呼ぶ将来のテストで誤検知する
function createChainMock(options: ChainOptions): Record<string, unknown> {
  const resolved = Promise.resolve(options.resolvedValue);
  const nested: ChainOptions = { resolvedValue: options.resolvedValue };
  const chain: Record<string, unknown> = {
    update: vi.fn().mockImplementation((args: unknown) => {
      options.onUpdate?.(args);
      return createChainMock(nested);
    }),
    select: vi.fn().mockImplementation(() => createChainMock(nested)),
    eq: vi.fn().mockImplementation(() => createChainMock(nested)),
    maybeSingle: vi.fn().mockReturnValue(resolved),
    then: resolved.then.bind(resolved),
  };
  return chain;
}

// Server Action Small テスト向けの共通 mock client ビルダー。
// fetchResult: 1 回目の from() に返す値 (select → maybeSingle チェーン)
// updateResult: 2 回目以降の from() に返す値 (update チェーンの await 解決値)
// onUpdate: update() の引数をキャプチャする spy。completed_units / meta の検証に使う
// rpcResult: `supabase.rpc(name, args)` の await 解決値 (RPC ベース Action 用)
// onRpc: rpc(name, args) の引数をキャプチャする spy
export function buildMockClient(options: {
  user: { id: string } | null;
  fetchResult?: ResolvedValue;
  updateResult?: ResolvedValue;
  onUpdate?: (args: unknown) => void;
  rpcResult?: ResolvedValue;
  onRpc?: (name: string, args: unknown) => void;
}) {
  const fetchResolved = options.fetchResult ?? { data: null, error: null };
  const updateResolved = options.updateResult ?? { data: null, error: null };
  const rpcResolved = options.rpcResult ?? { data: null, error: null };

  const fromMock = vi.fn();
  let callCount = 0;
  fromMock.mockImplementation(() => {
    const result = callCount++ === 0 ? fetchResolved : updateResolved;
    return createChainMock({
      resolvedValue: result,
      onUpdate: options.onUpdate,
    });
  });

  const rpcMock = vi.fn((name: string, args: unknown) => {
    options.onRpc?.(name, args);
    return Promise.resolve(rpcResolved);
  });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: options.user } }),
    },
    from: fromMock,
    rpc: rpcMock,
  };
}
