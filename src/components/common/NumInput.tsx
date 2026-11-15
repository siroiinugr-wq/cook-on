// 数字の入力欄。打っている間の文字は欄の中に持ち、数字に直した値だけを外に渡す。
// 以前は欄の値＝数字そのものだったので、全部消すと「|| 1」などですぐ数字に戻り、空にできなかった（delete で消せない）。
// 「12.」のように小数点を打った途中で点が消えることもあった。空のまま欄を離れたときだけ fallback（あれば）に戻す（2026-11-15）
import { useEffect, useState, type InputHTMLAttributes } from "react";
import { numText } from "../../lib/num";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue"> & {
  value: number | null | undefined;
  /** 打つたびに呼ぶ。空なら null（fallback があっても打っている間は null） */
  onValue: (n: number | null) => void;
  /** 空のまま欄を離れたときに入れる値（1ロットの個数＝1 など）。無ければ空のまま */
  fallback?: number;
  /** 小数を許すか（既定は許す） */
  decimal?: boolean;
};

const show = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "" : String(v));

export function NumInput({ value, onValue, fallback, decimal = true, onBlur, ...rest }: Props) {
  const [text, setText] = useState(show(value));
  // 外から値が変わったら入れ直す（打っている文字と同じ数なら、そのまま＝「12.」を「12」に戻さない）
  useEffect(() => {
    setText((cur) => (parse(cur, decimal) === (value ?? null) ? cur : show(value)));
  }, [value, decimal]);

  return (
    <input
      inputMode={decimal ? "decimal" : "numeric"}
      {...rest}
      value={text}
      onChange={(e) => {
        const t = clean(e.target.value, decimal);
        setText(t);
        onValue(parse(t, decimal));
      }}
      onBlur={(e) => {
        if (text === "" && fallback !== undefined) {
          setText(String(fallback));
          onValue(fallback);
        }
        onBlur?.(e);
      }}
    />
  );
}

function clean(v: string, decimal: boolean): string {
  const t = numText(v);
  if (!decimal) return t.replace(/\./g, "");
  const i = t.indexOf(".");
  return i < 0 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, "");
}

function parse(t: string, decimal: boolean): number | null {
  if (t === "" || t === ".") return null;
  const n = decimal ? Number(t) : parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}
