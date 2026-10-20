// フォーマット不問のデータ取り込み（設計書 ③④）
// parseImport：文字を6,000字ごとに分けて Gemini で読み、名寄せまでして imports/{id} にプレビューを保存する。
//              読めなかった部分のクレジットは返す。保存はしない（人がプレビューで確かめてから）
// commitImport：プレビューで直した内容を、材料マスターとレシピに一括で保存する（recipes/save.ts の決まりで）
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { importMaxChars, splitForImport } from "../shared/credits";
import type { ImportDoc, ParsedRecipe } from "../shared/importTypes";
import { isUnit, parseUnit, type Unit } from "../shared/units";
import { GEMINI_API_KEY, REGION } from "./config";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { requestIdOf, runWithCredits } from "../core/credits";
import { addUsage, callGeminiJson, type Usage } from "./gemini";
import { IMPORT_SCHEMA, IMPORT_SYSTEM, type ImportAnswer } from "./prompts";
import { loadOrgMatchData, resolveNames } from "./resolve";
import { saveImportedRecipes } from "../recipes/importSave";

/** 同時に読む数（多いと Gemini の1分あたりの上限に当たる） */
const PARALLEL = 3;

export const parseImport = onCall(
  { region: REGION, memory: "1GiB", timeoutSeconds: 1800, secrets: [GEMINI_API_KEY] },
  async (req) => {
    const orgId = idOf(req.data?.orgId, "店舗ID");
    const uid = requireRole(req.auth, orgId, ROLES.EDIT);
    requireVerified(req.auth);
    const requestId = requestIdOf(req.data?.requestId);
    const text = String(req.data?.text ?? "");
    const fileName = String(req.data?.fileName ?? "").slice(0, 120);
    const db = getFirestore();
    const unlimited = (await db.doc(`organizations/${orgId}`).get()).data()?.unlimited === true;
    const max = importMaxChars(unlimited);
    if (text.length > max) {
      throw new HttpsError("invalid-argument", `1回に取り込めるのは${max.toLocaleString()}字までです。ファイルを分けてください。`);
    }
    const chunks = splitForImport(text);
    if (!chunks.length) throw new HttpsError("invalid-argument", "ファイルに文字が見つかりませんでした。");

    const ref = db.collection(`organizations/${orgId}/imports`).doc();
    return runWithCredits({ orgId, uid, action: "importChunk", units: chunks.length, requestId }, async () => {
      const base: ImportDoc = {
        status: "parsing", fileName, chars: text.length, chunks: chunks.length, failedChunks: [], creditsUsed: 0, recipes: [], createdBy: uid,
      };
      await ref.set({ ...base, createdAt: FieldValue.serverTimestamp() });

      // ── 読み取り（一部が失敗しても、読めた分は使う）──
      let usage: Usage = { in: 0, out: 0 };
      const answers: (ImportAnswer | null)[] = new Array(chunks.length).fill(null);
      for (let i = 0; i < chunks.length; i += PARALLEL) {
        await Promise.all(chunks.slice(i, i + PARALLEL).map(async (chunk, j) => {
          try {
            const r = await callGeminiJson<ImportAnswer>({ system: IMPORT_SYSTEM, prompt: chunk, schema: IMPORT_SCHEMA, maxOutputTokens: 8192 });
            answers[i + j] = r.output;
            usage = addUsage(usage, r.usage);
          } catch (e) {
            console.warn("取り込みの一部を読めませんでした", orgId, i + j, String((e as Error)?.message ?? e));
          }
        }));
      }
      const failed = answers.flatMap((a, i) => (a ? [] : [i]));
      if (failed.length === chunks.length) {
        await ref.update({ status: "failed", error: "ファイルを読み取れませんでした。" });
        throw new HttpsError("internal", "ファイルを読み取れませんでした。クレジットは使われていません。");
      }

      // ── 名寄せ（取り込みの料金に含める）──
      const raw = answers.flatMap((a) => a?.recipes ?? []).filter((r) => r.name || r.items?.length);
      const names = raw.flatMap((r) => (r.items ?? []).map((it) => it.std || it.raw));
      const org = await loadOrgMatchData(orgId);
      const resolved = await resolveNames(org, names, true);
      usage = addUsage(usage, resolved.usage);

      let k = 0;
      const recipes: ParsedRecipe[] = raw.map((r) => ({
        name: String(r.name ?? "").slice(0, 60) || "名前のないレシピ",
        category: String(r.category ?? "").slice(0, 30),
        pieces: typeof r.yield === "number" && r.yield > 0 ? r.yield : null,
        items: (r.items ?? []).map((it) => ({
          raw: String(it.raw ?? "").slice(0, 60),
          std: String(it.std ?? it.raw ?? "").slice(0, 60),
          qty: typeof it.qty === "number" && it.qty >= 0 ? it.qty : null,
          unit: toUnit(it.unit),
          match: resolved.matches[k++],
        })),
        steps: (r.steps ?? []).map((s) => String(s).slice(0, 400)).filter(Boolean).slice(0, 40),
        notes: String(r.notes ?? "").slice(0, 300),
      }));
      const used = chunks.length - failed.length;
      await ref.update({ status: "preview", recipes, failedChunks: failed, creditsUsed: used });
      return { result: { importId: ref.id, recipes: recipes.length, failedChunks: failed }, usage, usedUnits: used };
    });
  },
);

function toUnit(u: unknown): Unit {
  const s = String(u ?? "");
  return isUnit(s) ? s : parseUnit(s) ?? "g";
}

// 無制限の店舗は数百件をまとめて保存することがあるので、時間とメモリに余裕を持たせる
export const commitImport = onCall({ region: REGION, memory: "1GiB", timeoutSeconds: 540 }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  const importId = idOf(req.data?.importId, "取り込みID");
  const db = getFirestore();
  const ref = db.doc(`organizations/${orgId}/imports/${importId}`);

  // 二重に押されても1回だけ保存する
  const ok = await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() as ImportDoc | undefined;
    if (!d) throw new HttpsError("not-found", "取り込みが見つかりません。");
    if (d.status === "saved") return false;
    if (d.status !== "preview") throw new HttpsError("failed-precondition", "この取り込みは保存できる状態ではありません。");
    tx.update(ref, { status: "saving" });
    return true;
  });
  if (!ok) return { saved: 0, already: true };

  try {
    const edited = Array.isArray(req.data?.recipes) ? (req.data.recipes as ParsedRecipe[]) : [];
    const ids = await saveImportedRecipes(orgId, uid, edited.filter((r) => !r.skip));
    await ref.update({ status: "saved", savedRecipeIds: ids, recipes: edited });
    return { saved: ids.length };
  } catch (e) {
    // 原因をログに残す（画面には決まった文しか出さないため）
    console.error("取り込みを保存できませんでした", orgId, importId, e);
    await ref.update({ status: "preview" }).catch(() => undefined);
    throw e instanceof HttpsError ? e : new HttpsError("internal", "保存できませんでした。もう一度お試しください。");
  }
});
