// 役割の呼び方をお店ごとに変える（例：「編集＋原価」→「店長」、「編集のみ（原価なし）」→「製造」）。
// 役職名は会社ごとに違うので、標準はできることで呼び、お店が自分の呼び方を付けられるようにする（MASA 2026-11-15）。
// 変わるのは表示だけで、できることは役割で決まる（shared/roles.ts）
import { useState } from "react";
import { RENAMABLE_ROLES, ROLE_HELP, ROLE_LABEL, ROLE_NAME_MAX, type RoleNames } from "@shared/roles";
import { useOrgCtx } from "../../contexts/OrgContext";
import { errorText, saveDoc } from "../../lib/store";
import { Accordion } from "../common/Accordion";
import { ui } from "../common/ui";

export function RoleNamesEditor({ orgId }: { orgId: string }) {
  const { org } = useOrgCtx();
  const [names, setNames] = useState<RoleNames>(org.settings.roleNames);
  const [msg, setMsg] = useState("");
  const set = (r: keyof RoleNames, v: string) => setNames((cur) => ({ ...cur, [r]: v.slice(0, ROLE_NAME_MAX) }));
  const save = async () => {
    setMsg("");
    const clean = Object.fromEntries(Object.entries(names).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v)) as RoleNames;
    try {
      await saveDoc(`organizations/${orgId}`, { settings: { ...org.settings, roleNames: clean } });
      setMsg("保存しました。");
    } catch (e) {
      setMsg(errorText(e));
    }
  };
  const custom = Object.values(org.settings.roleNames).filter(Boolean).length;
  return (
    <Accordion title="役割の呼び方" summary={custom ? `${custom}つをお店の呼び方にしています` : "「店長」「製造」など、お店の呼び方に変えられます"}>
      <div className="space-y-2">
        <p className="text-xs text-muted">変わるのは表示の名前だけです。できることは役割で決まっています。空にすると標準の名前に戻ります。</p>
        {RENAMABLE_ROLES.map((r) => (
          <label key={r} className="block space-y-1">
            <span className={ui.label}>{ROLE_LABEL[r]}<span className="ml-1 font-normal text-faint">{ROLE_HELP[r]}</span></span>
            <input className={ui.input} value={names[r] ?? ""} maxLength={ROLE_NAME_MAX} placeholder={ROLE_LABEL[r]} onChange={(e) => set(r, e.target.value)} />
          </label>
        ))}
        <button onClick={save} className={`w-full ${ui.secondary}`}>呼び方を保存する</button>
        {msg && <p className="text-xs text-ink-soft">{msg}</p>}
      </div>
    </Accordion>
  );
}
