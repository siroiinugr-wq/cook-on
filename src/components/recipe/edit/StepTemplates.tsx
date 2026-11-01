// よく使う工程：名前を付けて保存し（1つでも、いくつかまとめてでも）、レシピの編集ですぐ呼び出す。
// 保存先は organizations/{orgId}/stepTemplates（お店のみんなで使える）。写真は orgs/{orgId}/recipes/_steps/
// レシピに入れた工程は「どのよく使う工程の何番目か」を覚えているので、あとでよく使う工程を直すと、使っているレシピに反映できる。
import { useState } from "react";
import { recipesUsingTemplate } from "@shared/steps";
import type { Recipe, RecipeStep, StepTemplate } from "@shared/types";
import { useCol } from "../../../hooks/useData";
import { uploadPhoto, usePhotoUrl } from "../../../lib/photos";
import { call, newId, removeDoc, saveDoc } from "../../../lib/store";
import { useConfirm } from "../../common/ConfirmDialog";
import { Icon } from "../../common/Icon";
import { Sheet } from "../../common/Sheet";
import { ui } from "../../common/ui";

export function useStepTemplates(orgId: string) {
  const { list } = useCol<StepTemplate>(`organizations/${orgId}/stepTemplates`);
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

type RecipeRow = Pick<Recipe, "id" | "name" | "steps">;

/** 一覧から選んで入れる。押した工程は今の作り方の最後に足す。「編集」でよく使う工程そのものを直せる */
export function PickTemplateSheet({ orgId, uid, recipes, currentRecipeId, onPick, onEdited, onClose }: {
  orgId: string; uid: string; recipes: RecipeRow[]; currentRecipeId: string | null;
  onPick: (t: StepTemplate) => void; onEdited: (t: StepTemplate) => void; onClose: () => void;
}) {
  const list = useStepTemplates(orgId);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<StepTemplate | null>(null);
  const confirm = useConfirm();
  const shown = list.filter((t) => !q.trim() || t.name.includes(q.trim()) || t.steps.some((s) => s.includes(q.trim())));

  async function remove(t: StepTemplate) {
    if (await confirm({ title: `「${t.name}」を消しますか？`, body: "レシピに入れた工程はそのまま残ります。", ok: "消す" })) {
      await removeDoc(`organizations/${orgId}/stepTemplates/${t.id}`);
    }
  }

  if (editing) {
    return <EditTemplateSheet orgId={orgId} uid={uid} template={editing} recipes={recipes} currentRecipeId={currentRecipeId}
      onSaved={onEdited} onClose={() => setEditing(null)} />;
  }
  return (
    <Sheet title="よく使う工程から入れる" onClose={onClose}>
      <div className="space-y-3">
        {list.length > 5 && <input className={ui.input} placeholder="名前や中身で探す" value={q} onChange={(e) => setQ(e.target.value)} />}
        {!list.length && <p className="text-sm text-muted">まだありません。工程の右下の「よく使う工程に保存」で、ここに入ります。</p>}
        <ul className="space-y-2">
          {shown.map((t) => {
            const used = recipesUsingTemplate(recipes, t.id).length;
            return (
              <li key={t.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start gap-2">
                  <button className="min-w-0 flex-1 text-left" onClick={() => { onPick(t); onClose(); }}>
                    <p className="font-bold">{t.name}<span className="ml-2 text-xs font-normal text-muted">{t.steps.length}工程{used ? `・レシピ${used}件で使用` : ""}</span></p>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-xs text-ink-soft">
                      {t.steps.slice(0, 4).map((s, i) => <li key={i} className="line-clamp-2">{s}{t.photoPaths?.[i] ? " 📷" : ""}</li>)}
                      {t.steps.length > 4 && <li className="list-none text-muted">ほか{t.steps.length - 4}工程</li>}
                    </ol>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button className="text-xs text-clay-strong underline" onClick={() => setEditing(t)}>編集</button>
                    <button className="text-xs text-muted underline" onClick={() => remove(t)}>消す</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}

/** 名前を付けて保存する（steps はまとめて1つのよく使う工程になる）。保存した工程はこのレシピでも結びつける */
export function SaveTemplateSheet({ orgId, uid, steps, onSaved, onClose }: {
  orgId: string; uid: string; steps: RecipeStep[]; onSaved: (templateId: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState(() => steps[0]?.text.slice(0, 20) ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const clean = steps.filter((s) => s.text.trim()).slice(0, 20);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const path = `organizations/${orgId}/stepTemplates`;
      const id = newId(path);
      await saveDoc(`${path}/${id}`, {
        name: name.trim().slice(0, 40), steps: clean.map((s) => s.text.trim().slice(0, 400)),
        photoPaths: clean.map((s) => s.photoPath ?? ""), createdBy: uid,
      }, { merge: false });
      onSaved(id);
      onClose();
    } catch {
      setErr("保存できませんでした。");
      setBusy(false);
    }
  }

  return (
    <Sheet title="よく使う工程に保存" onClose={onClose}>
      <div className="space-y-3">
        <label className="block space-y-1"><span className={ui.label}>名前（呼び出すときに探す名前）</span>
          <input className={ui.input} value={name} maxLength={40} placeholder="例：バターと砂糖をすり混ぜる" onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <ol className="list-decimal space-y-1 rounded-xl bg-sand p-3 pl-8 text-sm">{clean.map((s, i) => <li key={i}>{s.text}{s.photoPath ? " 📷" : ""}</li>)}</ol>
        <p className="text-xs text-muted">あとでこのよく使う工程を直すと、入れたレシピにまとめて反映できます。</p>
        {err && <p className="text-sm text-ng">{err}</p>}
        <button disabled={busy || !name.trim() || !clean.length} onClick={save} className={`w-full ${ui.primary}`}>{busy ? "保存しています…" : "保存する"}</button>
      </div>
    </Sheet>
  );
}

/** よく使う工程を直す（文・写真・工程の追加と削除）。保存したら、使っているレシピに反映するかを選ぶ */
function EditTemplateSheet({ orgId, uid, template, recipes, currentRecipeId, onSaved, onClose }: {
  orgId: string; uid: string; template: StepTemplate; recipes: RecipeRow[]; currentRecipeId: string | null;
  onSaved: (t: StepTemplate) => void; onClose: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [rows, setRows] = useState(() => template.steps.map((text, i) => ({ text, photo: template.photoPaths?.[i] ?? "" })));
  const [busy, setBusy] = useState(-2);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<StepTemplate | null>(null);
  const patch = (i: number, p: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const clean = rows.filter((r) => r.text.trim()).slice(0, 20);

  async function addPhoto(i: number, f: File | undefined) {
    if (!f) return;
    setBusy(i);
    setErr("");
    try {
      patch(i, { photo: await uploadPhoto(`orgs/${orgId}/recipes/_steps`, f) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "写真を上げられませんでした。");
    } finally {
      setBusy(-2);
    }
  }

  async function save() {
    setBusy(-1);
    setErr("");
    try {
      const next: StepTemplate = { id: template.id, name: name.trim().slice(0, 40), steps: clean.map((r) => r.text.trim().slice(0, 400)), photoPaths: clean.map((r) => r.photo) };
      await saveDoc(`organizations/${orgId}/stepTemplates/${template.id}`, { name: next.name, steps: next.steps, photoPaths: next.photoPaths, createdBy: uid });
      onSaved(next);
      setSaved(next);
    } catch {
      setErr("保存できませんでした。");
    } finally {
      setBusy(-2);
    }
  }

  if (saved) {
    const targets = recipesUsingTemplate(recipes, template.id).filter((r) => r.id !== currentRecipeId);
    return (
      <ApplyRecipesSheet title="使っているレシピに反映" recipes={targets} onClose={onClose}
        lead={`「${saved.name}」を保存しました。このよく使う工程を入れたレシピにも、直した工程と写真を反映しますか？（入れたあとに自分で付けた写真は残ります）`}
        empty={currentRecipeId ? "ほかに使っているレシピはありません。編集中のこのレシピには反映しました。" : "使っているレシピはまだありません。"}
        run={(ids) => call<{ done: number }>("syncSteps", { orgId, templateId: template.id, recipeIds: ids })} />
    );
  }
  return (
    <Sheet title="よく使う工程を編集" onClose={onClose}>
      <div className="space-y-3">
        <label className="block space-y-1"><span className={ui.label}>名前</span>
          <input className={ui.input} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2 rounded-xl border border-line p-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-clay-soft text-xs font-bold text-clay-strong">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <textarea className="w-full rounded-lg border border-line-strong px-2 py-1.5 text-sm" rows={2} value={r.text} onChange={(e) => patch(i, { text: e.target.value })} />
              <div className="flex items-center gap-2">
                {r.photo ? <StepThumb path={r.photo} onRemove={() => patch(i, { photo: "" })} /> : (
                  <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-ink-soft">
                    <Icon name="camera" className="h-4 w-4" />{busy === i ? "上げています…" : "写真・イラストを付ける"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => addPhoto(i, e.target.files?.[0])} />
                  </label>
                )}
                <button className="ml-auto text-faint" aria-label="この工程を消す" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="trash" className="h-4 w-4" /></button>
              </div>
            </div>
          </div>
        ))}
        {rows.length < 20 && <button className={`w-full ${ui.secondary} py-2 text-sm`} onClick={() => setRows([...rows, { text: "", photo: "" }])}>＋ 工程を足す</button>}
        {err && <p className="text-sm text-ng">{err}</p>}
        <button disabled={busy !== -2 || !name.trim() || !clean.length} onClick={save} className={`w-full ${ui.primary}`}>{busy === -1 ? "保存しています…" : "保存する"}</button>
      </div>
    </Sheet>
  );
}

/** 反映するレシピを選ぶ（はじめは全部に印）。押すとサーバーがまとめて直し、前の版は履歴に残る */
export function ApplyRecipesSheet({ title, lead, empty, recipes, extra, run, onClose }: {
  title: string; lead: string; empty?: string; recipes: RecipeRow[];
  /** 一覧の上に出す、もう1つの選択（例：よく使う工程にも入れる） */
  extra?: { label: string };
  run: (ids: string[], extra: boolean) => Promise<{ done: number }>; onClose: () => void;
}) {
  const [picked, setPicked] = useState(() => new Set(recipes.map((r) => r.id)));
  const [extraOn, setExtraOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const toggle = (id: string) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setPicked(n);
  };

  async function go() {
    setBusy(true);
    setMsg("");
    try {
      const r = await run([...picked], extraOn);
      setMsg(`${r.done}件のレシピに反映しました。前の版は各レシピの履歴に残っています。`);
      setPicked(new Set());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "反映できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-ink-soft">{lead}</p>
        {extra && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-clay" checked={extraOn} onChange={(e) => setExtraOn(e.target.checked)} />{extra.label}</label>}
        {!recipes.length ? <p className="text-sm text-muted">{empty ?? "対象のレシピはありません。"}</p> : (
          <>
            <div className="flex gap-3 text-xs">
              <button className="text-clay-strong underline" onClick={() => setPicked(new Set(recipes.map((r) => r.id)))}>すべて選ぶ</button>
              <button className="text-muted underline" onClick={() => setPicked(new Set())}>すべて外す</button>
            </div>
            <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {recipes.map((r) => (
                <li key={r.id}><label className="flex items-center gap-2 px-3 py-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-clay" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />{r.name}
                </label></li>
              ))}
            </ul>
          </>
        )}
        {msg && <p className="text-sm text-ink-soft">{msg}</p>}
        {msg && !picked.size ? <button onClick={onClose} className={`w-full ${ui.secondary}`}>閉じる</button> : (
          <button disabled={busy || (!picked.size && !(extra && extraOn))} onClick={go} className={`w-full ${ui.primary}`}>
            {busy ? "反映しています…" : picked.size ? `${picked.size}件のレシピに反映する` : "反映する"}
          </button>
        )}
      </div>
    </Sheet>
  );
}

export function StepThumb({ path, onRemove }: { path: string; onRemove: () => void }) {
  const url = usePhotoUrl(path);
  return (
    <span className="flex items-center gap-1">
      {url ? <img src={url} alt="" className="h-12 w-16 rounded-md object-cover" /> : <span className="h-12 w-16 rounded-md bg-sand" />}
      <button className="text-xs text-muted underline" onClick={onRemove}>外す</button>
    </span>
  );
}
