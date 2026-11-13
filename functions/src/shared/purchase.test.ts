import { describe, expect, it } from "vitest";
import { decidePurchase } from "./purchase";
import { CREDIT_PACKS } from "./credits";

const ok = { id: "cs_live_abc123", payment_status: "paid", amount_total: 1000, currency: "jpy", metadata: { app: "cookon", orgId: "org1", packId: "p100" } };

describe("購入の知らせからクレジットを渡すか決める", () => {
  it("払い終わった決済は、まとめ買いのクレジット数を渡す", () => {
    expect(decidePurchase(ok)).toEqual({ grant: true, orgId: "org1", sessionId: "cs_live_abc123", packId: "p100", credits: 100, priceYen: 1000 });
  });
  it("コンビニ・振込でまだ払っていないときは渡さない", () => {
    expect(decidePurchase({ ...ok, payment_status: "unpaid" }).grant).toBe(false);
  });
  it("金額や通貨が今の値段と違うときは渡さない", () => {
    expect(decidePurchase({ ...ok, amount_total: 100 }).grant).toBe(false);
    expect(decidePurchase({ ...ok, currency: "usd" }).grant).toBe(false);
  });
  it("ほかのアプリの決済・知らないまとめ買い・店舗が無い決済は渡さない", () => {
    expect(decidePurchase({ ...ok, metadata: { ...ok.metadata, app: "omni" } }).grant).toBe(false);
    expect(decidePurchase({ ...ok, metadata: { ...ok.metadata, packId: "p999" } }).grant).toBe(false);
    expect(decidePurchase({ ...ok, metadata: { app: "cookon", orgId: "../x", packId: "p100" } }).grant).toBe(false);
    expect(decidePurchase({ ...ok, metadata: null }).grant).toBe(false);
  });
  it("どのまとめ買いも、多く買うほど1クレジットが安い", () => {
    const per = CREDIT_PACKS.map((p) => p.priceYen / p.credits);
    expect(per).toEqual([...per].sort((a, b) => b - a));
  });
});
