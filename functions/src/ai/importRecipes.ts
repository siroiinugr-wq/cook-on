// フォーマット不問のデータ取り込み（設計書 ③④）
// parseImport：文字を6,000字ごとに分けて Gemini で読み、名寄せまでして imports/{id} にプレビューを保存する。
//              読めなかった部分のクレジットは返す。保存はしない（人がプレビューで確かめてから）
// commitImport：プレビューで直した内容を、材料マスターとレシピに一括で保存する（recipes/save.ts の決まりで）
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { importMaxChars, splitForImport } from "../shared/credits";
import { CONTINUED_NAME } from "../shared/importSplit";
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
            const r = await callGeminiJson<ImportAnswer>({ system: IMPORT_SYSTEM, prompt: chunk, schema: IMPORT_SCHEMA, maxOutputTokens: 32768 });
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

      const preview = await buildPreview(orgId, answers);
      usage = addUsage(usage, preview.usage);
      const recipes = preview.recipes;
      const used = chunks.length - failed.length;
      await ref.update({ status: "preview", recipes, failedChunks: failed, creditsUsed: used });
      return { result: { importId: ref.id, recipes: recipes.length, failedChunks: failed }, usage, usedUnits: used };
    });
  },
);

/** AIの読み取り結果を名寄せしてプレビューの形にする（名寄せは取り込みの料金に含める）。写真からの取り込みも使う */
export async function buildPreview(orgId: string, answers: (ImportAnswer | null)[]): Promise<{ recipes: ParsedRecipe[]; usage: Usage }> {
  // 塊の切れ目で割れたレシピ（name が「（続き）」）は、前のレシピにつなぐ（shared/importSplit.ts）
  const raw: ImportAnswer["recipes"] = [];
  for (const r of answers.flatMap((a) => a?.recipes ?? [])) {
    const prev = raw[raw.length - 1];
    if (String(r.name ?? "").trim() === CONTINUED_NAME && prev) {
      prev.items = [...(prev.items ?? []), ...(r.items ?? [])];
      prev.steps = [...(prev.steps ?? []), ...(r.steps ?? [])];
      if (r.notes) prev.notes = [prev.notes, r.notes].filter(Boolean).join(" ");
      continue;
    }
    if (r.name || r.items?.length) raw.push({ ...r, name: String(r.name ?? "").trim() === CONTINUED_NAME ? "" : r.name });
  }
  const names = raw.flatMap((r) => (r.items ?? []).map((it) => it.std || it.raw));
  const org = await loadOrgMatchData(orgId);
  const resolved = await resolveNames(org, names, true);

  let k = 0;
  const recipes: ParsedRecipe[] = raw.map((r) => ({
    name: String(r.name ?? "").slice(0, 60) || "名前のないレシピ",
    category: String(r.category ?? "").slice(0, 30),
    subcategory: String(r.subcategory ?? "").slice(0, 30),
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
  return { recipes, usage: resolved.usage };
}

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

/**
 * 取り込みのやり直し用：この取り込みで作ったレシピを、まとめて一覧からしまう（消さない。履歴も残り、一つずつ戻せる）。
 * keepEdited なら、取り込んだあとに手で直したレシピ（第2版以降）はしまわない
 */
export const archiveImport = onCall({ region: REGION, timeoutSeconds: 300 }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.EDIT);
  const importId = idOf(req.data?.importId, "取り込みID");
  const keepEdited = req.data?.keepEdited !== false;
  const d = (await getFirestore().doc(`organizations/${orgId}/imports/${importId}`).get()).data() as ImportDoc | undefined;
  if (!d) throw new HttpsError("not-found", "取り込みが見つかりません。");
  return archiveRecipesOf(orgId, d.savedRecipeIds ?? [], keepEdited);
});

/** レシピをしまう（keepEdited なら第2版以降＝手で直したものは残す） */
async function archiveRecipesOf(orgId: string, ids: string[], keepEdited: boolean): Promise<{ archived: number; kept: number }> {
  const db = getFirestore();
  let archived = 0;
  let kept = 0;
  for (let i = 0; i < ids.length; i += 300) {
    const docs = await db.getAll(...ids.slice(i, i + 300).map((id) => db.doc(`organizations/${orgId}/recipes/${id}`)));
    const batch = db.batch();
    for (const doc of docs) {
      if (!doc.exists || doc.get("archived") === true) continue;
      if (keepEdited && Number(doc.get("version") ?? 1) > 1) { kept++; continue; }
      batch.update(doc.ref, { archived: true, updatedAt: FieldValue.serverTimestamp() });
      archived++;
    }
    await batch.commit();
  }
  return { archived, kept };
}

/** 読み取り中・保存中がこれより古ければ、止まったものとして消せる */
const STUCK_MS = 60 * 60 * 1000;

/**
 * これまでの取り込みを、選んでまとめて消す（重複した取り込みの片付け）。
 * 取り込みの記録を消し、その取り込みで作ったレシピはしまう（消さない。一つずつ戻せる）。keepEdited なら手で直したレシピは残す
 */
export const removeImports = onCall({ region: REGION, timeoutSeconds: 300 }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.EDIT);
  const raw = Array.isArray(req.data?.importIds) ? (req.data.importIds as unknown[]) : [];
  const importIds = [...new Set(raw.map((x) => idOf(x, "取り込みID")))];
  if (!importIds.length || importIds.length > 100) throw new HttpsError("invalid-argument", "消す取り込みを1〜100件選んでください。");
  const keepEdited = req.data?.keepEdited !== false;
  const db = getFirestore();
  const snaps = await db.getAll(...importIds.map((id) => db.doc(`organizations/${orgId}/imports/${id}`)));
  let removed = 0;
  let busy = 0;
  let archived = 0;
  let kept = 0;
  for (const s of snaps) {
    if (!s.exists) continue;
    const d = s.data() as ImportDoc;
    const at = s.updateTime?.toMillis() ?? 0;
    if ((d.status === "parsing" || d.status === "saving") && Date.now() - at < STUCK_MS) { busy++; continue; }
    const r = await archiveRecipesOf(orgId, d.savedRecipeIds ?? [], keepEdited);
    archived += r.archived;
    kept += r.kept;
    await s.ref.delete();
    removed++;
  }
  return { removed, busy, archived, kept };
});
