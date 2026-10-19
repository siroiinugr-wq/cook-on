// 既製品データ（UGC）の登録と評価（設計書 ①）
// submitUgcProduct：店舗が既製品を登録する（同じメーカー・商品名があればそれを返す）
// onUgcVoteWritten：店舗の票（organizations/{orgId}/ugcVotes/{productId}）を数え直し、
//                   基準を満たしたら共有マスター globalIngredients に昇格させる
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { allergenFromName, isAllergenId, sortAllergens } from "../shared/allergens";
import { toMatchKey } from "../shared/matchKey";
import { judgeUgc, voteDelta, type Vote } from "../shared/ugc";
import type { UgcProduct } from "../shared/types";
import { REGION } from "../ai/config";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";

const NUTRITION_KEYS = ["kcal", "protein", "fat", "carbohydrate", "salt"];

export const submitUgcProduct = onCall({ region: REGION }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  requireVerified(req.auth);
  const d = (req.data ?? {}) as Record<string, unknown>;
  const maker = String(d.maker ?? "").trim().slice(0, 40);
  const productName = String(d.productName ?? "").trim().slice(0, 60);
  const ingredientsText = String(d.ingredientsText ?? "").trim().slice(0, 1000);
  if (!maker || !productName || !ingredientsText) {
    throw new HttpsError("invalid-argument", "メーカー名・商品名・原材料名を入れてください。");
  }
  const allergens = sortAllergens((Array.isArray(d.allergens) ? d.allergens : [])
    .map((a) => (isAllergenId(a) ? a : allergenFromName(String(a)))).filter((a): a is NonNullable<typeof a> => !!a));
  const n = (d.nutrition ?? {}) as Record<string, unknown>;
  const nutrition = Object.fromEntries(NUTRITION_KEYS.flatMap((k) => (typeof n[k] === "number" && Number.isFinite(n[k]) ? [[k, n[k] as number]] : [])));

  const db = getFirestore();
  const key = toMatchKey(`${maker}${productName}`);
  const dup = await db.collection("ugcProducts").where("key", "==", key).limit(1).get();
  if (!dup.empty) return { productId: dup.docs[0].id, existed: true };

  const ref = db.collection("ugcProducts").doc();
  await ref.set({
    key, maker, productName, ingredientsText, allergens, nutrition,
    createdByOrg: orgId, createdBy: uid, goodCount: 0, badCount: 0, status: "pending",
    createdAt: FieldValue.serverTimestamp(),
  });
  return { productId: ref.id, existed: false };
});

export const onUgcVoteWritten = onDocumentWritten(
  { document: "organizations/{orgId}/ugcVotes/{productId}", region: REGION },
  async (event) => {
    const { orgId, productId } = event.params;
    const v = (x: unknown): Vote | null => (x === 1 || x === -1 ? x : null);
    const delta = voteDelta(v(event.data?.before.data()?.value), v(event.data?.after.data()?.value));
    if (!delta.good && !delta.bad) return;

    const db = getFirestore();
    const ref = db.doc(`ugcProducts/${productId}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const p = snap.data() as UgcProduct | undefined;
      // 自分の店舗が登録した商品への票は数えない（ルールでは止めず、ここで無視する）
      if (!p || p.createdByOrg === orgId || p.status !== "pending") return;
      const good = Math.max(0, p.goodCount + delta.good);
      const bad = Math.max(0, p.badCount + delta.bad);
      const verdict = judgeUgc(good, bad);
      tx.update(ref, {
        goodCount: good, badCount: bad,
        ...(verdict === "promote" ? { status: "promoted", promotedAt: FieldValue.serverTimestamp() } : {}),
        ...(verdict === "reject" ? { status: "rejected" } : {}),
      });
      if (verdict === "promote") {
        tx.set(db.doc(`globalIngredients/ugc_${productId}`), {
          name: `${p.productName}（${p.maker}）`,
          aliases: [p.productName, `${p.maker}${p.productName}`],
          category: "既製品",
          allergens: p.allergens,
          nutrition: p.nutrition ?? {},
          ingredientsText: p.ingredientsText,
          source: "ugc",
          maker: p.maker,
          ugcId: productId,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    });
  },
);
