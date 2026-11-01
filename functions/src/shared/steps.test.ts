import { describe, expect, it } from "vitest";
import { applyStepPhoto, applyTemplate, recipesWithStep, stepKey, stepsFromTemplate } from "./steps";

const tpl = { id: "t1", steps: ["バターを室温に戻す", "砂糖とすり混ぜる"], photoPaths: ["", "p/mix.jpg"] };

describe("工程をまとめて直す", () => {
  it("句読点や空白の違いは同じ工程とみなす", () => {
    expect(stepKey("バターを、室温に戻す。")).toBe(stepKey("バターを室温に戻す"));
  });

  it("よく使う工程に足した工程と写真が、入れたレシピに反映される", () => {
    const steps = [{ text: "型に紙を敷く" }, ...stepsFromTemplate({ ...tpl, photoPaths: [] }), { text: "焼く" }];
    steps[1].photoPath = "p/own.jpg";
    const next = { ...tpl, steps: [...tpl.steps, "卵を少しずつ加える"], photoPaths: [...tpl.photoPaths, ""] };
    const r = applyTemplate(steps, next);
    expect(r.changed).toBe(true);
    expect(r.steps.map((s) => s.text)).toEqual(["型に紙を敷く", "バターを室温に戻す", "砂糖とすり混ぜる", "卵を少しずつ加える", "焼く"]);
    // 自分で付けた写真は残り、よく使う工程の写真が入る
    expect(r.steps[1].photoPath).toBe("p/own.jpg");
    expect(r.steps[2].photoPath).toBe("p/mix.jpg");
  });

  it("変わっていなければ changed は false", () => {
    const steps = stepsFromTemplate(tpl);
    expect(applyTemplate(steps, tpl).changed).toBe(false);
  });

  it("同じよく使う工程を2回入れても、それぞれ置き換える", () => {
    const steps = [...stepsFromTemplate(tpl), ...stepsFromTemplate(tpl)];
    const r = applyTemplate(steps, { ...tpl, steps: ["A"], photoPaths: [""] });
    expect(r.steps.map((s) => s.text)).toEqual(["A", "A"]);
  });

  it("同じ文の工程に写真を付ける", () => {
    const r = applyStepPhoto([{ text: "粗熱をとる。" }, { text: "焼く" }], "粗熱をとる", "p/x.jpg");
    expect(r.steps[0].photoPath).toBe("p/x.jpg");
    expect(r.steps[1].photoPath).toBeUndefined();
    const list = [{ id: "a", name: "A", steps: [{ text: "粗熱をとる", photoPath: "p/x.jpg" }] }, { id: "b", name: "B", steps: [{ text: "粗熱を とる" }] }];
    expect(recipesWithStep(list, "粗熱をとる", "p/x.jpg").map((x) => x.id)).toEqual(["b"]);
  });
});
