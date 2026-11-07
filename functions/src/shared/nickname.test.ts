import { describe, expect, it } from "vitest";
import { NICKNAME_MAX, cleanNickname, memberLabel, suggestNickname } from "./nickname";

describe("ニックネーム", () => {
  it("前後と続く空白を整える", () => {
    expect(cleanNickname("  ぎん   ちゃん ")).toEqual({ ok: true, name: "ぎん ちゃん" });
  });
  it("空・長すぎ・メールアドレスは弾く", () => {
    expect(cleanNickname("   ").ok).toBe(false);
    expect(cleanNickname("あ".repeat(NICKNAME_MAX + 1)).ok).toBe(false);
    expect(cleanNickname("あ".repeat(NICKNAME_MAX)).ok).toBe(true);
    expect(cleanNickname("taro@example.com").ok).toBe(false);
    expect(cleanNickname("taro＠example").ok).toBe(false);
  });
  it("一覧の名前にメールアドレスは出さない", () => {
    expect(memberLabel({ nickname: "ぎん", displayName: "山田太郎" })).toBe("ぎん");
    expect(memberLabel({ nickname: null, displayName: "山田太郎" })).toBe("山田太郎");
    expect(memberLabel({ displayName: "taro@example.com" })).toBe("名前未設定");
    expect(memberLabel({})).toBe("名前未設定");
  });
  it("初めの案もメールの形なら空", () => {
    expect(suggestNickname("山田太郎")).toBe("山田太郎");
    expect(suggestNickname("taro@example.com")).toBe("");
  });
});
