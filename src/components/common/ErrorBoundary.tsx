// 画面の途中で止まったとき、真っ白にせず「読み込み直す」を出す。原因の文はそのまま見せる（知らせてもらえば直しやすい）。
// 画面を移ったら（key が変わったら）消えて、新しい画面をもう一度出す。
import { Component, type ReactNode } from "react";

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto min-h-screen max-w-lg bg-cream p-6 text-center">
        <p className="mt-16 font-serif text-lg">画面を表示できませんでした</p>
        <p className="mt-2 text-sm text-muted">お手数ですが、読み込み直してください。続くときは下の文を知らせてください。</p>
        <button type="button" onClick={() => location.reload()} className="mt-6 w-full rounded-xl bg-clay py-3 font-bold text-white">読み込み直す</button>
        <button type="button" onClick={() => { location.href = "/"; }} className="mt-3 w-full rounded-xl border border-line-strong bg-paper py-3 text-sm">ホームへ</button>
        <p className="mt-6 break-all text-left text-[11px] text-faint">{this.state.error.message}</p>
      </div>
    );
  }
}
