// Firestore ルールのテスト（エミュレーターで実行：npm run test:rules。Java が必要）
// 一番大事な「他の店舗のデータは見えない・クレジットやレシピは画面から書き換えられない」を確かめる
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;
const ingredient = { name: "薄力粉", purchasePrice: 300, purchaseQty: 1, purchaseUnit: "kg", allergens: ["wheat"] };

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-cook-on", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "organizations/orgA"), { name: "A店", plan: "free", credits: 10 });
    await setDoc(doc(db, "organizations/orgA/recipes/r1"), { name: "クッキー", version: 1 });
    await setDoc(doc(db, "organizations/orgA/ingredients/i1"), ingredient);
    await setDoc(doc(db, "organizations/orgA/alerts/a1"), { recipeId: "r1", read: false });
    await setDoc(doc(db, "organizations/orgA/staffRecipes/r1"), { name: "クッキー", version: 1 });
    await setDoc(doc(db, "organizations/orgA/staffIngredients/i1"), { name: "薄力粉", purchaseQty: 1, purchaseUnit: "kg", allergens: ["wheat"] });
    await setDoc(doc(db, "organizations/orgA/public/branding"), { appName: "A店", logoUrl: null, primaryColor: "#d97757" });
    await setDoc(doc(db, "aiRequests/orgA_req00001"), { status: "done" });
  });
});

const as = (uid: string, orgs: Record<string, string>) => env.authenticatedContext(uid, { orgs }).firestore();

describe("テナント分離", () => {
  it("A店のメンバーはA店のレシピを読める（見るだけの人は値段を抜いた写し）", async () => {
    await assertSucceeds(getDoc(doc(as("u1", { orgA: "admin" }), "organizations/orgA/recipes/r1")));
    await assertSucceeds(getDoc(doc(as("u1", { orgA: "viewer" }), "organizations/orgA/staffRecipes/r1")));
  });
  it("B店のメンバーはA店のレシピも材料も読めない", async () => {
    const db = as("u2", { orgB: "owner" });
    await assertFails(getDoc(doc(db, "organizations/orgA/recipes/r1")));
    await assertFails(getDoc(doc(db, "organizations/orgA/ingredients/i1")));
  });
  it("クレームの無い人・ログインしていない人は読めない", async () => {
    await assertFails(getDoc(doc(env.authenticatedContext("u9").firestore(), "organizations/orgA")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "organizations/orgA")));
  });
});

describe("お金とレシピは Functions だけが書く", () => {
  it("オーナーでもクレジット残高とプランは変えられない。店舗名は変えられる", async () => {
    const db = as("u1", { orgA: "owner" });
    await assertFails(updateDoc(doc(db, "organizations/orgA"), { credits: 9999 }));
    await assertFails(updateDoc(doc(db, "organizations/orgA"), { unlimited: true }));
    await assertFails(updateDoc(doc(db, "organizations/orgA"), { plan: "pro" }));
    await assertSucceeds(updateDoc(doc(db, "organizations/orgA"), { name: "A店 本店" }));
  });
  it("スタッフは店舗名を変えられない", async () => {
    await assertFails(updateDoc(doc(as("u3", { orgA: "editor" }), "organizations/orgA"), { name: "x" }));
  });
  it("オーナーでもレシピ・通帳・受付票は画面から書けない", async () => {
    const db = as("u1", { orgA: "owner" });
    await assertFails(setDoc(doc(db, "organizations/orgA/recipes/r2"), { name: "x" }));
    await assertFails(setDoc(doc(db, "organizations/orgA/creditLedger/l1"), { amount: 100 }));
    await assertFails(getDoc(doc(db, "aiRequests/orgA_req00001")));
  });
});

describe("材料マスター", () => {
  it("管理者は材料を作れる・直せる。見るだけの人はできない", async () => {
    await assertSucceeds(setDoc(doc(as("u3", { orgA: "admin" }), "organizations/orgA/ingredients/i2"), { ...ingredient, name: "強力粉" }));
    await assertSucceeds(updateDoc(doc(as("u3", { orgA: "admin" }), "organizations/orgA/ingredients/i1"), { purchasePrice: 350 }));
    await assertFails(updateDoc(doc(as("u4", { orgA: "viewer" }), "organizations/orgA/ingredients/i1"), { purchasePrice: 1 }));
  });
  it("形のおかしい材料は書けない（マイナスの値段・知らない項目）", async () => {
    const db = as("u3", { orgA: "admin" });
    await assertFails(setDoc(doc(db, "organizations/orgA/ingredients/i3"), { ...ingredient, purchasePrice: -1 }));
    await assertFails(setDoc(doc(db, "organizations/orgA/ingredients/i3"), { ...ingredient, costCache: 1 }));
    await assertFails(setDoc(doc(db, "organizations/orgA/ingredients/i3"), { ...ingredient, priceTax: 0.05 }));
  });
  it("写真と、税込で入れた印は書ける", async () => {
    const db = as("u3", { orgA: "admin" });
    await assertSucceeds(setDoc(doc(db, "organizations/orgA/ingredients/i4"), { ...ingredient, photoPath: "orgs/orgA/ingredients/1.jpg", priceTax: 0.08 }));
    await assertSucceeds(setDoc(doc(db, "organizations/orgA/ingredients/i5"), { ...ingredient, photoPath: null, priceTax: 0 }));
  });
});

describe("スタッフ権限（経営の情報は見えない）", () => {
  const staff = () => as("u5", { orgA: "editor" });
  it("スタッフ・見るだけは元のレシピ・材料・前の版・値段の記録を読めない。写しは読める", async () => {
    for (const db of [staff(), as("u6", { orgA: "viewer" })]) {
      await assertFails(getDoc(doc(db, "organizations/orgA/recipes/r1")));
      await assertFails(getDoc(doc(db, "organizations/orgA/recipes/r1/versions/1")));
      await assertFails(getDoc(doc(db, "organizations/orgA/ingredients/i1")));
      await assertFails(getDoc(doc(db, "organizations/orgA/ingredients/i1/priceHistory/h1")));
      await assertFails(getDoc(doc(db, "organizations/orgA/creditLedger/l1")));
      await assertFails(getDoc(doc(db, "organizations/orgA/purchaseInbox/x1")));
      await assertSucceeds(getDoc(doc(db, "organizations/orgA/staffRecipes/r1")));
      await assertSucceeds(getDoc(doc(db, "organizations/orgA/staffIngredients/i1")));
    }
  });
  it("写しは誰も画面から書けない", async () => {
    await assertFails(setDoc(doc(as("u1", { orgA: "owner" }), "organizations/orgA/staffRecipes/r2"), { name: "x" }));
    await assertFails(setDoc(doc(staff(), "organizations/orgA/staffIngredients/i2"), { name: "x" }));
  });
  it("スタッフは値段なしで材料を作れる。値段を入れて作ることはできない", async () => {
    const { purchasePrice: _p, ...noPrice } = ingredient;
    await assertSucceeds(setDoc(doc(staff(), "organizations/orgA/ingredients/i7"), { ...noPrice, purchasePrice: null }));
    await assertFails(setDoc(doc(staff(), "organizations/orgA/ingredients/i8"), ingredient));
    await assertFails(setDoc(doc(staff(), "organizations/orgA/ingredients/i8"), { ...noPrice, purchasePrice: null, supplier: "○○商店" }));
  });
  it("スタッフは材料の名前・アレルゲンを直せる。値段・仕入れ先は変えられない", async () => {
    await assertSucceeds(setDoc(doc(staff(), "organizations/orgA/ingredients/i1"), { name: "薄力粉（特宝笠）", allergens: ["wheat"], allergensConfirmed: true }, { merge: true }));
    await assertFails(updateDoc(doc(staff(), "organizations/orgA/ingredients/i1"), { purchasePrice: 1 }));
    await assertFails(updateDoc(doc(staff(), "organizations/orgA/ingredients/i1"), { supplier: "x" }));
    await assertFails(setDoc(doc(staff(), "organizations/orgA/ingredients/i1"), { name: "薄力粉", purchasePrice: null, purchaseQty: 1, purchaseUnit: "kg", allergens: [] }));
  });
  it("店長は元のレシピ・材料・包装資材を読めて、値段を直せる。店舗名・ブランドは変えられない", async () => {
    const db = as("u7", { orgA: "manager" });
    await assertSucceeds(getDoc(doc(db, "organizations/orgA/recipes/r1")));
    await assertSucceeds(getDoc(doc(db, "organizations/orgA/alerts/a1")));
    await assertSucceeds(updateDoc(doc(db, "organizations/orgA/ingredients/i1"), { purchasePrice: 320 }));
    await assertSucceeds(setDoc(doc(db, "organizations/orgA/packaging/p9"), { name: "袋", purchasePrice: 10, purchaseQty: 1, unit: "枚" }));
    await assertFails(updateDoc(doc(db, "organizations/orgA"), { name: "x" }));
    await assertFails(setDoc(doc(db, "organizations/orgA/public/branding"), { appName: "x", logoUrl: null, primaryColor: "#000000" }));
  });
  it("管理者でも写しを作り終えた印は画面から付けられない", async () => {
    await assertFails(updateDoc(doc(as("u1", { orgA: "owner" }), "organizations/orgA"), { staffViewsAt: 1 }));
  });
});

describe("包装資材とセット", () => {
  const bag = { name: "10cm袋", purchasePrice: 1500, purchaseQty: 100, unit: "枚", priceTax: 0.1 };
  const set = { name: "10cm袋セット", items: [{ packagingId: "p1", name: "10cm袋", qty: 1 }] };
  it("管理者は資材とセットを作れる。スタッフ・見るだけの人・ほかの店舗はできない", async () => {
    await assertSucceeds(setDoc(doc(as("u3", { orgA: "admin" }), "organizations/orgA/packaging/p1"), bag));
    await assertSucceeds(setDoc(doc(as("u3", { orgA: "admin" }), "organizations/orgA/packagingSets/s1"), set));
    await assertFails(setDoc(doc(as("u5", { orgA: "editor" }), "organizations/orgA/packaging/p2"), bag));
    await assertFails(getDoc(doc(as("u5", { orgA: "editor" }), "organizations/orgA/packaging/p1")));
    await assertFails(setDoc(doc(as("u4", { orgA: "viewer" }), "organizations/orgA/packaging/p2"), bag));
    await assertFails(setDoc(doc(as("u2", { orgB: "owner" }), "organizations/orgA/packagingSets/s2"), set));
  });
  it("形のおかしい資材は書けない（知らない単位・税の形・知らない項目）", async () => {
    const db = as("u3", { orgA: "admin" });
    await assertFails(setDoc(doc(db, "organizations/orgA/packaging/p3"), { ...bag, unit: "kg" }));
    await assertFails(setDoc(doc(db, "organizations/orgA/packaging/p3"), { ...bag, priceTax: 0.2 }));
    await assertFails(setDoc(doc(db, "organizations/orgA/packagingSets/s3"), { ...set, cost: 1 }));
  });
});

describe("ラベルの保存した品目", () => {
  const item = { name: "コーヒー豆（エチオピア）", text: "コーヒー豆（生豆生産国名 エチオピア）", content: "100g" };
  it("スタッフは保存・消せる。見るだけの人・ほかの店舗はできない。形のおかしいものは書けない", async () => {
    await assertSucceeds(setDoc(doc(as("u3", { orgA: "editor" }), "organizations/orgA/labelItems/l1"), item));
    await assertSucceeds(deleteDoc(doc(as("u3", { orgA: "editor" }), "organizations/orgA/labelItems/l1")));
    await assertFails(setDoc(doc(as("u4", { orgA: "viewer" }), "organizations/orgA/labelItems/l2"), item));
    await assertFails(setDoc(doc(as("u2", { orgB: "owner" }), "organizations/orgA/labelItems/l2"), item));
    await assertFails(setDoc(doc(as("u3", { orgA: "editor" }), "organizations/orgA/labelItems/l3"), { ...item, name: "" }));
    await assertFails(setDoc(doc(as("u3", { orgA: "editor" }), "organizations/orgA/labelItems/l3"), { ...item, price: 1 }));
  });
});

describe("アラート・ブランド・票", () => {
  it("アラートは既読にだけできる（スタッフは読めない）", async () => {
    await assertFails(getDoc(doc(as("u5", { orgA: "editor" }), "organizations/orgA/alerts/a1")));
    const db = as("u3", { orgA: "admin" });
    await assertSucceeds(updateDoc(doc(db, "organizations/orgA/alerts/a1"), { read: true }));
    await assertFails(updateDoc(doc(db, "organizations/orgA/alerts/a1"), { recipeId: "x" }));
    await assertFails(deleteDoc(doc(db, "organizations/orgA/alerts/a1")));
  });
  it("ブランドは誰でも読め、管理者だけが色を変えられる", async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "organizations/orgA/public/branding")));
    const branding = { appName: "A店", logoUrl: null, primaryColor: "#336699" };
    await assertSucceeds(setDoc(doc(as("u1", { orgA: "admin" }), "organizations/orgA/public/branding"), branding));
    await assertFails(setDoc(doc(as("u3", { orgA: "editor" }), "organizations/orgA/public/branding"), branding));
    await assertFails(setDoc(doc(as("u1", { orgA: "admin" }), "organizations/orgA/public/branding"), { ...branding, primaryColor: "red" }));
  });
  it("票は自分の uid で 1 か -1 だけ", async () => {
    const db = as("u3", { orgA: "editor" });
    await assertSucceeds(setDoc(doc(db, "organizations/orgA/ugcVotes/p1"), { value: 1, uid: "u3" }));
    await assertFails(setDoc(doc(db, "organizations/orgA/ugcVotes/p2"), { value: 5, uid: "u3" }));
    await assertFails(setDoc(doc(db, "organizations/orgA/ugcVotes/p3"), { value: 1, uid: "someone" }));
  });
  it("共有マスターは読めるが書けない", async () => {
    const db = as("u1", { orgA: "owner" });
    await assertSucceeds(getDoc(doc(db, "globalIngredients/g1")));
    await assertFails(setDoc(doc(db, "globalIngredients/g1"), { name: "x" }));
    await assertFails(setDoc(doc(db, "ugcProducts/p1"), { goodCount: 100 }));
  });
});
