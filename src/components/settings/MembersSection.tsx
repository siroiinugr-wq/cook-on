// 設定画面の「メンバー」欄：いまのメンバーと、招待リンクの作成・コピー・取り消し（管理者だけ）
import { useEffect, useState } from "react";
import { INVITE_EXPIRE_DAYS, INVITE_ROLES, ROLE_HELP, ROLE_LABEL, type InviteRole } from "@shared/roles";
import { createInvite, inviteUrl, revokeInvite, subscribeInvites, subscribeMembers, type Member, type PendingInvite } from "../../lib/invite";
import { errorText } from "../../lib/store";
import type { Role } from "@shared/types";
import { useConfirm } from "../common/ConfirmDialog";
import { Icon } from "../common/Icon";

export function MembersSection({ orgId, canManage }: { orgId: string; canManage: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [role, setRole] = useState<InviteRole>("editor");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const confirm = useConfirm();

  useEffect(() => subscribeMembers(orgId, setMembers), [orgId]);
  useEffect(() => (canManage ? subscribeInvites(orgId, setInvites) : undefined), [orgId, canManage]);

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(orgId, token));
      setMsg({ ok: true, text: "招待リンクをコピーしました。LINEやメールで相手に送ってください。" });
    } catch {
      setMsg({ ok: false, text: `コピーできませんでした。このリンクを送ってください：${inviteUrl(orgId, token)}` });
    }
  };

  const make = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { token } = await createInvite(orgId, role, label);
      setLabel("");
      await copy(token);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (i: PendingInvite) => {
    if (!(await confirm({ title: "この招待を取り消しますか？", body: "送ったリンクは使えなくなります。", ok: "取り消す" }))) return;
    try {
      await revokeInvite(orgId, i.token);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted"><Icon name="users" className="h-4 w-4 text-clay" />メンバー</div>
        <ul className="mt-2 divide-y divide-line">
          {members.map((m) => (
            <li key={m.uid} className="flex items-center justify-between gap-3 py-2">
              <span className="truncate">{m.displayName || m.email || m.uid}</span>
              <span className="shrink-0 rounded-full bg-sand px-2 py-0.5 text-xs text-ink-soft">{ROLE_LABEL[m.role as Role] ?? m.role}</span>
            </li>
          ))}
        </ul>
      </div>

      {canManage && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          <div className="text-sm font-medium">招待リンクを作る</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {INVITE_ROLES.map((r) => (
              <button key={r} onClick={() => setRole(r)}
                className={`rounded-xl border p-2 text-left ${role === r ? "border-clay bg-clay-soft" : "border-line bg-paper"}`}>
                <div className="text-sm font-medium">{ROLE_LABEL[r]}</div>
                <div className="text-xs text-muted">{ROLE_HELP[r]}</div>
              </button>
            ))}
          </div>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="メモ（だれに送るか。例：山田さん）"
            className="w-full rounded-xl border border-line-strong bg-paper px-3 py-2 text-sm" />
          <button onClick={make} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-clay py-3 font-bold text-white disabled:bg-line-strong">
            <Icon name="link" className="h-4 w-4" />{busy ? "作っています…" : "リンクを作ってコピー"}
          </button>
          <p className="text-xs text-faint">リンクは{INVITE_EXPIRE_DAYS}日間、1人だけ使えます。</p>
          {msg && <p className={`break-all text-sm ${msg.ok ? "text-ok" : "text-ng"}`}>{msg.text}</p>}

          {invites.length > 0 && (
            <div>
              <div className="text-xs text-muted">まだ使われていない招待（{invites.length}件）</div>
              <ul className="mt-1 divide-y divide-line">
                {invites.map((i) => (
                  <li key={i.token} className="flex items-center gap-2 py-2 text-sm">
                    <span className="flex-1 truncate">{ROLE_LABEL[i.role as Role] ?? i.role}{i.label ? `・${i.label}` : ""}
                      <span className="ml-1 text-xs text-faint">{new Date(i.expiresAt).toLocaleDateString("ja-JP")}まで</span></span>
                    <button onClick={() => copy(i.token)} className="text-clay-strong underline">コピー</button>
                    <button onClick={() => revoke(i)} className="text-muted underline">取り消す</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
