// 手入力の材料名の名寄せ（設計書 ④）
// suggestIngredients：無料。一致と候補だけ（入力欄のサジェスト）
// aiMatchIngredients：1クレジットで20件まで。候補から AI が選ぶ。確かなものは店舗の別名として覚える
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { aiMatchCredits, AI_MATCH_BATCH } from "../shared/credits";
import { GEMINI_API_KEY, REGION } from "./config";
import { idOf, requireRole, requireVerified, ROLES } from "../core/auth";
import { requestIdOf, runWithCredits } from "../core/credits";
import { loadOrgMatchData, rememberAliases, resolveNames } from "./resolve";

function namesOf(v: unknown): string[] {
  const list = (Array.isArray(v) ? v : []).map((x) => String(x ?? "").trim().slice(0, 60)).filter(Boolean);
  if (!list.length) throw new HttpsError("invalid-argument", "材料名を入れてください。");
  if (list.length > AI_MATCH_BATCH) throw new HttpsError("invalid-argument", `一度に調べられるのは${AI_MATCH_BATCH}件までです。`);
  return list;
}

export const suggestIngredients = onCall({ region: REGION, memory: "512MiB" }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  requireRole(req.auth, orgId, ROLES.ANY);
  const names = namesOf(req.data?.names);
  const org = await loadOrgMatchData(orgId);
  const { matches } = await resolveNames(org, names, false);
  return { matches };
});

export const aiMatchIngredients = onCall({ region: REGION, memory: "512MiB", secrets: [GEMINI_API_KEY] }, async (req) => {
  const orgId = idOf(req.data?.orgId, "店舗ID");
  const uid = requireRole(req.auth, orgId, ROLES.EDIT);
  requireVerified(req.auth);
  const names = namesOf(req.data?.names);
  const requestId = requestIdOf(req.data?.requestId);

  return runWithCredits({ orgId, uid, action: "aiMatch", units: aiMatchCredits(names.length), requestId }, async () => {
    const org = await loadOrgMatchData(orgId);
    const { matches, usage } = await resolveNames(org, names, true);
    await rememberAliases(orgId, matches.flatMap((m, i) =>
      m.via === "ai" && m.confidence >= 0.85 && m.kind === "global" && m.id ? [{ name: names[i], globalId: m.id }] : []));
    return { result: { matches }, usage };
  });
});
