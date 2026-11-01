// 材料の中の切り替え：材料｜包装資材｜既製品。どれも「原価に入るもの」なので、下の入口「材料」の中にまとめる。
// 3つの違いが分かるように、タブに例を添え、下に「いま見ているもの」の説明を1行出す
import { NavLink, useLocation } from "react-router-dom";
import { Icon, type IconName } from "../common/Icon";

const TABS: { to: string; label: string; eg: string; icon: IconName; about: string }[] = [
  { to: "/ingredients", label: "材料", eg: "粉・砂糖・卵", icon: "scale", about: "レシピに使う材料。仕入れ値・アレルゲン・ラベルの名前を持ち、原価と食品表示に使います。" },
  { to: "/packaging", label: "包装資材", eg: "袋・脱酸素剤", icon: "tag", about: "食べ物ではない袋・シールなど。レシピに「1個あたり」で付けると、1個の原価に入ります（ラベルには出ません）。" },
  { to: "/products", label: "既製品", eg: "チョコ・ジャム", icon: "box", about: "メーカーの商品の原材料とアレルゲン。登録すると「材料」にも入り、レシピで使えます。お店どうしで確かめ合えます。" },
];

export function MaterialTabs() {
  const path = useLocation().pathname;
  const here = TABS.find((t) => t.to === path) ?? TABS[0];
  return (
    <div className="no-print -mt-1 mb-3 space-y-1.5">
      <nav className="grid grid-cols-3 gap-1 rounded-xl bg-sand p-1">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end
            className={({ isActive }) => `flex flex-col items-center rounded-lg px-1 py-1.5 ${isActive ? "bg-paper text-clay-strong shadow-sm" : "text-muted"}`}>
            {({ isActive }) => <>
              <span className={`flex items-center gap-1 text-sm ${isActive ? "font-bold" : ""}`}><Icon name={t.icon} className="h-4 w-4" />{t.label}</span>
              <span className="text-[10px] opacity-80">{t.eg}</span>
            </>}
          </NavLink>
        ))}
      </nav>
      <p className="px-1 text-xs text-muted">{here.about}</p>
    </div>
  );
}
