// 既製品のパッケージの写真を読む（1枚1クレジット、PRODUCT_PHOTO_MAX 枚まで）。
// 画面が Storage（ugc/{orgId}/{draftId}/）に上げた写真から、メーカー・商品名・原材料名・アレルゲン・栄養成分を読み、
// 既製品の登録フォームに下書きとして返す。保存はしない（人が見比べて直してから submitUgcProduct で登録する）。
// 1枚目は商品の画像として残し、2枚目以降は読み終わったら消す。
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import { allergenFromName, sortAllergens } from "../shared/allergens";
import { PRODUCT_PHOTO_MAX } from "../shared/credits";
import { NUTRITION_KEYS, toPer100g } from "../shared/ugc";
import { GEMINI_API_KEY, REGION } from "./config";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { requestIdOf, runWithCredits } from "../core/credits";
import { callGeminiJson } from "./gemini";
import { PRODUCT_PHOTO_SCHEMA, PRODUCT_PHOTO_SYSTEM, type ProductPhotoAnswer } from "./prompts";

const MAX_BYTES = 8 * 1024 * 1024;

export const readProductPhoto = onCall({ region: REGION, memory: "512MiB", timeoutSeconds: 120, secrets: [GEMINI_API_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  requireVerified(req.auth);
  const requestId = requestIdOf(req.data?.requestId);
  const draftId = idOf(req.data?.draftId, "写真のまとまり");
  const dir = `ugc/${orgId}/${draftId}/`;
  const paths = (Array.isArray(req.data?.paths) ? req.data.paths : []).map(String);
  if (!paths.length) throw new HttpsError("invalid-argument", "写真がありません。");
  if (paths.length > PRODUCT_PHOTO_MAX) throw new HttpsError("invalid-argument", `1回に読めるのは${PRODUCT_PHOTO_MAX}枚までです。`);
  if (paths.some((p: string) => !p.startsWith(dir) || !/^[A-Za-z0-9_-]+\.jpg$/.test(p.slice(dir.length)))) {
    throw new HttpsError("invalid-argument", "写真の場所が正しくありません。画面を読み込み直してください。");
  }

  return runWithCredits({ orgId, uid, action: "productPhoto", units: paths.length, requestId }, async () => {
    const bucket = getStorage().bucket();
    const images = await Promise.all(paths.map(async (p: string) => {
      const [buf] = await bucket.file(p).download();
      if (buf.length > MAX_BYTES) throw new HttpsError("invalid-argument", "写真が大きすぎます。");
      return { mimeType: "image/jpeg", data: buf.toString("base64") };
    }));
    const { output, usage } = await callGeminiJson<ProductPhotoAnswer>({
      system: PRODUCT_PHOTO_SYSTEM, prompt: `既製品のパッケージの写真${paths.length}枚です。一括表示を書き写してください。`,
      images, schema: PRODUCT_PHOTO_SCHEMA, maxOutputTokens: 2048,
    });
    await Promise.all(paths.slice(1).map((p: string) => bucket.file(p).delete().catch(() => undefined)));

    const raw = (output.nutrition ?? {}) as Record<string, unknown>;
    const grams = typeof output.basisGrams === "number" ? output.basisGrams : null;
    const label = String(output.basisLabel ?? "");
    // 100gあたりなら grams=100 なのでそのまま。「1個あたり」だけで g が分からなければ成分は入れない（人に入れてもらう）
    const per100 = toPer100g(raw, grams ?? (/100\s*g/i.test(label.normalize("NFKC")) ? 100 : null));
    const hasRaw = NUTRITION_KEYS.some((k) => typeof raw[k] === "number");
    const notes = [String(output.note ?? "").slice(0, 200)];
    if (hasRaw && !per100) notes.push(`栄養成分は「${label || "基準が不明"}」の表示で、100gあたりに直せませんでした。`);
    return {
      result: {
        maker: String(output.maker ?? "").trim().slice(0, 40),
        productName: String(output.productName ?? "").trim().slice(0, 60),
        ingredientsText: String(output.ingredients ?? "").trim().slice(0, 1000),
        allergens: sortAllergens((output.allergens ?? []).map(allergenFromName).filter((a): a is NonNullable<typeof a> => !!a)),
        nutrition: per100 ?? {},
        basisLabel: label.slice(0, 40),
        photoPath: paths[0],
        confidence: Math.max(0, Math.min(1, Number(output.confidence) || 0)),
        note: notes.filter(Boolean).join(" "),
      },
      usage,
    };
  });
});
