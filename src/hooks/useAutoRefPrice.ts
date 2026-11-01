// 仕入れ値が空なのに、結んでいる共有の材料に参考価格があるものへ、参考価格（税抜）を自動で入れる（無料・AIなし）。
// 共有の材料に参考価格が入ったときはサーバーの onGlobalRefPrice が入れるが、その仕組みができる前に結んだ材料や、
// 取りこぼしはここで拾う。お店の画面を開いたとき、端末ごとに1つの材料につき1回だけ見る
import { useEffect } from "react";
import { refPricePatch } from "@shared/link";
import type { GlobalIngredient, Ingredient } from "@shared/types";
import { getOnce, saveDoc } from "../lib/store";

const checked = new Set<string>();

export function useAutoRefPrice(orgId: string, list: Ingredient[], enabled: boolean) {
  const want = enabled ? list.filter((i) => i.purchasePrice === null && i.globalRef && !checked.has(`${orgId}/${i.id}`)) : [];
  const key = want.map((i) => i.id).join(",");
  useEffect(() => {
    if (!key) return;
    for (const i of want) checked.add(`${orgId}/${i.id}`);
    (async () => {
      const globals = new Map<string, GlobalIngredient | null>();
      for (const i of want) {
        const id = i.globalRef!;
        if (!globals.has(id)) globals.set(id, await getOnce<GlobalIngredient>(`globalIngredients/${id}`).catch(() => null));
        const p = refPricePatch(i, globals.get(id));
        if (Object.keys(p).length) await saveDoc(`organizations/${orgId}/ingredients/${i.id}`, p).catch(() => undefined);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, key]);
}
