// 再エクスポートだけ（機能ごとにファイルを分ける）
import { initializeApp } from "firebase-admin/app";
initializeApp();

export { syncMemberClaims, createOrganization } from "./core/auth";
export { createInvite, revokeInvite, peekInvite, acceptInvite } from "./core/invite";
export { suggestIngredients, aiMatchIngredients } from "./ai/normalize";
export { parseImport, commitImport } from "./ai/importRecipes";
export { parseImportPhotos } from "./ai/importPhotos";
export { guessProduct, aiSuggest } from "./ai/assist";
export { readProductPhoto } from "./ai/productPhoto";
export { saveRecipe, restoreRecipeVersion, archiveRecipe } from "./recipes/save";
export { onIngredientWritten } from "./recipes/costAlert";
export { submitUgcProduct, onUgcVoteWritten } from "./ugc/products";
export { createCheckout, grantCredits } from "./billing/credits";
