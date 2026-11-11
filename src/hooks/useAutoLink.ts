// 共有の材料（食品成分表など）にまだ結んでいない材料を、名前がぴったり同じものだけ自動で結ぶ（無料・AIなし）。
// 結ぶと栄養成分・アレルゲンの目安・参考価格が入る。手で登録した材料も、データの整理を開かなくても結ばれるように（2026-11-12）。
// 同じ顔ぶれでは1回だけ試す（結べなかった材料のために、開くたびに呼ばない）。似た名前・AIで探すのはデータの整理で人が確かめる
import { useEffect } from "react";
import type { Ingredient } from "@shared/types";
import { call } from "../lib/store";

const KEY = "cookon-autolink:";
let running = false;

export function useAutoLink(orgId: string, ings: Ingredient[], on: boolean) {
  const loose = ings.filter((i) => !i.globalRef && !i.madeFrom).map((i) => i.id).sort().join(",");
  useEffect(() => {
    if (!on || !loose || running) return;
    let tried = "";
    try { tried = localStorage.getItem(KEY + orgId) ?? ""; } catch { /* 覚えられない端末では毎回1回試す */ }
    if (tried === loose) return;
    running = true;
    call("relinkIngredients", { orgId, useAi: false })
      .then(() => { try { localStorage.setItem(KEY + orgId, loose); } catch { /* 上と同じ */ } })
      .catch(() => { /* 失敗しても画面は止めない。次に開いたときにもう一度試す */ })
      .finally(() => { running = false; });
  }, [orgId, loose, on]);
}
