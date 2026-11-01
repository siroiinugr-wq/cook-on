// 作り方の編集。1工程に写真を1枚つけられる（作業モードで大きく出る）
// 写真を付けた工程と同じ文の工程が他のレシピにあれば、そちらにもまとめて付けられる（syncSteps）
import { useMemo, useState } from "react";
import { applyTemplate, recipesWithStep, stepsFromTemplate } from "@shared/steps";
import type { Recipe, RecipeStep, StepTemplate } from "@shared/types";
import { useCol } from "../../../hooks/useData";
import { uploadPhoto } from "../../../lib/photos";
import { call, saveDoc } from "../../../lib/store";
import { Icon } from "../../common/Icon";
import { ui } from "../../common/ui";
import { ApplyRecipesSheet, PickTemplateSheet, SaveTemplateSheet, StepThumb, useStepTemplates } from "./StepTemplates";

export function StepsEditor({ steps, set, photoDir, orgId, uid, recipeId }: {
  steps: RecipeStep[]; set: (s: RecipeStep[]) => void; photoDir: string; orgId: string; uid: string; recipeId: string | null;
}) {
  const [busy, setBusy] = useState(-1);
  const [err, setErr] = useState("");
  const [picking, setPicking] = useState(false);
  // 保存するのは、どの工程か（番号）。保存したらその工程をよく使う工程に結びつける
  const [saving, setSaving] = useState<number[] | null>(null);
  const [sharing, setSharing] = useState<number | null>(null);
  const templates = useStepTemplates(orgId);
  const tplById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const all = useCol<Recipe>(`organizations/${orgId}/recipes`, { where: [["archived", "==", false]] });
  const others = useMemo(() => all.list.filter((r) => r.id !== recipeId), [all.list, recipeId]);

  // 空の工程が1つだけなら、呼び出した工程で置き換える
  const addTemplate = (t: StepTemplate) => set([...steps.filter((s) => s.text.trim() || s.photoPath), ...stepsFromTemplate(t)]);
  const patch = (i: number, p: Partial<RecipeStep>) => set(steps.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: number) => {
    const next = [...steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };
  const linkTo = (idx: number[], templateId: string) =>
    set(steps.map((s, j) => (idx.includes(j) ? { ...s, templateId, templateStep: idx.indexOf(j) } : s)));

  async function addPhoto(i: number, f: File | undefined) {
    if (!f) return;
    setBusy(i);
    setErr("");
    try {
      patch(i, { photoPath: await uploadPhoto(photoDir, f) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "写真を上げられませんでした。");
    } finally {
      setBusy(-1);
    }
  }

  const share = sharing !== null ? steps[sharing] : null;
  const shareTpl = share?.templateId ? tplById.get(share.templateId) : undefined;

  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const tpl = s.templateId ? tplById.get(s.templateId) : undefined;
        const same = s.photoPath && s.text.trim() ? recipesWithStep(others, s.text, s.photoPath).length : 0;
        const tplLacks = !!(tpl && s.photoPath && (tpl.photoPaths?.[s.templateStep ?? -1] ?? "") !== s.photoPath);
        return (
          <div key={i} className="flex gap-2 rounded-xl border border-line bg-paper p-2.5">
            <div className="flex flex-col items-center gap-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-clay-soft text-xs font-bold text-clay-strong">{i + 1}</span>
              {i > 0 && <button className="text-xs text-faint" aria-label="上へ" onClick={() => move(i, -1)}>▲</button>}
              {i < steps.length - 1 && <button className="text-xs text-faint" aria-label="下へ" onClick={() => move(i, 1)}>▼</button>}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {tpl && <p className="text-[11px] text-muted">よく使う工程「{tpl.name}」から</p>}
              <textarea className="w-full rounded-lg border border-line-strong px-2 py-1.5 text-sm" rows={2} value={s.text} onChange={(e) => patch(i, { text: e.target.value })} placeholder="例：バターを室温に戻す" />
              <div className="flex flex-wrap items-center gap-2">
                {s.photoPath ? <StepThumb path={s.photoPath} onRemove={() => patch(i, { photoPath: null })} /> : (
                  <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink-soft">
                    <Icon name="camera" className="h-4 w-4" />{busy === i ? "上げています…" : "写真・イラストを付ける"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => addPhoto(i, e.target.files?.[0])} />
                  </label>
                )}
                {s.text.trim() && !tpl && <button className="text-xs text-clay-strong underline" onClick={() => setSaving([i])}>よく使う工程に保存</button>}
                <button className="ml-auto text-faint" aria-label="この工程を消す" onClick={() => set(steps.filter((_, j) => j !== i))}><Icon name="trash" className="h-4 w-4" /></button>
              </div>
              {(same > 0 || tplLacks) && (
                <button className="w-full rounded-lg bg-clay-soft px-2 py-1.5 text-left text-xs text-clay-strong" onClick={() => setSharing(i)}>
                  📷 この写真を{same > 0 ? `同じ工程のある他のレシピ（${same}件）` : ""}{same > 0 && tplLacks ? "と" : ""}{tplLacks ? "よく使う工程" : ""}にも付ける
                </button>
              )}
            </div>
          </div>
        );
      })}
      {err && <p className="text-sm text-ng">{err}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button className={`${ui.secondary} py-2 text-sm`} onClick={() => set([...steps, { text: "" }])}>＋ 工程を足す</button>
        <button className={`${ui.secondary} py-2 text-sm`} onClick={() => setPicking(true)}>よく使う工程から入れる</button>
      </div>
      {steps.filter((s) => s.text.trim()).length > 1 && (
        <button className="text-xs text-muted underline" onClick={() => setSaving(steps.flatMap((s, j) => (s.text.trim() ? [j] : [])))}>この作り方をまるごと「よく使う工程」に保存</button>
      )}
      {picking && (
        <PickTemplateSheet orgId={orgId} uid={uid} recipes={others} currentRecipeId={recipeId} onPick={addTemplate}
          onEdited={(t) => set(applyTemplate(steps, t).steps)} onClose={() => setPicking(false)} />
      )}
      {saving && <SaveTemplateSheet orgId={orgId} uid={uid} steps={saving.map((j) => steps[j])} onSaved={(id) => linkTo(saving, id)} onClose={() => setSaving(null)} />}
      {share && share.photoPath && (
        <ApplyRecipesSheet title="同じ工程にも写真を付ける" onClose={() => setSharing(null)}
          lead={`「${share.text.slice(0, 40)}」と同じ工程があるレシピです。付けるレシピを選んでください（すでに別の写真がある工程は、この写真に置き換わります）。`}
          recipes={recipesWithStep(others, share.text, share.photoPath)}
          extra={shareTpl && (shareTpl.photoPaths?.[share.templateStep ?? -1] ?? "") !== share.photoPath ? { label: `よく使う工程「${shareTpl.name}」にもこの写真を入れる` } : undefined}
          run={async (ids, toTemplate) => {
            if (toTemplate && shareTpl && share.templateStep !== undefined) {
              const photoPaths = shareTpl.steps.map((_, k) => (k === share.templateStep ? share.photoPath! : shareTpl.photoPaths?.[k] ?? ""));
              await saveDoc(`organizations/${orgId}/stepTemplates/${shareTpl.id}`, { photoPaths });
            }
            return ids.length ? call<{ done: number }>("syncSteps", { orgId, stepText: share.text, photoPath: share.photoPath, recipeIds: ids }) : { done: 0 };
          }} />
      )}
    </div>
  );
}
