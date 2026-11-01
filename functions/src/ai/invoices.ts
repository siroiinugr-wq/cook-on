// レシート・納品書の写真から、材料の仕入れ値を読む（1枚1クレジット）。画面は pages/InvoicePhotosPage.tsx。
// 写真は「写真から取り込み」と同じ一時置き場（orgs/{orgId}/imports/{batchId}/）に上げてもらい、読んだら消す。
// お店の材料の一覧も一緒に渡し、AIに同じ材料を選ばせる（候補に無い番号は捨てる）。保存はしない：画面で人が確かめて材料に反映する
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import { AI_MATCH_BATCH, INVOICE_MAX_PHOTOS } from "../shared/credits";
import { INVOICE_UNITS, type InvoiceLine } from "../shared/invoice";
import type { Unit } from "../shared/units";
import { GEMINI_API_KEY, REGION } from "./config";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { requestIdOf, runWithCredits } from "../core/credits";
import { addUsage, callGeminiJson, type Usage } from "./gemini";
import { INVOICE_SCHEMA, INVOICE_SYSTEM, PURCHASE_MATCH_SCHEMA, PURCHASE_MATCH_SYSTEM, type InvoiceAnswer, type PurchaseMatchAnswer } from "./prompts";
import { loadIngredientMap } from "../recipes/save";

const PARALLEL = 3;
const MAX_BYTES = 8 * 1024 * 1024;
/** AIに渡すお店の材料の数の上限（多すぎると答えが遅くなる） */
const MAX_INGREDIENTS = 400;
const TAXES = [0, 0.08, 0.1];

export const readInvoices = onCall({ region: REGION, memory: "1GiB", timeoutSeconds: 540, secrets: [GEMINI_API_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  requireVerified(req.auth);
  const requestId = requestIdOf(req.data?.requestId);
  const batchId = idOf(req.data?.batchId, "写真のまとまり");
  const dir = `orgs/${orgId}/imports/${batchId}/`;
  const paths = (Array.isArray(req.data?.paths) ? req.data.paths : []).map(String);
  if (!paths.length) throw new HttpsError("invalid-argument", "写真がありません。");
  if (paths.length > INVOICE_MAX_PHOTOS) throw new HttpsError("invalid-argument", `1回に読めるのは${INVOICE_MAX_PHOTOS}枚までです。`);
  if (paths.some((p: string) => !p.startsWith(dir) || !/^[A-Za-z0-9_-]+\.jpg$/.test(p.slice(dir.length)))) {
    throw new HttpsError("invalid-argument", "写真の場所が正しくありません。画面を読み込み直してください。");
  }
  const ings = [...(await loadIngredientMap(orgId)).values()].slice(0, MAX_INGREDIENTS);
  const list = ings.map((i, k) => `${k}. ${i.name}${i.aliases?.length ? `（${i.aliases.slice(0, 4).join("・")}）` : ""}`).join("\n");

  return runWithCredits({ orgId, uid, action: "invoicePhoto", units: paths.length, requestId }, async () => {
    const bucket = getStorage().bucket();
    let usage: Usage = { in: 0, out: 0 };
    const lines: InvoiceLine[] = [];
    let ok = 0;
    for (let i = 0; i < paths.length; i += PARALLEL) {
      await Promise.all(paths.slice(i, i + PARALLEL).map(async (p: string, j: number) => {
        const photo = i + j;
        try {
          const [buf] = await bucket.file(p).download();
          if (buf.length > MAX_BYTES) throw new Error("写真が大きすぎます");
          const r = await callGeminiJson<InvoiceAnswer>({
            system: INVOICE_SYSTEM,
            prompt: `お店の材料：\n${list || "（まだありません。ingredient はすべて -1）"}\n\nこの写真の明細を読み取ってください。`,
            images: [{ mimeType: "image/jpeg", data: buf.toString("base64") }], schema: INVOICE_SCHEMA, maxOutputTokens: 8192,
          });
          usage = addUsage(usage, r.usage);
          ok++;
          for (const l of r.output.lines ?? []) {
            const price = Number(l.price);
            if (!String(l.name ?? "").trim() || !(price > 0)) continue;
            const unit = (INVOICE_UNITS.includes(l.unit as Unit) ? l.unit : "個") as Unit;
            const ing = Number.isInteger(l.ingredient) && l.ingredient >= 0 ? ings[l.ingredient] : undefined;
            lines.push({
              photo, raw: String(l.name).trim().slice(0, 80), price: Math.round(price * 100) / 100,
              count: Number(l.count) > 0 ? Number(l.count) : 1, qty: Number(l.qty) > 0 ? Number(l.qty) : 1, unit,
              tax: TAXES.includes(Number(l.tax)) ? Number(l.tax) : 0.08,
              supplier: String(r.output.supplier ?? "").trim().slice(0, 60), date: /^\d{4}-\d{2}-\d{2}$/.test(r.output.date ?? "") ? r.output.date : "",
              ingredientId: ing?.id ?? null, confidence: ing ? Math.max(0, Math.min(1, Number(l.c) || 0)) : 0,
            });
          }
        } catch (e) {
          console.warn("レシートを読めませんでした", orgId, photo, String((e as Error)?.message ?? e));
        }
      }));
    }
    if (!ok) throw new HttpsError("internal", "写真を読み取れませんでした。クレジットは使われていません。");
    await Promise.all(paths.map((p: string) => bucket.file(p).delete().catch(() => undefined)));
    return { result: { lines, read: ok, photos: paths.length }, usage, usedUnits: ok };
  });
});

/** 1回にAIで探せる明細の行数 */
const MATCH_MAX_LINES = 200;

/**
 * 仕入れ明細ファイル（AI経理などが書き出したもの）で、名前では結べなかった行をAIがお店の材料から探す。
 * AI_MATCH_BATCH 行で1クレジット（aiMatch）。包装の量も品名から読む。保存はしない：画面で人が確かめて反映する
 */
export const matchPurchaseLines = onCall({ region: REGION, timeoutSeconds: 300, secrets: [GEMINI_API_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  requireVerified(req.auth);
  const requestId = requestIdOf(req.data?.requestId);
  const names: string[] = (Array.isArray(req.data?.names) ? req.data.names : []).map((x: unknown) => String(x ?? "").trim().slice(0, 80));
  if (!names.length || names.some((n) => !n)) throw new HttpsError("invalid-argument", "探す品名がありません。");
  if (names.length > MATCH_MAX_LINES) throw new HttpsError("invalid-argument", `1回にAIで探せるのは${MATCH_MAX_LINES}行までです。`);
  const ings = [...(await loadIngredientMap(orgId)).values()].slice(0, MAX_INGREDIENTS);
  if (!ings.length) throw new HttpsError("failed-precondition", "お店の材料がまだありません。");
  const list = ings.map((i, k) => `${k}. ${i.name}${i.aliases?.length ? `（${i.aliases.slice(0, 4).join("・")}）` : ""}`).join("\n");
  const batches = Math.ceil(names.length / AI_MATCH_BATCH);

  return runWithCredits({ orgId, uid, action: "aiMatch", units: batches, requestId }, async () => {
    let usage: Usage = { in: 0, out: 0 };
    const out = names.map(() => ({ ingredientId: null as string | null, confidence: 0, qty: 0, unit: "個" as Unit }));
    let ok = 0;
    for (let b = 0; b < batches; b++) {
      const part = names.slice(b * AI_MATCH_BATCH, (b + 1) * AI_MATCH_BATCH);
      try {
        const r = await callGeminiJson<PurchaseMatchAnswer>({
          system: PURCHASE_MATCH_SYSTEM,
          prompt: `お店の材料：\n${list}\n\n仕入れ明細の品名：\n${part.map((n, k) => `${k}. ${n}`).join("\n")}`,
          schema: PURCHASE_MATCH_SCHEMA, maxOutputTokens: 4096,
        });
        usage = addUsage(usage, r.usage);
        ok++;
        for (const l of r.output.lines ?? []) {
          if (!Number.isInteger(l.n) || l.n < 0 || l.n >= part.length) continue;
          const ing = Number.isInteger(l.ingredient) && l.ingredient >= 0 ? ings[l.ingredient] : undefined;
          out[b * AI_MATCH_BATCH + l.n] = {
            ingredientId: ing?.id ?? null, confidence: ing ? Math.max(0, Math.min(1, Number(l.c) || 0)) : 0,
            qty: Number(l.qty) > 0 ? Number(l.qty) : 0, unit: (INVOICE_UNITS.includes(l.unit as Unit) ? l.unit : "個") as Unit,
          };
        }
      } catch (e) {
        console.warn("仕入れ明細の名寄せに失敗", orgId, b, String((e as Error)?.message ?? e));
      }
    }
    if (!ok) throw new HttpsError("internal", "AIで探せませんでした。クレジットは使われていません。");
    return { result: { matches: out }, usage, usedUnits: ok };
  });
});
