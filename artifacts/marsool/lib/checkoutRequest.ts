// Keep one durable identity for an uncertain checkout, including after app restart.
// Store only a payload digest and random key; no address/cart contents are persisted here.
type Dependencies = {
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
  digest(body: string): Promise<string>;
  randomKey(): string;
  send(body: string, key: string, userId: string): Promise<unknown>;
};
export function createCheckoutSender(deps: Dependencies) {
  const inFlight = new Map<string, Promise<unknown>>();
  return function checkout(userId: string, body: string): Promise<unknown> {
    const flight = JSON.stringify([userId, body]);
    const pending = inFlight.get(flight);
    if (pending) return pending;
    const promise = (async () => {
      if (!userId) throw new Error("سجّل الدخول قبل إرسال الطلب");
      const digest = await deps.digest(body);
      const storageKey = `zaboni:checkout:v1:${userId}:${digest}`;
      let key = await deps.storage.getItem(storageKey);
      if (!key) {
        key = deps.randomKey();
        // Never send before durable storage succeeds.
        await deps.storage.setItem(storageKey, key);
      }
      const result = await deps.send(body, key, userId);
      if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string" || !result.id) {
        throw new Error("تعذّر تأكيد رقم الطلب، أعد المحاولة لاسترجاعه بأمان");
      }
      // Network/HTTP/parse failures leave the key available for a safe retry.
      // Cleanup failure also retains it; retrying cannot create another order.
      await deps.storage.removeItem(storageKey);
      return result;
    })();
    inFlight.set(flight, promise);
    void promise.finally(() => { if (inFlight.get(flight) === promise) inFlight.delete(flight); }).catch(() => {});
    return promise;
  };
}
