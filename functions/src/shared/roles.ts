// 役割の名前とできること（Firestoreルールの isMember / canEdit / isAdmin と同じ区切り）
import type { Role } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "オーナー",
  admin: "管理者",
  editor: "スタッフ（編集できる）",
  viewer: "見るだけ",
};

/** レシピ・材料を作る・直す。AIを使う */
export const canEdit = (r: Role | undefined) => r === "owner" || r === "admin" || r === "editor";
/** 店舗の設定・ブランド・クレジット購入・メンバー */
export const isAdmin = (r: Role | undefined) => r === "owner" || r === "admin";

/** 招待で選べる役割（オーナーは店舗を作った人だけ） */
export const INVITE_ROLES = ["admin", "editor", "viewer"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];
export const ROLE_HELP: Record<InviteRole, string> = {
  admin: "設定・メンバー・クレジットの購入もできます",
  editor: "レシピと材料を作る・直す、AIを使うことができます",
  viewer: "レシピを見る・作業モードと印刷だけができます",
};
export const INVITE_EXPIRE_DAYS = 7;
