// 写真から取り込み：画面が Storage（orgs/{orgId}/imports/{batchId}/）に上げた写真を、撮った順に Gemini で読む。
// 続きのページを同じレシピにまとめられるよう、PHOTOS_PER_CALL 枚ずつ一緒に見せる。そのあとは文字の取り込みと同じ
// （名寄せ → imports/{id} にプレビュー → 人が確かめて commitImport）。読めなかった写真の分のクレジットは返す。
// 写真は読み終わったら消す（置き場は読み取るまでの一時置き）。
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { importMaxPhotos } from "../shared/credits";
import type { ImportDoc } from "../shared/importTypes";
import { GEMINI_API_KEY, REGION } from "./config";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { requestIdOf, runWithCredits } from "../core/credits";
import { addUsage, callGeminiJson, type Usage } from "./gemini";
import { IMPORT_PHOTO_NOTE, IMPORT_SCHEMA, IMPORT_SYSTEM, type ImportAnswer } from "./prompts";
import { buildPreview } from "./importRecipes";

/** 1回の呼び出しで一緒に見せる枚数（2〜3ページにまたがるレシピをまとめられる数） */
const PHOTOS_PER_CALL = 4;
/** 同時に読む数（多いと Gemini の1分あたりの上限に当たる） */
const PARALLEL = 3;
/** 1枚の大きさの上限（画面で長い辺 2000px に縮めてから上げるので、ふつうは 1MB 前後） */
const MAX_BYTES = 8 * 1024 * 1024;

export const parseImportPhotos = onCall(
  { region: REGION, memory: "1GiB", timeoutSeconds: 1800, secrets: [GEMINI_API_KEY] },
  async (req) => {
    const orgId = idOf(req.data?.orgId, "店舗ID");
    const uid = requireRole(req.auth, orgId, ROLES.EDIT);
    requireVerified(req.auth);
    const requestId = requestIdOf(req.data?.requestId);
    const batchId = idOf(req.data?.batchId, "写真のまとまり");
    const dir = `orgs/${orgId}/imports/${batchId}/`;
    // 自分の店舗のこのまとまりの写真だけ読む（ほかの場所を読ませない）
    const paths = (Array.isArray(req.data?.paths) ? req.data.paths : []).map(String);
    if (!paths.length) throw new HttpsError("invalid-argument", "写真がありません。");
    if (paths.some((p: string) => !p.startsWith(dir) || !/^[A-Za-z0-9_-]+\.jpg$/.test(p.slice(dir.length)))) {
      throw new HttpsError("invalid-argument", "写真の場所が正しくありません。画面を読み込み直してください。");
    }

    const db = getFirestore();
    const unlimited = (await db.doc(`organizations/${orgId}`).get()).data()?.unlimited === true;
    const max = importMaxPhotos(unlimited);
    if (paths.length > max) throw new HttpsError("invalid-argument", `1回に読めるのは${max}枚までです。分けて読み取ってください。`);

    const groups: string[][] = [];
    for (let i = 0; i < paths.length; i += PHOTOS_PER_CALL) groups.push(paths.slice(i, i + PHOTOS_PER_CALL));
    const ref = db.collection(`organizations/${orgId}/imports`).doc();

    return runWithCredits({ orgId, uid, action: "importPhoto", units: paths.length, requestId }, async () => {
      const base: ImportDoc = {
        status: "parsing", fileName: `写真 ${paths.length}枚`, chars: 0, chunks: paths.length, photos: paths.length,
        failedChunks: [], creditsUsed: 0, recipes: [], createdBy: uid,
      };
      await ref.set({ ...base, createdAt: FieldValue.serverTimestamp() });

      const bucket = getStorage().bucket();
      let usage: Usage = { in: 0, out: 0 };
      const answers: (ImportAnswer | null)[] = new Array(groups.length).fill(null);
      for (let i = 0; i < groups.length; i += PARALLEL) {
        await Promise.all(groups.slice(i, i + PARALLEL).map(async (group, j) => {
          const g = i + j;
          try {
            const images = await Promise.all(group.map(async (p) => {
              const [buf] = await bucket.file(p).download();
              if (buf.length > MAX_BYTES) throw new Error(`写真が大きすぎます ${p}`);
              return { mimeType: "image/jpeg", data: buf.toString("base64") };
            }));
            const first = g * PHOTOS_PER_CALL + 1;
            const r = await callGeminiJson<ImportAnswer>({
              system: IMPORT_SYSTEM + IMPORT_PHOTO_NOTE,
              prompt: `${first}〜${first + group.length - 1}枚目の写真です。レシピを読み取ってください。`,
              images, schema: IMPORT_SCHEMA, maxOutputTokens: 8192,
            });
            answers[g] = r.output;
            usage = addUsage(usage, r.usage);
          } catch (e) {
            console.warn("写真の一部を読めませんでした", orgId, g, String((e as Error)?.message ?? e));
          }
        }));
      }
      // 読めなかったまとまりの写真の番号（0始まり）
      const failed = answers.flatMap((a, g) => (a ? [] : groups[g].map((_, k) => g * PHOTOS_PER_CALL + k)));
      if (failed.length === paths.length) {
        await ref.update({ status: "failed", error: "写真を読み取れませんでした。" });
        throw new HttpsError("internal", "写真を読み取れませんでした。クレジットは使われていません。");
      }
      // 1枚でも読めたら写真は消す（全部失敗のときは残して、同じ写真でもう一度押せるようにする）
      await Promise.all(paths.map((p: string) => bucket.file(p).delete().catch(() => undefined)));

      const preview = await buildPreview(orgId, answers);
      usage = addUsage(usage, preview.usage);
      const used = paths.length - failed.length;
      await ref.update({ status: "preview", recipes: preview.recipes, failedChunks: failed, creditsUsed: used });
      return { result: { importId: ref.id, recipes: preview.recipes.length, failedChunks: failed }, usage, usedUnits: used };
    });
  },
);
