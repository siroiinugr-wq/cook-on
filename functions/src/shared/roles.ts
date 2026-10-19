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
