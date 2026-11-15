// レシピの画面の「このレシピから次にやること」。レシピをアプリの起点にして、
// 材料の登録・仕入れ値・自家製の材料のレシピ・アレルゲン・包装・売価・ラベルへ、ここから枝分かれしてとべるようにする（MASA 2026-11-15）
import { Link } from "react-router-dom";
import type { Ingredient, Recipe } from "@shared/types";
import { HOMEMADE_CATEGORY, HOMEMADE_HINT } from "@shared/madeFrom";
import { ui } from "../common/ui";

interface Step {
  key: string;
  text: string;
  to?: string;
  chips?: { id: string; name: string; to: string; extra?: { label: string; to: string } }[];
}

/** money＝値段の見える役割か。見えない役割には仕入れ値・包装・売価の項目を出さない（そもそも値段が届かない） */
export function recipeNextSteps(recipe: Recipe, byId: Map<string, Ingredient>, money = true): Step[] {
  const me = `/recipes/${recipe.id}`;
  const edit = `${me}/edit`;
  const openIng = (id: string) => `/ingredients?open=${id}&from=${encodeURIComponent(me)}`;
  const items = recipe.items.filter((it) => it.unit !== "適量" || it.ingredientId);
  const linked = [...new Map(items.flatMap((it) => {
    const i = it.ingredientId ? byId.get(it.ingredientId) : undefined;
    return i ? [[i.id, i] as const] : [];
  })).values()];
  const steps: Step[] = [];
  // 自家製の材料のレシピ（ほかのレシピの材料になる）は、包装・売価を聞かない
  const homemade = recipe.category === HOMEMADE_CATEGORY || [...byId.values()].some((i) => i.madeFrom === recipe.id);

  const unlinked = items.filter((it) => !it.ingredientId && it.name.trim());
  if (unlinked.length) steps.push({ key: "link", text: `材料の一覧に結んでいない材料が${unlinked.length}件（${unlinked.slice(0, 3).map((x) => x.name).join("・")}${unlinked.length > 3 ? "…" : ""}）。編集で「材料を選ぶ」から登録できます`, to: edit });

  const noPrice = linked.filter((i) => i.purchasePrice === null && !i.madeFrom);
  if (money && noPrice.length) {
    steps.push({
      key: "price", text: `仕入れ値の無い材料が${noPrice.length}件。買う材料は値段を、お店で作る材料はレシピを入れると原価が出ます`,
      chips: noPrice.map((i) => ({ id: i.id, name: i.name, to: openIng(i.id), // 自家製らしい名前（カスタード・生地など）だけ「レシピを作る」も並べる。ほかは材料を開けば同じボタンがある
      ...(HOMEMADE_HINT.test(i.name) ? { extra: { label: "レシピを作る", to: `/recipes/new?for=${i.id}&from=${encodeURIComponent(me)}` } } : {}) })),
    });
  }

  const unconfirmed = linked.filter((i) => i.allergensConfirmed !== true && !i.madeFrom);
  if (unconfirmed.length) {
    steps.push({ key: "allergen", text: `アレルゲンを確かめていない材料が${unconfirmed.length}件（確かめるまでラベルを印刷できません）`, chips: unconfirmed.map((i) => ({ id: i.id, name: i.name, to: openIng(i.id) })) });
  }

  if (money && !recipe.packaging?.length && !homemade) steps.push({ key: "pack", text: "包装（袋・脱酸素剤など）が付いていません。付けると1個の原価に入ります", to: edit });
  if (money && recipe.sellingPrice === null && !homemade) steps.push({ key: "sell", text: "売価が未定です。入れると原価率が出ます", to: edit });
  if (!recipe.steps.length) steps.push({ key: "steps", text: "作り方がまだありません。作業モードで工程を見ながら作れるようになります", to: edit });
  return steps;
}

export function RecipeNext({ recipe, byId, money }: { recipe: Recipe; byId: Map<string, Ingredient>; money: boolean }) {
  const steps = recipeNextSteps(recipe, byId, money);
  if (!steps.length) return null;
  return (
    <section className={`${ui.card} space-y-2`}>
      <p className="text-sm font-bold">このレシピから次にやること</p>
      <ul className="space-y-2.5">
        {steps.map((s) => (
          <li key={s.key} className="space-y-1 text-sm">
            <p>{s.to ? <Link to={s.to} className="underline decoration-line-strong underline-offset-2">{s.text}</Link> : s.text}</p>
            {s.chips && (
              <div className="flex flex-wrap gap-1.5">
                {s.chips.slice(0, 12).map((c) => (
                  <span key={c.id} className="inline-flex items-center overflow-hidden rounded-full border border-line text-xs">
                    <Link to={c.to} className="px-2 py-0.5 text-clay-strong">{c.name}</Link>
                    {c.extra && <Link to={c.extra.to} className="border-l border-line bg-sand px-2 py-0.5 text-muted">{c.extra.label}</Link>}
                  </span>
                ))}
                {s.chips.length > 12 && <span className="text-xs text-muted">ほか{s.chips.length - 12}件</span>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
