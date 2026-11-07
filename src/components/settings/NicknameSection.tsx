// 設定の「ニックネーム」：メンバーの一覧などに出る自分の名前（MASAのウェブアプリ共通の決まり 2026-11-07。メールアドレスはほかの人に見せない）
import { useOrgCtx } from "../../contexts/OrgContext";
import { useMyNickname } from "../../lib/profile";
import { NicknameForm } from "../common/Nickname";

export function NicknameSection() {
  const { orgId, uid } = useOrgCtx();
  const me = useMyNickname(orgId, uid);
  return (
    <section className="space-y-2 rounded-2xl border border-line bg-paper p-4">
      <h2 className="font-bold">ニックネーム</h2>
      <NicknameForm initial={me.nickname} />
    </section>
  );
}
