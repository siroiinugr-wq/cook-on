// データの整理：取り込んだあとの見直しを、上から順に片付ける画面。AIを使うのは「AIで探す」「ラベルの名前」だけ（クレジット）。
// 共有の材料に結ぶ → お店で作る材料をレシピに結ぶ → 1. アレルゲンの確認 → 2. 仕入れ値 → 3. 何個分 → 4. 名前・レシピでないもの → 5. 同じ材料の行 → 6. 表記ゆれ → 7. ラベルの名前
import { useMemo } from "react";
import { calcCost } from "@shared/cost";
import { duplicateItems, guessPieces, HEAVY_SINGLE_GRAMS, isPlaceholderName, needsPieces, looksNotRecipe, similarIngredientGroups } from "@shared/tidy";
import type { Recipe } from "@shared/types";
import { categorySuspect } from "@shared/allergenGuess";
import { HOMEMADE_HINT, madeFromCandidates, usesIngredient } from "@shared/madeFrom";
import { HomemadeLinks } from "../components/tidy/HomemadeLinks";
import { GramsFix } from "../components/tidy/GramsFix";
import { PlainNames } from "../components/tidy/PlainNames";
import { looksMextName } from "@shared/mext";
import { Link } from "react-router-dom";
import { unitCostPerGram, yen } from "@shared/cost";
import { isPieceUnit } from "@shared/invoice";
import { useOrgCtx } from "../contexts/OrgContext";
import { useCol } from "../hooks/useData";
import { useIngredients } from "../hooks/useIngredients";
import { Accordion } from "../components/common/Accordion";
import { PageHead } from "../components/common/Layout";
import { AllergenReview } from "../components/tidy/AllergenReview";
import { PriceFill } from "../components/tidy/PriceFill";
import { PiecesFix, NamesFix, DupRows } from "../components/tidy/RecipeFixes";
import { MergeGroups } from "../components/tidy/MergeGroups";
import { LabelNames } from "../components/tidy/LabelNames";
import { LinkCard } from "../components/tidy/LinkCard";
import { useHashScroll } from "../hooks/useHashScroll";

const HIGH_PER_PIECE = 1000;
const LOW_PER_PIECE = 10;

export function TidyPage() {
  const { orgId, canEdit, org } = useOrgCtx();
  const ings = useIngredients(orgId);
  const recipes = useCol<Recipe>(`organizations/${orgId}/recipes`, { where: [["archived", "==", false]] });

  const usedIn = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recipes.list) for (const id of r.ingredientIds ?? []) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [recipes.list]);
  const byUse = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (usedIn.get(b.id) ?? 0) - (usedIn.get(a.id) ?? 0));

  // 自家製の材料（レシピに結んだもの）は、中身の材料から自動で入るので除く。成分表の分類から誤って付いたらしいものは確認済みでも出す
  const unconfirmed = byUse(ings.list.filter((i) => !i.madeFrom && (i.allergensConfirmed !== true || categorySuspect(i))));
  const noPrice = byUse(ings.list.filter((i) => i.purchasePrice === null));
  // 参考価格のままの材料は、空のものの後ろに並べる（お店の仕入れ値に直してもらう）
  const refPriced = byUse(ings.list.filter((i) => i.purchasePrice !== null && i.priceSource === "ref"));
  const noPieces = recipes.list.flatMap((r) => {
    if ((r.yield?.pieces ?? 1) !== 1) return [];
    const grams = calcCost(r.items, ings.byId).lines.reduce((t, l) => t + (l.grams ?? 0), 0);
    // 材料が重い、または「1個」の原価が1,000円を超える（何個分が入っていないことが多い）
    const heavy = needsPieces(r, grams) || (r.costCache?.perPiece ?? 0) >= HIGH_PER_PIECE;
    return heavy ? [{ r, grams, guess: guessPieces([r.name, r.memo ?? "", ...r.steps.map((s) => s.text)]) }] : [];
  });
  // 1個の原価が極端に安いレシピ（計算に入っていない材料がある・何個分が多すぎる）
  const tinyCost = recipes.list.filter((r) => r.costCache && r.costCache.perPiece > 0 && r.costCache.perPiece < LOW_PER_PIECE);
  // 仕入れ値はあるのに「1個」「1本」で買っていて重さが分からず、gに直せない材料
  const noGrams = byUse(ings.list.filter((i) => !i.madeFrom && i.purchasePrice !== null && unitCostPerGram(i) === null && isPieceUnit(i.purchaseUnit)));
  // お店で作る材料：同じ名前のレシピがあるもの（結ぶだけ）と、名前から自家製らしいもの（レシピを選んでもらう）
  const homemade = useMemo(() => {
    const madeOf = new Map(ings.list.flatMap((i) => (i.madeFrom ? [[i.id, i.madeFrom] as const] : [])));
    const recIngs = new Map(recipes.list.map((r) => [r.id, r.ingredientIds ?? []]));
    const rows: { ing: (typeof ings.list)[number]; recipe: Recipe }[] = [];
    const hinted: typeof ings.list = [];
    for (const ing of ings.list) {
      if (ing.madeFrom) continue;
      const c = madeFromCandidates(ing, recipes.list).find((r) => !usesIngredient(r.id, ing.id, recIngs, madeOf));
      if (c) rows.push({ ing, recipe: c });
      else if (HOMEMADE_HINT.test(ing.name) && !ing.globalRef && (usedIn.get(ing.id) ?? 0) > 0) hinted.push(ing);
    }
    return { rows, hinted };
  }, [ings.list, recipes.list, usedIn]);
  const badNames = recipes.list.filter((r) => isPlaceholderName(r.name) || looksNotRecipe(r));
  const dupRows = recipes.list.map((r) => ({ r, names: duplicateItems(r.items) })).filter((x) => x.names.length);
  const groups = similarIngredientGroups(ings.list).map(byUse);

  useHashScroll(!ings.loading && !recipes.loading);
  if (!canEdit) return <p className="py-10 text-center text-muted">データを整理する権限がありません。</p>;
  if (ings.loading || recipes.loading) return <p className="py-10 text-center text-muted">読み込み中…</p>;

  const loose = ings.list.filter((i) => !i.globalRef).length;
  const n = (k: number, unit = "件") => (k ? `${k}${unit}` : "済み");
  return (
    <div className="space-y-3 pb-10">
      <PageHead title="データの整理" back="/todo" />
      <p className="text-sm text-ink-soft">取り込んだレシピと材料を、上から順に見直します。どれも無料で、レシピは前の版が履歴に残ります。</p>

      <div id="link" className="scroll-mt-20"><LinkCard orgId={orgId} loose={loose} credits={org.credits} /></div>

      <Accordion id="homemade" title={`お店で作る材料をレシピに結ぶ（${n(homemade.rows.length)}）`} summary="タルト生地・クレームダマンドなど。結ぶと値段とアレルゲンがレシピの中身から入ります" defaultOpen={homemade.rows.length > 0}>
        <HomemadeLinks orgId={orgId} rows={homemade.rows} hinted={homemade.hinted} ingById={ings.byId} />
      </Accordion>
      <Accordion id="allergen" title={`1. アレルゲンの確認（${n(unconfirmed.length)}）`} summary="名前から推定した候補を見て、確定します。確定するまでラベルは印刷できません" defaultOpen={unconfirmed.length > 0}>
        <AllergenReview orgId={orgId} list={unconfirmed} usedIn={usedIn} />
      </Accordion>
      <Accordion id="price" title={`2. 仕入れ値（${noPrice.length || refPriced.length ? `空${noPrice.length}件・参考価格${refPriced.length}件` : "済み"}）`} summary="よく使う材料から順に。参考価格は目安なので、お店の仕入れ値が分かったら直します">
        <PriceFill orgId={orgId} list={[...noPrice, ...refPriced]} usedIn={usedIn} />
      </Accordion>
      <Accordion id="grams" title={`2b. gに直せない材料（${n(noGrams.length)}）`} summary="「1個」「1本」「1袋」で買っていて重さが分からず、原価に入らない材料。1つの重さを入れます">
        <GramsFix orgId={orgId} list={noGrams} usedIn={usedIn} />
      </Accordion>
      <Accordion id="pieces" title={`3. 何個分のレシピか（${n(noPieces.length)}）`} summary={`材料が${HEAVY_SINGLE_GRAMS}g以上、または1個の原価が${HIGH_PER_PIECE.toLocaleString("ja-JP")}円以上なのに「1ロット＝1個」のもの`}>
        <PiecesFix orgId={orgId} rows={noPieces} />
      </Accordion>
      <Accordion id="cheap" title={`3b. 1個の原価が${LOW_PER_PIECE}円未満のレシピ（${n(tinyCost.length)}）`} summary="計算に入っていない材料があるか、何個分が多すぎるかもしれません。開いて確かめます">
        {tinyCost.length ? (
          <ul className="divide-y divide-line text-sm">
            {tinyCost.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2 py-2">
                <Link to={`/recipes/${r.id}`} className="min-w-0 flex-1 truncate text-clay-strong underline">{r.name}</Link>
                <span className="shrink-0 text-xs text-muted">1個 {yen(r.costCache!.perPiece)}・{r.yield?.pieces ?? 1}個分{r.costCache!.missing ? `・計算に入らない材料${r.costCache!.missing}行` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">ありません。</p>}
      </Accordion>
      <Accordion id="names" title={`4. 名前のないレシピ・レシピでないもの（${n(badNames.length)}）`} summary="名前を付けるか、しまう（消えません）">
        <NamesFix orgId={orgId} list={badNames} />
      </Accordion>
      <Accordion id="dups" title={`5. 同じ材料が何行かに分かれている（${n(dupRows.length)}）`} summary="量を足して1行にまとめます（単位が同じものだけ）">
        <DupRows orgId={orgId} rows={dupRows} />
      </Accordion>
      <Accordion id="merge" title={`6. 材料の表記ゆれ（${n(groups.length, "組")}）`} summary="きび砂糖／キビ糖のような同じ材料を1つにまとめます">
        <MergeGroups orgId={orgId} groups={groups} usedIn={usedIn} />
      </Accordion>
      <Accordion id="plain" title={`6b. 成分表の名前のままの材料（${n(ings.list.filter((i) => looksMextName(i.name)).length)}）`} summary="「（キャベツ類） キャベツ 結球葉 生」のような名前を、お店の呼び方に直します">
        <PlainNames orgId={orgId} list={ings.list.filter((i) => looksMextName(i.name))} />
      </Accordion>
      <Accordion id="label" title={`7. ラベルの名前（${n(ings.list.filter((x) => !x.labelName?.trim()).length)}）`} summary="キビ糖→きび砂糖、薄力粉→小麦粉のように、品質表示に出す名前。AIが案を出し、最後に確かめます">
        <LabelNames orgId={orgId} list={byUse(ings.list)} usedIn={usedIn} credits={org.credits} />
      </Accordion>
    </div>
  );
}
