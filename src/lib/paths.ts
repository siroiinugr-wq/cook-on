// レシピと材料をどこから読むか。オーナー・管理者は元のデータ、スタッフ・見るだけは値段を抜いた写し
// （shared/staffView.ts。Firestore は一部の項目だけを隠せないため、ルールで元のデータを読めなくしている）
import { STAFF_INGREDIENTS, STAFF_RECIPES } from "@shared/staffView";

export const recipesPath = (orgId: string, seeMoney: boolean) => `organizations/${orgId}/${seeMoney ? "recipes" : STAFF_RECIPES}`;
export const ingredientsPath = (orgId: string, seeMoney: boolean) => `organizations/${orgId}/${seeMoney ? "ingredients" : STAFF_INGREDIENTS}`;
