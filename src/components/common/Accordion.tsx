// 折りたたみ。見出しに中身の1行要約を出し、開かなくても分かるようにする（Luxe Booking の約束）
import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/** id を付けると、アドレスが「#id」のとき開いた状態で始まる（ほかの画面から直接とべる） */
export function Accordion({ title, summary, children, defaultOpen = false, id }: { title: string; summary?: string; children: ReactNode; defaultOpen?: boolean; id?: string }) {
  const [open, setOpen] = useState(defaultOpen || (!!id && typeof window !== "undefined" && window.location.hash === `#${id}`));
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-line bg-paper">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <span className="flex-1">
          <span className="block font-medium">{title}</span>
          {summary && <span className="block text-xs text-muted">{summary}</span>}
        </span>
        <span className={`text-faint transition-transform ${open ? "rotate-90" : ""}`}><Icon name="chevron" className="h-4 w-4" /></span>
      </button>
      {open && <div className="border-t border-line px-4 py-3">{children}</div>}
    </section>
  );
}
