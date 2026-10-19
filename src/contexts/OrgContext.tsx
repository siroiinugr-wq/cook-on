// いま開いている店舗・自分の役割・店舗の情報を、どの画面からでも使えるようにする
import { createContext, useContext, type ReactNode } from "react";
import type { Role } from "@shared/types";
import { canEdit, isAdmin } from "@shared/roles";
import { useOrg, type Org } from "../hooks/useOrg";

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
}

const Ctx = createContext<OrgCtx | null>(null);

export function OrgProvider(p: { orgId: string; uid: string; email: string | null; orgs: Record<string, Role>; select: (id: string) => void; children: ReactNode }) {
  const { org } = useOrg(p.orgId);
  const role = p.orgs[p.orgId];
  const value: OrgCtx = { orgId: p.orgId, uid: p.uid, email: p.email, role, org, orgs: p.orgs, select: p.select, canEdit: canEdit(role), isAdmin: isAdmin(role) };
  return <Ctx.Provider value={value}>{p.children}</Ctx.Provider>;
}

export function useOrgCtx(): OrgCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("OrgProvider の外で useOrgCtx が呼ばれました");
  return v;
}
