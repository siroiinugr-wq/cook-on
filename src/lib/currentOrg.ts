// いま開いている店舗を覚えておく（1人が複数の店舗に入れるため。次に開いたときも同じ店舗から）
const KEY = "cookon-currentOrg";

export function loadCurrentOrg(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveCurrentOrg(orgId: string) {
  try {
    localStorage.setItem(KEY, orgId);
  } catch {
    // 覚えられなくても、今回の切り替えはできる
  }
}
