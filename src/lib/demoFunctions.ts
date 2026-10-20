// デモモードの「にせの Cloud Functions」。本番の関数と同じ名前・同じ引数・同じ返り値の形にしてある。
// レシピの保存と版、原価アラートは shared の同じ計算で本物どおりに動く。AIの部分だけ demoAi.ts の簡易版。
import { CREDIT_COST, type CreditAction } from "@shared/credits";
import { DEFAULT_TARGET_RATE } from "@shared/cost";
import type { PackCtx } from "@shared/packaging";
import { deriveRecipe, sanitizeRecipe } from "@shared/recipe";
import type { CostCache, Ingredient, PackagingMaterial, PackagingSet } from "@shared/types";
import { judgeUgc } from "@shared/ugc";
import { demoGet, demoListDocs, demoWrite, onDemoWrite } from "./demo";
import { DEMO_ORG } from "./demoData";
import { demoAiCall } from "./demoAi";

type Data = Record<string, unknown>;
const O = `organizations/${DEMO_ORG}`;
const now = () => new Date().toISOString();
const rid = () => `demo${Math.random().toString(36).slice(2, 12)}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function demoIngredientMap(): Map<string, Ingredient> {
  return new Map(demoListDocs(`${O}/ingredients`).map((x) => [x.id, { ...(x.data as unknown as Ingredient), id: x.id }]));
}

export function demoPackaging(): PackCtx {
  return {
    matById: new Map(demoListDocs(`${O}/packaging`).map((x) => [x.id, { ...(x.data as unknown as PackagingMaterial), id: x.id }])),
    setById: new Map(demoListDocs(`${O}/packagingSets`).map((x) => [x.id, { ...(x.data as unknown as PackagingSet), id: x.id }])),
  };
}

/** 本番の writeRecipe と同じ：今の中身を versions に写してから版を上げる */
export function demoWriteRecipe(recipeId: string | null, raw: unknown, note = "") {
  const input = sanitizeRecipe(raw);
  if (typeof input === "string") throw new Error(input);
  const id = recipeId ?? rid();
  const path = `${O}/recipes/${id}`;
  const cur = demoGet(path);
  if (recipeId && !cur) throw new Error("レシピが見つかりません。");
  const prev = cur ? Number(cur.version ?? 1) : 0;
  if (cur) demoWrite(`${path}/versions/${prev}`, { ...cur, archivedAt: now() }, false);
  demoWrite(path, {
    ...input, ...deriveRecipe(input, demoIngredientMap(), demoPackaging()), version: prev + 1, archived: false,
    updatedAt: now(), updatedBy: "demo-user", ...(note ? { changeNote: note } : {}),
  });
  return { recipeId: id, version: prev + 1 };
}

/** 本番の runWithCredits と同じ順：足りなければ断る → 引く → 失敗したら返す */
export async function demoWithCredits<T>(action: CreditAction, units: number, work: () => Promise<{ result: T; usedUnits?: number }>): Promise<T> {
  const cost = CREDIT_COST[action] * units;
  const org = demoGet(O)!;
  const balance = Number(org.credits ?? 0);
  if (balance < cost) throw new Error(`クレジットが足りません（残り${balance} / 必要${cost}）。クレジットの画面から追加できます。`);
  const ledger = `${O}/creditLedger/${rid()}`;
  demoWrite(O, { ...org, credits: balance - cost });
  demoWrite(ledger, { kind: "spend", action, amount: -cost, status: "held", createdAt: now() });
  try {
    await wait(700); // AIの待ち時間のつもり
    const out = await work();
    const back = (units - Math.min(units, out.usedUnits ?? units)) * CREDIT_COST[action];
    if (back > 0) demoWrite(O, { ...demoGet(O)!, credits: Number(demoGet(O)!.credits) + back });
    demoWrite(ledger, { ...demoGet(ledger)!, status: "spent", amount: -(cost - back) });
    return out.result;
  } catch (e) {
    demoWrite(O, { ...demoGet(O)!, credits: Number(demoGet(O)!.credits) + cost });
    demoWrite(ledger, { ...demoGet(ledger)!, status: "refunded", amount: 0, refunded: cost });
    throw e;
  }
}

export async function demoCall<T>(name: string, data: object): Promise<T> {
  const d = data as Data;
  switch (name) {
    case "saveRecipe":
      return demoWriteRecipe((d.recipeId as string) || null, d.recipe, String(d.note ?? "")) as T;
    case "restoreRecipeVersion": {
      const v = demoGet(`${O}/recipes/${d.recipeId}/versions/${d.version}`);
      if (!v) throw new Error("その版は見つかりません。");
      return demoWriteRecipe(String(d.recipeId), v, `第${d.version}版に戻した`) as T;
    }
    case "archiveRecipe": {
      const p = `${O}/recipes/${d.recipeId}`;
      demoWrite(p, { ...demoGet(p)!, archived: d.archived !== false });
      return { ok: true } as T;
    }
    case "submitUgcProduct": {
      const id = rid();
      demoWrite(`ugcProducts/${id}`, { ...d, createdByOrg: DEMO_ORG, goodCount: 0, badCount: 0, status: "pending", createdAt: now() });
      return { productId: id, existed: false } as T;
    }
    case "createCheckout":
      throw new Error("クレジットの購入は準備中です。もうしばらくお待ちください。");
    case "createInvite":
    case "createOrganization":
      throw new Error("デモモードではこの操作はできません。Firebase をつないでからお試しください。");
    default:
      return demoAiCall<T>(name, d);
  }
}

// ── 本番のトリガの代わり ──

/** recipes/costAlert.ts の recalcRecipes と同じ：使っているレシピを計算し直し、目標を初めて超えたらアラート */
function demoRecalc(uses: (r: Data) => boolean, cause: { id: string; name: string }) {
  const ingById = demoIngredientMap();
  const pack = demoPackaging();
  const target = Number((demoGet(O)?.settings as Data | undefined)?.targetCostRate) || DEFAULT_TARGET_RATE;
  for (const r of demoListDocs(`${O}/recipes`)) {
    if (!uses(r.data)) continue;
    const input = sanitizeRecipe(r.data);
    if (typeof input === "string") continue;
    const derived = deriveRecipe(input, ingById, pack);
    demoWrite(`${O}/recipes/${r.id}`, {
      ...r.data, allergens: derived.allergens, costCache: derived.costCache,
      packagingIds: derived.packagingIds, packagingSetIds: derived.packagingSetIds,
    }, false);
    const old = r.data.costCache as CostCache | null;
    const t = input.targetCostRate ?? target;
    const rate = derived.costCache.rate;
    if (rate !== null && rate > t && (old?.rate ?? 0) <= t) {
      demoWrite(`${O}/alerts/${rid()}`, {
        kind: "costOverTarget", recipeId: r.id, recipeName: input.name, ingredientId: cause.id, ingredientName: cause.name,
        oldRate: old?.rate ?? null, newRate: rate, target: t, read: false, createdAt: now(),
      }, false);
    }
  }
}
const has = (field: string, id: string) => (r: Data) => !!(r[field] as string[] | undefined)?.includes(id);

// 材料の仕入れ値が変わったら、使っているレシピの原価を計算し直し、目標を超えたらアラート（recipes/costAlert.ts と同じ）
onDemoWrite((path, before, after) => {
  const m = /^organizations\/demo\/ingredients\/([^/]+)$/.exec(path);
  if (!m || !before || !after) return;
  const keys = ["purchasePrice", "purchaseQty", "purchaseUnit", "gramsPerPiece", "gramsPerMl", "allergens"];
  if (keys.every((k) => JSON.stringify(before[k] ?? null) === JSON.stringify(after[k] ?? null))) return;
  if (["purchasePrice", "purchaseQty", "purchaseUnit"].some((k) => before[k] !== after[k])) {
    demoWrite(`${path}/priceHistory/${rid()}`, {
      from: { price: before.purchasePrice ?? null, qty: before.purchaseQty, unit: before.purchaseUnit },
      to: { price: after.purchasePrice ?? null, qty: after.purchaseQty, unit: after.purchaseUnit }, at: now(),
    }, false);
  }
  demoRecalc(has("ingredientIds", m[1]), { id: m[1], name: String(after.name) });
});

// 包装資材・包装セットを直したら（recipes/packagingAlert.ts と同じ）
onDemoWrite((path, before, after) => {
  const m = /^organizations\/demo\/(packaging|packagingSets)\/([^/]+)$/.exec(path);
  if (!m || !before) return;
  const keys = m[1] === "packaging" ? ["purchasePrice", "purchaseQty"] : ["items"];
  if (after && keys.every((k) => JSON.stringify(before[k] ?? null) === JSON.stringify(after[k] ?? null))) return;
  demoRecalc(has(m[1] === "packaging" ? "packagingIds" : "packagingSetIds", m[2]), { id: m[2], name: String((after ?? before).name) });
});

// 票が入ったら数え直す（ugc/products.ts の onUgcVoteWritten と同じ決まり）
onDemoWrite((path, before, after) => {
  const m = /^organizations\/demo\/ugcVotes\/([^/]+)$/.exec(path);
  if (!m) return;
  const p = `ugcProducts/${m[1]}`;
  const prod = demoGet(p);
  if (!prod || prod.createdByOrg === DEMO_ORG || prod.status !== "pending") return;
  const g = (v: unknown) => (v === 1 ? 1 : 0);
  const b = (v: unknown) => (v === -1 ? 1 : 0);
  const good = Number(prod.goodCount) + g(after?.value) - g(before?.value);
  const bad = Number(prod.badCount) + b(after?.value) - b(before?.value);
  const v = judgeUgc(good, bad);
  demoWrite(p, { ...prod, goodCount: good, badCount: bad, status: v === "promote" ? "promoted" : v === "reject" ? "rejected" : "pending" }, false);
});
