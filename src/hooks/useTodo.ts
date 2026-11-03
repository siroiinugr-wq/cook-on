// 「やること」の一覧。下の入口のバッジと、やることの画面が同じ数を使う（2か所で数え方が食い違わないように）
import { useMemo } from "react";
import { unitCostPerGram } from "@shared/cost";
import { categorySuspect } from "@shared/allergenGuess";
import { isPieceUnit } from "@shared/invoice";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol } from "./useData";
import { useIngredients } from "./useIngredients";
import { useAutoRefPrice } from "./useAutoRefPrice";

export interface Todo { key: string; title: string; sub: string; to: string; count: number; tone: "ng" | "warn" | "info" }

export function useTodo() {
  const { orgId, org, canEdit, isAdmin } = useOrgCtx();
  const alerts = useCol(`organizations/${orgId}/alerts`, { where: [["read", "==", false]] });
  const inbox = useCol(canEdit ? `organizations/${orgId}/purchaseInbox` : null);
  const ings = useIngredients(orgId);
  // 参考価格があるのに空の材料は、ここで自動で入れる（どの画面を開いても動くように、下の入口と同じ所で）
  useAutoRefPrice(orgId, ings.list, canEdit && !ings.loading);

  return useMemo(() => {
    const noPrice = ings.list.filter((i) => !i.madeFrom && i.purchasePrice === null).length;
    // 値段はあるのに「1個」で買っていて重さが分からない（データの整理の「gに直せない材料」と同じ数え方）
    const noGrams = ings.list.filter((i) => !i.madeFrom && i.purchasePrice !== null && unitCostPerGram(i) === null && isPieceUnit(i.purchaseUnit)).length;
    const refPrice = ings.list.filter((i) => i.purchasePrice !== null && i.priceSource === "ref").length;
    // データの整理の「アレルゲンの確認」と同じ数え方（自家製の材料は除く・成分表の分類から誤って付いたものは数える）
    const unconfirmed = ings.list.filter((i) => !i.madeFrom && (i.allergensConfirmed !== true || categorySuspect(i))).length;
    const noAddress = !org.settings.manufacturerAddress?.trim() || !org.settings.manufacturer?.trim();
    const list: Todo[] = [
      { key: "alerts", tone: "ng" as const, count: alerts.list.length, to: "/", title: `値上がりで目標の原価率を超えたレシピ ${alerts.list.length}件`, sub: "レシピの一覧のいちばん上で確かめられます" },
      ...(canEdit ? [
        { key: "inbox", tone: "info", count: inbox.list.length, to: "/ingredients/invoices", title: `AI経理から届いたレシート ${inbox.list.length}枚`, sub: "読み込むと材料の仕入れ値が最新になります" },
        { key: "allergen", tone: "warn", count: unconfirmed, to: "/tidy#allergen", title: `アレルゲンを確かめる材料 ${unconfirmed}件`, sub: "確かめるまで、その材料を使うレシピのラベルは印刷できません" },
        { key: "grams", tone: "warn", count: noGrams, to: "/tidy#grams", title: `重さが分からず原価に入らない材料 ${noGrams}件`, sub: "「1個」「1本」で買った材料の1つの重さを入れます（AIがネットで調べることもできます）" },
        { key: "price", tone: "warn", count: noPrice, to: "/tidy#price", title: `仕入れ値が入っていない材料 ${noPrice}件`, sub: "参考価格を入れる・AIがネットで調べる・レシートから読む" },
      ] as Todo[] : []),
      ...(isAdmin ? [{ key: "address", tone: "warn", count: noAddress ? 1 : 0, to: "/settings#store", title: "ラベルの製造者（名前・住所）が空です", sub: "食品表示に必要です。入れるまでラベルは印刷できません" }] as Todo[] : []),
      ...(canEdit ? [{ key: "ref", tone: "info", count: refPrice, to: "/tidy#price", title: `参考価格のままの材料 ${refPrice}件`, sub: "お店の仕入れ値が分かったら直すと、原価が正確になります" }] as Todo[] : []),
    ].filter((t) => t.count > 0);
    // バッジは「すぐ片付けたいもの」だけ（参考価格のままは数えない）
    const badge = list.filter((t) => t.key !== "ref").length;
    return { list, badge, inbox: inbox.list.length, loading: ings.loading };
  }, [alerts.list.length, inbox.list.length, ings.list, ings.loading, org.settings.manufacturer, org.settings.manufacturerAddress, canEdit, isAdmin]);
}
