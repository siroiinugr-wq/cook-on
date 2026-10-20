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
    await setDoc(doc(db, "organizations/orgA/public/branding"), { appName: "A店", logoUrl: null, primaryColor: "#d97757" });
    await setDoc(doc(db, "aiRequests/orgA_req00001"), { status: "done" });
  });
});

const as = (uid: string, orgs: Record<string, string>) => env.authenticatedContext(uid, { orgs }).firestore();

describe("テナント分離", () => {
  it("A店のメンバーはA店のレシピを読める", async () => {
    await assertSucceeds(getDoc(doc(as("u1", { orgA: "viewer" }), "organizations/orgA/recipes/r1")));
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
  it("スタッフは材料を作れる・直せる。見るだけの人はできない", async () => {
    await assertSucceeds(setDoc(doc(as("u3", { orgA: "editor" }), "organizations/orgA/ingredients/i2"), { ...ingredient, name: "強力粉" }));
    await assertSucceeds(updateDoc(doc(as("u3", { orgA: "editor" }), "organizations/orgA/ingredients/i1"), { purchasePrice: 350 }));
    await assertFails(updateDoc(doc(as("u4", { orgA: "viewer" }), "organizations/orgA/ingredients/i1"), { purchasePrice: 1 }));
  });
  it("形のおかしい材料は書けない（マイナスの値段・知らない項目）", async () => {
    const db = as("u3", { orgA: "editor" });
    await assertFails(setDoc(doc(db, "organizations/orgA/ingredients/i3"), { ...ingredient, purchasePrice: -1 }));
    await assertFails(setDoc(doc(db, "organizations/orgA/ingredients/i3"), { ...ingredient, costCache: 1 }));
  });
});

describe("アラート・ブランド・票", () => {
  it("アラートは既読にだけできる", async () => {
    const db = as("u3", { orgA: "editor" });
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
