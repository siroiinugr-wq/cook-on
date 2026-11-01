// AI が Google 検索で調べた結果の「見たページ」と Google の「検索の候補」。
// 検索つきのAI（グラウンディング）の答えを見せるときは、検索の候補も一緒に出すのが利用の条件
export function WebSources({ sources, searchHtml }: { sources?: { uri: string; title: string }[]; searchHtml?: string }) {
  if (!sources?.length && !searchHtml) return null;
  return (
    <>
      {sources && sources.length > 0 && (
        <span className="mt-1 block text-xs text-muted">
          見たページ：{sources.map((x, k) => (
            <a key={k} href={x.uri} target="_blank" rel="noreferrer" className="mr-2 underline">{x.title || `ページ${k + 1}`}</a>
          ))}
        </span>
      )}
      {searchHtml && <iframe title="Google 検索の候補" srcDoc={searchHtml} sandbox="allow-popups allow-popups-to-escape-sandbox" className="mt-1 h-16 w-full rounded-lg border border-line" />}
    </>
  );
}
