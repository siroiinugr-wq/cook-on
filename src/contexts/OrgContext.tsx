// いま開いている店舗・自分の役割・店舗の情報を、どの画面からでも使えるようにする
import { createContext, useContext, type ReactNode } from "react";
import type { Role } from "@shared/types";
import { canEdit, canRunAction, canSeeMoney, canUseAi, isAdmin } from "@shared/roles";
import type { CreditAction } from "@shared/credits";
import { useOrg, type Org } from "../hooks/useOrg";
import { useDoc } from "../hooks/useData";
import { setStaffMode } from "../lib/store";
import { ingredientsPath, recipesPath } from "../lib/paths";

export interface OrgCtx {
  orgId: string;
  uid: string;
  email: string | null;
  role: Role;
  org: Org;
  /** 所属している店舗（切り替え用） */
  orgs: Record<string, Role>;
  select: (orgId: string) => void;
  canEdit: boolean;
  isAdmin: boolean;
  /** 仕入れ値・原価・売価・原価率・仕入れ・包装資材を見られる（オーナー・管理者だけ。shared/roles.ts） */
  seeMoney: boolean;
  /** AIを使える（スタッフは管理者がメンバー一覧でオンにした人だけ） */
  canAi: boolean;
  /** その操作（クレジットを使うAI）をこの人ができるか。お金のAIはオーナー・管理者だけ */
  canRun: (a: CreditAction) => boolean;
  /** レシピ・材料を読む場所（スタッフは値段を抜いた写し。lib/paths.ts） */
  recipesPath: string;
  ingredientsPath: string;
}

const Ctx = createContext<OrgCtx | null>(null);

export function OrgProvider(p: { orgId: string; uid: string; email: string | null; orgs: Record<string, Role>; select: (id: string) => void; children: ReactNode }) {
  const { org } = useOrg(p.orgId);
  const role = p.orgs[p.orgId];
  const me = useDoc<{ ai?: boolean }>(`organizations/${p.orgId}/members/${p.uid}`).data;
  const seeMoney = canSeeMoney(role);
  setStaffMode(!seeMoney);
  const value: OrgCtx = {
    orgId: p.orgId, uid: p.uid, email: p.email, role, org, orgs: p.orgs, select: p.select, canEdit: canEdit(role), isAdmin: isAdmin(role),
    seeMoney, canAi: canUseAi(role, me?.ai), canRun: (a) => canRunAction(a, role, me?.ai),
    recipesPath: recipesPath(p.orgId, seeMoney), ingredientsPath: ingredientsPath(p.orgId, seeMoney),
  };
  return <Ctx.Provider value={value}>{p.children}</Ctx.Provider>;
}

export function useOrgCtx(): OrgCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("OrgProvider の外で useOrgCtx が呼ばれました");
  return v;
}
