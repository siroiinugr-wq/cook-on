// ニックネーム（MASAのウェブアプリ共通の決まり 2026-11-07）。決め方の判定は @shared/nickname、保存はサーバーの setNickname だけ
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions, isDemo } from "./firebase";
import { cleanNickname, suggestNickname } from "@shared/nickname";

/** 自分のニックネームを決める・変える（全部の所属先の members に同じ名前が入り、メールアドレスは消える） */
export async function saveNickname(raw: string): Promise<string> {
  const r = cleanNickname(raw);
  if (!r.ok) throw new Error(r.error);
  if (isDemo || !functions) return r.name;
  const res = await httpsCallable<{ nickname: string }, { nickname: string }>(functions, "setNickname")({ nickname: r.name });
  return res.data.nickname;
}

/** 以前の members に残っているメールアドレスを消す（管理者が開いたとき、所属先ごとに1回だけ） */
export function hideOldEmailsOnce(orgId: string) {
  if (isDemo || !functions) return;
  const key = `emails-hidden:${orgId}`;
  try {
    if (localStorage.getItem(key)) return;
  } catch {
    // 覚えられない端末では毎回呼ぶ（消すものが無ければ何もしない）
  }
  httpsCallable(functions, "hideMemberEmails")({ orgId })
    .then(() => {
      try {
        localStorage.setItem(key, String(Date.now()));
      } catch {
        // 覚えられなくても次に開いたときにもう一度呼ぶだけ
      }
    })
    .catch(() => undefined);
}

export interface MyNickname {
  loading: boolean;
  /** 決めたニックネーム。まだなら空 */
  nickname: string;
  /** 初めの案（Google の名前など。メールの形なら空） */
  suggest: string;
  /** 読めなかった（ルールの反映前など）。このときは入る前に止めない */
  failed?: boolean;
}

/** 自分の members/{uid} を見て、ニックネームが決まっているかを返す */
export function useMyNickname(orgId: string, uid: string): MyNickname {
  const [s, setS] = useState<MyNickname>({ loading: !isDemo, nickname: isDemo ? "デモ" : "", suggest: "" });
  useEffect(() => {
    if (isDemo || !db) return;
    setS((p) => ({ ...p, loading: true }));
    return onSnapshot(
      doc(db, `organizations/${orgId}/members/${uid}`),
      (snap) => setS({
        loading: false,
        nickname: String(snap.data()?.nickname ?? ""),
        suggest: suggestNickname(snap.data()?.displayName ?? auth?.currentUser?.displayName),
      }),
      // 読めないとき（ルールの反映前など）は止めない
      () => setS({ loading: false, nickname: "", suggest: "", failed: true }),
    );
  }, [orgId, uid]);
  return s;
}
