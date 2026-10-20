// ログイン中のユーザーと、所属している店舗。クレーム orgs: {orgId: role} から店舗の一覧を作る
import { useEffect, useState } from "react";
import { onIdTokenChanged, type User } from "firebase/auth";
import { auth, isDemo } from "../lib/firebase";

import type { Role } from "@shared/types";
export type { Role };
export interface Session {
  loading: boolean;
  // needsVerify：メールアドレスで登録して、まだ確認メールのリンクを開いていない（Googleの人は常に false）
  user: { uid: string; email: string | null; needsVerify: boolean } | null;
  orgs: Record<string, Role>;
}

const DEMO: Session = { loading: false, user: { uid: "demo-user", email: "demo@example.com", needsVerify: false }, orgs: { demo: "owner" } };

export function useSession(): Session {
  const [s, setS] = useState<Session>(isDemo ? DEMO : { loading: true, user: null, orgs: {} });
  useEffect(() => {
    if (isDemo || !auth) return;
    // onIdTokenChanged：クレームが付け直されて getIdToken(true) したときも呼ばれる
    return onIdTokenChanged(auth, async (u: User | null) => {
      if (!u) return setS({ loading: false, user: null, orgs: {} });
      const t = await u.getIdTokenResult();
      const needsVerify = !u.emailVerified && u.providerData.some((p) => p.providerId === "password");
      setS({ loading: false, user: { uid: u.uid, email: u.email, needsVerify }, orgs: (t.claims.orgs as Record<string, Role>) ?? {} });
    });
  }, []);
  return s;
}
