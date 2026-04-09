// 将来の Web Push 受信用。現在は空。
// push イベントハンドラは Web Push 移行時に追加する。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
