// 材料の中の切り替え：材料｜包装資材｜既製品。どれも「原価に入るもの」なので、下の入口「材料」の中にまとめる
import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/ingredients", label: "材料" },
  { to: "/packaging", label: "包装資材" },
  { to: "/products", label: "既製品" },
];

export function MaterialTabs() {
  return (
    <nav className="no-print -mt-1 mb-3 flex gap-1 rounded-xl bg-sand p-1 text-sm">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end
          className={({ isActive }) => `flex-1 rounded-lg py-1.5 text-center ${isActive ? "bg-paper font-bold text-clay-strong shadow-sm" : "text-muted"}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
