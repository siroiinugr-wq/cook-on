// ホワイトラベル：店舗ごとのロゴ・テーマ色・表示名（設計書 ①）
// - ログイン後：いま開いている店舗の organizations/{orgId}/public/branding
// - ログイン前：開いているドメインを tenantDomains/{ドメイン} で引き、その店舗のブランドでログイン画面を出す
// テーマ色は CSS の --color-clay だけを差し替える（濃い色・薄い色は index.css の color-mix が作る）
import { useEffect, useState } from "react";
import { DEFAULT_BRANDING, type Branding } from "@shared/types";
import { listenDoc } from "../lib/store";

const KEY = "cookon-brand";

export function applyBrand(b: Branding) {
  const root = document.documentElement;
  if (b.primaryColor && b.primaryColor.toLowerCase() !== DEFAULT_BRANDING.primaryColor) {
    root.style.setProperty("--color-clay", b.primaryColor);
    root.dataset.brand = "1";
  } else {
    root.style.removeProperty("--color-clay");
    delete root.dataset.brand;
  }
  document.title = b.appName || DEFAULT_BRANDING.appName;
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    // 覚えられなくても、今回は当たる
  }
}

export function applySavedBrand() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) applyBrand({ ...DEFAULT_BRANDING, ...(JSON.parse(raw) as Partial<Branding>) });
  } catch {
    // 無ければ既定の色のまま
  }
}

/** orgId が無い（ログイン前）ときは、ドメインから店舗を探す */
export function useBranding(orgId: string | null): Branding {
  const [domainOrg, setDomainOrg] = useState<string | null>(null);
  const [brand, setBrand] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    if (orgId) return;
    const host = window.location.hostname;
    if (!host || host === "localhost" || host.endsWith(".web.app") || host.endsWith(".firebaseapp.com")) return;
    return listenDoc<{ orgId: string }>(`tenantDomains/${host}`, (d) => setDomainOrg(d?.orgId ?? null));
  }, [orgId]);

  const target = orgId ?? domainOrg;
  useEffect(() => {
    if (!target) return;
    return listenDoc<Partial<Branding>>(`organizations/${target}/public/branding`, (d) => {
      const b = { ...DEFAULT_BRANDING, ...(d ?? {}) };
      setBrand(b);
      applyBrand(b);
    });
  }, [target]);

  return brand;
}
