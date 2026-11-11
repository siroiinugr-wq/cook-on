// 再エクスポートだけ（機能ごとにファイルを分ける）
import { initializeApp } from "firebase-admin/app";
initializeApp();

export { syncMemberClaims, createOrganization } from "./core/auth";
export { createInvite, revokeInvite, peekInvite, acceptInvite } from "./core/invite";
export { setNickname, hideMemberEmails } from "./core/profile";
export { suggestIngredients, aiMatchIngredients } from "./ai/normalize";
export { parseImport, commitImport, archiveImport, removeImports } from "./ai/importRecipes";
export { parseImportPhotos } from "./ai/importPhotos";
export { guessProduct, aiSuggest } from "./ai/assist";
export { readProductPhoto } from "./ai/productPhoto";
export { suggestLabelNames } from "./ai/labelNames";
export { saveRecipe, restoreRecipeVersion, archiveRecipe } from "./recipes/save";
export { onIngredientWritten } from "./recipes/costAlert";
export { refreshMadeFrom } from "./recipes/madeFrom";
export { tidyRecipes, mergeIngredients, relinkIngredients, confirmLinks } from "./recipes/tidy";
export { syncSteps } from "./recipes/steps";
export { matchPurchaseLines, readInvoices, searchPackSizes } from "./ai/invoices";
export { onIngredientShared, estimateRefPrices, reviewSuggestion } from "./global/suggestions";
export { onGlobalRefPrice, fillPricesFromWeb } from "./global/refPrices";
export { compareWebPrices } from "./ai/compare";
export { onPackagingWritten, onPackagingSetWritten } from "./recipes/packagingAlert";
export { submitUgcProduct, onUgcVoteWritten } from "./ugc/products";
export { createCheckout, grantCredits } from "./billing/credits";
export { stripeWebhook } from "./billing/stripe";
export { createLinkCode, receivePurchaseLines, revokeLinkCode } from "./link/keiri";
