// よく使う見た目（ボタン・入力欄・カード）。画面ごとに書き分けると少しずつずれるので、ここの名前で使う
export const ui = {
  primary: "rounded-xl bg-clay px-4 py-3 font-bold text-white disabled:bg-line-strong",
  secondary: "rounded-xl border border-line-strong bg-paper px-4 py-3 text-ink-soft disabled:opacity-50",
  quiet: "rounded-lg px-3 py-2 text-sm text-muted underline",
  input: "w-full rounded-xl border border-line-strong bg-paper px-3 py-2.5",
  card: "rounded-2xl border border-line bg-paper p-4",
  label: "text-xs font-medium text-muted",
  chip: "inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1 text-xs text-ink-soft",
} as const;
