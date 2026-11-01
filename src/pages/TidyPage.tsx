// データの整理：取り込んだあとの見直しを、上から順に片付ける画面。AIは使わないので無料。
// 共有の材料に結ぶ → 1. アレルゲンの確認 → 2. 仕入れ値 → 3. 何個分 → 4. 名前・レシピでないもの → 5. 同じ材料の行 → 6. 表記ゆれ → 7. ラベルの名前
import { useMemo, useState } from "react";
import { calcCost } from "@shared/cost";
import { duplicateItems, guessPieces, HEAVY_SINGLE_GRAMS, isPlaceholderName, needsPieces, looksNotRecipe, similarIngredientGroups } from "@shared/tidy";
import type { Recipe } from "@shared/types";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol } from "../hooks/useData";
import { useIngredients } from "../hooks/useIngredients";
import { call } from "../lib/store";
import { Accordion } from "../components/common/Accordion";
import { PageHead } from "../components/common/Layout";
import { ui } from "../components/common/ui";
import { AllergenReview } from "../components/tidy/AllergenReview";
import { PriceFill } from "../components/tidy/PriceFill";
import { PiecesFix, NamesFix, DupRows } from "../components/tidy/RecipeFixes";
import { MergeGroups } from "../components/tidy/MergeGroups";
import { LabelNames } from "../components/tidy/LabelNames";

export function TidyPage() {
  const { orgId, canEdit, org } = useOrgCtx();
  const ings = useIngredients(orgId);
  const recipes = useCol<Recipe>(`organizations/${orgId}/recipes`, { where: [["archived", "==", false]] });
  const [linkMsg, setLinkMsg] = useState("");
  const [linking, setLinking] = useState(false);

  const usedIn = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recipes.list) for (const id of r.ingredientIds ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [recipes.list]);
  const byUse = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (usedIn.get(b.id) ?? 0) - (usedIn.get(a.id) ?? 0));

  const unconfirmed = byUse(ings.list.filter((i) => i.allergensConfirmed !== true));
  const noPrice = byUse(ings.list.filter((i) => i.purchasePrice === null));
  const noPieces = recipes.list.flatMap((r) => {
    if ((r.yield?.pieces ?? 1) !== 1) return [];
    const grams = calcCost(r.items, ings.byId).lines.reduce((t, l) => t + (l.grams ?? 0), 0);
    return needsPieces(r, grams) ? [{ r, grams, guess: guessPieces([r.name, r.memo ?? "", ...r.steps.map((s) => s.text)]) }] : [];
  });
  const badNames = recipes.list.filter((r) => isPlaceholderName(r.name) || looksNotRecipe(r));
  const dupRows = recipes.list.map((r) => ({ r, names: duplicateItems(r.items) })).filter((x) => x.names.length);
  const groups = similarIngredientGroups(ings.list).map(byUse);

  if (!canEdit) return <p className="py-10 text-center text-muted">データを整理する権限がありません。</p>;
  if (ings.loading || recipes.loading) return <p className="py-10 text-center text-muted">読み込み中…</p>;

  async function relink() {
    setLinking(true);
    setLinkMsg("");
    try {
      const r = await call<{ linked: number; checked: number; globals: number }>("relinkIngredients", { orgId });
      setLinkMsg(r.globals === 0
        ? "共有の材料がまだ入っていません（運営の準備待ちです）。"
        : `${r.checked}件のうち${r.linked}件を共有の材料に結びました。アレルゲンの候補と参考価格が増えています。`);
    } catch (e) {
      setLinkMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setLinking(false);
    }
  }

  const loose = ings.list.filter((i) => !i.globalRef).length;
  const n = (k: number, unit = "件") => (k ? `${k}${unit}` : "済み");
  return (
    <div className="space-y-3 pb-10">
      <PageHead title="データの整理" back="/settings" />
      <p className="text-sm text-ink-soft">取り込んだレシピと材料を、上から順に見直します。どれも無料で、レシピは前の版が履歴に残ります。</p>

      {loose > 0 && (
        <section className={`${ui.card} space-y-2`}>
          <p className="font-bold">はじめに：材料を共有の材料に結ぶ</p>
          <p className="text-sm text-ink-soft">名前が同じ・とても似ている共有の材料（食品成分表など）に結ぶと、アレルゲンの候補・参考価格・成分が使えるようになります。結びついていない材料：{loose}件</p>
          <button disabled={linking} onClick={relink} className={`w-full ${ui.secondary}`}>{linking ? "結んでいます…" : "名前で結ぶ"}</button>
          {linkMsg && <p className="text-sm text-ink-soft">{linkMsg}</p>}
        </section>
      )}

      <Accordion title={`1. アレルゲンの確認（${n(unconfirmed.length)}）`} summary="名前から推定した候補を見て、確定します。確定するまでラベルは印刷できません" defaultOpen={unconfirmed.length > 0}>
        <AllergenReview orgId={orgId} list={unconfirmed} usedIn={usedIn} />
      </Accordion>
      <Accordion title={`2. 仕入れ値（${n(noPrice.length)}）`} summary="よく使う材料から順に。入れるとすぐ原価が出ます">
        <PriceFill orgId={orgId} list={noPrice} usedIn={usedIn} />
      </Accordion>
      <Accordion title={`3. 何個分のレシピか（${n(noPieces.length)}）`} summary={`材料が${HEAVY_SINGLE_GRAMS}g以上あるのに「1ロット＝1個」のもの`}>
        <PiecesFix orgId={orgId} rows={noPieces} />
      </Accordion>
      <Accordion title={`4. 名前のないレシピ・レシピでないもの（${n(badNames.length)}）`} summary="名前を付けるか、しまう（消えません）">
        <NamesFix orgId={orgId} list={badNames} />
      </Accordion>
      <Accordion title={`5. 同じ材料が何行かに分かれている（${n(dupRows.length)}）`} summary="量を足して1行にまとめます（単位が同じものだけ）">
        <DupRows orgId={orgId} rows={dupRows} />
      </Accordion>
      <Accordion title={`6. 材料の表記ゆれ（${n(groups.length, "組")}）`} summary="きび砂糖／キビ糖のような同じ材料を1つにまとめます">
        <MergeGroups orgId={orgId} groups={groups} usedIn={usedIn} />
      </Accordion>
      <Accordion title={`7. ラベルの名前（${n(ings.list.filter((x) => !x.labelName?.trim()).length)}）`} summary="キビ糖→きび砂糖、薄力粉→小麦粉のように、品質表示に出す名前。AIが案を出し、最後に確かめます">
        <LabelNames orgId={orgId} list={byUse(ings.list)} usedIn={usedIn} credits={org.credits} />
      </Accordion>
    </div>
  );
}
