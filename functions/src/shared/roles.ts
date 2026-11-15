// 役割の名前とできること（Firestoreルールの isMember / canEdit / isAdmin と同じ区切り）
import type { CreditAction } from "./credits";
import type { Role } from "./types";

// 標準の呼び方は「できること」で付ける（店長・製造などの役職名は会社ごとに違うため。MASA 2026-11-15）。
// お店ごとに呼び方を変えられる（settings.roleNames。roleLabel で読む）
export const ROLE_LABEL: Record<Role, string> = {
  owner: "オーナー",
  admin: "管理者",
  manager: "編集＋原価",
  editor: "編集のみ（原価なし）",
  viewer: "閲覧のみ",
};

/** お店ごとの呼び方（例：manager＝「店長」、editor＝「製造」）。オーナーは変えない */
export type RoleNames = Partial<Record<Exclude<Role, "owner">, string>>;
export const ROLE_NAME_MAX = 12;
export const RENAMABLE_ROLES = ["admin", "manager", "editor", "viewer"] as const;
/** 表示する役割の名前（お店の呼び方があればそれ、無ければ標準） */
export function roleLabel(r: Role | string, names?: RoleNames | null): string {
  const own = r !== "owner" ? names?.[r as Exclude<Role, "owner">]?.trim() : "";
  return own ? own.slice(0, ROLE_NAME_MAX) : ROLE_LABEL[r as Role] ?? r;
}

/** レシピ・材料を作る・直す */
export const canEdit = (r: Role | undefined) => r === "owner" || r === "admin" || r === "manager" || r === "editor";
/** 店舗の設定・ブランド・クレジット購入・メンバー */
export const isAdmin = (r: Role | undefined) => r === "owner" || r === "admin";
/** 仕入れ値・原価・売価・原価率・仕入れ・包装資材・クレジットの記録を見る（経営の情報）。manager（編集＋原価）まで。editor・viewer には見せない */
export const canSeeMoney = (r: Role | undefined) => isAdmin(r) || r === "manager";

/** AIを使える人：オーナー・管理者・manager はいつも。editor は管理者がメンバー一覧でオンにした人（members/{uid}.ai）。見るだけは使えない */
export const canUseAi = (r: Role | undefined, memberAi: boolean | undefined) => canSeeMoney(r) || (r === "editor" && memberAi === true);

/** 経営の情報を使うAI（値段を調べる・比べる・レシートの仕入れ値・原価の相談）。owner・admin・manager だけ。AIを許可した editor でも使えない */
export const MONEY_ACTIONS: readonly CreditAction[] = ["invoicePhoto", "sizeSearch", "priceSearch", "priceCompare", "aiSuggest"];
/** その操作をこの人ができるか（runWithCredits と画面の両方で使う） */
export const canRunAction = (a: CreditAction, r: Role | undefined, memberAi: boolean | undefined) =>
  MONEY_ACTIONS.includes(a) ? canSeeMoney(r) : canUseAi(r, memberAi);

/** 招待で選べる役割（オーナーは店舗を作った人だけ） */
export const INVITE_ROLES = ["admin", "manager", "editor", "viewer"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];
export const ROLE_HELP: Record<InviteRole, string> = {
  admin: "すべてできます（設定・メンバー・クレジットの購入・AI経理との連携も）",
  manager: "レシピ・材料の編集に加えて、原価・仕入れ値・売価を見て直せます。仕入れ・包装資材・データの整理・AIも使えます。設定・メンバー・クレジットの購入はできません",
  editor: "レシピと材料の登録・編集、作業モード、ラベル印刷ができます。仕入れ値・原価・売価は見えません。AIは管理者が1人ずつ許可します",
  viewer: "レシピを見る・作業モードとラベルの印刷だけができます。仕入れ値・原価・売価は見えません",
};
export const INVITE_EXPIRE_DAYS = 7;
